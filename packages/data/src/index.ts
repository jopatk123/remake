import baseEvents from '../dist/event'
import baseTalents from '../dist/talent'
import baseAchievements from '../dist/achievement'
import type { Event } from '../dist/event'
import type { Talent } from '../dist/talent'
import type { Achievement } from '../dist/achievement'
import { cultivationEvents } from './cultivation/events'
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
