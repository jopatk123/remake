import { useEffect, useRef } from 'react'
import { usePicked, useEnd, useProfile, useIsClassic, useGameState, useSummary } from '@remake/hooks'
import { realmConfig, realmFullName, EndingName } from '@remake/core'
import { useEndJudge } from '@/hooks/judge'
import { properties, judgeDisplay } from '@remake/data/etc/display'
import { toastAchvs, toastMsg } from '@/toast'
import Talent from '@/components/Talent'
import AnimatedNumber from '@/components/AnimatedNumber'
import './Summary.css'

const ENDING_KICKER: Record<string, string> = {
    death: '此生落幕',
    ascend: '羽化登仙',
    transcend: '超脱轮回',
    'leave-world': '踏碎虚空',
    reincarnation: '再入轮回',
}

const ENDING_LINE: Record<string, string> = {
    death: '一世浮沉，终有归处。',
    ascend: '尘缘已尽，天光接引。',
    transcend: '万法归一，此身自在。',
    'leave-world': '山河仍在，故人已远。',
    reincarnation: '旧梦已散，来生再见。',
}

const ENDING_SEAL: Record<string, string> = {
    death: '终',
    ascend: '仙',
    transcend: '道',
    'leave-world': '空',
    reincarnation: '生',
}

function LifeEnding() {
    const state = useGameState()
    const summary = useSummary()
    const ending = state?.ending ?? null
    const age = state?.props.current.age ?? 0
    return (
        <header className={`life-ending ${ending ? `ending-${ending}` : ''}`}>
            <span className="life-ending-seal font-display" aria-hidden="true">
                {ending ? ENDING_SEAL[ending] : '终'}
            </span>
            <div className="life-ending-copy">
                <span className="life-ending-kicker font-mono">
                    {ending ? ENDING_KICKER[ending] : '此生已尽'}
                </span>
                <h1 className="font-display">
                    {ending ? EndingName[ending] : '人生总结'}
                </h1>
                <p>{ending ? ENDING_LINE[ending] : '命数有尽，余韵未绝。'}</p>
            </div>
            <dl className="life-ending-stats">
                <div>
                    <dt>享年</dt>
                    <dd className="font-mono">{age}<small>岁</small></dd>
                </div>
                <div>
                    <dt>经历</dt>
                    <dd className="font-mono">{state?.events.size ?? 0}<small>事</small></dd>
                </div>
                <div>
                    <dt>成就</dt>
                    <dd className="font-mono">{state?.achievements.size ?? 0}<small>项</small></dd>
                </div>
                <div>
                    <dt>总评</dt>
                    <dd className="font-mono">{summary}</dd>
                </div>
            </dl>
        </header>
    )
}

function Judges() {
    const judges = useEndJudge()
    return (
        <ul className="judge-list">
            {judges.map(([key, { value, grade, level }], index) => (
                <li
                    className={`${key} grade-${grade}`}
                    key={key}
                    style={{ ['--judge-order' as string]: index }}
                >
                    <span className="property">{properties[key]}</span>
                    <AnimatedNumber value={value} className="value font-mono" />
                    <span className="level">{judgeDisplay(key, level)}</span>
                </li>
            ))}
        </ul>
    )
}

/** 结算页上的修仙总结：最终境界 + 结局 + 修行统计 */
function CultivationSummary() {
    const state = useGameState()
    if (!state?.cultivation.started) return null
    const c = state.cultivation
    const grade = realmConfig(c.realm).grade
    return (
        <div className={`cultivation-summary grade-${grade}`}>
            <span className="cs-label">
                {state.ending ? EndingName[state.ending] : '此生修行'}
            </span>
            <strong className="cs-title">
                {realmFullName(c.realm, c.minor)}
            </strong>
            <span className="cs-meta font-mono">
                {c.startAge} 岁入道 · 突破 {c.breakthroughs} 次 · 悟道{' '}
                {c.daos.length} 条 · 天劫准备 {c.tribulation}
            </span>
        </div>
    )
}

interface TalentListProps {
    picked: Set<number>
    picker: (id: number) => void
}
function TalentList({ picked, picker }: TalentListProps) {
    const [profile] = useProfile()
    const talents = usePicked()
    const hasInitialized = useRef(false)
    useEffect(() => {
        if (!profile.locked) return
        if (!hasInitialized.current) {
            for (const id of profile.locked) {
                if (talents.has(id) && !picked.has(id)) {
                    picker(id)
                }
            }
            hasInitialized.current = true
        }
    }, [profile.locked, talents, picked, picker])

    return (
        <ul className="talent-list">
            {Array.from(talents, (id, index) => (
                <li
                    key={id}
                    className="talent-reveal"
                    style={{ ['--reveal-order' as string]: index }}
                    onClick={() => picker(id)}
                    onKeyDown={event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        picker(id)
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={picked.has(id)}
                >
                    <Talent id={id} selected={picked.has(id)} />
                </li>
            ))}
        </ul>
    )
}

export default function Summary() {
    const isClassic = useIsClassic()
    const [locked, picker, end] = useEnd()
    const handlePicker = (id: number) => {
        if (isClassic) picker(id)
        else toastMsg('名人天赋不可锁定', 'summary-toast')
    }
    const handleEnd = () => {
        const achievements = end()
        toastAchvs(achievements)
    }
    return (
        <div className="screen summary">
            <LifeEnding />
            <Judges />
            <CultivationSummary />
            <div className="section">
                <div className="title">
                    {isClassic
                        ? '你可以锁定一个天赋，下辈子还能抽到'
                        : '名人天赋不可锁定'}
                </div>
                <TalentList picked={locked} picker={handlePicker} />
            </div>
            <button className="primary" onClick={handleEnd}>
                再次重开
            </button>
        </div>
    )
}
