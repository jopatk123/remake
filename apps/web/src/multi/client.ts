import type {
    ClientMessage,
    Danmaku,
    LogLine,
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
                const room = msg.room
                // 回到大厅 = 上一局收摊了：年数清零，不带进下一局
                commit({
                    room,
                    round: room.phase === 'lobby' ? 0 : Math.max(state.round, room.round),
                })
                break
            }
            case 'tick':
                commit({ round: msg.round })
                break
            case 'danmaku': {
                const { id, from, name, text, at } = msg
                // 不做定时消失：留着当聊天记录，只有攒够上限才让最旧的被挤掉
                const next = [...state.danmaku, { id, from, name, text, at }]
                commit({ danmaku: next.slice(-DANMAKU_KEEP) })
                break
            }
            case 'error':
                commit({ message: msg.message })
                break
        }
    }
    ws.onclose = () => {
        socket = null
        commit({ status: state.status === 'error' ? 'error' : 'closed' })
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
/** 选完天赋、分完点数、进入对战页后报到；全房间集齐才开始推进 */
export const enter = () => send({ t: 'enter' })
/** 任意玩家都能停 / 继续，服务端不校验谁按的 */
export const setPaused = (on: boolean) => send({ t: 'pause', on })
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
