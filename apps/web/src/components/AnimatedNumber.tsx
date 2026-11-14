import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
const mediaListeners = new Set<() => void>()

function subscribeReducedMotion(callback: () => void) {
    mediaListeners.add(callback)
    if (mediaListeners.size === 1) {
        window.matchMedia(reducedMotionQuery).addEventListener('change', () => {
            for (const listener of mediaListeners) listener()
        })
    }
    return () => mediaListeners.delete(callback)
}

function getReducedMotion() {
    return window.matchMedia(reducedMotionQuery).matches
}

/** 数字只在自身内部逐帧更新，避免带动整张页面重渲染。 */
export function useAnimatedNumber(value: number, duration = 400) {
    const [displayValue, setDisplayValue] = useState(value)
    const displayRef = useRef(value)
    const reduced = useSyncExternalStore(
        subscribeReducedMotion,
        getReducedMotion,
        () => false,
    )

    useEffect(() => {
        // 减少动态效果时直接展示终值，不做逐帧动画
        if (reduced || value === displayRef.current) return

        const startValue = displayRef.current
        let frame = 0
        let startedAt: number | null = null
        const update = (timestamp: number) => {
            if (startedAt === null) startedAt = timestamp
            const progress = Math.min((timestamp - startedAt) / duration, 1)
            const eased = 1 - (1 - progress) ** 3
            const next = Math.round(startValue + (value - startValue) * eased)
            displayRef.current = next
            setDisplayValue(next)
            if (progress < 1) frame = requestAnimationFrame(update)
        }
        frame = requestAnimationFrame(update)
        return () => cancelAnimationFrame(frame)
    }, [duration, reduced, value])

    return reduced ? value : displayValue
}

export function AnimatedNumber({
    value,
    className = '',
}: {
    value: number
    className?: string
}) {
    const displayValue = useAnimatedNumber(value)
    return <span className={className}>{displayValue}</span>
}

export default AnimatedNumber
