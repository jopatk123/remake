/**
 * 修仙体系的基础类型。
 *
 * 设计原则：年龄只负责「过了多少年」，境界由「修为 + 瓶颈 + 天劫」驱动。
 * 这一层只放纯类型和常量，不依赖数据表，避免和 dist / xlsx 形成循环引用。
 */

/** 修行路线。标准凡人流是主线，太古与魂修是保留原有内容特色的支线 */
export enum CultivationPath {
    /** 炼气→筑基→…→渡劫→飞升，最主流的凡人流 */
    Standard = 0,
    /** 太古灵脉 / 无垢筑基线，文案特殊但底层共用境界值 */
    Ancient = 1,
    /** 魂修 / 夺舍线 */
    Soul = 2,
}

export const CultivationPathName: Record<number, string> = {
    [CultivationPath.Standard]: '凡人流',
    [CultivationPath.Ancient]: '太古法门',
    [CultivationPath.Soul]: '魂修',
}

/**
 * 结局类型。
 * 过去只靠 LIF:-1 隐含「结束」，无法区分寿终、飞升与离开世界；
 * 现在由事件显式声明，前端与多人结算都能据此给出不同的文案。
 */
export type EndingType =
    | 'death'
    | 'ascend'
    | 'transcend'
    | 'leave-world'
    | 'reincarnation'

export const EndingName: Record<EndingType, string> = {
    death: '身死道消',
    ascend: '渡劫飞升',
    transcend: '超脱',
    'leave-world': '踏碎虚空',
    reincarnation: '转世重修',
}

/** 事件在修仙内容里的分类，用于分池与防重复 */
export type EventStage =
    | 'entry' // 入道
    | 'daily' // 日常修炼
    | 'resource' // 灵石 / 丹药 / 法宝
    | 'sect' // 宗门
    | 'relation' // 师尊 / 道侣 / 徒弟 / 仇敌
    | 'explore' // 秘境 / 遗迹
    | 'dao' // 大道感悟
    | 'crisis' // 心魔 / 走火入魔 / 截杀
    | 'breakthrough' // 境界突破
    | 'tribulation' // 天劫
    | 'ending' // 终局
    | 'fallback' // 任何情况下都保底可抽

/** 一局内的修仙状态（不持久化，随 GameState 一起存在于内存） */
export interface CultivationState {
    /** 是否已入道。100 岁起自动入道，或由开盒子提前入道 */
    started: boolean
    /** 入道时的年龄 */
    startAge: number
    /** 路线 */
    path: CultivationPath
    /** 大境界序号，对应 REALMS 下标，9 表示已飞升 */
    realm: number
    /** 小阶段序号，对应 REALMS[realm].minorNames */
    minor: number
    /** 当前小阶段已积累的修为 */
    progress: number
    /** 瓶颈标记：修为已满，等待大境界突破 */
    bottleneck: boolean
    /** 已悟大道 */
    daos: string[]
    /** 长期标记：护道人、本命法宝、延寿丹、洞府… */
    flags: string[]
    /** 天劫准备度，渡劫期专用 */
    tribulation: number
    /** 已经扛过的雷劫重数（0–9），九劫尽过才有资格飞升 */
    tribulationStage: number
    /** 进入渡劫期时的准备度基准，避免前八境累积值让九劫被瞬间跳过 */
    tribulationBaseline: number
    /** 成功突破次数 */
    breakthroughs: number
    /** 突破失败次数 */
    failures: number
    /** 寿元压力累计（软惩罚，不直接致死） */
    decay: number
}

/** 传给 UI / 多人协议的轻量快照 */
export interface CultivationSnapshot {
    started: boolean
    path: number
    realm: number
    minor: number
    progress: number
    progressMax: number
    title: string
    daos: number
    tribulation: number
    /** 已渡雷劫重数 */
    trials: number
    bottleneck: boolean
    ending: EndingType | null
}

/** 修仙扩展事件：在原生 Event 之上追加的可选字段 */
export interface CultivationEventMeta {
    /** 结局类型。带这个字段的事件触发即结束本局 */
    ending?: EndingType
    /** 冷却年数：触发后多少年内不再抽到 */
    cooldown?: number
    /** 同组文案轮换：同组事件短期内不重复 */
    variantGroup?: string
    /** 内容分类 */
    stage?: EventStage
    /** 所属境界；不填表示跨境界通用 */
    realm?: number
    /** 事件池权重（相对值） */
    weight?: number
    /** 触发后写入的长期标记 */
    flag?: string
    /** 需要已拥有某标记才可能出现 */
    requireFlag?: string
    /** 需要已悟某条大道才可能出现 */
    requireDao?: string
    /** UI 高亮类型 */
    kind?: 'breakthrough' | 'ascend' | 'tribulation' | 'omen'
}

/** 修仙扩展效果：在原生 EventEffect 之上追加的可选字段 */
export interface CultivationEffectMeta {
    /** 修为增量 */
    CULT?: number
    /** 大境界增量（可为负，用于夺舍失败等） */
    REALM?: number
    /** 小阶段增量 */
    MINOR?: number
    /** 设定修行路线 */
    PATH?: number
    /** 大道感悟数量（配合 dao 字段） */
    DAO?: number
    /** 天劫准备度 */
    TRIB?: number
    /** 突破成功率加成（本局永久，累计） */
    RATE?: number
}
