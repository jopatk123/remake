import { describe, expect, test } from 'vitest'
import { deathEventId, deathText } from './death'

describe('死因事件', () => {
    test('分支死法报「你死了。」前面那条事件，才是真正的原因', () => {
        expect(deathEventId([{ events: [10003, 10000] }])).toBe(10003)
    })

    test('自带结局文本的事件直接报自己', () => {
        expect(deathEventId([{ events: [40050] }])).toBe(40050)
        expect(deathEventId([{ events: [10009, 30002, 10010] }])).toBe(30002)
    })

    test('没有前因时退回「你死了。」，查不到扣命事件就用当年最后一条', () => {
        expect(deathEventId([{ events: [10000] }])).toBe(10000)
        expect(deathEventId([{ events: [10010] }])).toBe(10010)
        expect(deathEventId([])).toBeNull()
    })

    test('只取最后一年的日志', () => {
        const logs = [
            { events: [10001, 40050] },
            { events: [10003, 10000] },
        ]
        expect(deathEventId(logs)).toBe(10003)
    })

    test('文本按 id 查表，换行压平、超长截断，未知 id 返回 null', () => {
        expect(deathText(10003, 30)).toBe('你生了场重病。')
        expect(deathText(10000, 30)).toBe('你死了。')
        expect(deathText(10779, 30)).toContain('居然还有人在人生重开')
        expect(deathText(11503, 30)?.length).toBeLessThanOrEqual(120)
        expect(deathText(null, 30)).toBeNull()
        expect(deathText(99999999, 30)).toBeNull()
    })
})
