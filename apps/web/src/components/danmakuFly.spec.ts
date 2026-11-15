import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Danmaku } from '@remake/multi'
import { QUEUE_LIMIT, TIMING, createDanmakuFlyController } from './danmakuFly'

function msg(id: string, text = 'hello'): Danmaku {
    return { id, from: 'p1', name: '甲', text, at: 1 }
}

describe('createDanmakuFlyController', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('未开场景时丢弃到达的消息', () => {
        const setActive = vi.fn()
        const ctl = createDanmakuFlyController(setActive)
        ctl.onArrival(msg('1'))
        expect(setActive).not.toHaveBeenCalled()
        ctl.dispose()
    })

    test('同一时刻只播一条，队列超出上限丢掉最旧的', () => {
        vi.useFakeTimers()
        const setActive = vi.fn()
        const ctl = createDanmakuFlyController(setActive)
        ctl.setContext({ mode: 'hero', reduced: true, toneOf: () => 0 })
        ctl.onArrival(msg('1', '一'))
        vi.advanceTimersByTime(0)
        expect(setActive).toHaveBeenCalledTimes(1)
        expect(setActive.mock.calls[0]![0]).toMatchObject({ item: { id: '1' } })

        ctl.onArrival(msg('2', '二'))
        ctl.onArrival(msg('3', '三'))
        ctl.onArrival(msg('4', '四'))
        expect(setActive).toHaveBeenCalledTimes(1)
        expect(QUEUE_LIMIT).toBe(2)

        vi.advanceTimersByTime(2400)
        expect(setActive).toHaveBeenLastCalledWith(null)
        vi.advanceTimersByTime(TIMING.hero.cooldown)
        expect(setActive.mock.calls.at(-1)![0]).toMatchObject({
            item: { id: '3' },
        })
        ctl.dispose()
    })

    test('换场景把正在飞的和队列一起作废', () => {
        vi.useFakeTimers()
        const setActive = vi.fn()
        const ctl = createDanmakuFlyController(setActive)
        ctl.setContext({ mode: 'hero', reduced: true, toneOf: () => 0 })
        ctl.onArrival(msg('1'))
        vi.advanceTimersByTime(0)
        ctl.onArrival(msg('2'))
        const first = setActive.mock.calls[0]![0]
        expect(ctl.isCurrent(first)).toBe(true)

        ctl.setContext({ mode: 'compact', reduced: true, toneOf: () => 0 })
        expect(ctl.isCurrent(first)).toBe(false)
        expect(setActive).toHaveBeenLastCalledWith(null)
        vi.advanceTimersByTime(10_000)
        expect(
            setActive.mock.calls.some(call => call[0]?.item.id === '2'),
        ).toBe(false)
        ctl.dispose()
    })
})
