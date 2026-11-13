import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './client'

export const useMulti = () => useSyncExternalStore(subscribe, getSnapshot)

/** 已经开局的房间：此时「继续」要经过房间屏障，不能本地直接推进 */
export const useInMatch = () => {
    const { status, room } = useMulti()
    return status === 'connected' && room !== null && room.phase !== 'lobby'
}

/**
 * 结算倒计时的本地秒表。
 *
 * 服务端只下发「还剩多少毫秒」这个时长（各端时钟不准也能对上），
 * 前端收到后按自己的时钟往下走。期间服务端会定期重发房间视图，
 * 每次 left 变化都会顺手重新校准一次截止时间。
 */
export function useResultCountdown(left: number | null) {
    const [remaining, setRemaining] = useState(left ?? 0)
    useEffect(() => {
        if (left === null) return
        const deadline = Date.now() + left
        const tick = () => setRemaining(Math.max(0, deadline - Date.now()))
        tick()
        const timer = window.setInterval(tick, 100)
        return () => window.clearInterval(timer)
    }, [left])
    return remaining
}
