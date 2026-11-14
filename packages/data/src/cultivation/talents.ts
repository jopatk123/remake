/**
 * 修仙天赋。
 *
 * 原本修仙相关天赋只有两个，长期目标太少。这里补 20 个：
 * 前 5 个开局即可抽到，后面 15 个带境界 / 条件触发，
 * 抽到之后要到对应阶段才生效，形成「前期选路线、后期收奖励」的感觉。
 */
import type { Talent } from '../talent.types'

type Row = [
    id: number,
    name: string,
    description: string,
    grade: 0 | 1 | 2 | 3,
    effect: Talent['effect'],
    condition?: string,
]

const ROWS: Row[] = [
    [3000, '天灵根', '修行资质极佳，悟性+3，智力+2', 2, { INT: 3, SPR: 1 }],
    [3001, '先天道胎', '生而知之，体质+3，道心+2', 3, { STR: 3, SPR: 2 }],
    [3002, '家资万贯', '灵石不缺，家境+5', 1, { MNY: 5 }],
    [3003, '仙缘深厚', '总有人愿意帮你，颜值+3，快乐+2', 2, { CHR: 3, SPR: 2 }],
    [3004, '苦修之士', '坐得住冷板凳，体质+2，快乐-1', 0, { STR: 2, SPR: -1 }],
    [3005, '引气诀', '入道之后悟性再进一分', 1, { INT: 3 }, 'STRT>0'],
    [3006, '筑基丹', '筑基时得一枚丹药相助', 1, { STR: 4 }, 'REALM>=1'],
    [3007, '丹成一品', '金丹品质远胜同辈', 2, { STR: 4, INT: 3 }, 'REALM>=2'],
    [3008, '元婴出窍', '神识可离体而行', 2, { INT: 5 }, 'REALM>=3'],
    [3009, '化神之资', '神念覆盖一方天地', 3, { INT: 6, SPR: 2 }, 'REALM>=4'],
    [3010, '虚空法则', '炼虚之后进境更快', 2, { INT: 5, STR: 3 }, 'REALM>=5'],
    [3011, '身魂合一', '三者合一，再无短板', 3, { STR: 5, SPR: 4 }, 'REALM>=6'],
    [3012, '万法归一', '大乘之后万法皆通', 3, { INT: 8 }, 'REALM>=7'],
    [3013, '雷劫不侵', '渡劫时肉身更扛得住', 3, { STR: 8 }, 'REALM>=8'],
    [3014, '五行俱全', '五行大道同悟', 2, { INT: 5, MNY: 3 }, 'DAO>=5'],
    [3015, '道心坚固', '心魔难侵', 2, { SPR: 6 }, 'DAO>=3'],
    [3016, '护道之人', '总有人替你守着阵眼', 2, { CHR: 4, SPR: 3 }, 'STRT>0'],
    [3017, '屡败屡战', '每次失败都换来一点长进', 1, { STR: 3, INT: 3 }, 'FAIL>=2'],
    [3018, '仙寿绵长', '活过千岁之后气机更沉', 2, { STR: 5, SPR: 5 }, 'AGE>=1000'],
    [3019, '太古遗脉', '体内流着另一套法门的血', 3, { STR: 6, INT: 6 }, 'PATH=1'],
]

export const cultivationTalents = new Map<Talent['id'], Talent>(
    ROWS.map(([id, name, description, grade, effect, condition]) => [
        id,
        {
            id,
            name,
            description,
            grade,
            ...(effect ? { effect } : {}),
            ...(condition ? { condition } : {}),
            max: 1,
        },
    ]),
)
