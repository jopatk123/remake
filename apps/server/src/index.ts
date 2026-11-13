import { WebSocketServer, type WebSocket } from 'ws'
import { DEFAULT_PORT, type ClientMessage, type ServerMessage } from '@remake/multi'
import { Room } from './room'

const port = Number(process.env.PORT ?? DEFAULT_PORT)
const rooms = new Map<string, Room>()
const sessions = new Map<WebSocket, { roomId: string; playerId: string }>()

const wss = new WebSocketServer({ port })

function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function normalizeRoom(raw: string) {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

wss.on('connection', ws => {
    ws.on('message', data => {
        let msg: ClientMessage
        try {
            msg = JSON.parse(String(data)) as ClientMessage
        } catch {
            return send(ws, { t: 'error', message: '消息格式错误' })
        }

        if (msg.t === 'join') {
            const roomId = normalizeRoom(msg.room || '')
            if (!roomId) return send(ws, { t: 'error', message: '房间号不能为空' })
            if (sessions.has(ws))
                return send(ws, { t: 'error', message: '你已经在房间里了' })

            let room = rooms.get(roomId)
            if (!room) {
                room = new Room(roomId)
                rooms.set(roomId, room)
            }

            const playerId = crypto.randomUUID()
            const err = room.join(playerId, msg.name, m => send(ws, m))
            if (err) return send(ws, { t: 'error', message: err })

            sessions.set(ws, { roomId, playerId })
            send(ws, { t: 'welcome', id: playerId, room: roomId })
            console.log(
                `[${roomId}] ${msg.name} 加入，当前 ${room.size} 人`,
            )
            return
        }

        const session = sessions.get(ws)
        if (!session) return send(ws, { t: 'error', message: '先加入房间' })
        const room = rooms.get(session.roomId)
        if (!room) return send(ws, { t: 'error', message: '房间不存在' })

        switch (msg.t) {
            case 'start':
                room.start(session.playerId)
                break
            case 'pause':
                room.setPaused(session.playerId, msg.on)
                break
            case 'speed':
                room.setSpeed(session.playerId, msg.ms)
                break
            case 'danmaku':
                room.danmaku(session.playerId, msg.text)
                break
            case 'sync':
                room.sync(session.playerId, {
                    age: msg.age,
                    life: msg.life,
                    alive: msg.alive,
                    summary: msg.summary,
                    props: msg.props,
                    logs: msg.logs,
                })
                break
            default:
                send(ws, { t: 'error', message: '未知指令' })
        }
    })

    ws.on('close', () => {
        const session = sessions.get(ws)
        if (!session) return
        sessions.delete(ws)
        const room = rooms.get(session.roomId)
        if (!room) return
        room.leave(session.playerId)
        console.log(`[${session.roomId}] 一人离开，剩 ${room.size} 人`)
        if (room.empty) {
            // 定时器不清会一直在后台跑，房间越多越费 CPU
            room.dispose()
            rooms.delete(session.roomId)
            console.log(`[${session.roomId}] 房间已销毁`)
        }
    })

    ws.on('error', error => {
        console.error('连接异常', error.message)
    })
})

// 心跳：清掉假死连接，否则屏障会被挂机的人卡住
const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
        const socket = ws as WebSocket & { alive?: boolean }
        if (socket.alive === false) {
            socket.terminate()
            continue
        }
        socket.alive = false
        socket.ping()
    }
}, 30_000)

wss.on('connection', ws => {
    const socket = ws as WebSocket & { alive?: boolean }
    socket.alive = true
    ws.on('pong', () => {
        socket.alive = true
    })
})

process.on('SIGINT', () => {
    clearInterval(heartbeat)
    wss.close()
    process.exit(0)
})

console.log(`人生重开 · 多人中继已启动 ws://0.0.0.0:${port}`)