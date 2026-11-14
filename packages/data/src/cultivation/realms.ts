/**
 * 凡人流标准境界表。
 *
 * 采用修仙网文里认知成本最低、使用最广的一条链：
 * 炼气 → 筑基 → 金丹 → 元婴 → 化神 → 炼虚 → 合体 → 大乘 → 渡劫 → 飞升。
 *
 * 「升级方式」也沿用最主流的一套：
 *   每年积累修为 + 灵根/功法/资源加成 + 小境界自然提升
 *   → 大境界遇到瓶颈，按悟性/道心/资源/大道判定突破
 *   → 渡劫期逐重扛过九重雷劫，集齐大道，才引动飞升。
 *
 * 这里只放配置和纯函数，所有数值集中在此，方便单独调平衡。
 */
import type { CultivationState } from './types'

export interface RealmConfig {
    readonly id: number
    /** 简称，用于进度条 */
    readonly name: string
    /** 全称，用于日志与总结 */
    readonly fullName: string
    /** 小阶段名称 */
    readonly minorNames: readonly string[]
    /** 每个小阶段需要的修为 */
    readonly threshold: number
    /** 每年基础修为 */
    readonly gain: number
    /** 名义寿元：超过后只产生软压力，不会强制结束人生 */
    readonly lifespan: number
    /** 大境界突破的基础成功率 */
    readonly breakRate: number
    /**
     * 每次冲击大境界瓶颈时「走火入魔身死」的基础概率。
     * 凡人流的核心张力：金丹以上一步一劫，境界越高冲击越凶险；
     * 冲击成功与否无关，风险按尝试次数累积——突破率高也躲不过暴露。
     * 道心 / 悟性 / 大道 / 护道标记可减伤（见 deathShield）。
     */
    readonly deathRisk: number
    /** 事件稀有度，用于境界条配色 */
    readonly grade: number
    /** 境界说明 */
    readonly description: string
    /** 突破要点，显示在瓶颈提示里 */
    readonly need: string
    /** 主修属性提示 */
    readonly focus: string
}

const FOUR = ['初期', '中期', '后期', '圆满'] as const
const NINE = [
    '一层',
    '二层',
    '三层',
    '四层',
    '五层',
    '六层',
    '七层',
    '八层',
    '九层',
] as const

/**
 * 修为门槛按「整局应该有多长」反推，而不是随手写的数字。
 *
 * 旧配置 330 年就能飞升，导致 500 岁之后的动态事件池根本没机会出现，
 * 也和「删掉 500 岁上限」的目标自相矛盾。现在把全程拉到 800 岁上下：
 * 500 岁之后仍有三四百年的内容可玩，同时又不会长到需要点几千次。
 */
export const REALMS: readonly RealmConfig[] = [
    {
        id: 0,
        name: '炼气',
        fullName: '炼气期',
        minorNames: NINE,
        threshold: 200,
        gain: 9,
        lifespan: 150,
        breakRate: 0.78,
        deathRisk: 0.003,
        grade: 0,
        description: '引气入体，打通经脉，寿元不过百五。',
        need: '筑基丹或一处灵脉，方能把气凝成道基。',
        focus: '体质 · 家境',
    },
    {
        id: 1,
        name: '筑基',
        fullName: '筑基期',
        minorNames: FOUR,
        threshold: 340,
        gain: 12,
        lifespan: 300,
        breakRate: 0.7,
        deathRisk: 0.012,
        grade: 1,
        description: '液化真元，筑成道基，正式脱离凡胎。',
        need: '结丹灵物与一份稳定的灵气来源。',
        focus: '体质 · 悟性',
    },
    {
        id: 2,
        name: '金丹',
        fullName: '金丹期',
        minorNames: FOUR,
        threshold: 480,
        gain: 15,
        lifespan: 600,
        breakRate: 0.64,
        deathRisk: 0.035,
        grade: 1,
        description: '真元凝丹，丹成品分九等，可御器千里。',
        need: '心魔不侵、神魂足够强，方能破丹成婴。',
        focus: '体质 · 悟性 · 道心',
    },
    {
        id: 3,
        name: '元婴',
        fullName: '元婴期',
        minorNames: FOUR,
        threshold: 640,
        gain: 18,
        lifespan: 1100,
        breakRate: 0.58,
        deathRisk: 0.07,
        grade: 2,
        description: '破丹成婴，元婴出窍，纵肉身毁去亦可夺舍。',
        need: '神识质变，须悟一条大道并渡过雷劫。',
        focus: '悟性 · 道心',
    },
    {
        id: 4,
        name: '化神',
        fullName: '化神期',
        minorNames: FOUR,
        threshold: 800,
        gain: 21,
        lifespan: 1800,
        breakRate: 0.54,
        deathRisk: 0.12,
        grade: 2,
        description: '元婴化神，神念可覆一方天地。',
        need: '感悟虚空法则，需跨界历练。',
        focus: '悟性 · 道心',
    },
    {
        id: 5,
        name: '炼虚',
        fullName: '炼虚期',
        minorNames: FOUR,
        threshold: 1000,
        gain: 24,
        lifespan: 2800,
        breakRate: 0.5,
        deathRisk: 0.2,
        grade: 2,
        description: '炼虚合道，肉身与天地规则开始共鸣。',
        need: '身魂合一，须勘破一重心魔。',
        focus: '悟性 · 道心 · 体质',
    },
    {
        id: 6,
        name: '合体',
        fullName: '合体期',
        minorNames: FOUR,
        threshold: 1200,
        gain: 27,
        lifespan: 4000,
        breakRate: 0.46,
        deathRisk: 0.32,
        grade: 3,
        description: '元婴、元神、肉身三者合一，一念可改山河。',
        need: '万法归一，须融会至少两条大道。',
        focus: '悟性 · 道心',
    },
    {
        id: 7,
        name: '大乘',
        fullName: '大乘期',
        minorNames: FOUR,
        threshold: 1450,
        gain: 30,
        lifespan: 6000,
        breakRate: 0.42,
        deathRisk: 0.5,
        grade: 3,
        description: '万法归一，修为已至凡界顶点，只待天劫。',
        need: '主动引动飞升天劫，需护道人与本命法宝。',
        focus: '道心 · 大道',
    },
    {
        id: 8,
        name: '渡劫',
        fullName: '渡劫期',
        minorNames: ['一劫', '二劫', '三劫', '四劫', '五劫', '六劫', '七劫', '八劫', '九劫'],
        threshold: 1200,
        gain: 34,
        lifespan: 9000,
        breakRate: 0.38,
        deathRisk: 0,
        grade: 3,
        description: '九重雷劫、心魔劫、本源劫，一劫不成便道消。',
        need: '逐重扛过九劫，并悟满五条大道，方可引劫飞升。',
        focus: '大道 · 道心 · 准备度',
    },
    {
        id: 9,
        name: '飞升',
        fullName: '飞升',
        minorNames: ['飞升'],
        threshold: 0,
        gain: 0,
        lifespan: Number.POSITIVE_INFINITY,
        breakRate: 1,
        deathRisk: 0,
        grade: 3,
        description: '霞光万丈，仙门已开，此界再无你之名。',
        need: '',
        focus: '',
    },
]

/** 集中调参：所有平衡数值都在这里，改这里即可，不必翻引擎代码 */
export const TUNING = {
    /** 到这个年龄会自动入道（旧盒子可以提前入道） */
    autoStartAge: 100,
    /** 属性对年度修为的加成系数 */
    statGain: { strength: 0.012, intelligence: 0.02, money: 0.01, spirit: 0.014 },
    /** 年度修为的上限倍数（相对境界基础值），防止属性爆炸后一秒飞升 */
    gainCapScale: 2.6,
    /** 大境界突破成功率区间 */
    minBreakRate: 0.28,
    maxBreakRate: 0.94,
    /** 每条大道 / 每个长期标记提供的突破加成 */
    daoRateBonus: 0.045,
    flagRateBonus: 0.025,
    /** 道心（SPR）对突破的加成系数 */
    spiritRateBonus: 0.00035,
    /** 悟性（INT）对突破的加成系数 */
    intRateBonus: 0.0003,
    /** 每次突破失败累计的补偿，避免无限卡关 */
    failurePity: 0.07,
    /** 寿元压力的每年成功率惩罚 */
    decayPenalty: 0.004,
    /** 寿元压力封顶：活得再久也不会把突破率压到 0 */
    decayCap: 80,
    /** 九重雷劫：每重需要的天劫准备度、总劫数 */
    tribulationStep: 90,
    tribulationTrials: 9,
    /** 渡劫期每年自然积累的准备度 */
    tribulationPerYear: 6,
    /** 引动飞升所需的大道数量 */
    daosRequired: 5,
    /** 单重雷劫失败概率（失败只退回准备度，不直接结束人生） */
    trialFailRate: 0.06,
    /** 屡劫不成才会身死道消的失败次数门槛 */
    trialDoomThreshold: 14,
    /** 防重复：日常事件默认冷却、其他随机池事件默认冷却、同组文案冷却 */
    dailyCooldown: 4,
    defaultCooldown: 7,
    /** 同组只隔一年就能轮换（0 表示完全不限制） */
    variantCooldown: 2,
    /** 普通事件的一生最多触发次数（0 表示不限） */
    maxPerRun: 0,
    /** 寿元压力的起始年龄差（超过境界寿元多少年开始） */
    decayGrace: 0,
    // ── 死亡风险：101 岁入道后，飞升应是少数人的结局 ────────────────────
    /** 全部死亡风险的总开关，校准「101 岁起飞升率 ≈ 5%」用 */
    deathRiskScale: 2.3,
    /** 渡劫期每扛一重雷劫的普通身死风险（不管成败，站上去就有暴露） */
    trialAttemptDeathRisk: 0.06,
    /** 单次渡劫失败（雷劫反噬）当场身死的额外概率 */
    trialDeathRisk: 0.5,
    /** 每次累计失败让下一次突破失败的死亡风险递增的比例与封顶次数 */
    deathEscalation: 0.12,
    deathEscalationCap: 12,
    /** 死亡减伤：道心 / 悟性 / 大道数量 / 长期标记（护道人、延寿丹等），封顶 50% */
    deathShieldSpirit: 0.006,
    deathShieldInt: 0.004,
    deathShieldDao: 0.02,
    deathShieldFlag: 0.018,
    deathShieldCap: 0.5,
    /** 寿元耗尽：超过名义寿元多少年开始有坐化风险，风险逐年线性上升 */
    decayDeathGrace: 45,
    decayDeathRate: 0.005,
    decayDeathCap: 0.15,
} as const

export const LAST_REALM = REALMS.length - 1
/** 渡劫期是倒数第二个境界，飞升是最后一个 */
export const TRIAL_REALM = LAST_REALM - 1

export function realmConfig(realm: number): RealmConfig {
    return REALMS[Math.max(0, Math.min(LAST_REALM, realm))]!
}

export function realmTitle(realm: number, minor: number): string {
    if (realm >= LAST_REALM) return '飞升'
    const c = realmConfig(realm)
    const index = Math.max(0, Math.min(c.minorNames.length - 1, minor))
    return `${c.name}·${c.minorNames[index]}`
}

export function realmFullName(realm: number, minor: number): string {
    if (realm >= LAST_REALM) return '飞升仙界'
    const c = realmConfig(realm)
    const index = Math.max(0, Math.min(c.minorNames.length - 1, minor))
    return `${c.fullName} ${c.minorNames[index]}`
}

export function progressMax(realm: number): number {
    return realmConfig(realm).threshold
}

export function isBottleneckLastMinor(realm: number, minor: number): boolean {
    return minor >= realmConfig(realm).minorNames.length - 1
}

/** 年度修为：境界基础值 + 五维加成，封顶避免后期失控 */
export function annualGain(
    realm: number,
    props: {
        strength: number
        intelligence: number
        money: number
        spirit: number
    },
): number {
    const c = realmConfig(realm)
    if (c.gain <= 0) return 0
    const { strength, intelligence, money, spirit } = props
    const bonus =
        strength * TUNING.statGain.strength +
        intelligence * TUNING.statGain.intelligence +
        money * TUNING.statGain.money +
        Math.max(0, spirit) * TUNING.statGain.spirit
    return Math.min(c.gain + Math.max(0, bonus), c.gain * TUNING.gainCapScale)
}

/** 大境界突破成功率 */
export function breakRate(state: CultivationState, props: {
    intelligence: number
    spirit: number
}): number {
    const c = realmConfig(state.realm)
    const raw =
        c.breakRate +
        state.daos.length * TUNING.daoRateBonus +
        state.flags.length * TUNING.flagRateBonus +
        props.intelligence * TUNING.intRateBonus +
        Math.max(0, props.spirit) * TUNING.spiritRateBonus +
        state.failures * TUNING.failurePity -
        Math.min(state.decay, TUNING.decayCap) * TUNING.decayPenalty
    return Math.max(TUNING.minBreakRate, Math.min(TUNING.maxBreakRate, raw))
}

/** 是否满足引动飞升天劫的条件：九劫尽过 + 大道圆满 */
export function canAscend(state: CultivationState): boolean {
    return (
        state.realm === TRIAL_REALM &&
        state.tribulationStage >= TUNING.tribulationTrials &&
        state.daos.length >= TUNING.daosRequired
    )
}

/**
 * 死亡减伤系数（0～0.5）。
 * 道心越稳、悟性越高、大道越多、护道准备越足，越不容易身死道消——
 * 让玩家的属性取舍和事件选择真正影响「能不能活到飞升」。
 */
export function deathShield(
    props: { spirit: number; intelligence: number },
    c: { daos: readonly string[]; flags: readonly string[] },
): number {
    const raw =
        Math.max(0, props.spirit) * TUNING.deathShieldSpirit +
        Math.max(0, props.intelligence) * TUNING.deathShieldInt +
        c.daos.length * TUNING.deathShieldDao +
        c.flags.length * TUNING.deathShieldFlag
    return Math.min(TUNING.deathShieldCap, raw)
}

/** 给 UI / 协议用的快照 */
export function snapshot(
    state: CultivationState,
    ending: import('./types').EndingType | null,
): import('./types').CultivationSnapshot {
    return {
        started: state.started,
        path: state.path,
        realm: state.realm,
        minor: state.minor,
        progress: Math.floor(state.progress),
        progressMax: progressMax(state.realm),
        title: realmTitle(state.realm, state.minor),
        daos: state.daos.length,
        tribulation: state.tribulation,
        trials: state.tribulationStage,
        bottleneck: state.bottleneck,
        ending,
    }
}
