/**
 * 修仙扩展事件库。
 *
 * 为什么是独立 TS 模块而不是继续往 event.xlsx 里加行：
 * 1. 修仙事件需要一堆新字段（修为、境界、大道、结局、冷却、变体组），
 *    xlsx / v-transform 的列结构是固定的，塞不进去；
 * 2. 300 条左右的内容用紧凑的行格式写，比维护 5000+ 行的表格更可靠；
 * 3. 旧事件的 id、文本、条件一个都不动，运行时由 index.ts 做合并覆盖。
 *
 * 行格式（前 5 段用 | 分隔，第 6 段 meta 里允许出现条件里的 |）：
 *   id | 文本 | stage | grade | effect | meta
 *   effect: CULT:14,INT:2,MNY:-1       （key:value 用逗号分隔）
 *   meta:   r:0,w:10,cd:4,...           （key:value 用分号分隔）
 */
import type { Event, EventEffect, EventGrade } from '../event.types'
import { EARLY_ROWS } from './rows.early'
import { LATE_ROWS } from './rows.late'
import { COMMON_ROWS } from './rows.common'
import { LONGEVITY_ROWS } from './rows.longevity'

/** meta 里的短键 → Event 字段 */
const META_KEYS: Record<string, string> = {
    r: 'realm',
    w: 'weight',
    cd: 'cooldown',
    vg: 'variantGroup',
    flg: 'flag',
    rf: 'requireFlag',
    dao: 'dao',
    rd: 'requireDao',
    inc: 'include',
    exc: 'exclude',
    kind: 'kind',
    nr: 'NoRandom',
    end: 'ending',
    post: 'postEvent',
    st: 'stage',
}

function splitRow(line: string): string[] {
    const parts: string[] = []
    let rest = line
    for (let i = 0; i < 5; i++) {
        const p = rest.indexOf('|')
        if (p < 0) throw new Error(`Invalid cultivation event row: ${line}`)
        parts.push(rest.slice(0, p))
        rest = rest.slice(p + 1)
    }
    parts.push(rest)
    return parts
}

function parseEffect(raw: string): EventEffect | undefined {
    if (!raw) return undefined
    const effect: Record<string, number> = {}
    for (const pair of raw.split(',')) {
        if (!pair) continue
        const [key, value] = pair.split(':')
        const n = Number(value)
        if (!key || Number.isNaN(n))
            throw new Error(`Invalid cultivation effect: ${pair}`)
        effect[key] = n
    }
    return Object.keys(effect).length ? (effect as EventEffect) : undefined
}

function parseMeta(raw: string): Record<string, string | number | boolean> {
    const meta: Record<string, string | number | boolean> = {}
    if (!raw) return meta
    // 先用占位符保护条件里的分号（条件语法不用分号，这里只是防御）
    for (const pair of raw.split(';')) {
        if (!pair) continue
        const colon = pair.indexOf(':')
        if (colon < 0) throw new Error(`Invalid cultivation meta: ${pair}`)
        const key = pair.slice(0, colon)
        const value = pair.slice(colon + 1)
        const field = META_KEYS[key] ?? key
        if (key === 'nr') meta[field] = value === '1'
        else if (['r', 'w', 'cd'].includes(key)) meta[field] = Number(value)
        else meta[field] = value
    }
    return meta
}

export function parseEventRow(line: string): Event {
    const [idRaw, text, stage, gradeRaw, effectRaw, metaRaw] = splitRow(line)
    const id = Number(idRaw)
    if (!Number.isInteger(id) || !text)
        throw new Error(`Invalid cultivation event row: ${line}`)
    const meta = parseMeta(metaRaw ?? '')
    const effect = parseEffect(effectRaw ?? '')
    const grade = (Number(gradeRaw) || 0) as EventGrade
    // 50100–50999 按百位分段，每 100 个 id 对应一个大境界，省掉几百个 r: 标记
    if (meta.realm === undefined && id >= 50100 && id < 51000) {
        meta.realm = Math.floor((id - 50100) / 100)
    }
    return {
        id,
        event: text,
        grade,
        ...(effect ? { effect } : {}),
        ...(stage ? { stage } : {}),
        ...meta,
    } as Event
}

const ALL_ROWS = [
    ...EARLY_ROWS,
    ...LATE_ROWS,
    ...COMMON_ROWS,
    ...LONGEVITY_ROWS,
]

/** 扩展事件表，运行时与 dist/event.ts 的基础表合并（扩展优先） */
export const cultivationEvents = new Map<Event['id'], Event>(
    ALL_ROWS.map(line => {
        const e = parseEventRow(line)
        return [e.id, e] as const
    }),
)

/** 按内容分类索引，供事件池使用 */
export const eventsByStage = new Map<string, Event[]>()
/** 按境界索引，供事件池使用 */
export const eventsByRealm = new Map<number, Event[]>()
for (const event of cultivationEvents.values()) {
    const stage = (event.stage as string) ?? 'daily'
    const list = eventsByStage.get(stage) ?? []
    list.push(event)
    eventsByStage.set(stage, list)
    if (typeof event.realm === 'number') {
        const rl = eventsByRealm.get(event.realm) ?? []
        rl.push(event)
        eventsByRealm.set(event.realm, rl)
    }
}

export const cultivationEventCount = cultivationEvents.size
