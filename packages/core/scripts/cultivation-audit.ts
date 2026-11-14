/**
 * 修仙体系验收脚本（只读，不改任何数据）。
 *
 * 在 packages/core 下运行：
 *   bun run scripts/cultivation-audit.ts
 *
 * 三部分：
 *  ① 数据一致性：id / 效果字段 / 条件 / 分支引用 / 旧链映射 / 各境界池覆盖
 *  ② 批量模拟：无异常、500 岁后可继续、十境可达、九重雷劫、飞升可达、重复率
 *  ③ 硬断言：不达标时以非零退出码结束
 */
import {
    events,
    ages,
    cultivationEvents,
    eventsByRealm,
    eventsByStage,
    LEGACY_EVENT_IDS,
    LEGACY_BLOCKED_AFTER_START,
    LAST_REALM,
    TRIAL_REALM,
    TUNING,
    TRIAL_BROADCAST_IDS,
} from '@remake/data'
import { parse } from '@remake/condition'
import baseEvents from '../../data/dist/event'
import { createState } from '../src/state'
import { next } from '../src/game'
import { produce } from 'immer'

const issues: string[] = []
const fail = (msg: string) => issues.push(msg)

// ── ① 数据一致性 ────────────────────────────────────────────────────────
const ALLOWED_EFFECT = new Set([
    'CHR', 'INT', 'STR', 'MNY', 'SPR', 'LIF', 'AGE',
    'CULT', 'REALM', 'MINOR', 'PATH', 'DAO', 'TRIB', 'RATE',
])
const ALLOWED_STAGE = new Set([
    'entry', 'daily', 'resource', 'sect', 'relation', 'explore',
    'dao', 'crisis', 'breakthrough', 'tribulation', 'ending', 'fallback',
])

const baseCount = baseEvents.size
const conflicts = [...cultivationEvents.keys()].filter(id => baseEvents.has(id))
if (conflicts.length > 0)
    fail(`扩展事件与旧 id 冲突: ${conflicts.join(',')}`)
if (events.size !== baseCount + cultivationEvents.size)
    fail(`合并后事件数不对：${baseCount} + ${cultivationEvents.size} != ${events.size}`)

const idSet = new Set<number>()
for (const [id, e] of cultivationEvents) {
    if (idSet.has(id)) fail(`扩展事件 id 重复: ${id}`)
    idSet.add(id)
    if (!e.event) fail(`事件 ${id} 缺少文本`)
    if (![0, 1, 2, 3].includes(e.grade)) fail(`事件 ${id} 稀有度非法`)
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(e.event))
        fail(`事件 ${id} 文本含控制字符或乱码`)
    const stage = e.stage as string | undefined
    if (!stage || !ALLOWED_STAGE.has(stage))
        fail(`事件 ${id} 缺少合法 stage: ${stage}`)
    if (typeof e.realm === 'number' && (e.realm < 0 || e.realm > LAST_REALM))
        fail(`事件 ${id} 境界越界: ${e.realm}`)
    if (e.effect) {
        for (const [key, value] of Object.entries(e.effect)) {
            if (!ALLOWED_EFFECT.has(key))
                fail(`事件 ${id} 存在未知效果字段 ${key}`)
            if (typeof value !== 'number' || !Number.isFinite(value))
                fail(`事件 ${id} 效果 ${key} 不是数字`)
        }
    }
    for (const cond of [e.include, e.exclude]) {
        if (!cond) continue
        try {
            const tree = parse(cond)
            if (!Array.isArray(tree)) fail(`事件 ${id} 条件解析异常: ${cond}`)
        } catch (error) {
            fail(`事件 ${id} 条件解析抛错: ${cond} ${String(error)}`)
        }
    }
    if (e.branch) {
        for (const b of e.branch) {
            if (!events.has(b.event))
                fail(`事件 ${id} 的分支指向不存在的事件 ${b.event}`)
        }
    }
}

for (const id of LEGACY_EVENT_IDS)
    if (!events.has(id)) fail(`旧链映射指向不存在的事件 ${id}`)
for (const id of LEGACY_BLOCKED_AFTER_START)
    if (!events.has(id)) fail(`屏蔽清单指向不存在的事件 ${id}`)
for (const id of TRIAL_BROADCAST_IDS)
    if (!events.has(id)) fail(`九重雷劫播报事件缺失: ${id}`)

for (let realm = 0; realm < TRIAL_REALM + 1; realm++) {
    const list = eventsByRealm.get(realm) ?? []
    const fallback = (eventsByStage.get('fallback') ?? []).filter(
        e => e.realm === realm,
    )
    if (list.length < 20)
        fail(`境界 ${realm} 内容不足：只有 ${list.length} 条`)
    if (fallback.length < 3)
        fail(`境界 ${realm} 兜底不足：只有 ${fallback.length} 条`)
}

const longevity = (eventsByStage.get('daily') ?? []).concat(
    ...['resource', 'sect', 'relation', 'explore', 'dao', 'crisis', 'tribulation']
        .map(s => eventsByStage.get(s) ?? []),
).filter(e => e.id >= 51400 && e.id < 51500)
if (longevity.length < 50) fail(`长生纪元内容不足: ${longevity.length} 条`)

const death = events.get(10000)
if (!death) fail('缺少通用死亡事件 10000')
else if (JSON.stringify(death).includes('AGE![500]'))
    fail('死亡事件里仍残留 AGE![500] 复活限制')
if (ages.has(501)) fail('age 表仍存在 501 岁（说明有人续了硬表）')

// ── ② 批量模拟 ──────────────────────────────────────────────────────────
function freshProfile() {
    return {
        times: 0,
        talents: new Set<number>(),
        achievements: new Set<number>(),
        events: new Set<number>(),
    }
}
function randomAlloc() {
    return {
        charm: 3 + Math.floor(Math.random() * 8),
        intelligence: 3 + Math.floor(Math.random() * 8),
        strength: 3 + Math.floor(Math.random() * 8),
        money: 3 + Math.floor(Math.random() * 8),
        spirit: 3 + Math.floor(Math.random() * 8),
    }
}

const RUNS = 600
const YEARS = 1600
let exceptions = 0
let maxAge = 0
let reached500 = 0
let ascendedRuns = 0
let totalEvents = 0
let repeatedEvents = 0
let uniqueEventTotal = 0
let post500Events = 0
let post500Longevity = 0
let trialYears = 0
let trialRuns = 0
let ascendAgeTotal = 0
// ── 「101 岁条件飞升率」追踪（用户核心指标：成功到 101 岁后约 5% 飞升）──
let cohort101 = 0
let cohortAscend = 0
let badDeathCause = 0
const realmsSeen = new Set<number>()
const endings: Record<string, number> = {}
const longevitySeen = new Set<number>()

for (let run = 0; run < RUNS; run++) {
    const profile = freshProfile()
    // 强制「神秘的小盒子」：这是设计上活到 100 岁入道的正路，
    // 没有它玩家 85+ 就会被「安然离世」带走，永远到不了修仙段
    let state = createState(randomAlloc(), [1048])
    let reached = false
    let ascended = false
    let firstLife = true
    let hit101 = false
    let trialEnteredAt: number | null = null
    const recent: { id: number; age: number }[] = []
    for (let year = 0; year < YEARS; year++) {
        let result
        try {
            result = next(state, profile)
        } catch (error) {
            exceptions++
            if (exceptions <= 3) console.error('模拟异常:', error)
            break
        }
        state = result.state
        maxAge = Math.max(maxAge, result.age)
        realmsSeen.add(state.cultivation.realm)
        if (result.age >= 500) reached = true
        if (firstLife && result.age >= 101) hit101 = true
        if (state.cultivation.realm >= TRIAL_REALM && trialEnteredAt === null)
            trialEnteredAt = result.age
        for (const id of firstLife ? result.events : []) {
            totalEvents++
            if (recent.some(item => item.id === id && result.age - item.age < 10))
                repeatedEvents++
            recent.push({ id, age: result.age })
            if (result.age >= 500) {
                post500Events++
                if (id >= 51400 && id < 51500) {
                    post500Longevity++
                    longevitySeen.add(id)
                }
            }
        }
        while (recent.length > 0 && result.age - recent[0]!.age > 10)
            recent.shift()
        if (result.ending) {
            endings[result.ending] = (endings[result.ending] ?? 0) + 1
            // 入道后的死亡必须来自引擎判定（走火入魔 51310 / 雷劫 51301 /
            // 坐化 51311）；若仍被随机池里的旧致死事件带走，校准即失效
            if (result.ending === 'death' && result.age >= 100) {
                const cause = result.events.at(-1)
                if (
                    cause !== undefined &&
                    ![51310, 51301, 51311].includes(cause) &&
                    cause !== 10000
                )
                    badDeathCause++
            }
            if (firstLife && result.ending === 'ascend' && hit101) {
                cohort101++
                cohortAscend++
            } else if (firstLife && hit101 && result.ending === 'death') {
                cohort101++
            }
            if (result.ending === 'ascend') {
                ascended = true
                ascendAgeTotal += result.age
                if (trialEnteredAt !== null) {
                    trialYears += result.age - trialEnteredAt
                    trialRuns++
                }
            }
        }
        if (result.end) {
            if (ascended) break
            firstLife = false
            // 压测模式：复活继续，验证 500 岁之后不会抽空事件
            state = produce(state, draft => {
                draft.life = 1
                draft.ending = null
            })
        }
    }
    if (reached) reached500++
    if (ascended) ascendedRuns++
    uniqueEventTotal += state.events.size
}

const repeatRate = totalEvents ? repeatedEvents / totalEvents : 0
const avgAscendAge = ascendedRuns ? Math.round(ascendAgeTotal / ascendedRuns) : 0
const avgTrialYears = trialRuns ? Math.round(trialYears / trialRuns) : 0

console.log('=== 数据一致性 ===')
console.log('扩展事件', cultivationEvents.size, '总事件', events.size,
    '基础事件', baseCount, '境界数', LAST_REALM + 1,
    '长生纪元', longevity.length)
console.log('问题数', issues.length)
for (const issue of issues.slice(0, 20)) console.log('  ✗', issue)
console.log('=== 批量模拟 ===')
console.log('局数', RUNS, '最长年龄', maxAge, '异常', exceptions)
console.log('到达 500 岁的局', reached500, '飞升的局', ascendedRuns)
console.log('平均飞升年龄', avgAscendAge, '平均渡劫期年数', avgTrialYears)
console.log('经历过的境界', [...realmsSeen].sort((a, b) => a - b).join(','))
console.log('结局分布', JSON.stringify(endings))
const cohortRate = cohort101 ? cohortAscend / cohort101 : 0
console.log('101 岁条件飞升率', `${(cohortRate * 100).toFixed(1)}%`,
    `(${cohortAscend}/${cohort101})`)
console.log('每年平均不同事件(累计)', Math.round(uniqueEventTotal / RUNS))
console.log('10 年内同事件重复率', `${(repeatRate * 100).toFixed(2)}%`)
console.log('500 岁后事件数', post500Events,
    '其中长生纪元', post500Longevity,
    `(${(post500Longevity / Math.max(1, post500Events) * 100).toFixed(1)}%)`,
    '命中不同长生文案', longevitySeen.size)
console.log('调参参考', JSON.stringify({
    autoStartAge: TUNING.autoStartAge,
    tribulationStep: TUNING.tribulationStep,
    tribulationTrials: TUNING.tribulationTrials,
    daosRequired: TUNING.daosRequired,
}))

// ── ③ 硬断言 ────────────────────────────────────────────────────────────
if (exceptions > 0) fail(`模拟出现异常 ${exceptions} 次`)
if (reached500 < RUNS * 0.8)
    fail(`到达 500 岁的局过少: ${reached500}/${RUNS}`)
if (ascendedRuns === 0)
    fail(`没有任何一局能飞升：飞升路线断了 (${ascendedRuns}/${RUNS})`)
if (avgAscendAge <= 500)
    fail(`平均飞升年龄未突破旧的 500 岁上限: ${avgAscendAge}`)
if (avgTrialYears < 20)
    fail(`渡劫期过短，九重雷劫没形成阶段: ${avgTrialYears} 年`)
if (cohort101 < 100)
    fail(`101 岁样本过少，飞升率统计不可信: ${cohort101}`)
if (cohortRate < 0.01 || cohortRate > 0.08)
    fail(`101 岁条件飞升率偏离设计区间（优质加点实测 5.2%，随机加点约 2-4%）: ${(cohortRate * 100).toFixed(1)}%`)
if (badDeathCause > 2)
    fail(`入道后仍被旧致死事件带走 ${badDeathCause} 次`)
if (repeatRate > 0.1)
    fail(`10 年内同事件重复率超标: ${(repeatRate * 100).toFixed(2)}%`)
if (longevitySeen.size < 20)
    fail(`500 岁后命中的长生文案过少: ${longevitySeen.size}`)
if (realmsSeen.size < LAST_REALM + 1)
    fail(`境界未走全: ${[...realmsSeen].join(',')}`)

console.log('=== 断言 ===')
console.log(issues.length === 0 ? '全部通过 ✓' : `失败 ${issues.length} 项`)
for (const issue of issues) console.log('  ✗', issue)
if (issues.length > 0) process.exitCode = 1
