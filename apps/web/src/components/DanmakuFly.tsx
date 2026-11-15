/**
 * 弹幕的分场景展示层：
 * - 候场页 / 结算倒数：大字从视口横穿（结算时挪到排名卡片下方，别挡名次）
 * - 对局推进：只留顶部一条窄轨小字，不压任何人的日志
 *
 * 只读「刚到一条」的通知，不读 store 里留着的聊天记录：
 * 房间页 ↔ 对战页来回挂载时，diff 历史数组会把旧消息当成新消息重播一遍。
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Step, useStep } from '@remake/hooks'
import { subscribeDanmakuArrival } from '@/multi/client'
import { subscribeRareFx } from '@/fx/rare'
import { useMulti } from '@/multi/useMulti'
import {
    createDanmakuFlyController,
    type Flying,
    type Mode,
} from './danmakuFly'
import './DanmakuFly.css'

/** 大字最多显示多少字，完整文本仍在「候场闲谈」里 */
const HERO_LIMIT = 18

export function DanmakuFlyLayer() {
    const step = useStep()
    const { status, room, id } = useMulti()
    const [active, setActive] = useState<Flying | null>(null)
    const [reduced, setReduced] = useState(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    const [ctl] = useState(() => createDanmakuFlyController(setActive))

    const mode: Mode =
        status !== 'connected' || room === null
            ? 'off'
            : step === Step.Room
              ? 'hero'
              : room.phase === 'over'
                ? 'result'
                : 'compact'

    /* 场景切换必须在提交前同步进调度器，不能写在 render 里改闭包 */
    useLayoutEffect(() => {
        ctl.setContext({
            mode,
            reduced,
            toneOf: (from: string) => {
                const index = room?.players.findIndex(p => p.id === from) ?? -1
                return index >= 0 ? index % 5 : 0
            },
        })
    }, [ctl, mode, reduced, room])

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

    /* mode 变了先把旧字藏掉，等 layout effect 把 generation 推上去 */
    const fly =
        active && active.mode === mode && ctl.isCurrent(active) ? active : null
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
