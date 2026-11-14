/**
 * 修仙阶段成就。
 *
 * 原来修仙相关成就约 7 个，而且大多绑在旧事件链上；
 * 这里按「境界 / 大道 / 寿元 / 结局」四个维度补 20 个，
 * 让 100 岁之后每隔一段就有一次明确的正反馈。
 */
import {
    AchievementGrade,
    AchievementOpportunity,
    type Achievement,
} from '../achievement.types'

type Row = [
    id: number,
    name: string,
    description: string,
    grade: AchievementGrade,
    condition: string,
    hide?: boolean,
]

const G = AchievementGrade
const O = AchievementOpportunity

const ROWS: Row[] = [
    [400, '引气入体', '百岁之后踏上修行路', G.White, 'STRT>0'],
    [401, '筑成道基', '突破到筑基期', G.White, 'REALM>=1'],
    [402, '丹成九转', '突破到金丹期', G.Blue, 'REALM>=2'],
    [403, '破丹成婴', '突破到元婴期', G.Blue, 'REALM>=3'],
    [404, '元婴化神', '突破到化神期', G.Purple, 'REALM>=4'],
    [405, '炼虚合道', '突破到炼虚期', G.Purple, 'REALM>=5'],
    [406, '三者合一', '突破到合体期', G.Purple, 'REALM>=6'],
    [407, '万法归一', '突破到大乘期', G.Orange, 'REALM>=7'],
    [408, '劫云压顶', '踏入渡劫期', G.Orange, 'REALM>=8'],
    [409, '飞升仙界', '渡过天劫，得道飞升', G.Orange, 'ASC>0'],
    [410, '初悟大道', '悟出第一条大道', G.Blue, 'DAO>=1'],
    [411, '三道同参', '悟出三条大道', G.Purple, 'DAO>=3'],
    [412, '五行俱全', '悟出五条大道', G.Purple, 'DAO>=5'],
    [413, '万法归一·道', '悟出八条大道', G.Orange, 'DAO>=8'],
    [414, '五百岁', '活过五百年，500 不再是尽头', G.Blue, 'AGE>=500'],
    [415, '千岁仙翁', '活过一千岁', G.Purple, 'AGE>=1000'],
    [416, '与天同寿', '活过三千岁', G.Orange, 'AGE>=3000'],
    [417, '屡败屡战', '大境界突破失败三次仍不放弃', G.Blue, 'FAIL>=3'],
    [418, '九转功成', '累计成功突破八次', G.Purple, 'BRK>=8'],
    [419, '劫备俱全', '天劫准备度达到圆满', G.Orange, 'TRIB>=100'],
]

export const cultivationAchievements = new Map<Achievement['id'], Achievement>(
    ROWS.map(([id, name, description, grade, condition, hide]) => [
        id,
        {
            id,
            name,
            description,
            grade,
            condition,
            hide: hide ?? false,
            opportunity: O.Trajectory,
        },
    ]),
)
