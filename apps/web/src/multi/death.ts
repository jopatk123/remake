/**
 * 死因的事件 id 与文本。
 *
 * 协议只传 id，不传字符串：中继不懂事件内容，文本一律由各端查本地数据表。
 * 这里一半负责「从日志里挑出该报哪个 id」（上报时用），
 * 另一半负责「把 id 翻成能显示的一行字」（榜单渲染时用）。
 */
import { events, LEGACY_ENDINGS, ASCEND_EVENT_ID } from '@remake/data'
import { format } from '@remake/vitex'

/** 通用的「你死了。」，写进榜单等于没说，真正的原因在它前面那条分支事件 */
const GENERIC_DEATH = 10000
/** 飞升 / 超脱事件：自带结局文本，榜单要优先显示它们而不是「你死了。」 */
const ASCEND_IDS = new Set<number>([
    ASCEND_EVENT_ID,
    51302,
    51303,
    ...Object.entries(LEGACY_ENDINGS)
        .filter(([, ending]) => ending === 'ascend' || ending === 'transcend')
        .map(([id]) => Number(id)),
])
/** 事件表里有彩蛋级的超长文本（整首歌词），别把榜单撑爆 */
const MAX_TEXT = 120
const thisYear = new Date().getFullYear()

/**
 * 从最后一年日志里挑出要上报的死因事件 id。
 *
 * 死亡是某条带 LIF:-1 的事件把生命值扣到 0；倒着扫最后一年，先找到它。
 * 大部分死法是「某事件 → 分支 → 你死了。」，这时用前一条事件当死因
 * （比如「你生了场重病。」）；飞升、穿越这类自带结局文本的事件就直接用自己。
 */
export function deathEventId(logs: { events: number[] }[]): number | null {
    const last = logs.at(-1)
    if (!last) return null
    const ids = last.events
    // 飞升 / 超脱是圆满结局，优先用它的文本，别被同年的普通事件盖过去
    for (let i = ids.length - 1; i >= 0; i--) {
        if (ASCEND_IDS.has(ids[i]!)) return ids[i]!
    }
    for (let i = ids.length - 1; i >= 0; i--) {
        const id = ids[i]
        if (id === undefined) continue
        if ((events.get(id)?.effect?.LIF ?? 0) >= 0) continue
        const cause = ids[i - 1]
        return id === GENERIC_DEATH && cause !== undefined ? cause : id
    }
    // 兜底：数据表里万一没标 LIF，至少把当年最后一条事件报出去
    return ids.at(-1) ?? null
}

/** 把死因事件 id 翻成榜单上的一行字；查不到返回 null，由 Death 组件决定兜底文案 */
export function deathText(id: number | null, age = 0): string | null {
    // 通用死亡事件本身只有「你死了。」，写进榜单等于没说；
    // 真正的原因应该由 deathEventId 取前一条分支事件。
    if (id == null || id === GENERIC_DEATH) return null
    const item = events.get(id)
    if (!item) return null
    let text = item.event
    if (item.format)
        text = format(text, key => ({ CurrentYear: thisYear + age - 1 })[key])
    // 换行会破坏榜单的一行布局；截断后再由 CSS 做省略号
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}
