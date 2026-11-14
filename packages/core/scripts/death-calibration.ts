/**
 * 死亡风险校准脚本（只读 + 临时改内存参数，不写任何文件）。
 *
 * 目标：活到 101 岁的玩家，最终飞升率 ≈ 5%。
 * 做法：对不同的 deathRiskScale 跑模拟，测出「到达 101 岁的局里飞升占比」，
 * 然后把最合适的 scale 烧进 TUNING。
 *
 * 在 packages/core 下运行：
 *   bun run scripts/death-calibration.ts
 */
import { TUNING } from '@remake/data'
import { createState } from '../src/state'
import { next } from '../src/game'

interface Alloc {
    charm: number
    intelligence: number
    strength: number
    money: number
    spirit: number
}

function randomAlloc(): Alloc {
    return {
        charm: 3 + Math.floor(Math.random() * 8),
        intelligence: 3 + Math.floor(Math.random() * 8),
        strength: 3 + Math.floor(Math.random() * 8),
        money: 3 + Math.floor(Math.random() * 8),
        spirit: 3 + Math.floor(Math.random() * 8),
    }
}

function freshProfile() {
    return {
        times: 0,
        talents: new Set<number>(),
        achievements: new Set<number>(),
        events: new Set<number>(),
    }
}

function measure(scale: number, runs: number) {
    ;(TUNING as { deathRiskScale: number }).deathRiskScale = scale
    let reached101 = 0
    let ascended = 0
    let exceptions = 0
    let deathAgeTotal = 0
    let deathCount = 0
    let pre100Deaths = 0
    const deathRealms = new Map<number, number>()
    for (let run = 0; run < runs; run++) {
        const profile = freshProfile()
        // 强制「神秘的小盒子」：这是设计上唯一能避开 85+ 安然离世、
        // 活到 100 岁入道的路径，校准群体就是这批玩家
        let state = createState(randomAlloc(), [1048])
        let hit101 = false
        let outcome: 'ascend' | 'death' | 'none' = 'none'
        for (let year = 0; year < 1600; year++) {
            let result
            try {
                result = next(state, profile)
            } catch (error) {
                exceptions++
                if (exceptions <= 2) console.error('异常:', error)
                break
            }
            state = result.state
            if (result.age >= 101) hit101 = true
            if (result.end) {
                if (result.ending === 'ascend') {
                    outcome = 'ascend'
                    break
                }
                if (result.ending === 'death' && result.age >= 100) {
                    outcome = 'death'
                    deathCount++
                    deathAgeTotal += result.age
                    const realm = state.cultivation.realm
                    deathRealms.set(realm, (deathRealms.get(realm) ?? 0) + 1)
                    break
                }
                // 100 岁前正常死亡（意外等基础游戏内容），本局结束
                if (result.age < 100) pre100Deaths++
                outcome = 'none'
                break
            }
        }
        if (hit101) {
            reached101++
            if (outcome === 'ascend') ascended++
        }
    }
    return {
        scale,
        reached101,
        ascended,
        rate: reached101 ? ascended / reached101 : 0,
        exceptions,
        pre100Deaths,
        avgDeathAge: deathCount ? Math.round(deathAgeTotal / deathCount) : 0,
        deathRealms: [...deathRealms.entries()].sort((a, b) => a[0] - b[0]),
    }
}

const RUNS = 150
console.log(`每档 ${RUNS} 局（强制持盒 1048），目标飞升率 5%`)
for (const scale of [1, 2, 3, 4, 6, 8]) {
    const r = measure(scale, RUNS)
    console.log(
        `scale=${scale}  到达101岁 ${r.reached101}  飞升 ${r.ascended}` +
            `  飞升率 ${(r.rate * 100).toFixed(1)}%  异常 ${r.exceptions}` +
            `  百岁前意外死 ${r.pre100Deaths}  平均死亡年龄 ${r.avgDeathAge}` +
            `  死亡境界分布 ${JSON.stringify(r.deathRealms)}`,
    )
}
