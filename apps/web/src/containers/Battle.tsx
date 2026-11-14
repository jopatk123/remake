/**
 * 多人对战：整屏并排显示每个人的人生。
 *
 * 自己那一列是完整的本地游戏，别人的列是服务端广播过来的镜像 ——
 * 只有属性和最近若干年的日志。两边用的是同一套日志组件，所以
 * 「别人看你」和「你看别人」长得一样。
 *
 * 推进是全自动的：不用点“继续”，服务端按节拍往下走。想停下来读文字时
 * 谁都可以按“暂停”，再按一次就继续；嫌快嫌慢谁都能调节拍。
 *
 * 所有人结束后不马上切页面：先在结算浮层上播几秒倒计时，把名次和死因看完，
 * 倒计时归零、服务端把房间收回大厅时才退回房间页。
 */
import { useCallback, useLayoutEffect, useRef } from 'react'
import { useGameState, useGoHome, useNext } from '@remake/hooks'
import { SPEEDS } from '@remake/multi'
import { judgeGradeByValue } from '@/config'
import { Log } from '@/components/LogList'
import AnimatedProp from '@/components/AnimatedProp'
import CultivationBar from '@/components/CultivationBar'
import { DanmakuInput, DanmakuTrack } from '@/components/Danmaku'
import { Ranking } from '@/components/Ranking'
import { useJudge } from '@/hooks/judge'
import {
    disconnect,
    setPaused as sendPaused,
    setSpeed as sendSpeed,
} from '@/multi/client'
import { copyText } from '@/multi/clipboard'
import { useMultiMatch } from '@/multi/play'
import { useResultCountdown } from '@/multi/useMulti'
import { toastMsg } from '@/toast'
import type { Props, PlayerView } from '@remake/multi'
import './Battle.css'

/** 属性的固定显示顺序，和自己列的 CSS order 保持一致 */
const PROP_ORDER = ['charm', 'intelligence', 'strength', 'money', 'spirit'] as const

/** 节拍档位的短标签，和 protocol 里的 SPEEDS 一一对应 */
const SPEED_LABELS: Record<number, string> = {
    3000: '慢',
    1500: '正常',
    800: '快',
    400: '极速',
}

/** 几个人排几列：4 人用 2×2 比一字排开每列宽一倍，读得清 */
function columnsFor(count: number) {
    if (count <= 1) return 1
    if (count <= 3) return count
    if (count === 4) return 2
    if (count <= 6) return 3
    return 4
}

function PropRow({ props }: { props: Props | null }) {
    return (
        <ul className="battle-props">
            {PROP_ORDER.map(key => {
                const value = props?.[key] ?? 0
                const grade = judgeGradeByValue(key, value)
                return <AnimatedProp key={key} prop={key} value={value} grade={grade} />
            })}
        </ul>
    )
}

/** 自己那一列：走 useJudge，和单人页的属性条完全同源 */
function MyProps() {
    const judges = useJudge()
    const map = new Map(judges.map(([key, judge]) => [key, judge]))
    return (
        <ul className="battle-props">
            {PROP_ORDER.map(key => {
                const judge = map.get(key)
                return (
                    <AnimatedProp
                        key={key}
                        prop={key}
                        value={judge?.value ?? 0}
                        grade={judge?.grade ?? 0}
                    />
                )
            })}
        </ul>
    )
}

interface MyColumnProps {
    name: string
    age: number
    ended: boolean
    paused: boolean
    over: boolean
    tone: number
    leading: boolean
    logs: { age: number; events: number[]; talents: number[]; achievements: number[] }[]
}

function MyColumn({ name, age, ended, paused, over, tone, leading, logs }: MyColumnProps) {
    const ref = useRef<HTMLUListElement>(null)
    useLayoutEffect(() => {
        requestAnimationFrame(() => {
            const el = ref.current
            if (!el) return
            el.scrollTop = el.scrollHeight
        })
    }, [logs])
    const note = over
        ? '本局结束，正在结算…'
        : ended
          ? '你的人生结束了，等其他人跑完…'
          : paused
            ? '已暂停'
            : '自动推进中…'
    const classes = [
        'battle-col me',
        `player-tone-${tone}`,
        leading ? 'leading' : '',
        ended ? 'dead' : '',
    ].filter(Boolean).join(' ')
    return (
        <section className={classes}>
            <header className="battle-col-bar">
                <span className="name">
                    {name}
                    <span className="tag font-mono">我</span>
                    {leading && <span className="leader-tag">领先</span>}
                </span>
                <span className="age font-mono">{age}岁</span>
            </header>
            <MyProps />
            <CultivationBar compact />
            <ul className="logs battle-logs hide-scrollbar" ref={ref}>
                {logs.map((log, index) => (
                    <Log
                        key={log.age}
                        log={log}
                        latest={index === logs.length - 1}
                    />
                ))}
            </ul>
            <footer className="battle-foot">
                <span className="battle-note"><i className="status-dot" />{note}</span>
            </footer>
        </section>
    )
}

function PeerColumn({
    player,
    paused,
    tone,
    leading,
}: {
    player: PlayerView
    paused: boolean
    tone: number
    leading: boolean
}) {
    const ref = useRef<HTMLUListElement>(null)
    useLayoutEffect(() => {
        requestAnimationFrame(() => {
            const el = ref.current
            if (!el) return
            el.scrollTop = el.scrollHeight
        })
    }, [player.logs])
    const state = !player.alive
        ? player.connected
            ? '已结束'
            : '已离线'
        : paused
          ? '已暂停'
          : '自动推进中…'
    const classes = [
        'battle-col peer',
        `player-tone-${tone}`,
        player.alive ? '' : 'dead',
        player.connected ? '' : 'offline',
        leading ? 'leading' : '',
    ].filter(Boolean).join(' ')
    return (
        <section className={classes}>
            <header className="battle-col-bar">
                <span className="name">
                    {player.name}
                    {leading && <span className="leader-tag">领先</span>}
                </span>
                <span className="age font-mono">{player.age}岁</span>
            </header>
            <PropRow props={player.props} />
            <ul className="logs battle-logs hide-scrollbar" ref={ref}>
                {player.logs.length === 0 && (
                    <li className="battle-empty">还没迈出第一步…</li>
                )}
                {player.logs.map((log, index) => (
                    <Log
                        key={log.age}
                        log={log}
                        latest={index === player.logs.length - 1}
                    />
                ))}
            </ul>
            <footer className="battle-foot">
                <span className="battle-note"><i className="status-dot" />{state}</span>
            </footer>
        </section>
    )
}

export function Battle() {
    const [{ logs, ended }, next] = useNext()
    const { mp } = useMultiMatch(next, ended)
    const state = useGameState()
    const goHome = useGoHome()

    const room = mp.room
    // 结算阶段留在这一页：服务端给「还剩多少毫秒」，本地把秒数走完
    const left = useResultCountdown(
        mp.room?.phase === 'over' ? (mp.room.resultLeft ?? 0) : null,
    )
    const handlePause = useCallback(() => {
        if (!room) return
        sendPaused(!room.paused)
    }, [room])
    const handleLeave = useCallback(() => {
        disconnect()
        goHome()
    }, [goHome])
    const copyLink = useCallback(async () => {
        if (!room) return
        const url = `${location.origin}${location.pathname}?room=${room.id}`
        const ok = await copyText(url)
        toastMsg(
            ok ? '邀请链接已复制，发到群里就能进' : '复制失败，请手动复制地址栏链接',
            'copy-link',
        )
    }, [room])

    if (!room) return null

    const players = room.players
    const alive = players.filter(player => player.alive).length
    const cols = columnsFor(players.length)
    const waiting = room.waiting
    const over = room.phase === 'over'
    // 领先判定与服务端排名一致：飞升 > 境界 > 年龄 > 总评
    const endingRank = (ending: PlayerView['ending']) =>
        ending === 'ascend' || ending === 'transcend'
            ? 3
            : ending === 'leave-world'
              ? 2
              : ending === 'reincarnation'
                ? 1
                : 0
    const leaderId = players.length > 1
        ? [...players].sort(
              (a, b) =>
                  endingRank(b.ending) - endingRank(a.ending) ||
                  (b.realm ?? 0) - (a.realm ?? 0) ||
                  b.age - a.age ||
                  b.summary - a.summary,
          )[0]?.id
        : null
    /** 还在等别人选天赋时，「继续」没有意义，按钮先不出现；收摊那一帧也不给按 */
    const canToggle = room.phase === 'playing' && waiting.length === 0

    return (
        <div className={`battle ${room.paused ? 'is-paused' : ''}`}>
            <div className="battle-bar">
                <span className="battle-code font-mono">{room.id}</span>
                <span className="battle-round font-mono">已过 {room.round} 年</span>
                <span className="battle-meta">
                    {over ? '本局已结束' : `${alive} / ${players.length} 人还在跑`}
                </span>
                {/* 节拍谁都能改：读得快的人不必等，想细看的人也不必抢暂停 */}
                <span className="battle-speed" role="group" aria-label="推进速度">
                    <span className="battle-speed-label">速度</span>
                    {SPEEDS.map(ms => (
                        <button
                            key={ms}
                            className={room.interval === ms ? 'primary' : ''}
                            onClick={() => sendSpeed(ms)}
                            title={`每年 ${(ms / 1000).toFixed(1)} 秒`}
                        >
                            {SPEED_LABELS[ms]}
                        </button>
                    ))}
                </span>
                <span className="battle-spacer" />
                {canToggle && (
                    <button className="primary" onClick={handlePause}>
                        {room.paused ? '继续' : '暂停'}
                    </button>
                )}
                <button className="secondary" onClick={copyLink}>
                    复制邀请
                </button>
                <button className="secondary" onClick={handleLeave}>
                    退出
                </button>
            </div>

            <div className="battle-tick-track" aria-hidden="true">
                <span
                    key={`${room.round}-${room.interval}`}
                    className={room.paused ? 'paused' : ''}
                    style={{ ['--tick-duration' as string]: `${room.interval}ms` }}
                />
            </div>

            {/* 弹幕轨在顶栏下面，不压任何人的日志 */}
            <DanmakuTrack />

            {room.paused && (
                <div className="battle-pause">
                    {waiting.length > 0
                        ? `等待 ${waiting.join('、')} 选完天赋…`
                        : `${room.pausedBy ?? '有人'} 暂停了对局，任何一个人都可以点「继续」`}
                </div>
            )}

            <div
                className="battle-stage"
                style={{ ['--cols' as string]: cols }}
            >
                {players.map((player, index) =>
                    player.id === mp.id ? (
                        <MyColumn
                            key={player.id}
                            name={player.name}
                            age={Math.max(
                                0,
                                state?.props.current.age ?? player.age,
                            )}
                            ended={ended}
                            paused={room.paused}
                            over={over}
                            tone={index % 5}
                            leading={player.id === leaderId}
                            logs={logs}
                        />
                    ) : (
                        <PeerColumn
                            key={player.id}
                            player={player}
                            paused={room.paused}
                            tone={index % 5}
                            leading={player.id === leaderId}
                        />
                    ),
                )}
            </div>

            <DanmakuInput />

            {/* 结算浮层：先停在对战页倒数几秒，到点才由服务端收回房间页 */}
            {over && (
                <div className="battle-result">
                    <div className="battle-result-card">
                        <Ranking
                            items={room.result ?? []}
                            me={mp.id}
                            title="本局排名"
                        />
                        <p className="battle-result-count">
                            {left > 0
                                ? `${Math.max(1, Math.ceil(left / 1000))} 秒后回到房间…`
                                : '正在回到房间…'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Battle
