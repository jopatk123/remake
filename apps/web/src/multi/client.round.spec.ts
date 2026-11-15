import { describe, expect, test } from 'vitest'
import { applyRoomRound, applyTickRound } from './client'
import type { RoomView } from '@remake/multi'

function room(patch: Partial<RoomView> & Pick<RoomView, 'phase' | 'round' | 'match'>): RoomView {
    return {
        id: 'TEST',
        interval: 1500,
        paused: false,
        pausedBy: null,
        waiting: [],
        result: null,
        resultLeft: null,
        players: [],
        ...patch,
    }
}

describe('迟到的 tick 不能带进下一局', () => {
    test('大厅把年数清零', () => {
        expect(
            applyRoomRound(
                { round: 80, match: 1 },
                room({ phase: 'lobby', round: 80, match: 1 }),
            ),
        ).toEqual({ round: 0, match: 1 })
    })

    test('新的一局从 0 起算，不吃上一局的年数', () => {
        expect(
            applyRoomRound(
                { round: 80, match: 1 },
                room({ phase: 'playing', round: 0, match: 2 }),
            ),
        ).toEqual({ round: 0, match: 2 })
    })

    test('同一局里迟到的房间快照不会把年数拽回去', () => {
        expect(
            applyRoomRound(
                { round: 12, match: 1 },
                room({ phase: 'playing', round: 10, match: 1 }),
            ),
        ).toEqual({ round: 12, match: 1 })
    })

    test('上一局迟到的房间快照整份丢掉', () => {
        expect(
            applyRoomRound(
                { round: 0, match: 2 },
                room({ phase: 'playing', round: 80, match: 1 }),
            ),
        ).toBe('ignore')
    })

    test('大厅 / 结算里的 tick 丢掉', () => {
        expect(
            applyTickRound({ match: 1, phase: 'lobby' }, { round: 80, match: 1 }),
        ).toBe('ignore')
        expect(
            applyTickRound({ match: 1, phase: 'over' }, { round: 80, match: 1 }),
        ).toBe('ignore')
    })

    test('上一局迟到的 tick 丢掉', () => {
        expect(
            applyTickRound({ match: 2, phase: 'playing' }, { round: 80, match: 1 }),
        ).toBe('ignore')
    })

    test('当前局的 tick 照收', () => {
        expect(
            applyTickRound({ match: 2, phase: 'playing' }, { round: 3, match: 2 }),
        ).toBe(3)
    })
})
