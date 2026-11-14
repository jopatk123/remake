/** 天赋稀有度 */
export enum TalentGrade {
    White = 0,
    Blue = 1,
    Purple = 2,
    Orange = 3,
}

/** 天赋效果 */
export type TalentEffect = {
    /** 额外家境 */
    readonly MNY?: number
    /** 额外体质 */
    readonly STR?: number
    /** 额外悟性 */
    readonly INT?: number
    /** 额外颜值 */
    readonly CHR?: number
    /** 额外道心 */
    readonly SPR?: number
    /** 额外随机属性 */
    readonly RND?: number
}

/** 权重天赋 */
export type TalentWithWeight = [number, number]

/** 指定列表盲盒 */
export type TalentReplacementTalent = {
    talent: TalentWithWeight[]
    grade?: never
}

/** 指定稀有度盲盒 */
export type TalentReplacementGrade = {
    grade: TalentGrade
    talent?: never
}

/** 天赋盲盒 */
export type TalentReplacement = TalentReplacementTalent | TalentReplacementGrade

/** 天赋 */
export type Talent = {
    /** 序号 */
    readonly id: number
    /** 天赋名 */
    readonly name: string
    /** 天赋描述 */
    readonly description: string
    /** 天赋触发条件 */
    readonly condition?: string
    /** 天赋稀有度 */
    readonly grade: TalentGrade
    /** 天赋效果 */
    readonly effect?: TalentEffect
    /** 专属天赋 */
    readonly exclusive?: boolean
    /** 初始可用属性点调整 */
    readonly points?: number
    /** 互斥天赋 */
    readonly exclude?: number[]
    /** 互斥组：同组天赋只能获得一个 */
    readonly group?: string
    /** 天赋盲盒 */
    readonly replacement?: TalentReplacement
    /** 入道时全属性加成（一次性）；path 用于限定修行路线 */
    readonly entryAll?: { value: number; path?: number }
    /** 突破到指定大境界时，全属性提升百分比（一次性） */
    readonly breakthroughPercent?: { realm: number; percent: number }
    /** 五维各自独立随机加成 */
    readonly randomPerStat?: { min: number; max: number }
    /** 单一随机属性加成 */
    readonly randomOne?: { min: number; max: number }
    /** 额外复活次数 */
    readonly revives?: number
    /** 复活优先级，数字越小越先消耗 */
    readonly revivePriority?: number
    /** 复活时写入日志的事件 id */
    readonly reviveEvent?: number
    /** 低于该年龄时无限复活 */
    readonly immortalUntil?: number
    /** 属性为负时强制钳制到 1 */
    readonly negativeClamp?: boolean
    /** 到指定年龄时跳过若干年 */
    readonly skipAge?: { at: number; years: number }
    /** 触发时写入的长期标记（修仙扩展） */
    readonly grantFlag?: string
    /** 复活前必须已经触发过这些事件之一（修仙扩展） */
    readonly reviveRequireEvent?: number[]
    /** 仅渡劫身死时才能复活（修仙扩展） */
    readonly reviveOnTribulation?: boolean
    /** 复活时额外属性变化（修仙扩展） */
    readonly reviveEffect?: TalentEffect & { AGE?: number }
    /** 天赋触发上限 */
    readonly max: number
}
// @vt-types-end

export const transformers = {
    id: Number,
    grade: (val: any) => Number(val) || 0,
    exclude: (val: (string | number)[] | undefined) => val?.map(Number),
    effect: (val: any) => {
        if (!val) return
        for (const key in val) {
            val[key] = Number(val[key])
            if (isNaN(val[key]))
                throw new Error(`Invalid property value: ${key}=${val[key]}`)
        }
        return val
    },
    replacement: (val: any) => {
        if (!val) return
        if (val.talent)
            val.talent = val.talent.map((v: string | number) => {
                if (typeof v === 'number') return [v, 1]
                const [talent, weight] = v.split('*').map(Number)
                if (talent == null || isNaN(talent))
                    throw new Error(`Invalid talent value: ${v}`)
                if (weight != null && isNaN(weight))
                    throw new Error(
                        `Invalid weight value: ${v} ${JSON.stringify({ talent, weight })}`,
                    )
                return [talent, weight ?? 1]
            })
        if (val.grade) val.grade = Number(val.grade)
        return val
    },
    max: (val: any) => Number(val) || 1,
}
