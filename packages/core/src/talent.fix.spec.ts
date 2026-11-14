import { expect, test, describe } from 'bun:test'
import {
    talents,
    CultivationPath,
    BOX_ENTRY_EVENT_ID,
    TRIBULATION_FAILURE_ID,
} from '@remake/data'
import { createState, propsEffect } from './state'
import { exclude, replacement, tryRevive, trigger as ttr } from './talent'
import { trigger as etr } from './event'
import { applyCultivationEffects, pickEntryEvent } from './cultivation'
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
    charm: 5,
    intelligence: 5,
    strength: 5,
    money: 5,
    spirit: 5,
}

describe('天赋 / 事件修复', () => {
    test('白色转盘 grade=0 不再空开', () => {
        const result = replacement([2009])
        const chain = result.chains.get(2009)
        expect(chain?.length).toBeGreaterThan(0)
        expect(talents.get(chain![0]!)?.grade).toBe(0)
    })

    test('突破 +20% 天赋互斥', () => {
        expect(exclude(3011, [3012])).toBe(3012)
        expect(exclude(3012, [3013])).toBe(3013)
        expect(exclude(3013, [3011])).toBe(3011)
    })

    test('太古遗脉入道即生效，不限太古法门', () => {
        let state = createState(allocation, [3019])
        state = produce(state, draft => {
            draft.props = propsEffect(draft.props, { age: 101 })
        })
        state = applyCultivationEffects(state, 50000)
        expect(state.cultivation.started).toBe(true)
        expect(state.cultivation.path).toBe(CultivationPath.Standard)
        expect(state.props.current.intelligence).toBe(35)
        expect(talents.get(3019)?.entryAll?.path).toBeUndefined()
    })

    test('入道后传承洞府不再改修行路线', () => {
        let state = createState(allocation, [])
        state = produce(state, draft => {
            draft.props = propsEffect(draft.props, { age: 101 })
        })
        state = applyCultivationEffects(state, 50000)
        expect(state.cultivation.path).toBe(CultivationPath.Standard)
        state = applyCultivationEffects(state, 40061)
        expect(state.cultivation.path).toBe(CultivationPath.Standard)
        expect(state.cultivation.started).toBe(true)
    })

    test('持有小盒子时百岁入道走开盒事件', () => {
        const state = createState(allocation, [1048])
        expect(pickEntryEvent(state)).toBe(BOX_ENTRY_EVENT_ID)
        const started = produce(
            createState(allocation, []),
            draft => {
                draft.props = propsEffect(draft.props, { age: 100 })
            },
        )
        const withBox = produce(started, draft => {
            draft.talents.add(1048)
        })
        const result = next(withBox, profile)
        expect(result.age).toBe(100)
        expect(result.events).toContain(BOX_ENTRY_EVENT_ID)
        expect(result.state.cultivation.started).toBe(true)
        const plain = next(started, profile)
        expect(plain.events).not.toContain(BOX_ENTRY_EVENT_ID)
        expect(
            plain.events.some(id => id >= 50000 && id < 50010),
        ).toBe(true)
    })

    test('恶魔的交易能从修仙身死中救人', () => {
        const dead = produce(createState(allocation, [1148]), draft => {
            draft.life = 0
            draft.ending = 'death'
        })
        const revived = tryRevive(dead)
        expect(revived.state.life).toBe(1)
        expect(revived.state.ending).toBeNull()
        expect(revived.events).toContain(20001)

        const killed = etr(
            51310,
            createState(allocation, [1148]),
            profile,
        )
        expect(killed.state.life).toBe(1)
        expect(killed.state.ending).toBeNull()
        expect(killed.triggers).toContain(20001)
    })

    test('诺贝尔奖必须先得奖才能复活', () => {
        const dead = produce(createState(allocation, [2024]), draft => {
            draft.life = 0
            draft.ending = 'death'
        })
        expect(tryRevive(dead).state.life).toBe(0)
        const awarded = produce(dead, draft => {
            draft.events.add(10679)
        })
        const revived = tryRevive(awarded)
        expect(revived.state.life).toBe(1)
        expect(revived.events).toContain(11504)
    })

    test('转世重修只在渡劫失败时重生', () => {
        const dead = produce(createState(allocation, [1134]), draft => {
            draft.life = 0
            draft.ending = 'death'
            draft.props.current.age = 800
            draft.props.current.strength = 20
        })
        expect(tryRevive(dead).state.life).toBe(0)
        const trib = produce(dead, draft => {
            draft.events.add(TRIBULATION_FAILURE_ID)
            draft.eventHistory.set(TRIBULATION_FAILURE_ID, [800])
        })
        const revived = tryRevive(trib)
        expect(revived.state.life).toBe(1)
        expect(revived.events).toContain(20409)
        expect(revived.state.props.current.age).toBe(300)
    })

    test('紫色胶囊用 skipAge 跳过 40~50 岁', () => {
        const state = produce(createState(allocation, [1104]), draft => {
            draft.props = propsEffect(draft.props, { age: 40 })
        })
        const result = next(state, profile)
        expect(result.age).toBe(50)
        expect(result.talents).toContain(1104)
    })

    test('护道之人入道后写入护道人标记', () => {
        const state = produce(createState(allocation, [3016]), draft => {
            draft.cultivation.started = true
            draft.props = propsEffect(draft.props, { age: 101 })
        })
        const result = ttr(state, profile)
        expect(result.triggers).toContain(3016)
        expect(result.state.cultivation.flags).toContain('护道人')
    })

    test('筑基丹在冲击筑基时触发，而不是筑基之后', () => {
        expect(talents.get(3006)?.condition).toBe('BTL=1&REALM=0')
        expect(talents.get(3007)?.condition).toBe('BTL=1&REALM=1')
        expect(talents.get(3008)?.condition).toBe('BTL=1&REALM=2')
        expect(talents.get(3014)?.condition).toBe('DAO>=3')
        expect(talents.get(3018)?.condition).toBe('AGE>=500')
        expect(talents.get(3017)?.max).toBe(3)
    })
})
