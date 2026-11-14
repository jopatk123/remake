import {
    type Event,
    type Talent,
    type TalentGrade,
    talents,
} from '@remake/data'
import type { Properties, GameState, ProfileState } from './state'
import {
    propsEffect,
    createFlatState,
    negativeClampEnabled,
} from './state'
import { check } from '@remake/condition'
import { pick, pickWeight, random, type RNG } from '@remake/vitex'
import { produce } from 'immer'
import type { TriggerResult } from './game'

const Grades: TalentGrade[] = [0, 1, 2, 3] as const
const GradeMap = Map.groupBy(
    talents.keys().filter(t => !talents.get(t)!.exclusive),
    t => talents.get(t)!.grade,
)

export const count = talents.size

export type PullRate = Map<TalentGrade, number>
export type PullRateAddition = {
    mode: 'add' | 'multiply'
    value: number
}
export type PullRateAdditions = {
    [key in keyof ProfileState]?: (
        value: ProfileState[key],
    ) => Map<TalentGrade, PullRateAddition>
}
export interface RateOptions {
    base: PullRate
    additions: PullRateAdditions
}
const AddidtionInit = Grades.map(g => [g, 1]) as [TalentGrade, number][]
function talentRateWithAddition(
    { base, additions }: RateOptions,
    profile: ProfileState,
) {
    const rate = new Map(AddidtionInit)
    for (const [key, getAddition] of Object.entries(additions)) {
        const value = profile[key as keyof ProfileState]
        for (const [k, v] of getAddition(value as any).entries()) {
            const current = rate.get(k)!
            if (v.mode === 'add') {
                rate.set(k, current + v.value)
            } else if (v.mode === 'multiply') {
                rate.set(k, current * v.value)
            }
        }
    }
    for (const [g, addition] of rate.entries()) {
        const b = base.get(g)
        if (!b) throw new Error(`talent: base rate for grade ${g} is missing`)
        rate.set(g, Math.max(b * addition, 0))
    }
    return rate
}

export interface PullOptions {
    count: number
    rate: RateOptions
}

export function pull(
    options: PullOptions,
    profile: ProfileState,
    rng?: RNG,
): Talent['id'][] {
    const rate = Array.from(
        talentRateWithAddition(options.rate, profile).entries(),
    )
    const result = []
    const map = new Map(Grades.map(g => [g, new Set(GradeMap.get(g))]))
    const usedGroups = new Set<string>()
    if (profile.locked) {
        result.push(...profile.locked)
        if (result.length >= options.count) return result
        for (const talent of result) {
            const { grade, group } = talents.get(talent)!
            if (group) usedGroups.add(group)
            map.get(grade)!.delete(talent)
        }
    }
    for (let i = options.count - result.length; i > 0; i--) {
        const grade = pickWeight(rate, rng)! ?? 0
        const set = map.get(grade)!
        if (set.size === 0) continue
        const candidates = Array.from(set).filter(id => {
            const { group } = talents.get(id)!
            return !group || !usedGroups.has(group)
        })
        if (candidates.length === 0) continue
        const id = pick(candidates, rng)!
        result.push(id)
        set.delete(id)
        const { group } = talents.get(id)!
        if (group) usedGroups.add(group)
    }
    return result
}

export function exclude(talent: Talent['id'], list: Iterable<Talent['id']>) {
    const current = talents.get(talent)!
    for (const t of list) {
        if (t === talent) continue
        if (current.exclude?.includes(t)) return t
        const target = talents.get(t)!
        if (target.exclude?.includes(talent)) return t
        if (current.group && target.group === current.group) return t
    }
    return null
}

function chainReplace(t: Talent['id'], ts: Set<Talent['id']>, rng?: RNG) {
    const { replacement: r } = talents.get(t)!
    if (!r) return null
    let picked: Talent['id'] | null = null
    if (r.talent) {
        const filtered = r.talent.filter(([id]) => {
            if (ts.has(id)) return false
            return exclude(id, ts) == null
        })
        picked = pickWeight(filtered, rng)
    } else if (r.grade) {
        const filtered = GradeMap.get(r.grade)!.filter(id => {
            if (ts.has(id)) return false
            return exclude(id, ts) == null
        })
        picked = pick(filtered, rng)
    }
    if (!picked) return null
    const nts = new Set(ts)
    nts.add(picked)
    const next = chainReplace(picked, nts, rng) as Talent['id'][] | null
    if (next) return [picked, ...next]
    return [picked]
}

export interface ReplacementResult {
    talents: Set<Talent['id']>
    chains: Map<Talent['id'], Talent['id'][]>
}

export function replacement(
    list: Iterable<Talent['id']>,
    rng?: RNG,
): ReplacementResult {
    const set = new Set(list)
    const chains = new Map() as ReplacementResult['chains']
    for (const talent of list) {
        const chain = chainReplace(talent, set, rng)
        if (!chain) continue
        chains.set(talent, chain)
        chain.forEach(t => set.add(t))
    }
    return { talents: set, chains }
}

export interface AdditionalPoint {
    talent: Talent['id']
    points: number
}

export interface AdditionalPoints {
    source: AdditionalPoint[]
    points: number
}

export function additionalPoints(
    list: Iterable<Talent['id']>,
): AdditionalPoints {
    const source: AdditionalPoint[] = []
    let total = 0
    for (const id of list) {
        const { points } = talents.get(id)!
        if (!points) continue
        source.push({ talent: id, points })
        total += points
    }
    return { source, points: total }
}

const EffectRandomProperties = [
    'money',
    'strength',
    'intelligence',
    'charm',
    'spirit',
] as (keyof Properties)[]

/** 只靠引擎钩子生效、不走年度属性结算的天赋 */
export function isPassiveTalent(talent: Talent): boolean {
    return !!(
        talent.entryAll ||
        talent.breakthroughPercent ||
        talent.negativeClamp ||
        talent.immortalUntil != null ||
        talent.revives ||
        talent.skipAge
    )
}

export function trigger(
    state: GameState,
    profile: ProfileState,
    rng?: RNG,
): TriggerResult<Talent['id']> {
    const flatState = createFlatState(state, profile)
    const triggers: Talent['id'][] = []
    const skipTalents: Talent['id'][] = []

    // 跳过年龄是独立的引擎钩子，不受普通触发条件影响
    for (const talent of state.talents) {
        const meta = talents.get(talent)!
        if (!meta.skipAge) continue
        if ((state.talentTriggers.get(talent) ?? 0) >= meta.max) continue
        if (state.props.current.age < meta.skipAge.at) continue
        // 已经越过整个跳过区间就不再回头，避免高龄获得时反而减龄
        if (
            state.props.current.age >=
            meta.skipAge.at + meta.skipAge.years
        )
            continue
        skipTalents.push(talent)
        triggers.push(talent)
    }

    for (const talent of state.talents) {
        const meta = talents.get(talent)!
        const { condition, max } = meta
        if (meta.skipAge) continue
        if ((state.talentTriggers.get(talent) ?? 0) >= max) continue
        if (isPassiveTalent(meta) && !meta.effect && !meta.randomPerStat && !meta.randomOne)
            continue
        if (condition && !check(flatState, condition)) continue
        triggers.push(talent)
    }
    if (triggers.length === 0) return { state, triggers }
    const clampNegative = negativeClampEnabled(state)
    const newState = produce(state, draft => {
        for (const talent of skipTalents) {
            const { skipAge, max } = talents.get(talent)!
            const times = draft.talentTriggers.get(talent) ?? 0
            if (times >= max || !skipAge) continue
            const age = draft.props.current.age
            const target = skipAge.at + skipAge.years
            if (age < skipAge.at || age >= target) continue
            draft.props = propsEffect(
                draft.props,
                { age: target - age },
                clampNegative,
            )
            draft.talentTriggers.set(talent, times + 1)
        }
        for (const talent of triggers) {
            if (skipTalents.includes(talent)) continue
            const times = draft.talentTriggers.get(talent) ?? 0
            draft.talentTriggers.set(talent, times + 1)
            const { effect, randomPerStat, randomOne } = talents.get(talent)!
            const pe = {} as Partial<Properties>
            if (effect) {
                if (effect.CHR) pe.charm = effect.CHR
                if (effect.INT) pe.intelligence = effect.INT
                if (effect.STR) pe.strength = effect.STR
                if (effect.MNY) pe.money = effect.MNY
                if (effect.SPR) pe.spirit = effect.SPR
                if (effect.RND) {
                    const key = pick(EffectRandomProperties, rng)!
                    pe[key] = (pe[key] ?? 0) || effect.RND
                }
            }
            if (randomPerStat) {
                for (const key of EffectRandomProperties) {
                    pe[key] =
                        (pe[key] ?? 0) +
                        random(randomPerStat.max, randomPerStat.min, rng)
                }
            }
            if (randomOne) {
                const key = pick(EffectRandomProperties, rng)!
                pe[key] =
                    (pe[key] ?? 0) +
                    random(randomOne.max, randomOne.min, rng)
            }
            if (Object.keys(pe).length === 0) continue
            draft.props = propsEffect(draft.props, pe, clampNegative)
        }
    })
    return { state: newState, triggers }
}

/** 死亡复活结果：state 已恢复到活着的状态，events 用于日志播报 */
export interface ReviveResult {
    state: GameState
    events: Event['id'][]
}

/**
 * 统一死亡复活结算。
 * 顺序固定：化神之资 → 橙色胶囊 → 轮回之外 → 死者苏生。
 */
export function tryRevive(state: GameState): ReviveResult {
    // 只处理真正的死亡：飞升 / 超脱 / 离世 / 转世都不能被复活打断
    const isDeath =
        state.ending === 'death' ||
        (state.ending === null && state.life < 1)
    if (!isDeath) return { state, events: [] }
    const age = state.props.current.age
    const candidates = [...state.talents]
        .map(id => talents.get(id)!)
        .filter(t => t.revives || t.immortalUntil != null)
        .sort(
            (a, b) => (a.revivePriority ?? 99) - (b.revivePriority ?? 99),
        )
    for (const talent of candidates) {
        if (talent.immortalUntil != null) {
            if (age >= talent.immortalUntil) continue
        } else {
            const used = state.reviveUsed.get(talent.id) ?? 0
            if (used >= (talent.revives ?? 0)) continue
        }
        return {
            state: produce(state, draft => {
                draft.life = 1
                if (draft.ending === 'death') draft.ending = null
                if (talent.immortalUntil == null) {
                    draft.reviveUsed.set(
                        talent.id,
                        (draft.reviveUsed.get(talent.id) ?? 0) + 1,
                    )
                }
                if (talent.reviveEvent != null) {
                    draft.events.add(talent.reviveEvent)
                    const history =
                        draft.eventHistory.get(talent.reviveEvent) ?? []
                    draft.eventHistory.set(talent.reviveEvent, [
                        ...history,
                        age,
                    ])
                }
            }),
            events:
                talent.reviveEvent != null ? [talent.reviveEvent] : [],
        }
    }
    return { state, events: [] }
}
