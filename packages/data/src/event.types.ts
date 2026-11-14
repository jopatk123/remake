/** 事件稀有度 */
export type EventGrade = 0 | 1 | 2 | 3

/** 事件效果 */
export type EventEffect = {
    /** 颜值变化 */
    readonly CHR?: number
    /** 智力变化 */
    readonly INT?: number
    /** 体质变化 */
    readonly STR?: number
    /** 家境变化 */
    readonly MNY?: number
    /** 快乐变化 */
    readonly SPR?: number
    /** 寿命变化 */
    readonly LIF?: number
    /** 年龄变化 */
    readonly AGE?: number
    /** 修为增量（修仙扩展） */
    readonly CULT?: number
    /** 大境界增量（修仙扩展） */
    readonly REALM?: number
    /** 小阶段增量（修仙扩展） */
    readonly MINOR?: number
    /** 设定修行路线（修仙扩展） */
    readonly PATH?: number
    /** 大道感悟数量（修仙扩展） */
    readonly DAO?: number
    /** 天劫准备度（修仙扩展） */
    readonly TRIB?: number
    /** 突破成功率永久加成（修仙扩展） */
    readonly RATE?: number
}

/** 分支路线 */
export type EventBranch = {
    /** 分支条件 */
    condition: string
    /** 分支事件ID */
    event: number
}

/** 事件 */
export type Event = {
    /** ID */
    readonly id: number
    /** 事件内容 */
    readonly event: string
    /** 事件稀有度 */
    readonly grade: EventGrade
    /** 追加事件内容 */
    readonly postEvent?: string
    /** 事件效果 */
    readonly effect?: EventEffect
    /** 非随机事件 */
    readonly NoRandom?: boolean
    /** 有某事件时才能被随机到 */
    readonly include?: string
    /** 有某事件时一定随机不到 */
    readonly exclude?: string
    /** 分支路线 */
    readonly branch?: EventBranch[]
    /** 是否需要格式化 */
    readonly format?: boolean
    /** 结局类型：触发即结束本局（修仙扩展） */
    readonly ending?: string
    /** 冷却年数：触发后多少年内不再抽到（修仙扩展） */
    readonly cooldown?: number
    /** 同组文案轮换组（修仙扩展） */
    readonly variantGroup?: string
    /** 内容分类（修仙扩展） */
    readonly stage?: string
    /** 所属境界（修仙扩展） */
    readonly realm?: number
    /** 事件池权重（修仙扩展） */
    readonly weight?: number
    /** 触发后写入的长期标记（修仙扩展） */
    readonly flag?: string
    /** 需要已拥有某标记（修仙扩展） */
    readonly requireFlag?: string
    /** 需要已悟某条大道（修仙扩展） */
    readonly requireDao?: string
    /** 大道名（配合 effect.DAO 使用，修仙扩展） */
    readonly dao?: string
    /** UI 高亮类型（修仙扩展） */
    readonly kind?: string
}
// @vt-types-end

export const transformers = {
    id: Number,
    // 默认稀有度为0
    grade: (val: any) => Number(val) || 0,
    effect: (val: any) => {
        if (!val) return
        for (const key in val) {
            val[key] = Number(val[key])
            if (isNaN(val[key]))
                throw new Error(`Invalid property value: ${key}=${val[key]}`)
        }
        return val
    },
    branch: (val?: any[]) => {
        if (!val) return
        for (const key in val) {
            const [condition, eventId] = val[key]!.split(':')
            const event = Number(eventId)
            if (isNaN(event))
                throw new Error(`Invalid event ID in branch: ${eventId}`)
            val[key] = { condition, event }
        }
        return val
    },
}
