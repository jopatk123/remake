import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './client'

export const useMulti = () => useSyncExternalStore(subscribe, getSnapshot)

/** 已经开局的房间：此时「继续」要经过房间屏障，不能本地直接推进 */
export const useInMatch = () => {
    const { status, room } = useMulti()
    return status === 'connected' && room !== null && room.phase !== 'lobby'
}
