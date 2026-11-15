/**
 * 一次性音效。
 *
 * 语义不另起一套判定 —— 直接复用 fx/rare.ts 已经分好的 tone / tag：
 * 那边判断"这个时刻该有多重的视觉反馈"，这边判断"该有多重的声音"，
 * 两边看同一份分类，才不会出现画面上是天降横祸、听起来却像捡了个铜板。
 *
 * tone → 音色家族：
 *   gold   金属（FM 钟、磬）
 *   violet 弦（短拨）
 *   azure  噪声（滤波扫频：雷、水、风）
 *   jade   木石（带通噪声）
 *   blood  低频冲击 + 噪声撕裂
 */

import type { RareFxItem } from '@/fx/rare'
import { getGraph } from './context'
import { bell, click, drum, heartbeat, midiToHz, noiseBurst, pluck } from './synth'

export type SfxName =
    | 'ui'
    | 'flip'
    | 'rare'
    | 'vessel'
    | 'chain'
    | 'propUp'
    | 'propDown'
    | 'breakthrough'
    | 'tribulation'
    | 'insight'
    | 'omen'
    | 'crisis'
    | 'ambush'
    | 'ascend'
    | 'death'
    | 'reincarnation'
    | 'seal'
    | 'farDeath'
    | 'farAscend'

export function playSfx(name: SfxName, pan = 0, delay = 0) {
    const g = getGraph()
    if (!g) return
    const bus = g.sfxBus
    /* 留一点点提前量，避免第一个包络点和当前时刻撞在一起 */
    const t = g.ctx.currentTime + 0.006 + delay

    switch (name) {
        case 'ui':
            click(g, t, 0.1, bus)
            return

        case 'flip':
            noiseBurst(g, t, 0.09, 0.09, bus, {
                type: 'bandpass',
                from: 5200,
                to: 1600,
                q: 1.6,
                wet: 0.08,
                attack: 0.002,
            })
            return

        case 'rare': {
            bell(g, midiToHz(76), t, 2.4, 0.13, bus)
            bell(g, midiToHz(83), t + 0.06, 2.8, 0.08, bus, 0.9, pan)
            return
        }

        case 'vessel': {
            /* 玉片相击：高频、短、脆 */
            bell(g, midiToHz(88), t, 1.8, 0.11, bus, 0.7)
            bell(g, midiToHz(91), t + 0.05, 1.6, 0.09, bus, 0.7)
            noiseBurst(g, t, 0.12, 0.05, bus, {
                type: 'highpass',
                from: 5000,
                to: 8000,
                q: 0.8,
                wet: 0.2,
                attack: 0.002,
            })
            return
        }

        case 'chain': {
            pluck(g, midiToHz(72), t, 0.5, 0.13, bus)
            pluck(g, midiToHz(64), t + 0.11, 0.5, 0.11, bus)
            pluck(g, midiToHz(79), t + 0.22, 0.9, 0.13, bus)
            return
        }

        case 'propUp':
            pluck(g, midiToHz(84), t, 0.28, 0.09, bus)
            return

        case 'propDown':
            pluck(g, midiToHz(64), t, 0.32, 0.09, bus)
            return

        case 'breakthrough': {
            /* 鼓垫底 + 磬 + 一段上扬扫频：向上，但不是飞升那种规模 */
            drum(g, t, 0.26, bus)
            bell(g, midiToHz(72), t + 0.02, 3.2, 0.13, bus)
            noiseBurst(g, t + 0.02, 0.5, 0.06, bus, {
                type: 'bandpass',
                from: 900,
                to: 4800,
                q: 1.2,
                wet: 0.3,
                attack: 0.2,
            })
            return
        }

        case 'tribulation': {
            /* 雷：低频轰 + 高频碎裂，两段叠在一起才像"劈"而不是"鼓" */
            noiseBurst(g, t, 1.1, 0.34, bus, {
                type: 'lowpass',
                from: 5200,
                to: 140,
                q: 0.8,
                wet: 0.45,
                attack: 0.004,
            })
            drum(g, t, 0.32, bus)
            noiseBurst(g, t + 0.04, 1.6, 0.12, bus, {
                type: 'highpass',
                from: 3200,
                to: 900,
                q: 0.7,
                wet: 0.6,
                attack: 0.002,
            })
            return
        }

        case 'insight': {
            /* 顿悟：泛音列往上堆，五度关系，不解决也不紧张 */
            bell(g, midiToHz(69), t, 3.4, 0.1, bus)
            bell(g, midiToHz(76), t + 0.14, 3.4, 0.08, bus)
            bell(g, midiToHz(81), t + 0.28, 3.6, 0.06, bus)
            return
        }

        case 'omen':
            bell(g, midiToHz(79), t, 4.2, 0.09, bus, 1.1)
            return

        case 'crisis': {
            pluck(g, midiToHz(52), t, 0.9, 0.15, bus)
            noiseBurst(g, t, 0.7, 0.11, bus, {
                type: 'bandpass',
                from: 2400,
                to: 240,
                q: 1.1,
                wet: 0.35,
                attack: 0.01,
            })
            return
        }

        case 'ambush': {
            /* 魔劫：刀光下坠 → 撞击 → 心跳，三段错开，不叠成一坨 */
            noiseBurst(g, t, 0.62, 0.34, bus, {
                type: 'bandpass',
                from: 7600,
                to: 220,
                q: 1.4,
                wet: 0.5,
                attack: 0.006,
            })
            drum(g, t + 0.5, 0.34, bus)
            heartbeat(g, t + 1.1, 0.2, bus)
            return
        }

        case 'ascend': {
            /* 六秒版：事件当下用。磬 → 五声堆叠 → 鼓，收在长混响里 */
            bell(g, midiToHz(77), t + 0.15, 5, 0.2, bus)
            const gong = [0, 2, 4, 7, 9]
            for (let i = 0; i < 6; i += 1) {
                const midi = 55 + (gong[i % 5] ?? 0) + 12 * Math.floor(i / 5)
                pluck(g, midiToHz(midi), t + 0.35 + i * 0.3, 2.2, 0.13, bus)
            }
            drum(g, t + 2.2, 0.32, bus)
            bell(g, midiToHz(86), t + 2.2, 6, 0.15, bus)
            return
        }

        case 'death': {
            bell(g, midiToHz(45), t, 4, 0.18, bus)
            noiseBurst(g, t, 1.4, 0.09, bus, {
                type: 'lowpass',
                from: 1800,
                to: 90,
                q: 0.7,
                wet: 0.7,
                attack: 0.02,
            })
            return
        }

        case 'reincarnation': {
            for (let i = 0; i < 6; i += 1) {
                pluck(g, midiToHz(57 + i * 2), t + i * 0.13, 1.1, 0.1, bus)
            }
            heartbeat(g, t + 1.1, 0.2, bus)
            return
        }

        case 'seal': {
            /* 印章落下：闷响 + 纸面摩擦 */
            drum(g, t, 0.22, bus)
            noiseBurst(g, t, 0.28, 0.1, bus, {
                type: 'lowpass',
                from: 2600,
                to: 500,
                q: 0.9,
                wet: 0.2,
                attack: 0.008,
            })
            return
        }

        case 'farDeath':
            bell(g, midiToHz(54), t, 3.4, 0.055, bus, 1.2, pan)
            return

        case 'farAscend':
            bell(g, midiToHz(78), t, 4, 0.05, bus, 1.2, pan)
            return
    }
}

/** 把视觉总线的产出翻成声音，不重复判定语义 */
export function playRareFx(items: readonly RareFxItem[]) {
    /* 同一年可能有多条，最多三条，按稀有度从高到低 */
    for (const item of items.slice(0, 3)) {
        if (item.fx === 'ambush') {
            playSfx('ambush')
            continue
        }
        if (item.tag === '飞升') {
            playSfx('ascend')
            continue
        }
        if (item.tag === '结局') {
            if (item.title === '渡劫飞升' || item.title === '超脱') playSfx('ascend')
            else if (item.title === '转世重修') playSfx('reincarnation')
            else playSfx('death')
            continue
        }
        if (item.tag === '雷劫') {
            playSfx('tribulation')
            continue
        }
        if (item.tag === '危机') {
            playSfx('crisis')
            continue
        }
        if (item.tag === '顿悟') {
            playSfx('insight')
            continue
        }
        if (item.tag === '天兆') {
            playSfx('omen')
            continue
        }
        if (item.tag === '稀有天赋' || item.tag === '橙色天赋') {
            playSfx('rare')
            continue
        }
        if (item.tag === '稀有奇遇' || item.tag === '奇遇') {
            playSfx('omen')
            continue
        }
        /* 紫色天赋之类的轻提示：不喧宾夺主，但要让玩家知道有新东西 */
        playSfx('propUp')
    }
}
