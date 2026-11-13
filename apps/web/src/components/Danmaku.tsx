/**
 * 弹幕：顶栏下面几行，像聊天一样往上涨。
 *
 * 不飞、也不定时消失 —— 只有新的挤进来、位置不够了，最上面那条才被顶出去。
 * 不做全屏飘字：这一屏最值钱的是几个人的人生日志，弹幕压上去就没法读了。
 */
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { DANMAKU_GAP, DANMAKU_LIMIT } from '@remake/multi'
import { sendDanmaku } from '@/multi/client'
import { useMulti } from '@/multi/useMulti'
import './Danmaku.css'

/** 屏幕上留几行。多留一行就少一截日志，三条刚好 */
const ROWS = 3

export function DanmakuTrack() {
    const { danmaku, id, room } = useMulti()
    /**
     * 只画最后几条。更旧的留在 store 里不清 —— 从对战页退回房间页
     * 组件要重挂载，要是每次都清空，刚聊的几句就白说了。
     */
    const visible = danmaku.slice(-ROWS)

    return (
        <div
            className="danmaku"
            style={{ '--rows': visible.length } as CSSProperties}
        >
            {visible.map(item => {
                const playerIndex = room?.players.findIndex(
                    player => player.id === item.from,
                ) ?? -1
                const tone = playerIndex >= 0 ? playerIndex % 5 : 0
                return (
                    <div
                        key={item.id}
                        className={`danmaku-item player-tone-${tone}${item.from === id ? ' me' : ''}`}
                    >
                        {/* 两个 span 必须贴着写：中间留换行会在 flex 里冒出一个空格 */}
                        <span className="danmaku-name">【{item.name}】：</span><span className="danmaku-text">{item.text}</span>
                    </div>
                )
            })}
        </div>
    )
}

export function DanmakuInput() {
    const { status } = useMulti()
    const [text, setText] = useState('')
    /** 和服务端同一个间隔：按得再快也不会白发一条（服务端会丢） */
    const [cooling, setCooling] = useState(false)
    const ready = status === 'connected'

    const handleSend = () => {
        const value = text.trim()
        if (!value || !ready || cooling) return
        sendDanmaku(value)
        setText('')
        setCooling(true)
        setTimeout(() => setCooling(false), DANMAKU_GAP + 100)
    }

    return (
        <div className="danmaku-input">
            <input
                value={text}
                maxLength={DANMAKU_LIMIT}
                placeholder={cooling ? '刚发过，缓一下…' : '说点什么，回车发送'}
                disabled={!ready}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    handleSend()
                }}
            />
            <button
                className="secondary"
                onClick={handleSend}
                disabled={!ready || cooling || text.trim().length === 0}
            >
                {cooling ? '稍等' : '发送'}
            </button>
        </div>
    )
}
