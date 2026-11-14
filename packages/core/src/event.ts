import {
    type Event,
    events,
    TUNING,
    LEGACY_BLOCKED_AFTER_START,
} from '@remake/data'
import type { CultivationEventMeta } from '@remake/data'
import type { Properties, GameState, ProfileState } from './state'
import { propsEffect, createFlatState } from './state'
import { check as checkCondition } from '@remake/condition'
import type { TriggerResult } from './game'
import { applyCultivationEffects } from './cultivation'
import { produce, enableMapSet } from 'immer'
enableMapSet()

type ExtendedEvent = Event & CultivationEventMeta

/** 这些类型的内容一生只出现一次，靠事件 id 去重，避免后期文案刷屏 */
const ONCE_STAGES = new Set([
    'entry',
    'dao',
    'breakthrough',
    'tribulation',
    'ending',
])

/** 不参与默认冷却的 stage：引擎播报 / 兜底 / 一生一次 */
const NO_COOLDOWN_STAGES = new Set([
    'entry',
    'dao',
    'breakthrough',
    'tribulation',
    'ending',
    'fallback',
])

export function check(
    event: Event['id'],
    state: GameState,
    profile: ProfileState,
) {
    const e = events.get(event) as ExtendedEvent | undefined
    if (!e) return false
    if (e.NoRandom) return false
    const { include, exclude } = e
    const stage = e.stage as string | undefined
    const age = state.props.current.age
    const c = state.cultivation

    // 入道之后，凡人寿终 / 旧链致死彩蛋不再随机抽到。
    // 这些事件原本靠旧链里程碑排除，百岁自动入道的玩家永远碰不到那些
    // 里程碑，于是会年年抽到「寿元终」被判死。修仙者的生死交给天劫。
    if (c.started && LEGACY_BLOCKED_AFTER_START.has(event)) return false

    // 一生一次
    if (stage && ONCE_STAGES.has(stage) && state.events.has(event)) return false

    // 冷却只作用于「修仙扩展事件」。旧表事件（没有 stage）自带
    // include / exclude 控制重复，再加冷却会切断原本的童年 / 修仙链式剧情；
    // 它们改由事件池里的权重衰减来降重复。
    const cooldown = stage
        ? (e.cooldown ??
          (NO_COOLDOWN_STAGES.has(stage)
              ? 0
              : stage === 'daily'
                ? TUNING.dailyCooldown
                : TUNING.defaultCooldown))
        : 0
    if (cooldown > 0 && stage !== 'fallback') {
        const last = state.eventHistory.get(event)?.at(-1)
        if (last !== undefined && age - last < cooldown) return false
    }

    // 同组文案轮换：只禁止「紧贴着的两年内连出同组」，组内不同条目
    // 仍可逐年轮换。若把整组一起锁多年，长生纪元反而没内容可播。
    if (e.variantGroup && stage !== 'fallback') {
        for (const [id, history] of state.eventHistory) {
            if (id === event) continue
            const other = events.get(id) as ExtendedEvent | undefined
            if (other?.variantGroup !== e.variantGroup) continue
            const last = history.at(-1)
            if (last !== undefined && age - last < TUNING.variantCooldown)
                return false
        }
    }

    // 长期标记 / 大道前置条件
    if (e.requireFlag && !c.flags.includes(e.requireFlag)) return false
    if (e.requireDao && !c.daos.includes(e.requireDao)) return false

    // 修仙池事件只在入道之后出现；旧年龄池事件没有 stage，完全不受影响。
    // fallback 例外：未入道也要有兜底，防止 500 岁后抽空。
    if (stage && stage !== 'fallback' && stage !== 'entry' && !c.started)
        return false

    const flatState = createFlatState(state, profile)
    if (exclude && checkCondition(flatState, exclude)) return false
    if (include) return checkCondition(flatState, include)
    return true
}

export function trigger(
    eventId: number,
    state: GameState,
    profile: ProfileState,
): TriggerResult<Event['id']> {
    const { effect, branch } = events.get(eventId)! as ExtendedEvent
    const newState = produce(state, draft => {
        draft.events.add(eventId)
        const age = draft.props.current.age
        const history = draft.eventHistory.get(eventId) ?? []
        draft.eventHistory.set(eventId, [...history, age])
        if (!effect) return
        if (effect.LIF) draft.life += effect.LIF
        const pe: Partial<Properties> = {}
        if (effect.AGE) {
            // 年龄事件（转世 / 夺舍等）可能把年龄改到负数或越过硬边界，
            // 这里统一夹到 >= 0，避免 ages.get(负年龄) 之类的异常。
            const target = Math.max(0, age + effect.AGE)
            pe.age = target - age
        }
        if (effect.CHR) pe.charm = effect.CHR
        if (effect.INT) pe.intelligence = effect.INT
        if (effect.STR) pe.strength = effect.STR
        if (effect.MNY) pe.money = effect.MNY
        if (effect.SPR) pe.spirit = effect.SPR
        draft.props = propsEffect(draft.props, pe)
    })
    // 修仙扩展效果（修为 / 境界 / 大道 / 结局）与旧链映射在这里统一结算，
    // 分支事件通过下面的递归也会各自走一遍。
    const withCultivation = applyCultivationEffects(newState, eventId)
    const flatState = createFlatState(withCultivation, profile)
    if (branch) {
        for (const { condition, event } of branch) {
            if (checkCondition(flatState, condition)) {
                const result = trigger(event, withCultivation, profile)
                return {
                    state: result.state,
                    triggers: [eventId, ...result.triggers],
                }
            }
        }
    }
    return { state: withCultivation, triggers: [eventId] }
}
