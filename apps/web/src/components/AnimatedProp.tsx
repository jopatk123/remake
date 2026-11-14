import { useEffect, useRef, useState } from 'react'
import { properties } from '@remake/data/etc/display'
import { useAnimatedNumber } from './AnimatedNumber'
import './AnimatedProp.css'

interface AnimatedPropProps {
    prop: keyof typeof properties
    value: number
    grade: number
}

export function AnimatedProp({ prop, value, grade }: AnimatedPropProps) {
    const previousTarget = useRef(value)
    const previousGrade = useRef(grade)
    const [trend, setTrend] = useState<'up' | 'down' | 'normal'>('normal')
    const [delta, setDelta] = useState<number | null>(null)
    const [flip, setFlip] = useState(0)
    const [gradeUp, setGradeUp] = useState(false)
    const displayValue = useAnimatedNumber(value)

    /**
     * 属性跨档才做庆祝反馈：每年 +1 的普通变化继续走飘字，
     * 否则多人对战里每列每年都闪一次，日志就没法看了。
     */
    useEffect(() => {
        const previous = previousGrade.current
        previousGrade.current = grade
        if (grade <= previous) return
        setGradeUp(true)
        const timer = window.setTimeout(() => setGradeUp(false), 900)
        return () => window.clearTimeout(timer)
    }, [grade])

    useEffect(() => {
        const previous = previousTarget.current
        if (value === previous) return
        previousTarget.current = value
        const difference = value - previous
        setTrend(difference > 0 ? 'up' : 'down')
        setDelta(difference)
        setFlip(current => (current + 1) % 2)
        const timer = window.setTimeout(() => {
            setTrend('normal')
            setDelta(null)
        }, 1400)
        return () => window.clearTimeout(timer)
    }, [value])

    return (
        <li
            className={`animated-prop ${prop} grade-${grade} trend-${trend}-${flip} ${gradeUp ? 'grade-pulse' : ''}`}
        >
            <span className="name">{properties[prop]}</span>
            <span className="value font-mono">
                <span className="number">{displayValue}</span>
                {delta !== null && (
                    <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
                        {delta > 0 ? `+${delta}` : delta}
                    </span>
                )}
            </span>
        </li>
    )
}

export default AnimatedProp
