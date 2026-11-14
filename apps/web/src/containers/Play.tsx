import { useState, useRef, useCallback } from 'react'
import { useLayoutEffect, useEffect } from 'react'
import AnimatedProp from '@/components/AnimatedProp'
import CultivationBar from '@/components/CultivationBar'
import { useNext, useGotoSummary, useSetStep, Step, useGameState } from '@remake/hooks'
import { EndingName } from '@remake/core'
import { useJudge } from '@/hooks/judge'
import { AutoInterval } from '@/config'
import { toastAchvs } from '@/toast/Achv'
import { Log } from '@/components/LogList'
import { useInMatch, useMulti } from '@/multi/useMulti'
import { Battle } from './Battle'
import './Play.css'

function Properties() {
    const judges = useJudge()
    return (
        <ul className="properties">
            {judges.map(([key, { value, grade }]) => (
                <AnimatedProp key={key} prop={key} value={value} grade={grade} />
            ))}
        </ul>
    )
}

/** 单机：点一下过一年，本地直接推进 */
function Solo() {
    const [{ logs, ended }, next] = useNext()
    const state = useGameState()
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
    const ending = state?.ending ? EndingName[state.ending] : null
    return (
        <div className="screen play">
            <Properties />
            <CultivationBar />
            <ul
                className="logs hide-scrollbar"
                onClick={handleNext}
                ref={logRef}
            >
                {logs.map((log, index) => (
                    <Log
                        key={log.age}
                        log={log}
                        latest={index === logs.length - 1}
                    />
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
                        {ending ? `${ending} · 人生总结` : '人生总结'}
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
     * 结算阶段（over）仍留在对战页看倒计时；服务端数完秒把房间收回
     * 大厅（phase 变回 lobby）后，才主动退回房间页 —— 否则会掉进
     * 「不在对局里」的分支，露出上一局的单人页面，而那个页面已经不能推进了。
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
