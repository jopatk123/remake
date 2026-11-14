/**
 * 修仙进度条。
 *
 * 100 岁入道后才出现；显示「境界 + 小阶段 + 修为进度 + 大道 / 天劫准备」。
 * 单人页和多人游戏里「自己」那一列共用这一套，紧凑模式只收起次要信息，
 * 保证不遮挡日志（延续项目里「文字可读性优先」的约定）。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useGameState } from '@remake/hooks'
import {
    realmConfig,
    realmTitle,
    TUNING,
    CultivationPathName,
    EndingName,
} from '@remake/core'
import './CultivationBar.css'

type PulseKind = 'breakthrough' | 'tribulation' | 'ascend'

type RealmFxKind = 'entry' | 'realm' | 'ascend'

interface RealmFx {
    kind: RealmFxKind
    label: string
    title: string
    seq: number
}

interface CultivationSnapshot {
    realm: number
    minor: number
    trial: number
    started: boolean
}

/** 入道 / 大境界突破的局部光效：跟随修为条，多人模式里就落在自己那一列 */
function RealmBurst({ fx }: { fx: RealmFx }) {
    return (
        <div
            key={fx.seq}
            className={`realm-fx kind-${fx.kind}`}
            aria-hidden="true"
        >
            <span className="realm-fx-glow" />
            <span className="realm-fx-beam" />
            <span className="realm-fx-ring" />
            <span className="realm-fx-ring ring-2" />
            <span className="realm-fx-label">
                <em>{fx.label}</em>
                <strong>{fx.title}</strong>
            </span>
            <span className="realm-fx-particles">
                {Array.from({ length: 10 }, (_, index) => (
                    <i
                        key={index}
                        style={{ ['--i' as string]: index } as CSSProperties}
                    />
                ))}
            </span>
        </div>
    )
}

export function CultivationBar({ compact = false }: { compact?: boolean }) {
    const state = useGameState()
    const [pulse, setPulse] = useState<PulseKind | null>(null)
    const [realmFx, setRealmFx] = useState<RealmFx | null>(null)
    const previous = useRef<CultivationSnapshot | null>(null)
    const pulseTimer = useRef(0)
    const realmTimer = useRef(0)
    const realmSeq = useRef(0)

    /**
     * 只在「境界变化 / 雷劫推进 / 入道」这些真正的节点播一次光效，
     * 不从日志里反推，避免多人页每人每年都触发一次。
     */
    useEffect(() => {
        if (!state) return
        const c = state.cultivation
        const next: CultivationSnapshot = {
            realm: c.realm,
            minor: c.minor,
            trial: c.tribulationStage,
            started: c.started,
        }
        const last = previous.current
        previous.current = next
        if (!last) return
        let kind: PulseKind | null = null
        let nextRealmFx: Omit<RealmFx, 'seq'> | null = null
        if (!last.started && c.started) {
            kind = 'breakthrough'
            nextRealmFx = {
                kind: 'entry',
                label: '入道',
                title: realmConfig(c.realm).fullName,
            }
        } else if (c.realm > last.realm) {
            kind = c.realm >= 9 ? 'ascend' : 'breakthrough'
            nextRealmFx = {
                kind: c.realm >= 9 ? 'ascend' : 'realm',
                label: c.realm >= 9 ? '飞升' : '境界突破',
                title: realmConfig(c.realm).fullName,
            }
        } else if (c.tribulationStage > last.trial) kind = 'tribulation'
        else if (c.minor > last.minor) kind = 'breakthrough'
        if (!kind) return
        setPulse(kind)
        window.clearTimeout(pulseTimer.current)
        pulseTimer.current = window.setTimeout(() => setPulse(null), 1000)

        if (nextRealmFx) {
            realmSeq.current += 1
            setRealmFx({ ...nextRealmFx, seq: realmSeq.current })
            window.clearTimeout(realmTimer.current)
            realmTimer.current = window.setTimeout(
                () => setRealmFx(null),
                nextRealmFx.kind === 'ascend' ? 2600 : 1800,
            )
        }
    }, [state])

    useEffect(
        () => () => {
            window.clearTimeout(pulseTimer.current)
            window.clearTimeout(realmTimer.current)
        },
        [],
    )

    if (!state) return null
    const c = state.cultivation
    if (!c.started) return null

    const cfg = realmConfig(c.realm)
    const ascended = c.realm >= 9
    const inTrial = c.realm === 8
    // 渡劫期不再显示修为条，改显示九重雷劫的推进；其余境界显示修为。
    const trialCurrent = Math.max(
        0,
        c.tribulation - c.tribulationBaseline,
    )
    const trialMax = inTrial
        ? TUNING.tribulationStep * TUNING.tribulationTrials
        : 1
    const max = Math.max(1, inTrial ? trialMax : cfg.threshold)
    const value = inTrial ? trialCurrent : c.progress
    const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
    const title = realmTitle(c.realm, c.minor)

    return (
        <div
            className={`cultivation-bar grade-${cfg.grade} ${compact ? 'compact' : ''} ${ascended ? 'ascended' : ''} ${pulse ? `fx-${pulse}` : ''}`}
            title={cfg.description}
        >
            {realmFx && <RealmBurst fx={realmFx} />}
            <div className="cultivation-head">
                <span className="cultivation-label">境界</span>
                <strong className="cultivation-title font-mono">{title}</strong>
                <span className="cultivation-path">
                    {CultivationPathName[c.path] ?? '凡人流'}
                </span>
                {c.bottleneck && !ascended && (
                    <span
                        className="cultivation-bottleneck"
                        title={
                            cfg.deathRisk >= 0.07
                                ? `${cfg.need} 冲击此关恐有性命之忧`
                                : cfg.need
                        }
                    >
                        瓶颈 · {cfg.need}
                        {cfg.deathRisk >= 0.07 && ' ⚠'}
                    </span>
                )}
            </div>
            <div
                className="cultivation-track"
                role="progressbar"
                aria-label={inTrial ? '九重雷劫进度' : '修为进度'}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={Math.floor(value)}
            >
                <div
                    className="cultivation-fill"
                    style={{ ['--cultivation-percent' as string]: `${percent}%` }}
                />
            </div>
            <div className="cultivation-meta font-mono">
                {inTrial ? (
                    <span>雷劫 {c.tribulationStage}/{TUNING.tribulationTrials} 重</span>
                ) : (
                    <span>修为 {Math.floor(c.progress)}/{max}</span>
                )}
                <span>大道 {c.daos.length}/{TUNING.daosRequired}</span>
                {!ascended && (
                    <span className="cultivation-hint">
                        {inTrial
                            ? c.tribulationStage < TUNING.tribulationTrials
                                ? '九重雷劫未尽，继续扛劫'
                                : c.daos.length < TUNING.daosRequired
                                  ? `九劫已过，还缺 ${TUNING.daosRequired - c.daos.length} 条大道`
                                  : '大道圆满，可引飞升天劫'
                            : c.realm >= 7
                              ? cfg.need
                              : `突破要点：${cfg.need}`}
                    </span>
                )}
                {state.ending && (
                    <span className="cultivation-ending">
                        {EndingName[state.ending]}
                    </span>
                )}
            </div>
        </div>
    )
}

export default CultivationBar
