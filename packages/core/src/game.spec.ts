import { expect, test, describe } from 'bun:test'
import { createState, propsEffect, summary as stateSummary } from './state'
import { pick, start, next, summary, end } from './game'
import { produce } from 'immer'
import { enableMapSet } from 'immer'
enableMapSet()

describe('Achievement', () => {
    const profile = {
        times: 0,
        talents: new Set([]),
        achievements: new Set([]),
        events: new Set([]),
    }
    const allocation = {
        charm: 5,
        intelligence: 5,
        strength: 5,
        money: 5,
        spirit: 5,
    }

    test('talentsPicked', () => {
        // 挑战者、阴间福袋、轮盘赌
        const result = pick([1122, 1145, 1146])
        expect(result.talents.chains.size).toBeGreaterThan(1)
        expect(result.additionalPoints.source).toContainEqual({
            talent: 1122,
            points: -20,
        })
    })

    test('start', () => {
        const result = start(profile, allocation, [1001, 1111, 1130])
        expect(result.state.achievements).toContain(228) // 只通一窍
    })

    test('next', () => {
        // 白色胶囊
        const state = produce(
            createState(allocation, [1001, 1002, 1103]),
            draft => {
                draft.props = propsEffect(draft.props, { age: 10 })
            },
        )
        const result = next(state, profile)
        expect(result.state.props.current.age).toBe(10) // 十岁
        expect(result.state.events).toContain(10588) // 无事发生
    })

    test('encounter', () => {
        const state = produce(
            createState(allocation, [1001, 1002]),
            draft => {
                draft.props = propsEffect(draft.props, { age: 10 })
            },
        )
        // 概率 1 = 必定触发：拿到天赋 + 事件进日志
        const hit = next(state, profile, undefined, {
            encounters: [{ event: 11560, talent: 1048, rate: 1 }],
        })
        expect(hit.state.talents.has(1048)).toBe(true)
        expect(hit.state.events.has(11560)).toBe(true)
        expect(hit.events).toContain(11560)
        expect(hit.talents).toContain(1048)
        // 已经触发过该事件后不再重复触发
        const again = next(hit.state, profile, undefined, {
            encounters: [{ event: 11560, talent: 1048, rate: 1 }],
        })
        expect(again.events).not.toContain(11560)
        // 奇遇发放的天赋不再走次年触发，日志里只出现一次
        expect(again.talents).not.toContain(1048)
        // 概率 0 不触发
        const miss = next(state, profile, undefined, {
            encounters: [{ event: 11560, talent: 1048, rate: 0 }],
        })
        expect(miss.state.talents.has(1048)).toBe(false)
        // 超过 maxAge 后不再判定（盒子只能在 100 岁前拿到）
        const over = next(state, profile, undefined, {
            encounters: [{ event: 11560, talent: 1048, rate: 1, maxAge: 9 }],
        })
        expect(over.state.talents.has(1048)).toBe(false)
        expect(over.events).not.toContain(11560)
        // 正好等于 maxAge 时仍判定
        const ok = next(state, profile, undefined, {
            encounters: [{ event: 11560, talent: 1048, rate: 1, maxAge: 10 }],
        })
        expect(ok.state.talents.has(1048)).toBe(true)
    })

    test('summary', () => {
        const state = produce(
            createState(allocation, [1001, 1111, 1130]),
            draft => {
                draft.props = propsEffect(draft.props, {
                    charm: 1000,
                    intelligence: 1000,
                    strength: 1000,
                    money: 1000,
                    spirit: 1000,
                    age: 501,
                })
            },
        )
        const result = summary(state, profile)
        const s = stateSummary(state)
        expect(s).toBeGreaterThan(10000) // 总评大于10000
        expect(result.state.achievements).toContain(245) // 传奇人物
        expect(result.state.achievements).toContain(246) // 不可思议
        expect(result.state.achievements).toContain(247) // 大能者
        expect(result.state.achievements).toContain(248) // 无上存在
    })

    test('end', () => {
        const p = { ...profile, times: 500, talents: new Set([1002, 1003]) }
        const state = produce(
            createState(allocation, [1001, 1111, 1130]),
            draft => {
                draft.props = propsEffect(draft.props, {
                    charm: 1000,
                    intelligence: 1000,
                    strength: 1000,
                    money: 1000,
                    spirit: 1000,
                    age: 501,
                })
            },
        )
        const result = end(state, p)
        expect(result.profile.achievements).toContain(101) // 既视感
        expect(result.profile.achievements).toContain(102) // 孟婆愁
        expect(result.profile.achievements).toContain(103) // 所有人都是我
        expect(result.profile.achievements).toContain(104) // Rewrite
        expect(result.achievements).toContain(101)
        expect(result.achievements).toContain(102)
        expect(result.achievements).toContain(103)
        expect(result.achievements).toContain(104)
        expect(result.profile.talents).toContain(1001)
        expect(result.profile.talents).toContain(1002)
        expect(result.profile.talents).toContain(1003)
        expect(result.profile.talents).toContain(1111)
        expect(result.profile.talents).toContain(1130)
    })
})
