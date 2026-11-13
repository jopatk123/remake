import type { Achievement, Event, Talent } from '@remake/data'
import { ages, talents, AchievementOpportunity as Ao } from '@remake/data'
import type { GameState, ProfileState } from './state'
import { createState, nextProfile, propsEffect } from './state'
import { summary as stateSummary } from './state'
import type { ReplacementResult, AdditionalPoints } from './talent'
import { pull, exclude, replacement, additionalPoints } from './talent'
import { trigger as ttr } from './talent'
import { trigger as atr } from './achievement'
import { trigger as etr, check as ec } from './event'
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
    const age = s.props.current.age
    const tr = ttr(s, profile, rng)
    // 年度奇遇：先结算机缘，再结算当年事件，所以当年拿到盒子也能挡住当年的死亡
    let current = tr.state
    const encounterEvents: Event['id'][] = []
    const encounterTalents: Talent['id'][] = []
    for (const { event: id, rate, talent, maxAge } of options?.encounters ??
        []) {
        if (maxAge != null && age > maxAge) continue
        if (talent != null && current.talents.has(talent)) continue
        if (current.events.has(id)) continue
        if (random(1_000_000 - 1, 0, rng) >= rate * 1_000_000) continue
        current = etr(id, current, profile).state
        encounterEvents.push(id)
        if (talent != null) {
            current = produce(current, draft => {
                draft.talents.add(talent)
                // 奇遇当场发放的天赋，视为当年已经播报过，
                // 否则下一年天赋触发时会在日志里再出现一次
                const { max } = talents.get(talent)!
                draft.talentTriggers.set(
                    talent,
                    Math.max(draft.talentTriggers.get(talent) ?? 0, max),
                )
            })
            encounterTalents.push(talent)
        }
    }
    const events = ages.get(age)!.event
    let event: Event['id'] | null = null
    for (const level of events) {
        const filtered = level.filter(([e]) => ec(e, current, profile))
        if (filtered.length < 1) continue
        event = pickWeight(filtered, rng)
        break
    }
    if (event === null)
        throw new Error('No event could be picked for age ' + age)
    const er = etr(event, current, profile)
    const ar = atr(Ao.Trajectory, er.state, profile)
    const end = ar.state.life < 1
    return {
        state: ar.state,
        age,
        achievements: ar.triggers,
        events: [...encounterEvents, ...er.triggers],
        talents: [...tr.triggers, ...encounterTalents],
        end,
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
