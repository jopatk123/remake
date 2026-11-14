import type { Achievement, Event, Talent } from '@remake/data'
import {
    CultivationPath,
    type CultivationState,
    type EndingType,
} from '@remake/data'
import { produce } from 'immer'
import { sum, keys } from '@remake/vitex'

/** 基础的属性 */
export interface Properties {
    age: number
    charm: number
    intelligence: number
    strength: number
    money: number
    spirit: number
}

export interface HLProperties {
    current: Properties // 当前属性
    highest: Properties // 历史最高属性
    lowest: Properties // 历史最低属性
}

export type Allocation = Omit<Properties, 'age'>
export function createProperties(allocation: Allocation) {
    return { ...allocation, age: -1 }
}

export function createHLProperties(allocation: Allocation) {
    const current = createProperties(allocation)
    return { current, highest: { ...current }, lowest: { ...current } }
}

export interface GameState {
    props: HLProperties // 本局属性
    life: number // 本局生命值
    talents: Set<Talent['id']> // 本局拥有的天赋
    events: Set<Event['id']> // 本局触发过的事件
    achievements: Set<Achievement['id']> // 本局达成的成就
    talentTriggers: Map<Talent['id'], number> // 本局天赋触发次数
    /** 修仙进度：境界 / 修为 / 大道 / 天劫准备 */
    cultivation: CultivationState
    /** 事件触发历史：事件 id → 触发过的年龄列表，用于冷却与去重 */
    eventHistory: Map<Event['id'], number[]>
    /** 本局结局；null 表示尚未结束 */
    ending: EndingType | null
    /** 事件累积的突破成功率加成 */
    rateBonus: number
}

export function createCultivation(): CultivationState {
    return {
        started: false,
        startAge: 0,
        path: CultivationPath.Standard,
        realm: 0,
        minor: 0,
        progress: 0,
        bottleneck: false,
        daos: [],
        flags: [],
        tribulation: 0,
        tribulationStage: 0,
        tribulationBaseline: 0,
        breakthroughs: 0,
        failures: 0,
        decay: 0,
    }
}

/** 持久化存储的数据 */
export interface ProfileState {
    times: number // 游戏次数
    locked?: Talent['id'][] // 锁定的天赋
    talents: Set<Talent['id']> // 拥有过的天赋
    events: Set<Event['id']> // 触发过的事件
    achievements: Set<Achievement['id']> // 达成的成就
    highest?: Properties // 历史最高属性
    lowest?: Properties // 历史最低属性
}

export function createState(
    allocation: Allocation,
    talents?: Iterable<Talent['id']>,
): GameState {
    return {
        props: createHLProperties(allocation),
        life: 1,
        talents: new Set(talents),
        events: new Set(),
        achievements: new Set(),
        talentTriggers: new Map(),
        cultivation: createCultivation(),
        eventHistory: new Map(),
        ending: null,
        rateBonus: 0,
    }
}

/**
 * 总评：年龄贡献封顶 500，超出的部分改由境界 / 大道 / 结局提供。
 * 否则删掉 500 岁上限之后，只要一直活着分数就会无限膨胀，
 * 多人排名也会退化成「谁挂机久谁赢」。
 */
export function summary(state: GameState) {
    const { age, ...others } = state.props.highest
    const s = sum(Object.values(others))
    const ageScore = Math.min(Math.max(0, age), 500) / 2
    // 兼容旧存档 / 手工构造的状态：cultivation 可能不存在
    const c = state.cultivation
    const realmScore =
        c?.started
            ? (c.realm + 1) ** 2 * 12 + (c.breakthroughs ?? 0) * 8
            : 0
    const daoScore = (c?.daos?.length ?? 0) * 20
    const ending = state.ending
    const endingScore =
        ending === 'ascend'
            ? 600
            : ending === 'transcend'
              ? 800
              : ending === 'leave-world'
                ? 400
                : 0
    return Math.floor(s * 2 + ageScore + realmScore + daoScore + endingScore)
}

export interface FlatState {
    AGE: GameState['props']['current']['age']
    CHR: GameState['props']['current']['charm']
    INT: GameState['props']['current']['intelligence']
    STR: GameState['props']['current']['strength']
    MNY: GameState['props']['current']['money']
    SPR: GameState['props']['current']['spirit']
    HAGE: GameState['props']['highest']['age']
    HCHR: GameState['props']['highest']['charm']
    HINT: GameState['props']['highest']['intelligence']
    HSTR: GameState['props']['highest']['strength']
    HMNY: GameState['props']['highest']['money']
    HSPR: GameState['props']['highest']['spirit']
    LAGE: GameState['props']['lowest']['age']
    LCHR: GameState['props']['lowest']['charm']
    LINT: GameState['props']['lowest']['intelligence']
    LSTR: GameState['props']['lowest']['strength']
    LMNY: GameState['props']['lowest']['money']
    LSPR: GameState['props']['lowest']['spirit']
    LIF: GameState['life']
    TLT: GameState['talents']
    EVT: GameState['events']

    /** 修仙条件键：扩展事件与天赋可以直接写 REALM>=3 / DAO>=5 之类 */
    STRT: number
    REALM: number
    MINOR: number
    CULT: number
    PATH: number
    DAO: number
    TRIB: number
    BRK: number
    FAIL: number
    DECAY: number
    BTL: number
    /** 是否飞升 / 超脱 */
    ASC: number
    /** 结局编码：0 未结束，1 死亡，2 飞升，3 超脱，4 离世，5 转世 */
    END: number
    FLAG: Set<string>
    DAOS: Set<string>

    TMS: ProfileState['times']
    AEVT: ProfileState['events']
    ATLT: ProfileState['talents']
    AACH: ProfileState['achievements']

    SUM: number
}

type FlatStateKey = keyof FlatState

interface FlatTarget {
    game: GameState
    profile: ProfileState
}

type FlatMapper<Key extends FlatStateKey> = (
    state: FlatTarget,
) => FlatState[Key]

const FlatMappers: { [Key in FlatStateKey]: FlatMapper<Key> } = {
    AGE: state => state.game.props.current.age,
    CHR: state => state.game.props.current.charm,
    INT: state => state.game.props.current.intelligence,
    STR: state => state.game.props.current.strength,
    MNY: state => state.game.props.current.money,
    SPR: state => state.game.props.current.spirit,
    HAGE: state => state.game.props.highest.age,
    HCHR: state => state.game.props.highest.charm,
    HINT: state => state.game.props.highest.intelligence,
    HSTR: state => state.game.props.highest.strength,
    HMNY: state => state.game.props.highest.money,
    HSPR: state => state.game.props.highest.spirit,
    LAGE: state => state.game.props.lowest.age,
    LCHR: state => state.game.props.lowest.charm,
    LINT: state => state.game.props.lowest.intelligence,
    LSTR: state => state.game.props.lowest.strength,
    LMNY: state => state.game.props.lowest.money,
    LSPR: state => state.game.props.lowest.spirit,
    LIF: state => state.game.life,
    TLT: state => state.game.talents,
    EVT: state => state.game.events,
    STRT: state => (state.game.cultivation.started ? 1 : 0),
    REALM: state => state.game.cultivation.realm,
    MINOR: state => state.game.cultivation.minor,
    CULT: state => state.game.cultivation.progress,
    PATH: state => state.game.cultivation.path,
    DAO: state => state.game.cultivation.daos.length,
    TRIB: state => state.game.cultivation.tribulation,
    BRK: state => state.game.cultivation.breakthroughs,
    FAIL: state => state.game.cultivation.failures,
    DECAY: state => state.game.cultivation.decay,
    BTL: state => (state.game.cultivation.bottleneck ? 1 : 0),
    ASC: state =>
        state.game.ending === 'ascend' || state.game.ending === 'transcend'
            ? 1
            : 0,
    END: state => {
        switch (state.game.ending) {
            case 'death':
                return 1
            case 'ascend':
                return 2
            case 'transcend':
                return 3
            case 'leave-world':
                return 4
            case 'reincarnation':
                return 5
            default:
                return 0
        }
    },
    FLAG: state => new Set(state.game.cultivation.flags),
    DAOS: state => new Set(state.game.cultivation.daos),
    TMS: state => state.profile.times,
    AEVT: state => state.profile.events,
    ATLT: state => state.profile.talents,
    AACH: state => state.profile.achievements,
    SUM: ({ game }) => summary(game),
}

export const SupportedFlatStateKeys = new Set(keys(FlatMappers))

const flatStateHandle = {
    get<Key extends FlatStateKey>(target: FlatTarget, prop: Key) {
        return FlatMappers[prop]?.(target)
    },
    set: () => true,
}

export function createFlatState(game: GameState, profile: ProfileState) {
    return new Proxy({ game, profile }, flatStateHandle) as unknown as FlatState
}

export function propsEffect(hlp: HLProperties, effect: Partial<Properties>) {
    return produce(hlp, draft => {
        for (const key in effect) {
            const prop = key as keyof Properties
            const value = effect[prop]!
            draft.current[prop] += value
            draft.highest[prop] = Math.max(
                draft.highest[prop],
                draft.current[prop],
            )
            draft.lowest[prop] = Math.min(
                draft.lowest[prop],
                draft.current[prop],
            )
        }
    })
}

export function highestProperties(a: Properties, b?: Properties): Properties {
    if (!b) return { ...a }
    const result = {} as Properties
    for (const key of keys(a)) {
        result[key] = Math.max(a[key], b[key])
    }
    return result
}

export function lowestProperties(a: Properties, b?: Properties): Properties {
    if (!b) return { ...a }
    const result = {} as Properties
    for (const key of keys(a)) {
        result[key] = Math.min(a[key], b[key])
    }
    return result
}

export function nextProfile(
    profile: ProfileState,
    state: GameState,
    locked?: Talent['id'][],
) {
    return {
        times: profile.times + 1,
        talents: profile.talents.union(state.talents),
        events: profile.events.union(state.events),
        achievements: profile.achievements.union(state.achievements),
        highest: highestProperties(state.props.highest, profile.highest),
        lowest: lowestProperties(state.props.lowest, profile.lowest),
        locked,
    }
}
