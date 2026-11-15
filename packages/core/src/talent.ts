import {
    type Event,
    type Talent,
    type TalentGrade,
    talents,
    TRIBULATION_FAILURE_ID,
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

/** 渡劫失败相关事件：转世重修只在这些死亡上生效 */
const TRIBULATION_DEATH_IDS = new Set<number>([
    TRIBULATION_FAILURE_ID,
    10392,
    10408,
])

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
        // 用 == null 而不是 !b：0 权重是合法的「屏蔽该稀有度」写法
        if (b == null)
            throw new Error(`talent: base rate for grade ${g} is missing`)
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
    const result: Talent['id'][] = []
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
            if (group && usedGroups.has(group)) return false
            // 抽卡阶段也遵守互斥表：否则 10 连里会同时出现
            // 「生而为男 / 生而为女」这类只能二选一的废牌。
            return exclude(id, result) == null
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
    // 灵根玉简和它开出的灵根同属 'root' 互斥组。检查目标是否被互斥时
    // 必须把玉简自身从集合里摘掉，否则它会把同组的目标全部排除，
    // 开奖返回 null，橙色玉简变成一张没有任何效果的死卡。
    const others = new Set(ts)
    others.delete(t)
    let picked: Talent['id'] | null = null
    if (r.talent) {
        const filtered = r.talent.filter(([id]) => {
            if (ts.has(id)) return false
            return exclude(id, others) == null
        })
        picked = pickWeight(filtered, rng)
    } else if (r.grade != null) {
        const filtered = GradeMap.get(r.grade)!.filter(id => {
            if (ts.has(id)) return false
            return exclude(id, others) == null
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
        // 转盘 / 福袋类天赋开奖后消耗本体：否则「紫色转盘」会同时留下
        // 转盘和它开出的橙色，等于白赚一个天赋位和一份收集度。
        // 链条里的中间容器（例如橙色转盘开出灵根玉简，玉简再开出灵根）
        // 同样要消耗，只保留最后那个没有 replacement 的结果。
        set.delete(talent)
        for (const t of chain) {
            if (talents.get(t)?.replacement) continue
            set.add(t)
        }
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
            const meta = talents.get(talent)!
            const { effect, randomPerStat, randomOne, grantFlag } = meta
            const pe = {} as Partial<Properties>
            if (effect) {
                if (effect.CHR) pe.charm = effect.CHR
                if (effect.INT) pe.intelligence = effect.INT
                if (effect.STR) pe.strength = effect.STR
                if (effect.MNY) pe.money = effect.MNY
                if (effect.SPR) pe.spirit = effect.SPR
                if (effect.RND) {
                    const key = pick(EffectRandomProperties, rng)!
                    // 用叠加而不是 ||：同一天赋若同时带固定属性和 RND，
                    // 旧写法会直接把随机加成吞掉。
                    pe[key] = (pe[key] ?? 0) + effect.RND
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
            if (Object.keys(pe).length)
                draft.props = propsEffect(draft.props, pe, clampNegative)
            if (grantFlag && !draft.cultivation.flags.includes(grantFlag))
                draft.cultivation.flags.push(grantFlag)
        }
    })
    return { state: newState, triggers }
}

/** 死亡复活结果：state 已恢复到活着的状态，events 用于日志播报 */
export interface ReviveResult {
    state: GameState
    events: Event['id'][]
}

function diedToTribulationThisYear(state: GameState, age: number): boolean {
    for (const id of TRIBULATION_DEATH_IDS) {
        if (state.eventHistory.get(id)?.at(-1) === age) return true
    }
    return false
}

/**
 * 统一死亡复活结算。
 * 顺序按 revivePriority：化神之资 → 橙色胶囊 → 轮回之外 → 恶魔交易 →
 * 死者苏生 → 诺贝尔奖 → 转世重修。
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
    const clampNegative = negativeClampEnabled(state)
    for (const talent of candidates) {
        if (talent.immortalUntil != null) {
            if (age >= talent.immortalUntil) continue
        } else {
            const used = state.reviveUsed.get(talent.id) ?? 0
            if (used >= (talent.revives ?? 0)) continue
        }
        if (
            talent.reviveRequireEvent?.length &&
            !talent.reviveRequireEvent.some(id => state.events.has(id))
        )
            continue
        if (
            talent.reviveOnTribulation &&
            !diedToTribulationThisYear(state, age)
        )
            continue
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
                const fx = talent.reviveEffect
                if (fx) {
                    const pe: Partial<Properties> = {}
                    if (fx.CHR) pe.charm = fx.CHR
                    if (fx.INT) pe.intelligence = fx.INT
                    if (fx.STR) pe.strength = fx.STR
                    if (fx.MNY) pe.money = fx.MNY
                    if (fx.SPR) pe.spirit = fx.SPR
                    if (fx.AGE) {
                        const target = Math.max(0, age + fx.AGE)
                        pe.age = target - age
                    }
                    if (Object.keys(pe).length)
                        draft.props = propsEffect(
                            draft.props,
                            pe,
                            clampNegative,
                        )
                }
            }),
            events:
                talent.reviveEvent != null ? [talent.reviveEvent] : [],
        }
    }
    return { state, events: [] }
}
