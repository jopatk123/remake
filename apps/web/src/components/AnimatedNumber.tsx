import { useEffect, useRef, useState } from 'react'

/** 数字只在自身内部逐帧更新，避免带动整张页面重渲染。 */
export function useAnimatedNumber(value: number, duration = 400) {
    const [displayValue, setDisplayValue] = useState(value)
    const displayRef = useRef(value)

    useEffect(() => {
        const startValue = displayRef.current
        if (value === startValue) return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced) {
            displayRef.current = value
            setDisplayValue(value)
            return
        }

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
    }, [duration, value])

    return displayValue
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
