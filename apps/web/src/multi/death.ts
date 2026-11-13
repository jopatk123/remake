/**
 * 死因的事件 id 与文本。
 *
 * 协议只传 id，不传字符串：中继不懂事件内容，文本一律由各端查本地数据表。
 * 这里一半负责「从日志里挑出该报哪个 id」（上报时用），
 * 另一半负责「把 id 翻成能显示的一行字」（榜单渲染时用）。
 */
import { events } from '@remake/data'
import { format } from '@remake/vitex'

/** 通用的「你死了。」，写进榜单等于没说，真正的原因在它前面那条分支事件 */
const GENERIC_DEATH = 10000
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

/** 把死因事件 id 翻成榜单上的一行字；查不到就返回 null 交给界面显示「不明」 */
export function deathText(id: number | null, age = 0): string | null {
    if (id == null) return null
    const item = events.get(id)
    if (!item) return null
    let text = item.event
    if (item.format)
        text = format(text, key => ({ CurrentYear: thisYear + age - 1 })[key])
    // 换行会破坏榜单的一行布局；截断后再由 CSS 做省略号
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}
