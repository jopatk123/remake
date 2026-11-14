/**
 * 年度奇遇表。
 *
 * 每一个条目会在每年独立判定一次 `rate`，命中就触发 `event`；
 * 若填了 `talent`，则同时获得该天赋。
 * 天赋已拥有 / 事件已触发过时不再判定，所以每局最多各得一次。
 * `maxAge` 为判定年龄上限（含），超过就不再判定。
 * `minAge` 为判定年龄下限（含），不到就不判定。
 *
 * `key` 只用于调试：web 端可以用同名 URL 参数覆盖概率，
 * 例如 `?box=0.05&cave=0.02`。
 */
export interface EncounterConfig {
    /** 调试短名，可被 URL 参数覆盖概率 */
    key: string
    /** 触发的事件 */
    event: number
    /** 每年触发概率，0~1 */
    rate: number
    /** 触发后额外获得的天赋 */
    talent?: number
    /** 判定年龄上限（含），超过该年龄不再判定 */
    maxAge?: number
    /** 判定年龄下限（含），不到该年龄不判定 */
    minAge?: number
}

export const encounters: EncounterConfig[] = [
    // 路边捡到小盒子：一生只得一次，且必须在 100 岁前捡到，才能在 100 岁开箱入道
    { key: 'box', event: 11560, talent: 1048, rate: 0.005, maxAge: 99 },
    // 传承洞府：普通人也能继承《仙脉图录》。
    // 只在入道前后十年判定：入道之后改路线会把凡人流读条拧成太古法门，
    // 且每年 0.5% 无限抽下去几乎必中。引擎侧入道后也不会再改 PATH。
    { key: 'cave', event: 40061, rate: 0.005, minAge: 100, maxAge: 110 },
]
