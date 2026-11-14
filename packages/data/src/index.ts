import baseEvents from '../dist/event'
import baseTalents from '../dist/talent'
import baseAchievements from '../dist/achievement'
import type { Event } from '../dist/event'
import type { Talent } from '../dist/talent'
import type { Achievement } from '../dist/achievement'
import { cultivationEvents } from './cultivation/events'
import {
    LEGACY_ALLOWED_AFTER_START,
    LEGACY_BLOCKED_AFTER_START,
} from './cultivation/legacy'
import { cultivationTalents } from './cultivation/talents'
import { cultivationAchievements } from './cultivation/achievements'

/**
 * 运行时合并：旧内容仍由 xlsx → dist 生成，修仙扩展内容由
 * cultivation/*.ts 提供（带修为 / 境界 / 结局等新字段，表格列里塞不下）。
 *
 * 合并顺序是「扩展覆盖基础」，所以哪怕以后重新跑 build:data 把 dist 重建了，
 * 扩展内容也不会丢；需要修正旧事件文本时，也在合并之后统一覆盖。
 */
function merge<T>(base: Map<number, T>, extra: Map<number, T>): Map<number, T> {
    const result = new Map<number, T>(base)
    for (const [id, item] of extra) result.set(id, item)
    return result
}

export const events = merge<Event>(baseEvents, cultivationEvents)

// 入道后屏蔽旧修仙链：只收录真实存在的事件，避免把空号写进自检清单
for (let id = 10323; id <= 10409; id++) {
    if (events.has(id)) LEGACY_BLOCKED_AFTER_START.add(id)
}
for (let id = 40001; id <= 40084; id++) {
    if (events.has(id) && !LEGACY_ALLOWED_AFTER_START.has(id))
        LEGACY_BLOCKED_AFTER_START.add(id)
}

// ── 旧事件文本覆盖 ──────────────────────────────────────────────
// 11503 是「永不言弃」的 Rickroll 彩蛋，原词在 event.xlsx 里是英文。
// 这里做运行时覆盖，而不是直接改生成物：重新跑 build:data 也不会丢，
// 和修仙扩展事件的合并方式保持一致。
// 译文重意境、轻逐字：保留原曲的告白结构和副歌，重复段落做了收敛，
// 避免整首歌把日志撑成几十屏。
events.set(11503, {
    ...events.get(11503)!,
    event: `我们从来不是爱情的陌路人，
规则你懂，我也心知肚明。
我想要的是一生一世的承诺，
这样的心意，旁人给不了你。

我只想告诉你此刻的感受，
想让你真正明白我的心。

我永远不会放弃你，
永远不会让你失望，
永远不会转身离去，
永远不会让你哭泣，
永远不会说再见，
永远不会用谎言伤你。

我们相识已经太久，
你的心一直在隐隐作痛，
却总是羞于开口。
其实我们都明白彼此的心意，
这场爱的游戏，我们继续玩下去。

如果你问我此刻的感受，
别说你看不清我的心。

（放弃你，放弃你）
（放弃你，放弃你）

我永远不会放弃你，
永远不会让你失望，
永远不会转身离去，
永远不会让你哭泣，
永远不会说再见，
永远不会用谎言伤你。`,
})

export const talents = merge<Talent>(baseTalents, cultivationTalents)

// ── 橙色天赋效果覆盖 ────────────────────────────────────────────
// 基础天赋仍由 xlsx → dist 生成，这里在合并之后统一覆盖，
// 重新跑 build:data 也不会丢失。
const talentOverrides: Record<number, Partial<Talent>> = {
    // 半神：全属性+2 → +8
    1023: {
        description: '全属性+8',
        effect: { MNY: 8, STR: 8, INT: 8, CHR: 8, SPR: 8 },
    },
    // 天命：初始可用属性点+8 → +20
    1064: { description: '初始可用属性点+20', points: 20 },
    // 阴间大会员：随机属性+8 → 单一随机属性+20~60
    1141: {
        description: '单一随机属性+20~60',
        effect: undefined,
        randomOne: { min: 20, max: 60 },
    },
    // 绝妙的天赋：五维各自随机+2~15，替换原有效果与+1属性点
    2015: {
        description: '五维各自随机+2~15',
        effect: undefined,
        points: undefined,
        randomPerStat: { min: 2, max: 15 },
    },
    // 橙色胶囊：跳过60~90岁，并额外复活一次
    1114: {
        description: '跳过60~90岁，并复活一次',
        condition: undefined,
        skipAge: { at: 60, years: 30 },
        revives: 1,
        revivePriority: 2,
        reviveEvent: 20011,
    },
    // 紫色胶囊：与橙色同一套跳龄钩子，不再靠年龄表塞「时间跳跃」
    1104: {
        description: '跳过40~50岁',
        condition: undefined,
        skipAge: { at: 40, years: 10 },
    },
    // 轮回之外：保留灵魂离体，并额外复活一次
    1135: {
        description: '死后灵魂离体，并可复活一次',
        revives: 1,
        revivePriority: 3,
        reviveEvent: 20012,
    },
    // 恶魔的交易：旧链靠 10000 分支加一条命，改走统一复活
    1148: {
        description: '所有属性-2，加一条命',
        revives: 1,
        revivePriority: 4,
        reviveEvent: 20001,
    },
    // 死者苏生：一条命 → 两条命
    1147: {
        description: '加两条命',
        revives: 2,
        revivePriority: 5,
        reviveEvent: 20013,
    },
    // 诺贝尔奖：得过奖才能复活，不再绑在 10000 分支上
    2024: {
        description: '得过诺贝尔奖可复活一次',
        revives: 1,
        revivePriority: 6,
        reviveEvent: 11504,
        reviveRequireEvent: [10679, 10680, 10681],
    },
    // 转世重修：仅渡劫失败时重生，体质大损、年龄回退
    1134: {
        description: '渡劫失败重生',
        revives: 1,
        revivePriority: 7,
        reviveEvent: 20409,
        reviveOnTribulation: true,
        reviveEffect: { STR: -1000, AGE: -500 },
    },
}

for (const [id, patch] of Object.entries(talentOverrides)) {
    const key = Number(id)
    talents.set(key, { ...talents.get(key)!, ...patch })
}

// ── 复活日志事件 ─────────────────────────────────────────────────
const reviveEvents: [number, string][] = [
    [20010, '天赋【化神之资】发动，你从必死之局中醒来。'],
    [20011, '天赋【橙色胶囊】发动，你被从死亡边缘拉了回来。'],
    [20012, '天赋【轮回之外】发动，你散去的魂魄重新聚拢。'],
    [20013, '天赋【死者苏生】发动，你被复活了。'],
]
for (const [id, event] of reviveEvents) {
    events.set(id, { id, event, grade: 3, NoRandom: true })
}

// 复活改由引擎统一结算，移除旧死亡事件上的天赋分支，避免叠两次。
const deathEvent = events.get(10000)
if (deathEvent?.branch) {
    events.set(10000, {
        ...deathEvent,
        branch: deathEvent.branch.filter(
            b =>
                !b.condition.includes('1147') &&
                !b.condition.includes('1148') &&
                !b.condition.includes('2024'),
        ),
    })
}
export const achievements = merge<Achievement>(
    baseAchievements,
    cultivationAchievements,
)

export * from '../dist/achievement'
export * from '../dist/age'
export { default as ages } from '../dist/age'
export * from '../dist/character'
export { default as characters } from '../dist/character'
export * from '../dist/event'
export * from '../dist/specialthanks'
export { default as specialThanks } from '../dist/specialthanks'
export * from '../dist/talent'
export * from './cultivation'
