import { useState, useRef, useCallback } from 'react'
import { useLayoutEffect, useEffect } from 'react'
import { useNext, useGotoSummary, useSetStep, Step } from '@remake/hooks'
import { useJudge } from '@/hooks/judge'
import { properties } from '@remake/data/etc/display'
import { AutoInterval } from '@/config'
import { toastAchvs } from '@/toast/Achv'
import { Log } from '@/components/LogList'
import { useInMatch, useMulti } from '@/multi/useMulti'
import { Battle } from './Battle'
import './Play.css'

interface PropProps {
    prop: keyof typeof properties
    value: number
    grade: number
}

function Prop({ prop, value, grade }: PropProps) {
    const prevRef = useRef<number>(value)
    const [trend, setTrend] = useState<'up' | 'down' | 'normal'>('normal')
    const [flip, setFlip] = useState(0)
    const [displayValue, setDisplayValue] = useState<number>(value)
    useEffect(() => {
        const prev = prevRef.current
        if (value === prev) return
        const startValue = prevRef.current
        prevRef.current = value
        setTrend(value > prev ? 'up' : 'down')
        setFlip(f => (f + 1) % 2)
        let startTimestamp: number | null = null
        const duration = 400
        let end = false
        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp
            const progress = timestamp - startTimestamp
            const progressRatio = Math.min(progress / duration, 1)
            const easeOutQuad = progressRatio * (2 - progressRatio)
            const currentDec = startValue + (value - startValue) * easeOutQuad
            setDisplayValue(Math.round(currentDec))
            if (!end && progress < duration) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
        const timer = setTimeout(() => setTrend('normal'), 2000)
        return () => {
            clearTimeout(timer)
            setDisplayValue(value)
            end = true
        }
    }, [value])

    return (
        <li className={`${prop} grade-${grade} trend-${trend}-${flip}`}>
            <span className="name">{properties[prop]}</span>
            <span className="value font-mono">{displayValue}</span>
        </li>
    )
}

function Properties() {
    const judges = useJudge()
    return (
        <ul className="properties">
            {judges.map(([key, { value, grade }]) => (
                <Prop key={key} prop={key} value={value} grade={grade} />
            ))}
        </ul>
    )
}

/** 单机：点一下过一年，本地直接推进 */
function Solo() {
    const [{ logs, ended }, next] = useNext()
    const [auto, setAuto] = useState(false)
    const logRef = useRef<HTMLUListElement>(null)
    const autoRef = useRef(0)
    const processRef = useRef(false)
    const gotoSummary = useGotoSummary()
    const handleNext = useCallback(() => {
        if (ended) return
        if (processRef.current) return
        processRef.current = true
        const achievements = next()
        toastAchvs(achievements)
        processRef.current = false
    }, [ended, next])
    const handleGotoSummary = useCallback(() => {
        if (!ended) return
        const achievements = gotoSummary()
        toastAchvs(achievements)
    }, [ended, gotoSummary])
    useLayoutEffect(() => {
        requestAnimationFrame(() => {
            if (!logRef.current) return
            logRef.current.scrollTop = logRef.current.scrollHeight
        })
    }, [logs])
    useEffect(() => {
        if (!auto) window.clearInterval(autoRef.current)
        else autoRef.current = window.setInterval(handleNext, AutoInterval)
        return () => window.clearInterval(autoRef.current)
    }, [auto, handleNext])
    return (
        <div className="screen play">
            <Properties />
            <ul
                className="logs hide-scrollbar"
                onClick={handleNext}
                ref={logRef}
            >
                {logs.map((log, index) => (
                    <Log key={index} log={log} />
                ))}
            </ul>
            <div className="controls">
                {!ended && (
                    <button
                        className="primary"
                        onClick={() => setAuto(!auto)}
                    >
                        {auto ? '关闭自动' : '开启自动'}
                    </button>
                )}
                {ended && (
                    <button className="primary" onClick={handleGotoSummary}>
                        人生总结
                    </button>
                )}
            </div>
        </div>
    )
}

/** 在房间里就走全场对战，否则还是原来那套单人流程 */
export function Play() {
    const active = useInMatch()
    const room = useMulti().room
    const setStep = useSetStep()
    /**
     * 服务端在结算后会把房间收回大厅（phase 变回 lobby）。
     * 这时候要主动退回房间页 —— 否则会掉进「不在对局里」的分支，
     * 露出上一局的单人页面，而那个页面已经不能推进了。
     */
    const lobby = room !== null && room.phase === 'lobby'
    useEffect(() => {
        if (lobby) setStep(Step.Room)
    }, [lobby, setStep])
    // 退回房间页的那一两帧不要闪出单人界面
    if (lobby) return null
    return active ? <Battle /> : <Solo />
}

export default Play
