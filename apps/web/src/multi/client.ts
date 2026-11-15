import type {
    ClientMessage,
    Danmaku,
    LogLine,
    Phase,
    Props,
    RoomView,
    ServerMessage,
} from '@remake/multi'
import { DANMAKU_KEEP } from '@remake/multi'

export type Status = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

export interface MultiState {
    status: Status
    /** 服务端分配的玩家 id */
    id: string | null
    /** 房间全量视图，上一局的排名也在里面（room.result） */
    room: RoomView | null
    /** 已完成年数，收到更大的值就该推进一年 */
    round: number
    /** 当前这一局的局次，用来丢掉上一局迟到的 tick */
    match: number
    /** 最近收到的弹幕，只留最新的若干条，不做定时清理 */
    danmaku: Danmaku[]
    /** 最近一条错误提示 */
    message: string | null
}

const initial: MultiState = {
    status: 'idle',
    id: null,
    room: null,
    round: 0,
    match: 0,
    danmaku: [],
    message: null,
}

function clearDanmaku() {
    if (state.danmaku.length === 0) return
    commit({ danmaku: [] })
}

let state: MultiState = initial
let socket: WebSocket | null = null
const listeners = new Set<() => void>()

/**
 * 「这一刻刚到一条弹幕」的通知，不存历史。
 *
 * 全屏飘字层不能去 diff state.danmaku：store 里留着最近几条且不清空，
 * 房间页 ↔ 对战页来回挂载时会把旧消息当成新消息重新播一遍。
 */
const arrivalListeners = new Set<(item: Danmaku) => void>()

export function subscribeDanmakuArrival(listener: (item: Danmaku) => void) {
    arrivalListeners.add(listener)
    return () => {
        arrivalListeners.delete(listener)
    }
}

function commit(patch: Partial<MultiState>) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function getSnapshot() {
    return state
}

/** 房间快照怎么改本地年数 / 局次：新的一局从 0 起，上一局迟到的快照丢掉 */
export function applyRoomRound(
    current: { round: number; match: number },
    room: RoomView,
): { round: number; match: number } | 'ignore' {
    const match = room.match ?? 0
    if (match !== 0 && current.match !== 0 && match < current.match)
        return 'ignore'
    const newMatch = match > current.match
    const round =
        room.phase === 'lobby' || newMatch
            ? room.phase === 'lobby'
                ? 0
                : room.round
            : Math.max(current.round, room.round)
    return { round, match }
}

/** 只接受当前这一局、还在 playing 里的 tick */
export function applyTickRound(
    current: { match: number; phase: Phase | null | undefined },
    tick: { round: number; match: number },
): number | 'ignore' {
    if (current.phase !== 'playing') return 'ignore'
    if (tick.match !== current.match) return 'ignore'
    return tick.round
}

/**
 * 连接地址优先级：?ws= 参数 > VITE_WS_URL > 同域 /ws（https）或 8787 端口（http）
 * 这样本地开发、自己域名、B 站容器三种环境都不用改代码。
 */
export function resolveUrl() {
    const param = new URLSearchParams(location.search).get('ws')
    if (param) return param
    const env = (import.meta as { env?: Record<string, string> }).env
        ?.VITE_WS_URL
    if (env) return env
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = location.protocol === 'https:' ? '' : ':8787'
    return `${protocol}//${location.hostname}${port}/ws`
}

export function connect(room: string, name: string) {
    disconnect()
    commit({ status: 'connecting', message: null, round: 0 })
    let ws: WebSocket
    try {
        ws = new WebSocket(resolveUrl())
    } catch (error) {
        commit({ status: 'error', message: `无法连接：${String(error)}` })
        return
    }
    socket = ws
    ws.onopen = () => {
        commit({ status: 'connected' })
        send({ t: 'join', room, name })
    }
    ws.onmessage = event => {
        let msg: ServerMessage
        try {
            msg = JSON.parse(event.data as string) as ServerMessage
        } catch {
            return
        }
        switch (msg.t) {
            case 'welcome':
                commit({ id: msg.id })
                break
            case 'room': {
                const next = applyRoomRound(state, msg.room)
                if (next === 'ignore') break
                commit({ room: msg.room, match: next.match, round: next.round })
                break
            }
            case 'tick': {
                const round = applyTickRound(
                    { match: state.match, phase: state.room?.phase },
                    msg,
                )
                if (round === 'ignore') break
                commit({ round })
                break
            }
            case 'danmaku': {
                const { id, from, name, text, at } = msg
                const item: Danmaku = { id, from, name, text, at }
                // 不做定时消失：留着当聊天记录，只有攒够上限才让最旧的被挤掉
                const next = [...state.danmaku, item]
                commit({ danmaku: next.slice(-DANMAKU_KEEP) })
                // 飘字层只认「刚到」这一刻，和上面的聊天记录分开
                for (const listener of arrivalListeners) listener(item)
                break
            }
            case 'error':
                commit({ message: msg.message })
                break
        }
    }
    ws.onclose = () => {
        socket = null
        // 年数清掉，房间快照留着：Play 靠 status 退回房间页，
        // 房间页还能显示原来的房号方便重新加入。
        commit({
            status: state.status === 'error' ? 'error' : 'closed',
            round: 0,
            match: 0,
            id: null,
        })
    }
    ws.onerror = () => commit({ status: 'error', message: '连接失败' })
}

export function disconnect() {
    if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
    }
    clearDanmaku()
    state = initial
    for (const listener of listeners) listener()
}

export function send(msg: ClientMessage) {
    // 1 === OPEN，不依赖 socket.OPEN（非浏览器运行时不一定挂在实例上）
    if (!socket || socket.readyState !== 1) return
    socket.send(JSON.stringify(msg))
}

export const start = () => send({ t: 'start' })
/** 选完天赋、分完点数、进入对战页后报到；全房间集齐后先停着等落笔 */
export const enter = () => send({ t: 'enter' })
/** 任意玩家都能停笔 / 开自动演绎，服务端不校验谁按的 */
export const setPaused = (on: boolean) => send({ t: 'pause', on })
/** 停笔时任何人点一下，全房间过一年 */
export const step = () => send({ t: 'step' })
/** 任意玩家都能调节拍，全房间跟着变 */
export const setSpeed = (ms: number) => send({ t: 'speed', ms })
/** 发一条弹幕。限流和截断都在服务端，这边不做二次判断 */
export const sendDanmaku = (text: string) => send({ t: 'danmaku', text })

export function sync(payload: {
    age: number
    life: number
    alive: boolean
    summary: number
    props: Props
    logs: LogLine[]
    /** 本局已获得的天赋 id，对战页用来显示稀有天赋 */
    talents?: number[]
    /** 致死事件 id，活着时给 null；服务端只转发，不解析内容 */
    death?: number | null
    /** 修仙进度：可选字段，服务端不解析内容，只用于排名与展示 */
    realm?: number
    realmTitle?: string
    ending?: import('@remake/multi').EndingType | null
}) {
    send({ t: 'sync', ...payload })
}
