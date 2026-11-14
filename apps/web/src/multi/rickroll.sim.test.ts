import { describe, it } from 'vitest'
import { start, type ProfileState } from '@remake/core'
// 直接调事件触发器，验证 11503 的 LIF:-1 到底有没有生效
import { trigger as etr } from '../../../../packages/core/src/event'

const props = { charm: 5, intelligence: 5, strength: 5, money: 5, spirit: 5 }

function profile(): ProfileState {
    return {
        times: 0,
        talents: new Set<number>(),
        events: new Set<number>(),
        achievements: new Set<number>(),
    }
}

describe('永不言弃 / 11503', () => {
    it('检查 Rickroll 事件的 LIF:-1 和复活天赋', () => {
        for (const talents of [[2036], [2036, 1135], [2036, 1135, 1008, 1010]]) {
            const p = profile()
            const { state } = start(p, props, talents as number[])
            const r = etr(11503, state, p)
            console.log(
                '[RICK]',
                JSON.stringify({
                    talents,
                    lifeBefore: state.life,
                    lifeAfter: r.state.life,
                    ending: r.state.ending,
                    triggers: r.triggers,
                }),
            )
        }
    })
})
