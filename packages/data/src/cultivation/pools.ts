/**
 * 阶段事件池。
 *
 * 旧逻辑是 `ages.get(age)!.event`：事件完全绑在年龄上，所以 500 岁之后
 * 连事件表都没有。这里改成「年龄池 + 境界池 + 长生纪元 + 兜底池」分层：
 *   - 高优先级层只在特定条件下非空（瓶颈、渡劫）；
 *   - 常规层按当前境界取内容，境界变了内容自然跟着换；
 *   - 长生纪元层按 AGE 逐档解锁，保证 500–4000+ 岁一直有新文本；
 *   - 最后一层永远有 3 条无条件事件，保证任何年龄都不会抽空。
 *
 * 关键：不要把年龄池整个放在最前面。旧表 100–500 岁每年第一层都是
 * 同样 18 条魂修事件，引擎「首层有候选就必抽」会让新内容永远进不了日志。
 * 现在年龄池被压缩成普通的一层，和境界层、长生层同台竞争。
 *
 * 本文件只产出「候选 id + 权重」，条件判定仍由 core/event.ts 统一负责。
 */
import type { Event } from '../event.types'
import { eventsByRealm, eventsByStage } from './events'
import { LAST_REALM, TRIAL_REALM } from './realms'

export type WeightedEvent = [number, number]

/** 各类内容的相对权重：修炼日常最多，大道与突破最稀有 */
export const STAGE_WEIGHT: Record<string, number> = {
    entry: 0,
    daily: 12,
    resource: 10,
    sect: 9,
    relation: 9,
    explore: 8,
    dao: 5,
    crisis: 6,
    breakthrough: 4,
    tribulation: 14,
    ending: 0,
    fallback: 10,
}

/** 年龄池混入主池时的权重倍率：旧剧情保留但不喧宾夺主 */
export const LEGACY_WEIGHT_SCALE = 0.15
/** 神秘的小盒子：持有时百岁入道走开盒，而不是通用感悟 */
export const BOX_TALENT_ID = 1048
export const BOX_ENTRY_EVENT_ID = 10323

/** 引擎直接触发、不进随机池的事件 id */
export const ENTRY_EVENT_IDS = Array.from(
    { length: 10 },
    (_, i) => 50000 + i,
)
/** 小境界播报：每个境界 3 条变体轮换（0–8 境） */
export const MINOR_BROADCAST_VARIANTS: readonly (readonly number[])[] = [
    [51200, 51212, 51213], // 炼气
    [51201, 51214, 51215], // 筑基
    [51202, 51216, 51217], // 金丹
    [51203, 51218, 51219], // 元婴
    [51204, 51229, 51230], // 化神
    [51205, 51220, 51221], // 炼虚
    [51206, 51222, 51231], // 合体
    [51207, 51223, 51232], // 大乘
    [51208, 51224, 51233], // 渡劫
]
/** 兼容旧调用：每个境界的主播报 id */
export const MINOR_BROADCAST_IDS = MINOR_BROADCAST_VARIANTS.map(ids => ids[0]!)
export const BREAKTHROUGH_SUCCESS_IDS = [51209, 51226, 51234] as const
export const BREAKTHROUGH_FAILURE_IDS = [51210, 51227, 51228] as const
export const BREAKTHROUGH_SUCCESS_ID = BREAKTHROUGH_SUCCESS_IDS[0]
export const BREAKTHROUGH_FAILURE_ID = BREAKTHROUGH_FAILURE_IDS[0]
export const DECAY_BROADCAST_ID = 51211
export const DECAY_BROADCAST_IDS = [51211, 51305, 51306] as const
/** 九重雷劫逐重播报；51329 是单劫失败退阵，51330 是九劫尽过 */
export const TRIAL_BROADCAST_IDS = Array.from(
    { length: 9 },
    (_, i) => 51320 + i,
)
export const TRIAL_FAIL_ID = 51329
export const TRIAL_DONE_ID = 51330
export const ASCEND_EVENT_ID = 51300
export const TRIBULATION_FAILURE_ID = 51301
export const LEAVE_WORLD_ID = 51302
export const TRANSCEND_EVENT_ID = 51303
export const REINCARNATION_ID = 51304
export const DECAY_EVENT_ID = 51305
export const LIFESPAN_WARNING_ID = 51306
export const LONGEVITY_PILL_ID = 51307
export const ASCEND_READY_ID = 51308
export const ASCEND_OMEN_ID = 51309
/** 走火入魔身死（突破失败致死）与寿元耗尽坐化（天人五衰致死） */
export const BACKLASH_DEATH_ID = 51310
export const DECAY_DEATH_ID = 51311

/**
 * 魔修偷袭（51500–）。
 * 这一组不进随机池：引擎每年独立掷一次千分之一的骰子，
 * 再按境界决定「身死 / 重伤 / 夺舍重生」。
 */
export const AMBUSH_ID = 51500
export const AMBUSH_INJURY_ID = 51501
export const AMBUSH_REBIRTH_ID = 51502
export const AMBUSH_DEATH_ID = 51503

function weightOf(event: Event): number {
    const stage = (event.stage as string) ?? 'daily'
    const base = STAGE_WEIGHT[stage] ?? 8
    const explicit = typeof event.weight === 'number' ? event.weight : base
    // 橙色事件更稀有一点，但保证至少为 1
    return Math.max(1, Math.round(explicit * (event.grade >= 3 ? 0.6 : 1)))
}

function layer(events: Iterable<Event>, scale = 1): WeightedEvent[] {
    const out: WeightedEvent[] = []
    for (const event of events)
        out.push([event.id, Math.max(1, Math.round(weightOf(event) * scale))])
    return out
}

/** 不绑定境界的跨境界支线（51000–51019） */
export function crossRealmEvents(): Event[] {
    return (eventsByStage.get('sect') ?? [])
        .concat(
            eventsByStage.get('resource') ?? [],
            eventsByStage.get('relation') ?? [],
            eventsByStage.get('explore') ?? [],
            eventsByStage.get('crisis') ?? [],
        )
        .filter(e => e.id >= 51000 && e.id < 51020)
}

/**
 * 长生纪元（51400–51459）：500 岁之后按年龄逐档解锁的内容。
 * 条件写在事件自己的 inc:AGE>=N 里，这里只负责把它们放进池。
 */
export function longevityEvents(): Event[] {
    const out: Event[] = []
    for (const stage of [
        'daily', 'resource', 'sect', 'relation', 'explore',
        'dao', 'crisis', 'tribulation',
    ]) {
        for (const e of eventsByStage.get(stage) ?? [])
            if (e.id >= 51400 && e.id < 51500) out.push(e)
    }
    return out
}

/** 当前境界自带的大道事件 + 按 REALM 条件解锁的跨境界大道事件 */
export function daoEvents(realm: number): Event[] {
    return (eventsByStage.get('dao') ?? []).filter(
        e => e.realm === realm || (e.id >= 51020 && e.id < 51040),
    )
}

export interface PoolContext {
    started: boolean
    realm: number
    bottleneck: boolean
    canAscend: boolean
    age: number
    /** 已经触发过（一生一次判定用） */
    triggered: (id: number) => boolean
}

/**
 * 生成修仙部分的层级。返回数组按优先级从高到低排列，
 * core 会把它们插到年龄池之后、兜底之前。
 */
export function cultivationLayers(ctx: PoolContext): WeightedEvent[][] {
    if (!ctx.started) return []
    const realm = Math.max(0, Math.min(LAST_REALM, ctx.realm))
    const realmEvents = eventsByRealm.get(realm) ?? []
    const isTrial = realm >= TRIAL_REALM

    // ① 瓶颈 / 天劫层：修为满时优先给突破相关的机缘与劫数
    const highLayer = realmEvents.filter(e => {
        const stage = e.stage as string
        return stage === 'tribulation' || stage === 'breakthrough'
    })

    // ② 大道层：随境界推进逐步解锁，是飞升的硬条件之一
    const daoLayer = daoEvents(realm)

    // ③ 境界常规层：日常 / 资源 / 宗门 / 关系 / 探索 / 危机
    const normalLayer = realmEvents.filter(e => {
        const stage = e.stage as string
        return (
            stage === 'daily' ||
            stage === 'resource' ||
            stage === 'sect' ||
            stage === 'relation' ||
            stage === 'explore' ||
            stage === 'crisis'
        )
    })

    // ④ 跨境界支线 + 长生纪元
    const longevity = longevityEvents()
    const crossLayer = crossRealmEvents().concat(longevity)

    return [
        // 高优先层只保留「真的值得优先」的部分：瓶颈时给突破，
        // 渡劫期给天劫；平时为空，让主池自由混合
        layer(ctx.bottleneck ? highLayer : highLayer.filter(e => e.stage === 'tribulation' && isTrial)),
        layer(daoLayer),
        layer(normalLayer),
        layer(crossLayer),
    ].filter(l => l.length > 0)
}

/** 兜底层：当前境界 3 条无条件事件，抽不到任何东西时保底 */
export function fallbackLayers(realm: number): WeightedEvent[][] {
    const r = Math.max(0, Math.min(TRIAL_REALM, realm))
    const group = (eventsByStage.get('fallback') ?? []).filter(
        e => e.realm === r,
    )
    if (group.length === 0) return []
    return [layer(group)]
}

/** 全境界通用兜底（连境界兜底都异常为空时的最后一道保险） */
export function universalFallbackLayer(): WeightedEvent[] {
    return layer(eventsByStage.get('fallback') ?? [])
}
