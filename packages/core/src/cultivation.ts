/**
 * 修仙引擎：修为积累、瓶颈突破、九重雷劫飞升、动态事件池、旧链兼容。
 *
 * 这里刻意不 import ./event，事件触发统一交给 game.ts 调度，
 * 避免 event.ts ↔ cultivation.ts 形成循环依赖。
 * 本模块只负责「算状态」和「给出该播报哪些事件 id」。
 */
import {
    ages,
    events,
    LAST_REALM,
    TRIAL_REALM,
    TUNING,
    annualGain,
    breakRate,
    realmConfig,
    snapshot,
    talents as talentData,
    ENTRY_EVENT_IDS,
    MINOR_BROADCAST_VARIANTS,
    BREAKTHROUGH_SUCCESS_IDS,
    BREAKTHROUGH_FAILURE_IDS,
    TRIAL_BROADCAST_IDS,
    TRIAL_FAIL_ID,
    TRIAL_DONE_ID,
    ASCEND_EVENT_ID,
    TRIBULATION_FAILURE_ID,
    DECAY_BROADCAST_ID,
    ASCEND_READY_ID,
    ASCEND_OMEN_ID,
    BACKLASH_DEATH_ID,
    DECAY_DEATH_ID,
    deathShield,
    softenRisk,
    cultivationLayers,
    fallbackLayers,
    universalFallbackLayer,
    LEGACY_WEIGHT_SCALE,
    LEGACY_START_EVENTS,
    LEGACY_PATH_EVENTS,
    LEGACY_REALM_SYNC,
    LEGACY_DAO_EVENTS,
    LEGACY_FLAG_EVENTS,
    LEGACY_TRIBULATION_EVENTS,
    LEGACY_ENDINGS,
    LEGACY_BLOCKED_AFTER_START,
    type CultivationState,
    type CultivationSnapshot,
    type CultivationEffectMeta,
    type CultivationEventMeta,
    type EndingType,
    type Event,
} from '@remake/data'
import type { EventEffect } from '@remake/data'
import type { GameState, ProfileState, Properties } from './state'
import {
    createFlatState,
    propsEffect,
    negativeClampEnabled,
    PROPERTY_KEYS,
} from './state'
import { produce } from 'immer'
import { pick, random, type RNG } from '@remake/vitex'

type WeightedEvent = [number, number]
type Effect = EventEffect & CultivationEffectMeta
type Meta = Event & CultivationEventMeta

function addDao(target: { daos: string[] }, name: string) {
    if (!target.daos.includes(name)) target.daos.push(name)
}

/** 突破到指定大境界时，按百分比提升全属性（每个天赋只结算一次） */
function applyBreakthroughGrowth(draft: GameState, previousRealm: number) {
    if (draft.cultivation.realm <= previousRealm) return
    const clamp = negativeClampEnabled(draft)
    for (const id of draft.talents) {
        const bonus = talentData.get(id)?.breakthroughPercent
        if (!bonus) continue
        if (draft.cultivation.realm < bonus.realm) continue
        if ((draft.talentTriggers.get(id) ?? 0) > 0) continue
        const delta = {} as Partial<Properties>
        for (const key of PROPERTY_KEYS) {
            const value = draft.props.current[key]
            delta[key] = Math.floor(value * (bonus.percent / 100))
        }
        draft.props = propsEffect(draft.props, delta, clamp)
        draft.talentTriggers.set(id, 1)
    }
}

/** 入道：太古遗脉全属性+30，随后执行脱胎换骨（五维低于10拉到10） */
function applyEntryGrowth(draft: GameState) {
    const clamp = negativeClampEnabled(draft)
    const entry = {} as Partial<Properties>
    for (const id of draft.talents) {
        const bonus = talentData.get(id)?.entryAll
        if (!bonus) continue
        if (bonus.path != null && draft.cultivation.path !== bonus.path) continue
        for (const key of PROPERTY_KEYS)
            entry[key] = (entry[key] ?? 0) + bonus.value
    }
    if (Object.keys(entry).length)
        draft.props = propsEffect(draft.props, entry, clamp)

    const floor = {} as Partial<Properties>
    for (const key of PROPERTY_KEYS) {
        const value = draft.props.current[key]
        if (value < 10) floor[key] = 10 - value
    }
    if (Object.keys(floor).length)
        draft.props = propsEffect(draft.props, floor, clamp)
}

/**
 * 事件触发后同步修仙状态。
 *
 * 同时处理三件事：
 *  1. 扩展事件的新 effect 字段（CULT / REALM / DAO / TRIB / PATH / RATE）；
 *  2. 旧事件链（103xx / 400xx）到标准境界的「只进不退」映射；
 *  3. 显式结局：飞升、超脱、离世、身死。
 */
export function applyCultivationEffects(
    state: GameState,
    eventId: number,
): GameState {
    const e = events.get(eventId) as Meta | undefined
    if (!e) return state
    const effect = e.effect as Effect | undefined
    const stage = e.stage as string | undefined
    const isEntry = stage === 'entry' || LEGACY_START_EVENTS.has(eventId)
    const legacyRealm = LEGACY_REALM_SYNC[eventId]
    const legacyDao = LEGACY_DAO_EVENTS[eventId]
    const legacyFlag = LEGACY_FLAG_EVENTS[eventId]
    const legacyTrib = LEGACY_TRIBULATION_EVENTS[eventId]
    const legacyPath = LEGACY_PATH_EVENTS[eventId]
    const legacyEnding = LEGACY_ENDINGS[eventId]
    const ending = e.ending ?? legacyEnding ?? null
    const relevant =
        isEntry ||
        ending !== null ||
        legacyRealm !== undefined ||
        legacyDao !== undefined ||
        legacyFlag !== undefined ||
        legacyTrib !== undefined ||
        legacyPath !== undefined ||
        e.flag !== undefined ||
        !!effect?.CULT ||
        !!effect?.REALM ||
        !!effect?.MINOR ||
        effect?.PATH !== undefined ||
        !!effect?.DAO ||
        !!effect?.TRIB ||
        !!effect?.RATE
    if (!relevant && state.life >= 1 && !state.ending) return state

    return produce(state, draft => {
        const d = draft.cultivation
        const age = draft.props.current.age
        const wasStarted = d.started
        const previousRealm = d.realm

        // 入道硬门槛：凡人生阶段不允许出现炼气读条。
        // 年度奇遇已经用 minAge 限制了传承洞府，这里再兜一层，
        // 防止后续数据/旧链事件在 100 岁前把 started 打开。
        if (isEntry && !d.started && age >= TUNING.autoStartAge) {
            d.started = true
            d.startAge = age
            d.path = legacyPath ?? d.path
        }
        if (legacyPath !== undefined) d.path = legacyPath
        if (effect?.PATH !== undefined) d.path = effect.PATH

        // 入道瞬间：太古遗脉 +30，并执行脱胎换骨
        if (!wasStarted && d.started) applyEntryGrowth(draft)

        if (effect?.CULT) d.progress = Math.max(0, d.progress + effect.CULT)
        if (effect?.REALM) {
            d.realm = Math.max(
                0,
                Math.min(LAST_REALM, d.realm + effect.REALM),
            )
            if (d.realm === LAST_REALM) d.bottleneck = false
        }
        if (effect?.MINOR) {
            const max = realmConfig(d.realm).minorNames.length - 1
            d.minor = Math.max(0, Math.min(max, d.minor + effect.MINOR))
        }

        const daoName =
            e.dao ?? legacyDao ?? (effect?.DAO ? `大道${d.daos.length + 1}` : null)
        if (daoName) addDao(d, daoName)

        d.tribulation = Math.min(
            999999,
            d.tribulation + (effect?.TRIB ?? 0) + (legacyTrib ?? 0),
        )
        if (effect?.RATE) draft.rateBonus += effect.RATE

        const flag = e.flag ?? legacyFlag
        if (flag && !d.flags.includes(flag)) d.flags.push(flag)

        // 旧链只进不退：新体系已经走到更高境界时，不被旧事件拉回去
        if (legacyRealm) {
            const [r, m] = legacyRealm
            if (r > d.realm || (r === d.realm && m > d.minor)) {
                d.realm = r
                d.minor = m
                d.bottleneck = false
            }
        }

        if (ending) {
            draft.ending = ending as EndingType
            draft.life = 0
            // 飞升 / 超脱之后境界条直接显示「飞升」，不留在渡劫期
            if (ending === 'ascend' || ending === 'transcend')
                d.realm = LAST_REALM
        }
        // 注意：显式声明结局的事件（修仙身死 / 飞升 / 转世）在这里立即生效；
        // 普通死亡（LIF 减到 0）的结局标记推迟到 game.ts 年度结算末尾——
        // 死亡分支里的复活事件（死者苏生 / 恶魔交易等）会先结算，
        // 把生命抬回 1，人就被救回来了。
        applyBreakthroughGrowth(draft, previousRealm)
    })
}

/** 100 岁起自动入道；已由盒子 / 太古法门提前入道的不再重复 */
export function shouldAutoStart(state: GameState, age: number): boolean {
    return (
        !state.cultivation.started &&
        age >= TUNING.autoStartAge &&
        state.life >= 1 &&
        !state.ending
    )
}

export function pickEntryEvent(rng?: RNG): number {
    return pick(ENTRY_EVENT_IDS, rng) ?? ENTRY_EVENT_IDS[0]!
}

export interface CultivationAdvance {
    state: GameState
    /** 需要引擎直接播报的事件 id（按顺序触发，不进随机池） */
    broadcasts: number[]
}

/** 播报文案变体轮换，避免同一句「气感又凝实一层」连刷九次 */
function variant(ids: readonly number[], index: number): number {
    return ids[Math.abs(index) % ids.length] ?? ids[0]!
}

/** 每年结算：修为 → 小境界 → 瓶颈 → 大境界突破 → 九重雷劫 → 飞升 */
export function advanceCultivation(
    state: GameState,
    rng?: RNG,
): CultivationAdvance {
    const c = state.cultivation
    if (!c.started || state.ending || state.life < 1)
        return { state, broadcasts: [] }
    const props = state.props.current
    const cfg = realmConfig(c.realm)
    const gain = annualGain(c.realm, props)
    const broadcasts: number[] = []

    const nextState = produce(state, draft => {
        const d = draft.cultivation
        const maxMinor = cfg.minorNames.length - 1

        // 寿元是软压力：先累计衰败并偶尔播报，但软压力也有尽头——
        // 长期卡在瓶颈、迟迟不能突破的修士，最终会在洞府里坐化。
        if (props.age > cfg.lifespan) {
            d.decay += 1
            if (d.decay % 40 === 0) broadcasts.push(DECAY_BROADCAST_ID)
            if (d.decay > TUNING.decayDeathGrace) {
                const risk = softenRisk(
                    Math.min(
                        TUNING.decayDeathCap,
                        (d.decay - TUNING.decayDeathGrace) *
                            TUNING.decayDeathRate,
                    ) *
                        (1 - deathShield(props, d)) *
                        TUNING.deathRiskScale,
                )
                if (random(1000, 0, rng) < risk * 1000) {
                    broadcasts.push(DECAY_DEATH_ID)
                    return
                }
            }
        }

        d.progress = Math.max(0, d.progress + gain)

        // ── 渡劫期：九重雷劫逐重扛，不再「一年就飞升」 ────────────────
        // 用「本境累计准备度」而不是全局 tribulation：旧链 / 大道事件在
        // 前八个境界已经攒了几百点，若直接用全局值算劫数，进渡劫第一年
        // 就会九劫全过并飞升，整个后期内容等于没做。
        if (d.realm === TRIAL_REALM) {
            d.bottleneck = false
            d.tribulation += TUNING.tribulationPerYear
            const target = Math.min(
                TUNING.tribulationTrials,
                Math.floor(
                    (d.tribulation - d.tribulationBaseline) /
                        TUNING.tribulationStep,
                ),
            )
            while (d.tribulationStage < target) {
                // 扛劫本身就有暴露风险：站上劫台不管成败都可能身死道消
                const attemptRisk = softenRisk(
                    TUNING.trialAttemptDeathRisk *
                        (1 - deathShield(props, d)) *
                        TUNING.deathRiskScale,
                )
                if (random(1000, 0, rng) < attemptRisk * 1000) {
                    broadcasts.push(TRIBULATION_FAILURE_ID)
                    return
                }
                // 单重雷劫有小概率失败：退回准备度，且失败时雷劫反噬更凶
                if (random(1000, 0, rng) < TUNING.trialFailRate * 1000) {
                    d.failures += 1
                    d.tribulation = Math.max(
                        d.tribulationBaseline,
                        d.tribulation - TUNING.tribulationStep,
                    )
                    broadcasts.push(TRIAL_FAIL_ID)
                    const risk = softenRisk(
                        TUNING.trialDeathRisk *
                            (1 - deathShield(props, d)) *
                            TUNING.deathRiskScale,
                    )
                    if (random(1000, 0, rng) < risk * 1000)
                        broadcasts.push(TRIBULATION_FAILURE_ID)
                    break
                }
                const stage = d.tribulationStage
                d.tribulationStage += 1
                d.minor = Math.min(maxMinor, d.tribulationStage)
                broadcasts.push(TRIAL_BROADCAST_IDS[stage] ?? TRIAL_DONE_ID)
            }

            const done = d.tribulationStage >= TUNING.tribulationTrials
            if (done && d.daos.length >= TUNING.daosRequired) {
                if (!draft.ending) {
                    broadcasts.push(
                        TRIAL_DONE_ID,
                        ASCEND_READY_ID,
                        ASCEND_OMEN_ID,
                        ASCEND_EVENT_ID,
                    )
                }
            } else if (done) {
                // 九劫已过但大道不足：不能死锁，每年在雷隙里补悟一条，
                // 播报一条「尚缺」的提示，直到大道圆满再飞升。
                addDao(d, `雷隙补悟${d.daos.length + 1}`)
                if (d.daos.length >= TUNING.daosRequired && !draft.ending) {
                    broadcasts.push(
                        TRIAL_DONE_ID,
                        ASCEND_READY_ID,
                        ASCEND_OMEN_ID,
                        ASCEND_EVENT_ID,
                    )
                } else if (d.tribulationStage % 3 === 0) {
                    broadcasts.push(ASCEND_READY_ID)
                }
            } else if (
                d.failures >= TUNING.trialDoomThreshold &&
                random(1000, 0, rng) < 6
            ) {
                broadcasts.push(TRIBULATION_FAILURE_ID)
            }
            return
        }

        if (d.realm >= LAST_REALM) return

        // ── 常规境界：小境界自然提升 ──────────────────────────────────
        if (!d.bottleneck) {
            while (d.progress >= cfg.threshold && d.minor < maxMinor) {
                d.progress -= cfg.threshold
                d.minor += 1
                broadcasts.push(
                    variant(
                        MINOR_BROADCAST_VARIANTS[
                            Math.min(d.realm, MINOR_BROADCAST_VARIANTS.length - 1)
                        ] ?? [51200],
                        d.minor,
                    ),
                )
            }
            if (d.minor >= maxMinor && d.progress >= cfg.threshold) {
                d.progress = cfg.threshold
                d.bottleneck = true
            }
        }

        if (d.bottleneck) {
            // ── 冲击瓶颈：不管成败，站上去就有走火入魔的暴露风险 ────────
            // 境界越高越凶险，累计失败越多越凶险；道心/悟性/大道/护道可减伤。
            // 低方差设计：风险摊在一生多次尝试上，而不是失败那一把定生死。
            const attemptRisk = softenRisk(
                cfg.deathRisk *
                    (1 +
                        TUNING.deathEscalation *
                            Math.min(d.failures, TUNING.deathEscalationCap)) *
                    (1 - deathShield(props, d)) *
                    TUNING.deathRiskScale,
            )
            if (random(1000, 0, rng) < attemptRisk * 1000) {
                d.failures += 1
                broadcasts.push(BACKLASH_DEATH_ID)
                return
            }
            const rate = Math.min(
                TUNING.maxBreakRate,
                breakRate(d as unknown as CultivationState, props) +
                    draft.rateBonus,
            )
            if (random(1000, 0, rng) < rate * 1000) {
                const previousRealm = d.realm
                d.realm += 1
                d.minor = 0
                d.progress = 0
                d.bottleneck = false
                d.breakthroughs += 1
                // 失败次数只在本境界内累计：跨过大境界后重新计算，
                // 避免炼气期的一次失败永久放大后期走火入魔风险。
                d.failures = 0
                // 身魂合一 / 万法归一 / 雷劫不侵：突破瞬间全属性+20%
                applyBreakthroughGrowth(draft, previousRealm)
                // 进入渡劫期时记下当前准备度，九劫从零开始逐重扛
                if (d.realm === TRIAL_REALM) {
                    d.tribulationBaseline = d.tribulation
                    d.tribulationStage = 0
                }
                // 突破后寿元重置，天人五衰压力清零，否则活得越久越卡关
                d.decay = 0
                broadcasts.push(
                    variant(BREAKTHROUGH_SUCCESS_IDS, d.breakthroughs),
                )
            } else {
                d.failures += 1
                // 失败后退出瓶颈，必须重新把修为攒满才能再次冲关。
                // 否则 60% 的修为惩罚只是展示数字，下一年仍会立刻重试。
                d.bottleneck = false
                d.progress = Math.max(0, Math.floor(cfg.threshold * 0.6))
                broadcasts.push(
                    variant(BREAKTHROUGH_FAILURE_IDS, d.failures),
                )
            }
        }
    })
    return { state: nextState, broadcasts }
}

/**
 * 最近触发过的事件降权，同组文案自然轮换。
 * 兜底事件也降权但保留最小权重，保证任何一年都至少有几条可选。
 */
function decayLayer(
    layer: WeightedEvent[],
    state: GameState,
    age: number,
): WeightedEvent[] {
    return layer.map(([id, weight]) => {
        const history = state.eventHistory.get(id)
        const last = history?.at(-1)
        if (last === undefined) return [id, weight]
        const gap = age - last
        const isFallback = events.get(id)?.stage === 'fallback'
        if (gap < 3) return [id, Math.max(1, Math.round(weight * 0.06))]
        if (gap < 8) return [id, Math.max(1, Math.round(weight * 0.28))]
        if (gap < 15) return [id, Math.max(1, Math.round(weight * (isFallback ? 0.5 : 0.65)))]
        return [id, weight]
    })
}

/** 入道之后，旧表里那批「凡人寿终」事件不再参与随机抽取 */
export function isBlockedAfterStart(
    state: GameState,
    eventId: number,
): boolean {
    return (
        state.cultivation.started &&
        LEGACY_BLOCKED_AFTER_START.has(eventId)
    )
}

/**
 * 动态事件池：替代原来的 ages.get(age)!.event。
 *
 * 与旧行为最大的不同：年龄池不再「独占最高优先级」。
 * 旧表 100–500 岁每年第一层都是同样 18 条魂修事件，如果沿用
 * 「首层有候选就必抽」，新增的境界内容几乎永远进不了日志。
 * 现在把年龄池按权重摊平，和境界层 / 大道层 / 长生纪元层同台竞争。
 *
 * 500 岁之后 ages.get(age) 为空，整条链仍由境界池 + 长生池 + 兜底撑住，
 * 所以「删除 500 岁上限」不需要往 age.xlsx 里续写几千年。
 */
export function resolveEventPool(
    age: number,
    state: GameState,
): WeightedEvent[][] {
    const base = ages.get(age)?.event ?? []
    const c = state.cultivation
    if (!c.started)
        return [
            ...base.map(l => decayLayer(l, state, age)),
            universalFallbackLayer(),
        ]

    const cultivation = cultivationLayers({
        started: true,
        realm: c.realm,
        bottleneck: c.bottleneck,
        canAscend: false,
        age,
        triggered: id => state.events.has(id),
    })

    // ① 主线层：境界 / 大道 / 长生纪元（新内容为主）
    // ② 年龄层：旧剧情降权后混入，保留 100 岁开盒子等原有体验
    const legacy: WeightedEvent[] = []
    for (const level of base)
        for (const [id, weight] of level)
            legacy.push([
                id,
                Math.max(1, Math.round(weight * LEGACY_WEIGHT_SCALE)),
            ])

    const merged: WeightedEvent[] = []
    for (const level of cultivation) merged.push(...level)
    merged.push(...legacy)

    return [
        decayLayer(merged, state, age),
        ...fallbackLayers(c.realm).map(l => decayLayer(l, state, age)),
        universalFallbackLayer(),
    ]
}

/** 兜底保险：随机池彻底抽空时，直接从无条件兜底里挑一条 */
export function lastResortEvent(rng?: RNG): number | null {
    const layer = universalFallbackLayer()
    if (layer.length === 0) return null
    const total = layer.reduce((sum, [, w]) => sum + w, 0)
    let roll = random(total, 0, rng)
    for (const [id, weight] of layer) {
        roll -= weight
        if (roll < 0) return id
    }
    return layer.at(-1)?.[0] ?? null
}

export function cultivationSnapshot(state: GameState): CultivationSnapshot {
    return snapshot(state.cultivation, state.ending)
}

/** 供条件系统使用的补充键 */
export function cultivationFlatKeys(state: GameState, profile: ProfileState) {
    return createFlatState(state, profile)
}
