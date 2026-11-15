/**
 * 音频设置的持久化。
 *
 * 和主题一样走 localStorage，不引状态库：只有一个对象、两个订阅者，
 * 用不上全局 store。现在只剩音效音量与总开关 —— 背景音乐已移除。
 */

export interface AudioSettings {
    /** 音效音量，0–1 */
    sfx: number
    muted: boolean
}

const KEY = 'audio'

const FALLBACK: AudioSettings = {
    sfx: 0.75,
    muted: false,
}

function clamp(value: unknown, fallback: number) {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(1, Math.max(0, n))
}

function normalize(raw: Partial<AudioSettings> | null): AudioSettings {
    return {
        sfx: clamp(raw?.sfx, FALLBACK.sfx),
        muted: Boolean(raw?.muted),
    }
}

function read(): AudioSettings {
    try {
        const text = localStorage.getItem(KEY)
        if (!text) return { ...FALLBACK }
        return normalize(JSON.parse(text) as Partial<AudioSettings>)
    } catch {
        /* 隐私模式或脏数据：退回默认值，不影响游戏 */
        return { ...FALLBACK }
    }
}

let current: AudioSettings = read()
const listeners = new Set<(settings: AudioSettings) => void>()

function persist(settings: AudioSettings) {
    try {
        localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
        /* 存不下就算了，本次会话内仍然生效 */
    }
}

export function getAudioSettings() {
    return current
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
    const next = normalize({ ...current, ...patch })
    if (next.sfx === current.sfx && next.muted === current.muted) {
        return
    }
    current = next
    persist(next)
    for (const listener of listeners) listener(next)
}

export function toggleMuted() {
    setAudioSettings({ muted: !current.muted })
}

export function subscribeAudioSettings(listener: (settings: AudioSettings) => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}
