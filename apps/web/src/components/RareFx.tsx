import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { subscribeRareFx, type RareFxItem } from '@/fx/rare'
import './RareFx.css'

const DURATION: Record<number, number> = { 1: 1900, 2: 2100, 3: 2900 }

/** 同档 / 低档事件要顶替当前特效时的保底播放时长 */
const MIN_SHOW: Record<number, number> = { 1: 400, 2: 1000, 3: 1200 }

function topTier(items: RareFxItem[]) {
    return Math.max(...items.map(item => item.tier)) as 1 | 2 | 3
}

/** 排队时只留一条：高档优先，同档取最新的 */
function preferQueued(prev: RareFxItem[] | null, next: RareFxItem[]) {
    if (!prev) return next
    return topTier(next) >= topTier(prev) ? next : prev
}

/**
 * 稀有天赋 / 事件的全局反馈层。
 *
 * 只负责「把总线送来的条目播出来」，不做任何判定；
 * 因此单人、多人、抽卡三个入口可以共用同一套表现。
 * 连续稀有年份时走一条极简队列，避免飞升这类高档特效被下一年顶掉。
 */
export function RareFxLayer() {
    const [items, setItems] = useState<RareFxItem[] | null>(null)
    const timer = useRef(0)
    const shownAt = useRef(0)
    const playingTier = useRef<0 | 1 | 2 | 3>(0)
    const queued = useRef<RareFxItem[] | null>(null)

    useEffect(() => {
        const play = (next: RareFxItem[]) => {
            const tier = topTier(next)
            setItems(next)
            playingTier.current = tier
            shownAt.current = Date.now()
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(
                () => {
                    const nextUp = queued.current
                    queued.current = null
                    if (nextUp) play(nextUp)
                    else {
                        playingTier.current = 0
                        setItems(null)
                    }
                },
                DURATION[tier] ?? 2000,
            )
        }
        const unsubscribe = subscribeRareFx(next => {
            if (next.length === 0) return
            const tier = topTier(next)
            const current = playingTier.current
            if (current === 0) {
                play(next)
                return
            }
            // 低档永远不打断仍在播放的高档，排到它后面
            if (tier < current) {
                queued.current = preferQueued(queued.current, next)
                return
            }
            // 同档且还没播够保底时长，也先排队
            if (tier === current && Date.now() - shownAt.current < (MIN_SHOW[current] ?? 0)) {
                queued.current = preferQueued(queued.current, next)
                return
            }
            queued.current = null
            play(next)
        })
        return () => {
            unsubscribe()
            window.clearTimeout(timer.current)
        }
    }, [])

    if (!items || items.length === 0) return null
    const first = items[0]!
    const tier = topTier(items)
    const duration = DURATION[tier] ?? 2000
    return (
        <div
            className={`rare-fx tier-${tier} tone-${first.tone}`}
            style={{ ['--fx-duration' as string]: `${duration}ms` }}
            role="status"
            aria-live={tier >= 2 ? 'assertive' : 'polite'}
        >
            {first.fx === 'ambush' && (
                <div className="rare-fx-slash" aria-hidden="true" />
            )}
            {tier >= 2 && <div className="rare-fx-burst" aria-hidden="true" />}
            {tier >= 2 && <div className="rare-fx-ring" aria-hidden="true" />}
            {tier >= 2 && (
                <div className="rare-fx-particles" aria-hidden="true">
                    {Array.from(
                        { length: tier >= 3 ? 18 : 14 },
                        (_, index) => (
                            <span
                                key={index}
                                style={
                                    { ['--i' as string]: index } as CSSProperties
                                }
                            />
                        ),
                    )}
                </div>
            )}
            <div className="rare-fx-card">
                <span className="rare-fx-kicker">
                    {items.length > 1 ? '稀有时刻' : first.tag}
                </span>
                <ul className="rare-fx-list">
                    {items.map(item => (
                        <li key={item.key}>
                            <strong>{item.title}</strong>
                            {item.description && (
                                <span className="rare-fx-desc">
                                    {item.description}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

export default RareFxLayer
