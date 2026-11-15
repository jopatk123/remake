/**
 * 弹幕的分场景展示层：
 * - 候场页 / 结算倒数：大字从视口横穿（结算时挪到排名卡片下方，别挡名次）
 * - 对局推进：只留顶部一条窄轨小字，不压任何人的日志
 *
 * 只读「刚到一条」的通知，不读 store 里留着的聊天记录：
 * 房间页 ↔ 对战页来回挂载时，diff 历史数组会把旧消息当成新消息重播一遍。
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Step, useStep } from '@remake/hooks'
import type { Danmaku } from '@remake/multi'
import { subscribeDanmakuArrival } from '@/multi/client'
import { subscribeRareFx } from '@/fx/rare'
import { useMulti } from '@/multi/useMulti'
import './DanmakuFly.css'

type Mode = 'off' | 'hero' | 'result' | 'compact'
type Playing = Exclude<Mode, 'off'>

/** 队列只留最新两条；同一时刻只播一条，绝不叠字 */
const QUEUE_LIMIT = 2
/** 大字最多显示多少字，完整文本仍在「候场闲谈」里 */
const HERO_LIMIT = 18
/** 系统开了「减少动效」时改成静态停留 */
const STATIC_MS = 2400

const TIMING: Record<Playing, { base: number; cooldown: number }> = {
    hero: { base: 4200, cooldown: 1400 },
    result: { base: 4000, cooldown: 1400 },
    compact: { base: 3600, cooldown: 2600 },
}

interface Flying {
    item: Danmaku
    mode: Playing
    duration: number
    tone: number
    generation: number
}

interface Context {
    mode: Mode
    reduced: boolean
    toneOf: (from: string) => number
}

/**
 * 调度器放在组件外：订阅只挂一次，播放状态全在闭包里，
 * 不会因为每次收到房间快照（每年一次）就重挂订阅、丢队列。
 */
function createController(setActive: (fly: Flying | null) => void) {
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
        window.clearTimeout(scheduleTimer)
        window.clearTimeout(finishTimer)
        scheduleTimer = 0
        finishTimer = 0
    }

    function schedule(delay: number) {
        if (scheduleTimer) return
        scheduleTimer = window.setTimeout(() => {
            scheduleTimer = 0
            pump()
        }, Math.max(0, delay))
    }

    function pump() {
        if (mode === 'off' || active) return
        // 飞升 / 魔劫这类全屏特效刚播过，先让一让
        const wait = suspendUntil - Date.now()
        if (wait > 0) {
            schedule(wait)
            return
        }
        const item = queue.shift()
        if (!item) return
        const playing: Playing = mode as Playing
        // 长句子多给一点时间，别还没看清就飞走了
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
        // 用 JS 定时器收尾：全局 reduced-motion 把动画压到 0.01ms，
        // 靠 animationend 移除会瞬间消失或永远留在屏幕上。
        finishTimer = window.setTimeout(() => {
            finishTimer = 0
            active = null
            setActive(null)
            schedule(TIMING[playing].cooldown)
        }, duration)
    }

    return {
        /** 每次渲染同步上下文；换场景就把在飞的那条和队列一起作废 */
        setContext(next: Context) {
            if (next.mode !== mode) {
                clearTimers()
                queue = []
                active = null
                generation += 1
            }
            mode = next.mode
            reduced = next.reduced
            toneOf = next.toneOf
        },
        /** 换过场景后，React state 里那条旧消息就不该再画出来 */
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

export function DanmakuFlyLayer() {
    const step = useStep()
    const { status, room, id } = useMulti()
    const [active, setActive] = useState<Flying | null>(null)
    const [reduced, setReduced] = useState(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    const [ctl] = useState(() => createController(setActive))

    const mode: Mode =
        status !== 'connected' || room === null
            ? 'off'
            : step === Step.Room
              ? 'hero'
              : room.phase === 'over'
                ? 'result'
                : 'compact'

    ctl.setContext({
        mode,
        reduced,
        toneOf: (from: string) => {
            const index = room?.players.findIndex(p => p.id === from) ?? -1
            return index >= 0 ? index % 5 : 0
        },
    })

    useEffect(() => {
        const offDanmaku = subscribeDanmakuArrival(ctl.onArrival)
        const offRareFx = subscribeRareFx(ctl.onRareFx)
        return () => {
            offDanmaku()
            offRareFx()
            ctl.dispose()
        }
    }, [ctl])

    useEffect(() => {
        const query = matchMedia('(prefers-reduced-motion: reduce)')
        const onChange = () => setReduced(query.matches)
        query.addEventListener('change', onChange)
        return () => query.removeEventListener('change', onChange)
    }, [])

    const fly = ctl.isCurrent(active) ? active : null
    if (!fly) return null

    const short =
        fly.mode !== 'compact' && fly.item.text.length > HERO_LIMIT
            ? `${fly.item.text.slice(0, HERO_LIMIT)}…`
            : fly.item.text

    return (
        <div
            className={`danmaku-fly-layer mode-${fly.mode}${reduced ? ' reduced' : ''}`}
            aria-hidden="true"
        >
            <div className="danmaku-fly-track">
                <div
                    key={fly.item.id}
                    className={`danmaku-fly-item player-tone-${fly.tone}${fly.item.from === id ? ' me' : ''}`}
                    style={
                        {
                            ['--fly-duration' as string]: `${fly.duration}ms`,
                        } as CSSProperties
                    }
                >
                    <span className="danmaku-fly-name">【{fly.item.name}】</span>
                    <span className="danmaku-fly-text">{short}</span>
                </div>
            </div>
        </div>
    )
}

export default DanmakuFlyLayer
