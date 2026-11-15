import { expect, test, describe } from 'bun:test'
import {
    AMBUSH_REBIRTH_ID,
    MORTAL_TITLE,
    TUNING,
} from '@remake/data'
import { createState } from './state'
import {
    advanceCultivation,
    cultivationSnapshot,
    rollMagicAmbush,
    shouldAutoStart,
} from './cultivation'
import { next } from './game'
import { produce } from 'immer'
import { enableMapSet } from 'immer'
enableMapSet()

const profile = {
    times: 0,
    talents: new Set<number>(),
    achievements: new Set<number>(),
    events: new Set<number>(),
}
const allocation = {
    charm: 40,
    intelligence: 40,
    strength: 40,
    money: 40,
    spirit: 40,
}

function cultivator(realm = 3) {
    return produce(createState(allocation, []), draft => {
        draft.cultivation.started = true
        draft.cultivation.startAge = 100
        draft.cultivation.realm = realm
        draft.cultivation.minor = 2
        draft.cultivation.progress = 80
        draft.cultivation.daos = ['水', '火', '金']
        draft.cultivation.flags = ['洞府']
        draft.cultivation.breakthroughs = 3
        draft.cultivation.failures = 2
        draft.props.current.age = 400
        draft.props.current.charm = 80
        draft.props.current.intelligence = 80
        draft.props.current.strength = 80
        draft.props.current.money = 80
        draft.props.current.spirit = 80
    })
}

describe('夺舍重生回到凡人', () => {
    test('境界清零、退出入道，修为条不再是炼气期', () => {
        // 第一次掷中偷袭，第二次选夺舍
        const rolls = [0, 0]
        const rng = () => rolls.shift() ?? 0
        const { state, broadcasts } = rollMagicAmbush(cultivator(), rng)
        expect(broadcasts).toContain(AMBUSH_REBIRTH_ID)
        expect(state.cultivation.started).toBe(false)
        expect(state.cultivation.startAge).toBe(0)
        expect(state.cultivation.realm).toBe(0)
        expect(state.cultivation.minor).toBe(0)
        expect(state.cultivation.progress).toBe(0)
        expect(state.cultivation.breakthroughs).toBe(0)
        expect(state.props.current.age).toBe(1)
        expect(state.props.current.charm).toBe(10)
        expect(state.cultivation.daos).toEqual(['水', '火', '金'])
        expect(state.cultivation.flags).toEqual(['洞府'])
        expect(cultivationSnapshot(state).title).toBe(MORTAL_TITLE)
        expect(cultivationSnapshot(state).started).toBe(false)
    })

    test('夺舍后年度修为不再按炼气往上涨', () => {
        const rolls = [0, 0]
        const rng = () => rolls.shift() ?? 0
        const reborn = rollMagicAmbush(cultivator(), rng).state
        const advanced = advanceCultivation(reborn)
        expect(advanced.broadcasts).toEqual([])
        expect(advanced.state.cultivation.progress).toBe(0)
        expect(advanced.state.cultivation.started).toBe(false)
    })

    test('童年阶段不会自动入道，百岁才再走入道', () => {
        const rolls = [0, 0]
        const rng = () => rolls.shift() ?? 0
        const reborn = rollMagicAmbush(cultivator(), rng).state
        expect(shouldAutoStart(reborn, 54)).toBe(false)
        expect(shouldAutoStart(reborn, TUNING.autoStartAge)).toBe(true)

        const quiet: (max?: number, min?: number) => number = (max = 1) => max
        const child = next(reborn, profile, quiet)
        expect(child.state.cultivation.started).toBe(false)
        expect(child.state.cultivation.progress).toBe(0)
        expect(child.cultivation.title).toBe(MORTAL_TITLE)

        const aged = produce(reborn, draft => {
            draft.props.current.age = TUNING.autoStartAge - 1
        })
        const entered = next(aged, profile, quiet)
        expect(entered.state.cultivation.started).toBe(true)
        expect(entered.cultivation.title).not.toBe(MORTAL_TITLE)
        expect(entered.cultivation.title.startsWith('炼气')).toBe(true)
    })
})
