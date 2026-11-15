/**
 * 稀有天赋 / 稀有事件的视觉特效总线。
 *
 * 判定规则刻意不只看 grade：
 * 修仙事件里有大量橙色小突破与雷劫，如果按橙色直接播全屏，
 * 每年突破都会被闪一次。这里先按语义（kind / ending / DAO）分类，
 * 再让「首次获得」享受更高一档的反馈。
 */
import { EndingName, events, talents } from '@remake/data'
import type { Event as GameEvent } from '@remake/data'
import type { ProfileState } from '@remake/core'

export type RareFxTone = 'gold' | 'violet' | 'azure' | 'jade' | 'blood'
export type RareFxTier = 1 | 2 | 3

export interface RareFxItem {
    /** 幂等键：同一天赋 / 事件只展示一次 */
    key: string
    tier: RareFxTier
    tone: RareFxTone
    tag: string
    title: string
    description?: string
    /** 专属表现：魔修偷袭额外扫一道血色刀光，和其他稀有事件区分 */
    fx?: 'ambush'
}

export interface RareFxSource {
    talents: readonly number[]
    events: readonly number[]
}

type Listener = (items: RareFxItem[]) => void

const listeners = new Set<Listener>()
let pending: RareFxItem[] = []

export function subscribeRareFx(listener: Listener) {
    listeners.add(listener)
    if (pending.length > 0) {
        const items = pending
        pending = []
        listener(items)
    }
    return () => {
        listeners.delete(listener)
    }
}

export function emitRareFx(items: RareFxItem[]) {
    if (items.length === 0) return
    if (listeners.size === 0) {
        pending = [...pending, ...items].slice(-6)
        return
    }
    for (const listener of listeners) listener(items)
}

const EFFECT_LABELS: Record<string, string> = {
    CHR: '颜值',
    INT: '悟性',
    STR: '体质',
    MNY: '家境',
    SPR: '道心',
    LIF: '寿命',
    AGE: '年龄',
    CULT: '修为',
    REALM: '境界',
    MINOR: '小阶段',
    PATH: '路线',
    DAO: '大道',
    TRIB: '天劫',
    RATE: '突破率',
}

function clip(text: string, max = 26) {
    const line = text.split('\n')[0]!.trim()
    return line.length > max ? `${line.slice(0, max)}…` : line
}

function describeEffect(event: GameEvent) {
    const effect = event.effect
    if (!effect) return undefined
    const parts: string[] = []
    for (const [key, value] of Object.entries(effect)) {
        if (!value) continue
        const label = EFFECT_LABELS[key] ?? key
        parts.push(`${label}${value > 0 ? '+' : ''}${value}`)
    }
    return parts.length > 0 ? parts.join(' · ') : undefined
}

function isNegative(event: GameEvent) {
    if (event.ending === 'death' || event.kind === 'crisis') return true
    return Object.values(event.effect ?? {}).some(value => value < 0)
}

/** 魔修偷袭系列：千分之一/年、后果极重，单独享受最高档表现 */
const AMBUSH_IDS = new Set([51500, 51501, 51502, 51503])

function classifyTalent(
    id: number,
    profile: ProfileState | null,
): RareFxItem | null {
    const talent = talents.get(id)
    if (!talent || talent.grade < 2) return null
    const firstTime = profile ? !profile.talents.has(id) : true
    const rare = talent.grade >= 3
    return {
        key: `talent:${id}`,
        tier: rare ? (firstTime ? 2 : 1) : 1,
        tone: rare ? 'gold' : 'violet',
        tag: rare ? '稀有天赋' : '天赋',
        title: talent.name,
        description: talent.description,
    }
}

function classifyEvent(
    id: number,
    profile: ProfileState | null,
): RareFxItem | null {
    const event = events.get(id)
    if (!event) return null
    // 常规突破交给修为条与日志自身的动效，不再叠全屏
    if (event.kind === 'breakthrough') return null

    const firstTime = profile ? !profile.events.has(id) : true
    const key = `event:${id}`

    // 魔修偷袭：不走通用 crisis 的 tier 2，否则 1/1000 的天降横祸
    // 看起来和普通危机事件一个量级。这里固定最高档 + 专属刀光。
    if (AMBUSH_IDS.has(id)) {
        const title =
            id === 51500
                ? '魔修偷袭'
                : id === 51501
                  ? '身受重伤'
                  : id === 51502
                    ? '夺舍重生'
                    : '身死道消'
        return {
            key,
            tier: 3,
            tone: 'blood',
            tag: '魔劫',
            title,
            description: clip(event.event, 40),
            fx: 'ambush',
        }
    }

    if (event.ending) {
        const death = event.ending === 'death'
        return {
            key,
            tier: death ? 2 : 3,
            tone: death
                ? 'blood'
                : event.ending === 'reincarnation'
                  ? 'jade'
                  : 'gold',
            tag: '结局',
            title:
                EndingName[event.ending as keyof typeof EndingName] ??
                clip(event.event),
            description: clip(event.event, 40),
        }
    }

    if (event.kind === 'ascend') {
        return {
            key,
            tier: 3,
            tone: 'gold',
            tag: '飞升',
            title: clip(event.event),
            description: describeEffect(event),
        }
    }

    if (event.kind === 'tribulation') {
        return {
            key,
            tier: 2,
            tone: 'azure',
            tag: '雷劫',
            title: clip(event.event),
            description: describeEffect(event),
        }
    }

    if (event.kind === 'crisis') {
        return {
            key,
            tier: 2,
            tone: 'blood',
            tag: '危机',
            title: clip(event.event),
            description: describeEffect(event),
        }
    }

    if (event.stage === 'dao' || (event.effect?.DAO ?? 0) > 0) {
        return {
            key,
            tier: 2,
            tone: 'jade',
            tag: '顿悟',
            title: clip(event.event),
            description: describeEffect(event),
        }
    }

    if (event.kind === 'omen') {
        return {
            key,
            tier: 1,
            tone: 'azure',
            tag: '天兆',
            title: clip(event.event),
            description: describeEffect(event),
        }
    }

    if (event.grade < 3) return null

    // 基础表里的橙色事件数量少，当成真正的稀有奇遇；
    // 修仙表里剩下的橙色事件只做轻量提示，避免和突破 / 雷劫抢戏。
    const baseRare = event.id < 50000
    return {
        key,
        tier: baseRare ? (firstTime ? 2 : 1) : 1,
        tone: isNegative(event) ? 'blood' : 'gold',
        tag: baseRare ? '稀有奇遇' : '奇遇',
        title: clip(event.event),
        description: describeEffect(event),
    }
}

export function collectRareFx(
    source: RareFxSource,
    profile: ProfileState | null,
): RareFxItem[] {
    const items: RareFxItem[] = []
    const seen = new Set<string>()
    const push = (item: RareFxItem | null) => {
        if (!item || seen.has(item.key)) return
        seen.add(item.key)
        items.push(item)
    }
    for (const id of source.talents) push(classifyTalent(id, profile))
    for (const id of source.events) push(classifyEvent(id, profile))
    return items
}

/** 同一年只保留最高档，最多展示三条，避免多次全屏叠加 */
export function selectRareFx(items: RareFxItem[]): RareFxItem[] {
    if (items.length === 0) return []
    const top = Math.max(...items.map(item => item.tier)) as RareFxTier
    return items.filter(item => item.tier === top).slice(0, 3)
}

export function emitRareFxFromNext(
    source: RareFxSource,
    profile: ProfileState | null,
) {
    emitRareFx(selectRareFx(collectRareFx(source, profile)))
}

/** 抽卡结果单独处理：橙色天赋出现时立刻给一次强反馈 */
export function emitPullRareFx(
    ids: readonly number[],
    profile: ProfileState | null,
) {
    const items: RareFxItem[] = []
    for (const id of ids) {
        const talent = talents.get(id)
        if (!talent || talent.grade < 3) continue
        const item = classifyTalent(id, profile)
        if (!item) continue
        items.push({ ...item, tier: 2, tag: '橙色天赋' })
    }
    emitRareFx(items.slice(0, 2))
}
