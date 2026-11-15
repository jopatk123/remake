import baseEvents from '../dist/event'
import baseTalents from '../dist/talent'
import baseAchievements from '../dist/achievement'
import type { Event } from '../dist/event'
import type { Talent } from './talent.types'
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

// ── 旧链开盒收益覆盖 ────────────────────────────────────────────
// 10323 只对「神秘的小盒子」开放，是橙色天赋 1048 的全部数值收益。
// 原效果合计 11 点，作为橙色偏低；补到 20 点（五维各 +5）。
events.set(10323, {
    ...events.get(10323)!,
    effect: { CHR: 5, INT: 5, STR: 5, SPR: 5 },
})

// ── 晚年「衰老叙述」补体质门槛 ──────────────────────────────────
// 这批旧表事件是按 0–10 的属性尺度写的，城市 / 美国线有两条漏了 STR 条件；
// 灵根与修仙会把体质拉到几十点，于是「体质 66 还身体越来越差」。
// 农村版 10292 本来就有 (STR<6)，11308 是同一批文案的漏写，这里只补门槛。
// 11307 摔跤属于意外，不该再扣体质；它的致死分支仍是 STR<5，保持不动。
const elderGates: Record<number, Partial<Event>> = {
    11308: { include: '(STR<8)&(EVT?[10010])' },
    10790: { include: '(STR<8)&(EVT?[10011,10010])' },
    11307: { effect: undefined },
}
for (const [id, patch] of Object.entries(elderGates)) {
    const key = Number(id)
    events.set(key, { ...events.get(key)!, ...patch })
}

export const talents = merge<Talent>(
    baseTalents as unknown as Map<number, Talent>,
    cultivationTalents,
)

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
    // 体质惩罚从 -1000 收到 -50：原值配合「化神之资」的负属性钳制等于
    // 零代价重生，且没有钳制的角色会直接跌到 -980，惩罚失真。
    1134: {
        description: '渡劫失败重生，体质大损、年岁回退',
        revives: 1,
        revivePriority: 7,
        reviveEvent: 20409,
        reviveOnTribulation: true,
        reviveEffect: { STR: -50, AGE: -500 },
    },
    // 仲夏夜之梦：原数值是 114509 的梗，会让总评与道心评级直接爆表，
    // 作为蓝色「百世」的 1/8 隐藏结果，收敛到紫色档位的 +8。
    2032: {
        description: '道心+8，余韵悠长',
        effect: { SPR: 8 },
    },
    // 太古遗脉：+30 全属性（150 点）是橙色池第二名的 3.5 倍，
    // 收敛到 +10（50 点），仍是最强的入道爆发，但不再碾压其他橙色。
    3019: {
        description: '入道炼气时全属性+10',
        entryAll: { value: 10 },
    },
    // 转盘类：描述写清「消耗本体」，避免玩家以为是紫色天赋而低估，
    // 也避免结算页锁定一个开奖后就不存在的空壳。
    1144: {
        description: '消耗此天赋，随机获得一个橙色天赋',
    },
    2025: {
        description: '消耗此天赋，随机获得一个橙色天赋',
    },
    // 神秘的小盒子：数值收益全在 10323 开盒事件里，描述写清价值
    1048: {
        description: '100岁时开启，获得练气法门与全属性+5',
    },
    // 叠加态：原本是 exclusive 且没有任何替换表指向它，属于永远拿不到
    // 的死数据。放回紫色池，让它成为「赌橙色或体质-10」的高风险选项。
    2016: {
        exclusive: false,
        description: '消耗此天赋，变成橙色天赋或体质-10',
    },
}

for (const [id, patch] of Object.entries(talentOverrides)) {
    const key = Number(id)
    talents.set(key, { ...talents.get(key)!, ...patch })
}

// ── 清理不可达的占位天赋 ────────────────────────────────────────
// 2009–2013 是五个完全相同的「白色转盘」，exclusive 且没有任何替换表
// 指向它们，玩家永远拿不到；它们却会计入天赋收集度的分母。功能已由
// 1142 蓝色转盘覆盖，这里直接移除，保证收集度可以真的走到 100%。
for (const id of [2009, 2010, 2011, 2012, 2013]) talents.delete(id)

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
export * from './talent.types'
export * from './cultivation'
