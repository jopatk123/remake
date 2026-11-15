import { Fragment, useState, useRef, useCallback } from 'react'
import type { UIEvent } from 'react'
import { useLayoutEffect, useEffect } from 'react'
import AnimatedProp from '@/components/AnimatedProp'
import CultivationBar from '@/components/CultivationBar'
import { useNext, useGotoSummary, useSetStep, Step, useGameState, useProfile } from '@remake/hooks'
import { EndingName } from '@remake/core'
import { useJudge } from '@/hooks/judge'
import { AutoInterval } from '@/config'
import { toastAchvs } from '@/toast/Achv'
import { emitRareFxFromNext } from '@/fx/rare'
import { Log, logChapter } from '@/components/LogList'
import { useInMatch, useMulti } from '@/multi/useMulti'
import { AudioToggle } from '@/audio'
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
    const [profile] = useProfile()
    const state = useGameState()
    const [auto, setAuto] = useState(false)
    const logRef = useRef<HTMLUListElement>(null)
    const autoRef = useRef(0)
    const processRef = useRef(false)
    const followLatest = useRef(true)
    const gotoSummary = useGotoSummary()
    const handleNext = useCallback(() => {
        if (ended) return
        if (processRef.current) return
        processRef.current = true
        const result = next()
        toastAchvs(result.achievements)
        emitRareFxFromNext(result, profile)
        processRef.current = false
    }, [ended, next, profile])
    const handleGotoSummary = useCallback(() => {
        if (!ended) return
        const achievements = gotoSummary()
        toastAchvs(achievements)
    }, [ended, gotoSummary])
    const handleLogScroll = useCallback((event: UIEvent<HTMLUListElement>) => {
        const element = event.currentTarget
        const distanceToBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight
        followLatest.current = distanceToBottom < 56
    }, [])
    useLayoutEffect(() => {
        requestAnimationFrame(() => {
            if (!logRef.current || !followLatest.current) return
            logRef.current.scrollTop = logRef.current.scrollHeight
        })
    }, [logs])
    useEffect(() => {
        if (!auto) window.clearInterval(autoRef.current)
        else autoRef.current = window.setInterval(handleNext, AutoInterval)
        return () => window.clearInterval(autoRef.current)
    }, [auto, handleNext])
    const ending = state?.ending ? EndingName[state.ending] : null
    const displayAge = Math.max(0, state?.props.current.age ?? 0)
    return (
        <div
            className={`screen play ${state?.ending ? `ending-${state.ending}` : ''}`}
        >
            <Properties />
            <CultivationBar />
            <div className="life-log-wrap">
                <div className="life-log-head">
                    <span className="font-display">此生纪事</span>
                    <span className="life-age font-mono">
                        {displayAge} 岁
                    </span>
                </div>
                {logs.length === 0 ? (
                    <div
                        className="life-empty"
                        role="button"
                        tabIndex={0}
                        onClick={handleNext}
                        onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            handleNext()
                        }}
                    >
                        <span className="life-empty-age font-display" aria-hidden="true">0</span>
                        <span className="life-empty-kicker font-mono">命书尚未落笔</span>
                        <strong className="font-display">写下第一年</strong>
                        <span>点一下，看看这一生会怎样开始</span>
                    </div>
                ) : (
                    <ul
                        className="logs hide-scrollbar"
                        onClick={handleNext}
                        onScroll={handleLogScroll}
                        ref={logRef}
                        role="log"
                        aria-live="polite"
                        aria-label="人生记事"
                    >
                        {logs.map((log, index) => {
                            const chapter = logChapter(log.age)
                            // 夺舍重生后年龄从 1 重新计数，单用 age 会撞 key
                            return (
                                <Fragment key={`${log.age}-${index}`}>
                                    {chapter && (
                                        <li className="log-chapter" aria-hidden="true">
                                            <span>{chapter}</span>
                                        </li>
                                    )}
                                    <Log
                                        log={log}
                                        latest={index === logs.length - 1}
                                    />
                                </Fragment>
                            )
                        })}
                    </ul>
                )}
            </div>
            <div className="controls">
                {!ended && (
                    <>
                        <button className="primary" onClick={handleNext}>
                            下一年
                        </button>
                        <button
                            className="secondary"
                            onClick={() => setAuto(!auto)}
                            aria-pressed={auto}
                        >
                            {auto ? '停笔' : '自动演绎'}
                        </button>
                    </>
                )}
                {ended && (
                    <button className="primary" onClick={handleGotoSummary}>
                        {ending ? `${ending} · 人生总结` : '人生总结'}
                    </button>
                )}
                <AudioToggle />
            </div>
        </div>
    )
}

/** 在房间里就走全场对战，否则还是原来那套单人流程 */
export function Play() {
    const active = useInMatch()
    const mp = useMulti()
    const setStep = useSetStep()
    /**
     * 结算阶段（over）仍留在对战页看倒计时；服务端数完秒把房间收回
     * 大厅（phase 变回 lobby）后，才主动退回房间页 —— 否则会掉进
     * 「不在对局里」的分支，露出上一局的单人页面，而那个页面已经不能推进了。
     *
     * 对战中途断线同理：不能把同一条命接到单人「下一年」上，回房间重新进。
     */
    const lobby = mp.room !== null && mp.room.phase === 'lobby'
    const dropped = mp.status === 'closed' || mp.status === 'error'
    useEffect(() => {
        if (lobby || dropped) setStep(Step.Room)
    }, [lobby, dropped, setStep])
    // 退回房间页的那一两帧不要闪出单人界面
    if (lobby || dropped) return null
    return active ? <Battle /> : <Solo />
}

export default Play
