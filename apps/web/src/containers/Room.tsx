import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mode, Step, useGameReset, useModeChoose, useSetStep } from '@remake/hooks'
import { RESULT_MS } from '@remake/multi'
import { useMulti } from '@/multi/useMulti'
import { connect, disconnect, start } from '@/multi/client'
import { copyText } from '@/multi/clipboard'
import { toastMsg } from '@/toast'
import { DanmakuInput, DanmakuTrack } from '@/components/Danmaku'
import { Ranking } from '@/components/Ranking'
import './Room.css'

const NAME_KEY = 'remake-mp-name'

function randomCode() {
    const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 4; i++)
        code += pool[Math.floor(Math.random() * pool.length)]
    return code
}

function RoomHeading({ code }: { code: string }) {
    return (
        <header className="room-head">
            <span className="room-kicker font-mono">
                TOGETHER IN ONE LIFE · 同场轮回
            </span>
            <div className="room-title-row">
                <h2 className="room-title font-display">多人游戏</h2>
                <span className="room-code font-mono">
                    <small>房号</small>
                    {code}
                </span>
            </div>
            <p className="room-sub">
                同一间命室，各自落笔。谁走得更远，一屏见分晓。
            </p>
        </header>
    )
}

/** 多人游戏要把每个人画成一列，触屏和窄屏排不下，直接不让进 */
function useDesktop() {
    const [desktop, setDesktop] = useState(true)
    useEffect(() => {
        const check = () => {
            const coarse = window.matchMedia('(pointer: coarse)').matches
            setDesktop(!coarse && window.innerWidth >= 900)
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])
    return desktop
}

export function Room() {
    const mp = useMulti()
    const desktop = useDesktop()
    const setStep = useSetStep()
    const reset = useGameReset()
    const [, chooseMode] = useModeChoose()
    // 邀请链接带过来的房间号：进来自动入房，不用再点一次
    const urlRoom = useMemo(
        () =>
            new URLSearchParams(location.search).get('room')?.toUpperCase() ??
            null,
        [],
    )
    const [name, setName] = useState(
        () => localStorage.getItem(NAME_KEY) ?? '',
    )
    const [code, setCode] = useState(() => urlRoom ?? randomCode())
    const joined = mp.status === 'connected' && mp.room !== null
    const me = mp.room?.players.find(p => p.id === mp.id)
    const host = me?.host ?? false
    const started = useRef(false)
    const autoJoined = useRef(false)

    // 房主开始后，所有人各自进入自己那一套选天赋流程
    useEffect(() => {
        if (mp.room?.phase !== 'playing' || started.current) return
        started.current = true
        reset()
        chooseMode(Mode.Classic)
    }, [mp.room?.phase, reset, chooseMode])

    // 从邀请链接进来 + 之前留过昵称 → 直接进房，省掉一次点击
    useEffect(() => {
        if (!urlRoom || joined || autoJoined.current) return
        const saved = localStorage.getItem(NAME_KEY)?.trim()
        if (!saved) return
        autoJoined.current = true
        connect(urlRoom, saved)
    }, [urlRoom, joined])

    const handleJoin = useCallback(() => {
        const nick = name.trim()
        if (!nick) return
        localStorage.setItem(NAME_KEY, nick)
        connect(code.trim().toUpperCase(), nick)
    }, [name, code])

    const handleLeave = useCallback(() => {
        disconnect()
        started.current = false
        // 把 ?room= 从地址栏抹掉，否则刷新又会被拉回这个房间
        const url = new URL(location.href)
        if (url.searchParams.has('room')) {
            url.searchParams.delete('room')
            history.replaceState(null, '', url)
        }
        setStep(Step.Idle)
    }, [setStep])

    const copyLink = useCallback(async () => {
        // 进过房间之后一切以服务端给的房间号为准：房间页会重新挂载，
        // 本地的 code 有可能已经是另一个随机号了，复制出去就拉错房间。
        const roomId = mp.room?.id ?? code
        const url = `${location.origin}${location.pathname}?room=${roomId}`
        const ok = await copyText(url)
        toastMsg(
            ok ? '邀请链接已复制，发到群里就能进' : '复制失败，请手动复制地址栏链接',
            'copy-link',
        )
    }, [code, mp.room?.id])

    const players = mp.room?.players ?? []
    // 上一局的排名跟着房间下发，开局后被服务端清空
    const result = mp.room?.result ?? null
    /** 标题和分享链接都跟着真实房间走，不用本地那份可能过期的输入 */
    const shownCode = mp.room?.id ?? code

    if (!desktop && !joined) {
        return (
            <div className="screen room">
                <RoomHeading code={shownCode} />
                <div className="room-block">
                    <span className="room-block-mark font-display" aria-hidden="true">席</span>
                    <h3>这一席需要更大的桌面</h3>
                    <p>
                        多人游戏会把每个人的人生并排画在一屏上，
                        手机和平板排不下，请用电脑打开。
                    </p>
                    <button className="primary" onClick={handleLeave}>
                        返回首页
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="screen room">
            <RoomHeading code={shownCode} />

            {!joined && (
                <div className="room-form">
                    <div className="room-form-head">
                        <span className="room-form-kicker font-mono">入席</span>
                        <strong className="font-display">写下名字，等命书翻开</strong>
                        <p>
                            {urlRoom
                                ? '你正在加入这个房间，起个昵称就能进。'
                                : '每人一台电脑加入同一个房间，开局后所有人的一生并排显示。'}
                        </p>
                    </div>
                    <div className="room-fields">
                        <label>
                            昵称
                            <input
                                value={name}
                                maxLength={12}
                                placeholder="随便起一个"
                                onChange={e => setName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                            />
                        </label>
                        <label>
                            房间号
                            <input
                                value={code}
                                maxLength={12}
                                className="font-mono"
                                onChange={e => setCode(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                            />
                        </label>
                    </div>
                    <div className="room-actions">
                        <button className="primary" onClick={handleJoin}>
                            加入房间
                        </button>
                        <button className="secondary" onClick={handleLeave}>
                            返回
                        </button>
                    </div>
                    {mp.status === 'connecting' && (
                        <p className="room-status">正在扣门…</p>
                    )}
                    {mp.status === 'closed' && (
                        <p className="room-error">连接已断开，请重新加入</p>
                    )}
                    {mp.message && <p className="room-error">{mp.message}</p>}
                </div>
            )}

            {joined && (
                <>
                    {result && (
                        <div className="room-result">
                            <Ranking
                                items={result}
                                me={mp.id}
                                title="上一局排名"
                                note="比的是谁走得远，年龄相同时看总评"
                            />
                        </div>
                    )}
                    <section className="room-lobby">
                        <div className="room-lobby-head">
                            <div>
                                <span className="room-lobby-kicker font-mono">候场名录</span>
                                <strong>
                                    {players.length} 人在席
                                </strong>
                            </div>
                            <span className={`room-lobby-state ${players.length > 1 ? 'ready' : ''}`}>
                                {players.length > 1 ? '可以开局' : '等第二位入席'}
                            </span>
                        </div>
                        <ul className="room-players">
                            {players.map((player, index) => (
                                <li
                                    key={player.id}
                                    className={`player-tone-${index % 5} ${player.id === mp.id ? 'me' : ''}`}
                                    style={{ ['--player-order' as string]: index }}
                                >
                                    <span className="seat-index font-mono">
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <span className="player-avatar font-display" aria-hidden="true">
                                        {player.name.trim().slice(0, 1) || '命'}
                                    </span>
                                    <span className="name">
                                        {player.name}
                                        {player.host && (
                                            <span className="tag font-mono">
                                                房主
                                            </span>
                                        )}
                                        {player.id === mp.id && (
                                            <span className="tag font-mono">
                                                我
                                            </span>
                                        )}
                                    </span>
                                    <span className="state">
                                        {player.host ? '执笔候场' : '已入席'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="room-actions">
                            {host && (
                                <button className="primary" onClick={start}>
                                    开始对局
                                </button>
                            )}
                            <button className="secondary" onClick={copyLink}>
                                复制邀请链接
                            </button>
                            <button className="secondary" onClick={handleLeave}>
                                离开
                            </button>
                        </div>
                        <p className="room-status">
                            {host
                                ? players.length > 1
                                    ? '人已到齐，随时可以开局。'
                                    : '先把邀请链接发给朋友，等第二位入席。'
                                : '等房主落笔开局，先把链接发给朋友也行。'}
                        </p>
                        {mp.message && <p className="room-error">{mp.message}</p>}
                    </section>

                    <div className="room-bottom">
                        <details className="room-rules">
                            <summary>
                                <span>对局规则</span>
                                <small>自动推进 · 随时暂停 · 可调速度</small>
                            </summary>
                            <div className="room-rules-body">
                                <p>
                                    开局后先等所有人选完天赋、分配好点数进入对战页，
                                    到齐才自动往前走；谁都可以暂停、谁都可以调速度。
                                    一结束先倒数 {RESULT_MS / 1000} 秒看排名和死因，
                                    再回到这里接着开下一局。
                                </p>
                                <p>
                                    房主要是掉线或者离开，房主会随机换给还在的人。
                                </p>
                            </div>
                        </details>
                        {/* 等开局的时候也能聊天，弹幕和对战页共用一个组件 */}
                        <div className="room-chat">
                            <div className="room-chat-head">
                                <span className="font-display">候场闲谈</span>
                                <small>发条弹幕，房里的人都看得见</small>
                            </div>
                            <DanmakuTrack />
                            <DanmakuInput />
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default Room
