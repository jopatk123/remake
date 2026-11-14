export const properties = {
    charm: '颜值',
    intelligence: '悟性',
    strength: '体质',
    money: '家境',
    spirit: '道心',
    age: '享年',
    summary: '总评',
}

const s = (str: string) => str.split('|')
const p = (prefix: string, arr: string[]) => arr.map(v => prefix + v)
const jbase = '地狱|折磨|不佳|普通|优秀|罕见|逆天|传说'
export const judges = {
    // 与 JudgeLineMap.summary 的 12 档一一对应
    summary: s(jbase + '|筑基|金丹|元婴|飞升'),
    charm: s(jbase),
    money: s(jbase),
    spirit: s('道心破碎|道心不稳|道心平常|道心初定|道心坚定|道心通明|道心天成'),
    intelligence: s(jbase + '|识海|元神|仙魂'),
    strength: s(jbase + '|凝气|筑基|金丹|元婴|仙体'),
    // 与 JudgeLineMap.age 的 16 档一一对应：500 岁之后还有仙寿档
    age: s(
        '胎死腹中|早夭|少年|盛年|中年|花甲|古稀|杖朝|南山|不老|修仙|仙寿|地仙|天仙|金仙|与天同寿',
    ),
}

export const rates = {
    times: p('抽到紫色概率', s('不变|翻倍|三倍|四倍|五倍|六倍')),
    achievement: p('抽到橙色概率', s('不变|翻倍|三倍|四倍|五倍|六倍')),
}

export function judgeDisplay(key: keyof typeof judges, level: number) {
    return judges[key][level]
}
