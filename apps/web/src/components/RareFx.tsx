import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { subscribeRareFx, type RareFxItem } from '@/fx/rare'
import './RareFx.css'

const DURATION: Record<number, number> = { 1: 1900, 2: 2100, 3: 2900 }

/**
 * 稀有天赋 / 事件的全局反馈层。
 *
 * 只负责「把总线送来的条目播出来」，不做任何判定；
 * 因此单人、多人、抽卡三个入口可以共用同一套表现。
 */
export function RareFxLayer() {
    const [items, setItems] = useState<RareFxItem[] | null>(null)
    const timer = useRef(0)
    useEffect(
        () =>
            subscribeRareFx(next => {
                if (next.length === 0) return
                setItems(next)
                window.clearTimeout(timer.current)
                timer.current = window.setTimeout(
                    () => setItems(null),
                    DURATION[next[0]!.tier] ?? 2000,
                )
            }),
        [],
    )
    useEffect(() => () => window.clearTimeout(timer.current), [])
    if (!items || items.length === 0) return null
    const first = items[0]!
    const tier = first.tier
    const duration = DURATION[tier] ?? 2000
    return (
        <div
            className={`rare-fx tier-${tier} tone-${first.tone}`}
            style={{ ['--fx-duration' as string]: `${duration}ms` }}
            role="status"
            aria-live={tier >= 2 ? 'assertive' : 'polite'}
        >
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
