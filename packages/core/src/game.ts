import type {
    Achievement,
    Event,
    Talent,
    CultivationSnapshot,
    EndingType,
} from '@remake/data'
import {
    talents,
    AchievementOpportunity as Ao,
    LEGACY_START_EVENTS,
} from '@remake/data'
import type { GameState, ProfileState } from './state'
import { createState, nextProfile, propsEffect } from './state'
import { summary as stateSummary } from './state'
import type { ReplacementResult, AdditionalPoints } from './talent'
import { pull, exclude, replacement, additionalPoints } from './talent'
import {
    trigger as ttr,
    tryRevive,
    isPassiveTalent,
} from './talent'
import { trigger as atr } from './achievement'
import { trigger as etr, check as ec } from './event'
import {
    shouldAutoStart,
    pickEntryEvent,
    advanceCultivation,
    resolveEventPool,
    lastResortEvent,
    cultivationSnapshot,
} from './cultivation'
import type { RNG } from '@remake/vitex'
import { pickWeight, random } from '@remake/vitex'
import { produce, enableMapSet } from 'immer'
enableMapSet()

export interface TriggerResult<T> {
    state: GameState
    triggers: T[]
}
export interface PickResult {
    talents: ReplacementResult
    additionalPoints: AdditionalPoints
}
export function pick(talents: Iterable<Talent['id']>, rng?: RNG): PickResult {
    const r = replacement(talents, rng)
    const ap = additionalPoints(r.talents)
    return { talents: r, additionalPoints: ap }
}

export interface StartResult {
    state: GameState
    achievements: Achievement['id'][]
}
export function start(
    profile: ProfileState,
    ...args: Parameters<typeof createState>
): StartResult {
    const state = createState(...args)
    const ar = atr(Ao.Start, state, profile)
    return { state: ar.state, achievements: ar.triggers }
}
export interface NextResult {
    state: GameState
    age: number
    achievements: Achievement['id'][]
    events: Event['id'][]
    talents: Talent['id'][]
    end: boolean
    /** 本局结局；null 表示还在继续 */
    ending: EndingType | null
    /** 当年结束后的修仙快照，供 UI / 多人同步使用 */
    cultivation: CultivationSnapshot
}

/** 年度奇遇：每年独立判定一次，命中就触发事件（可获得天赋） */
export interface Encounter {
    /** 触发的事件 */
    event: Event['id']
    /** 每年触发概率，0~1 */
    rate: number
    /** 触发后额外获得的天赋 */
    talent?: Talent['id']
    /** 只在年龄不超过该值时判定（含该年龄），不填则不限 */
    maxAge?: number
    /** 只在年龄不低于该值时判定（含该年龄），不填则不限 */
    minAge?: number
}

export interface NextOptions {
    /** 年度奇遇表，按顺序逐个判定 */
    encounters?: Encounter[]
}

export function next(
    state: GameState,
    profile: ProfileState,
    rng?: RNG,
    options?: NextOptions,
): NextResult {
    let s = produce(state, draft => {
        draft.props = propsEffect(state.props, { age: 1 })
    })
    const tr = ttr(s, profile, rng)
    // 橙色胶囊等天赋可能在触发器里直接跳过若干年，年龄要在触发之后再取
    let current = tr.state
    const age = current.props.current.age
    const encounterEvents: Event['id'][] = []
    const encounterTalents: Talent['id'][] = []
    for (const { event: id, rate, talent, maxAge, minAge } of options
        ?.encounters ?? []) {
        if (maxAge != null && age > maxAge) continue
        if (minAge != null && age < minAge) continue
        if (
            talent != null &&
            (current.talents.has(talent) || exclude(talent, current.talents))
        )
            continue
        if (current.events.has(id)) continue
        // 已经入道就不要再抽「开盒 / 洞府」当入道事件
        if (current.cultivation.started && LEGACY_START_EVENTS.has(id)) continue
        if (random(1_000_000 - 1, 0, rng) >= rate * 1_000_000) continue
        current = etr(id, current, profile).state
        encounterEvents.push(id)
        if (talent != null) {
            current = produce(current, draft => {
                draft.talents.add(talent)
                // 奇遇当场发放的天赋，视为当年已经播报过，
                // 否则下一年天赋触发时会在日志里再出现一次
                const meta = talents.get(talent)!
                // 只有走年度属性结算的天赋才需要标记为已播报；
                // 入道/突破/复活/跳过年龄等被动天赋不能被提前标记，
                // 否则引擎钩子会永远不触发。
                if (!isPassiveTalent(meta)) {
                    draft.talentTriggers.set(
                        talent,
                        Math.max(draft.talentTriggers.get(talent) ?? 0, meta.max),
                    )
                }
            })
            encounterTalents.push(talent)
        }
    }

    // ① 百岁自动入道：不拿盒子的人也能走上标准修行路
    if (shouldAutoStart(current, age)) {
        const entryId = pickEntryEvent(current, rng)
        current = etr(entryId, current, profile).state
        encounterEvents.push(entryId)
    }

    // ② 年度修为 → 小境界 → 瓶颈 → 大境界突破 → 渡劫飞升
    const advance = advanceCultivation(current, rng)
    current = advance.state
    const broadcasts: Event['id'][] = []
    for (const id of advance.broadcasts) {
        if (current.ending) break
        const result = etr(id, current, profile)
        current = result.state
        broadcasts.push(...result.triggers)
    }

    // ③ 动态事件池：年龄层 + 境界层 + 阶段层 + 兜底，500 岁之后同样有内容
    const randomEvents: Event['id'][] = []
    if (!current.ending && current.life >= 1) {
        const pool = resolveEventPool(age, current)
        let picked: Event['id'] | null = null
        for (const level of pool) {
            const filtered = level.filter(([e]) => ec(e, current, profile))
            if (filtered.length < 1) continue
            picked = pickWeight(filtered, rng)
            break
        }
        if (picked === null) picked = lastResortEvent(rng)
        if (picked !== null) {
            const er = etr(picked, current, profile)
            current = er.state
            randomEvents.push(...er.triggers)
        } else {
            // 兜底表都空了也不抛异常，免得整个多人房间被一个人卡住
            console.warn('[core] no event available at age', age)
        }
    }

    // ④ 通用死亡判定：本年全部事件（含死亡分支里的复活事件）结算完，
    // 生命仍然 < 1 才判定身死。复活天赋（死者苏生等）因此能正常救人。
    if (!current.ending && current.life < 1) {
        const revived = tryRevive(current)
        if (revived.events.length) {
            current = revived.state
            randomEvents.push(...revived.events)
        } else {
            current = produce(current, draft => {
                draft.ending = 'death'
            })
        }
    }

    const ar = atr(Ao.Trajectory, current, profile)
    const end = ar.state.life < 1 || ar.state.ending !== null
    return {
        state: ar.state,
        age,
        achievements: ar.triggers,
        events: [...encounterEvents, ...broadcasts, ...randomEvents],
        talents: [...tr.triggers, ...encounterTalents],
        end,
        ending: ar.state.ending,
        cultivation: cultivationSnapshot(ar.state),
    }
}

export interface SummaryResult {
    state: GameState
    summary: number
    achievements: Achievement['id'][]
}
export function summary(
    state: GameState,
    profile: ProfileState,
): SummaryResult {
    const ar = atr(Ao.Summary, state, profile)
    const s = stateSummary(ar.state)
    return { state: ar.state, summary: s, achievements: ar.triggers }
}

export interface EndResult {
    profile: ProfileState
    achievements: Achievement['id'][]
}

export function end(
    state: GameState,
    profile: ProfileState,
    locked?: Talent['id'][],
) {
    const ar = atr(Ao.End, state, profile)
    const p = nextProfile(profile, ar.state, locked)
    return { profile: p, achievements: ar.triggers }
}

export { pull, exclude }
