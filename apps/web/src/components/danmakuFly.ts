/**
 * 弹幕飘字的调度：同一时刻只播一条，换场景把队列和正在飞的那条一起作废。
 * 不碰 React，方便单测队列 / 限流 / 场景切换。
 */
import type { Danmaku } from '@remake/multi'

export type Mode = 'off' | 'hero' | 'result' | 'compact'
export type Playing = Exclude<Mode, 'off'>

/** 队列只留最新两条；同一时刻只播一条，绝不叠字 */
export const QUEUE_LIMIT = 2
/** 系统开了「减少动效」时改成静态停留 */
const STATIC_MS = 2400

export const TIMING: Record<Playing, { base: number; cooldown: number }> = {
    hero: { base: 4200, cooldown: 1400 },
    result: { base: 4000, cooldown: 1400 },
    compact: { base: 3600, cooldown: 2600 },
}

export interface Flying {
    item: Danmaku
    mode: Playing
    duration: number
    tone: number
    generation: number
}

export interface Context {
    mode: Mode
    reduced: boolean
    toneOf: (from: string) => number
}

export function createDanmakuFlyController(
    setActive: (fly: Flying | null) => void,
) {
    let mode: Mode = 'off'
    let reduced = false
    let toneOf: Context['toneOf'] = () => 0
    let generation = 0
    let active: Flying | null = null
    let queue: Danmaku[] = []
    let scheduleTimer = 0
    let finishTimer = 0
    let suspendUntil = 0

    function clearTimers() {
        globalThis.clearTimeout(scheduleTimer)
        globalThis.clearTimeout(finishTimer)
        scheduleTimer = 0
        finishTimer = 0
    }

    function schedule(delay: number) {
        if (scheduleTimer) return
        scheduleTimer = globalThis.setTimeout(() => {
            scheduleTimer = 0
            pump()
        }, Math.max(0, delay))
    }

    function pump() {
        if (mode === 'off' || active) return
        const wait = suspendUntil - Date.now()
        if (wait > 0) {
            schedule(wait)
            return
        }
        const item = queue.shift()
        if (!item) return
        const playing: Playing = mode as Playing
        const duration = reduced
            ? STATIC_MS
            : TIMING[playing].base + Math.min(1600, item.text.length * 55)
        active = {
            item,
            mode: playing,
            duration,
            tone: toneOf(item.from),
            generation,
        }
        setActive(active)
        finishTimer = globalThis.setTimeout(() => {
            finishTimer = 0
            active = null
            setActive(null)
            schedule(TIMING[playing].cooldown)
        }, duration)
    }

    return {
        setContext(next: Context) {
            if (next.mode !== mode) {
                clearTimers()
                queue = []
                const had = active
                active = null
                generation += 1
                if (had) setActive(null)
            }
            mode = next.mode
            reduced = next.reduced
            toneOf = next.toneOf
        },
        isCurrent(fly: Flying | null) {
            return (
                fly !== null &&
                fly.generation === generation &&
                fly.mode === mode
            )
        },
        onArrival(item: Danmaku) {
            if (mode === 'off') return
            queue.push(item)
            if (queue.length > QUEUE_LIMIT)
                queue.splice(0, queue.length - QUEUE_LIMIT)
            schedule(0)
        },
        onRareFx(items: { tier: number }[]) {
            if (items.some(fx => fx.tier >= 2))
                suspendUntil = Date.now() + 2400
        },
        dispose() {
            clearTimers()
            queue = []
            active = null
            setActive(null)
        },
    }
}
