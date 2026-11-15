/**
 * 音频与 React 的接缝。
 *
 * 只剩音效：解锁、事件语义 → 声音、多人对手的远钟、切后台挂起。
 * 背景音乐已移除，所以这里不再订阅场景与境界，也不再随年份重算。
 *
 * 挂载在 Game 里，和 RareFxLayer 并列。渲染成 null，不占布局。
 */

import { useEffect, useRef, useState } from 'react'
import { subscribeRareFx } from '@/fx/rare'
import { useMulti } from '@/multi/useMulti'
import { getGraph, resumeAudio, suspendAudio, unlockAudio } from './context'
import { playRareFx, playSfx } from './sfx'
import {
    getAudioSettings,
    subscribeAudioSettings,
    toggleMuted,
    type AudioSettings,
} from './settings'
import './audio.css'

/** 对手在五列里的横向位置 → 声像，听得出是谁出事 */
function panOf(index: number, total: number) {
    if (total <= 1) return 0
    return ((index / (total - 1)) * 2 - 1) * 0.7
}

export function AudioRoot() {
    const multi = useMulti()

    /* ── 解锁：任何一次手势都行 ─────────────────────────────── */
    useEffect(() => {
        const onGesture = () => {
            const graph = getGraph()
            if (graph && graph.ctx.state === 'running') return
            unlockAudio()
        }
        window.addEventListener('pointerdown', onGesture, true)
        window.addEventListener('keydown', onGesture, true)
        return () => {
            window.removeEventListener('pointerdown', onGesture, true)
            window.removeEventListener('keydown', onGesture, true)
        }
    }, [])

    /* ── 视觉总线的语义 → 声音 ─────────────────────────────── */
    useEffect(() => subscribeRareFx(items => playRareFx(items)), [])

    /* ── 普通按钮的轻叩；日志区点一年不发声 ─────────────────── */
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            const target = event.target
            if (!(target instanceof Element)) return
            const button = target.closest('button')
            if (!button) return
            /* 静音按钮自己那一下不响，否则按下去"有声却已静音"很怪 */
            if (button.hasAttribute('data-audio-toggle')) return
            playSfx('ui')
        }
        document.addEventListener('click', onClick)
        return () => document.removeEventListener('click', onClick)
    }, [])

    /* ── 多人：只播对手的死亡与飞升，且按列序放声像 ─────────── */
    const seen = useRef(
        new Map<string, { alive: boolean; ending: string | null }>(),
    )
    useEffect(() => {
        const room = multi.room
        if (!room || room.phase !== 'playing') {
            seen.current.clear()
            return
        }
        const total = room.players.length
        room.players.forEach((player, index) => {
            if (player.id === multi.id) return
            const before = seen.current.get(player.id)
            seen.current.set(player.id, {
                alive: player.alive,
                ending: player.ending ?? null,
            })
            if (!before) return
            const pan = panOf(index, total)
            if (before.alive && !player.alive) {
                playSfx('farDeath', pan)
            } else if (!before.ending && player.ending) {
                playSfx('farAscend', pan)
            }
        })
    }, [multi.room, multi.id])

    /* ── 切后台省电 ────────────────────────────────────────── */
    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden) suspendAudio()
            else resumeAudio()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () =>
            document.removeEventListener('visibilitychange', onVisibility)
    }, [])

    return null
}

/** 喇叭开关。放在首页 .actions 与对局页 .controls 里，不弹面板 */
export function AudioToggle() {
    const [settings, setSettings] = useState<AudioSettings>(getAudioSettings)
    useEffect(() => subscribeAudioSettings(setSettings), [])
    const muted = settings.muted
    const label = muted ? '打开声音' : '关闭声音'

    return (
        <button
            type="button"
            data-audio-toggle
            className="audio-toggle"
            onClick={() => {
                unlockAudio()
                toggleMuted()
            }}
            aria-pressed={!muted}
            aria-label={label}
            title={label}
        >
            <svg
                className="audio-svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4Z" />
                {muted ? (
                    <>
                        <path className="audio-wave" d="M15.6 9.2 20 14.4" />
                        <path className="audio-wave" d="M20 9.2 15.6 14.4" />
                    </>
                ) : (
                    <>
                        <path className="audio-wave" d="M15.2 9.1a4.2 4.2 0 0 1 0 5.8" />
                        <path className="audio-wave" d="M18 6.9a7.8 7.8 0 0 1 0 10.2" />
                    </>
                )}
            </svg>
        </button>
    )
}
