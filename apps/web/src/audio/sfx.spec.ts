import { describe, expect, test } from 'vitest'
import type { RareFxItem } from '@/fx/rare'
import { peerOutcomeSfx, sfxForRareItem } from './sfx'

const alive = { alive: true, ending: null }

describe('peerOutcomeSfx', () => {
    test('第一次见到这个人不发声，避免进房把已结束的人重播一遍', () => {
        expect(
            peerOutcomeSfx(undefined, { alive: false, ending: 'death' }),
        ).toBeNull()
    })

    test('飞升 / 超脱 / 离世走远钟，即使 alive 已经变成 false', () => {
        expect(
            peerOutcomeSfx(alive, { alive: false, ending: 'ascend' }),
        ).toBe('farAscend')
        expect(
            peerOutcomeSfx(alive, { alive: false, ending: 'transcend' }),
        ).toBe('farAscend')
        expect(
            peerOutcomeSfx(alive, { alive: false, ending: 'leave-world' }),
        ).toBe('farAscend')
    })

    test('身死、转世、掉线按死亡远钟', () => {
        expect(
            peerOutcomeSfx(alive, { alive: false, ending: 'death' }),
        ).toBe('farDeath')
        expect(
            peerOutcomeSfx(alive, { alive: false, ending: 'reincarnation' }),
        ).toBe('farDeath')
        expect(
            peerOutcomeSfx(alive, { alive: false, ending: null }),
        ).toBe('farDeath')
    })

    test('已经结束过的人不再响', () => {
        expect(
            peerOutcomeSfx(
                { alive: false, ending: 'ascend' },
                { alive: false, ending: 'ascend' },
            ),
        ).toBeNull()
    })
})

function item(partial: Partial<RareFxItem>): RareFxItem {
    return {
        key: 'k',
        tier: 2,
        tone: 'gold',
        tag: '天赋',
        title: 'x',
        ...partial,
    }
}

describe('sfxForRareItem', () => {
    test('结局按 ending 类型，不靠中文标题', () => {
        expect(sfxForRareItem(item({ tag: '结局', ending: 'ascend', title: '改名了' }))).toBe('ascend')
        expect(sfxForRareItem(item({ tag: '结局', ending: 'transcend' }))).toBe('ascend')
        expect(sfxForRareItem(item({ tag: '结局', ending: 'leave-world' }))).toBe('ascend')
        expect(sfxForRareItem(item({ tag: '结局', ending: 'reincarnation' }))).toBe('reincarnation')
        expect(sfxForRareItem(item({ tag: '结局', ending: 'death' }))).toBe('death')
    })

    test('飞升事件与魔劫走专属音色', () => {
        expect(sfxForRareItem(item({ tag: '飞升' }))).toBe('ascend')
        expect(sfxForRareItem(item({ fx: 'ambush', tag: '魔劫' }))).toBe('ambush')
        expect(sfxForRareItem(item({ tag: '雷劫' }))).toBe('tribulation')
    })
})
