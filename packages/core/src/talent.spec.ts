import { expect, test, describe } from 'bun:test'
import type { ProfileState } from './state'
import type { PullOptions } from './talent'
import { pull, exclude, additionalPoints, replacement } from './talent'
import { talents } from '@remake/data'
import { produce } from 'immer'
import { enableMapSet } from 'immer'
enableMapSet()

describe('Talent', () => {
    const profile = {
        times: 0,
        talents: new Set([]),
        achievements: new Set([]),
        events: new Set([]),
    } as ProfileState

    const options = {
        count: 10,
        rate: {
            base: new Map([
                [0, 1000 - 111],
                [1, 100],
                [2, 10],
                [3, 1],
            ]),
            additions: {},
        },
    } as PullOptions

    test('pull external', () => {
        const p = produce(profile, draft => {
            draft.locked = [1001]
        })
        const result = pull(options, p)
        expect(result.length).toBe(options.count)
        expect(result).toContain(p.locked![0]!)
    })

    test('pull rate', () => {
        const opts = produce(options, draft => {
            draft.rate.additions = {
                times: () =>
                    new Map([
                        [0, { mode: 'multiply', value: 0 }],
                        [1, { mode: 'multiply', value: 0 }],
                        [2, { mode: 'multiply', value: 0 }],
                        [3, { mode: 'multiply', value: 1 }],
                    ]),
            }
        })
        const result = pull(opts, profile)
        expect(result.some(id => talents.get(id)?.grade === 3)).toBe(true)
    })

    test('exclude', () => {
        expect(exclude(1003, [1004])).toBe(1004)
        expect(exclude(1004, [1003])).toBe(1003)
        expect(exclude(1001, [1002, 1003])).toBe(null)
    })

    test('additionalPoints', () => {
        const result = additionalPoints([1001, 1002, 1003, 1007, 1019])
        expect(result).toEqual({
            source: [
                { talent: 1007, points: 2 },
                { talent: 1019, points: 4 },
            ],
            points: 6,
        })
    })

    test('replacement talent [阴间福袋]', () => {
        const talent = 1145
        const result = replacement([talent])
        // 福袋开奖后消耗本体，最终只剩开出来的天赋
        expect(result.talents.size).toBe(1)
        expect(result.talents.has(talent)).toBe(false)
        const source = talents.get(talent)!.replacement!.talent!
        const replaced = result.chains.get(talent)!.at(0)!
        expect(source.map(t => t[0])).toContain(replaced)
    })

    test('replacement grade [橙色转盘]', () => {
        const talent = 1144
        const result = replacement([talent])
        expect(result.talents.size).toBe(1)
        expect(result.talents.has(talent)).toBe(false)
        const source = talents.get(talent)!.replacement!.grade!
        const replaced = result.chains.get(talent)!.at(0)!
        expect(talents.get(replaced)?.grade).toBe(source)
    })

    test('pull 遵守互斥表，不会同时给出互斥天赋', () => {
        // 只出蓝色，抽满整个蓝色池，必然覆盖 1003 / 1004
        const opts = {
            count: 55,
            rate: {
                base: new Map([
                    [0, 0],
                    [1, 1000],
                    [2, 0],
                    [3, 0],
                ]),
                additions: {},
            },
        } as PullOptions
        const result = pull(opts, profile)
        expect(result.includes(1003) && result.includes(1004)).toBe(false)
    })

    test('橙色天赋数值收敛', () => {
        // 仲夏夜之梦不再是 114509 道心
        expect(talents.get(2032)?.effect?.SPR).toBe(8)
        // 太古遗脉从 +30 全属性收到 +10
        expect(talents.get(3019)?.entryAll?.value).toBe(10)
        // 转世重修的体质惩罚不再夸张到 -1000
        expect(talents.get(1134)?.reviveEffect?.STR).toBe(-50)
        // 叠加态回到紫色池，不再是没有入口的死数据
        expect(talents.get(2016)?.exclusive).toBeFalsy()
    })
})
