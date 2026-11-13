import type {
    LogLine,
    Phase,
    Props,
    PlayerView,
    RoomView,
    RankingItem,
    ServerMessage,
} from '@remake/multi'
import {
    DANMAKU_GAP,
    DANMAKU_LIMIT,
    LOG_LIMIT,
    MAX_PLAYERS,
    MAX_SPEED,
    MIN_SPEED,
    ROUND_MS,
} from '@remake/multi'

type Send = (msg: ServerMessage) => void

/** 每年之间的节拍，测试时可以调小：ROUND_MS=150 bun run src/index.ts */
const ROUND = Math.max(60, Number(process.env.ROUND_MS ?? ROUND_MS))
/** 开局后最多等多久就强制开跑，防止一个人卡在选天赋页把所有人挂住 */
const ENTER_TIMEOUT = Math.max(1000, Number(process.env.ENTER_TIMEOUT ?? 60_000))

export interface Player {
    id: string
    name: string
    host: boolean
    /** 活着才会被计入结算，也才会被等 */
    alive: boolean
    /** 连接是否还在，掉线的人留在榜单上不再阻塞别人 */
    connected: boolean
    age: number
    life: number
    summary: number
    props: Props | null
    /** 最近几年的人生摘要，别人的屏幕靠它把这一列画出来 */
    logs: LogLine[]
    send: Send
}

export interface SyncPayload {
    age: number
    life: number
    alive: boolean
    summary: number
    props: Props
    logs: LogLine[]
}

/**
 * 一个房间就是一组独立的人生赛跑。
 *
 * 推进是全自动的：服务端按 interval 的节拍发 tick，各端本地过一年再 sync 回来。
 * 谁都可能想停下来读一眼文字，所以 pause 不做权限 —— 任何人按下去都停，
 * 任何人再按一次都继续，这是唯一不会把人卡住的规则。节拍同理，谁都能调。
 */
export class Room {
    readonly id: string
    phase: Phase = 'lobby'
    round = 0
    private players = new Map<string, Player>()
    private hostId: string | null = null
    /** 有人按了暂停 */
    private paused = false
    private pausedBy: string | null = null
    /** 开局后等人进入对局（选天赋、分配属性要花点时间） */
    private waiting = false
    private entered = new Set<string>()
    /** 当前节拍：每年间隔毫秒。任何人改了都立刻重开定时器 */
    private interval = ROUND
    /** 上一局的排名，回大厅后挂在房间上给房间页显示，开局清空 */
    private result: RankingItem[] | null = null
    private clock: ReturnType<typeof setInterval> | null = null
    private enterTimer: ReturnType<typeof setTimeout> | null = null
    /** 每人上一次发弹幕的时间，用来限流；离开就清掉 */
    private danmakuAt = new Map<string, number>()

    constructor(id: string) {
        this.id = id
    }

    get size() {
        return [...this.players.values()].filter(p => p.connected).length
    }

    get empty() {
        return this.size === 0
    }

    get started() {
        return this.phase !== 'lobby'
    }

    join(id: string, name: string, send: Send): string | null {
        if (this.size >= MAX_PLAYERS) return '房间已满'
        // 开局后再进来的人从 0 岁起跑，和已经在跑的人对不上，干脆不让进
        if (this.phase === 'playing') return '对局已经开始，请等这一局结束'
        const host = this.hostId === null
        this.players.set(id, {
            id,
            name: name.slice(0, 12) || '无名氏',
            host,
            alive: true,
            connected: true,
            age: 0,
            life: 0,
            summary: 0,
            props: null,
            logs: [],
            send,
        })
        if (host) this.hostId = id
        this.broadcastRoom()
        return null
    }

    leave(id: string) {
        const player = this.players.get(id)
        if (!player) return
        this.danmakuAt.delete(id)
        if (this.phase === 'playing') {
            // 开局后掉线按阵亡处理，但保留在榜单上，否则名次会凭空少一个人
            player.alive = false
            player.connected = false
            player.send = () => {}
            this.entered.delete(id)
            // 房主掉线就把帽子随机扔给还在的人，否则下一局没人能开
            if (this.hostId === id) this.transferHost()
            this.refreshWaiting()
            this.checkOver()
            this.broadcastRoom()
        } else {
            this.players.delete(id)
            this.entered.delete(id)
            if (this.hostId === id) this.transferHost()
            this.broadcastRoom()
        }
    }

    /** 房主随时可以开始，不用等别人准备 */
    start(id: string) {
        if (this.phase !== 'lobby') return
        if (this.hostId !== id) {
            this.players.get(id)?.send({ t: 'error', message: '只有房主能开始' })
            return
        }
        this.phase = 'playing'
        this.round = 0
        this.paused = false
        this.pausedBy = null
        this.waiting = true
        this.entered.clear()
        // 上一局的排名只留到这一局开始，开了就收起来
        this.result = null
        // 上一局的年龄 / 日志不能漏到这一局来
        for (const player of this.players.values()) {
            player.alive = true
            player.age = 0
            player.life = 0
            player.summary = 0
            player.props = null
            player.logs = []
        }
        this.startClock()
        this.enterTimer = setTimeout(() => {
            if (this.phase === 'playing' && this.waiting) {
                console.log(`[${this.id}] 等人超时，强制开跑`)
                this.waiting = false
                this.enterTimer = null
                this.broadcastRoom()
            }
        }, ENTER_TIMEOUT)
        this.broadcastRoom()
    }

    /** 任意玩家都能暂停 / 继续 */
    setPaused(id: string, on: boolean) {
        const player = this.players.get(id)
        if (!player || this.phase !== 'playing') return
        this.paused = on
        this.pausedBy = on ? player.name : null
        this.broadcastRoom()
    }

    /** 任意玩家都能调节拍，全房间跟着变 */
    setSpeed(id: string, ms: number) {
        const player = this.players.get(id)
        if (!player) return
        if (!Number.isFinite(ms)) return
        const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(ms)))
        if (next === this.interval) return
        this.interval = next
        this.restartClock()
        console.log(`[${this.id}] ${player.name} 把节拍调成 ${next}ms`)
        this.broadcastRoom()
    }

    /** 发一条弹幕：净化 → 限流 → 广播。服务端不认识内容，也不存历史 */
    danmaku(id: string, raw: string) {
        const player = this.players.get(id)
        if (!player) return
        // 换行和制表符会把轨道撑乱，统一压成空格；剩下的按字数截断
        const text = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, DANMAKU_LIMIT)
        if (!text) return
        const now = Date.now()
        const last = this.danmakuAt.get(id) ?? 0
        if (now - last < DANMAKU_GAP) {
            player.send({ t: 'error', message: '发得有点快，缓一下再发' })
            return
        }
        this.danmakuAt.set(id, now)
        this.broadcast({
            t: 'danmaku',
            id: crypto.randomUUID(),
            from: player.id,
            name: player.name,
            text,
            at: now,
        })
    }

    sync(id: string, payload: SyncPayload) {
        const player = this.players.get(id)
        if (!player) return
        // 结算那一拍可能还有在路上的 sync，落回大厅后就别再写进来了
        if (this.phase !== 'playing') return
        // 第一条 sync 代表这个人已经进入对局了，可以开始跑
        if (!this.entered.has(id)) {
            this.entered.add(id)
            this.refreshWaiting()
        }
        player.age = payload.age
        player.life = payload.life
        player.summary = payload.summary
        player.props = payload.props
        // 只留最近若干年：整列要塞进一屏，历史太长既没必要也压包
        player.logs = payload.logs.slice(-LOG_LIMIT)
        if (player.alive && !payload.alive) player.alive = false
        this.checkOver()
        this.broadcastRoom()
    }

    /** 房间被回收时一定要调，否则定时器会一直跑着占 CPU */
    dispose() {
        this.stopClock()
        if (this.enterTimer) clearTimeout(this.enterTimer)
        this.enterTimer = null
        this.players.clear()
        this.entered.clear()
        this.danmakuAt.clear()
    }

    private alivePlayers() {
        return [...this.players.values()].filter(p => p.alive)
    }

    private startClock() {
        if (this.clock) return
        this.clock = setInterval(() => this.tick(), this.interval)
    }

    private stopClock() {
        if (!this.clock) return
        clearInterval(this.clock)
        this.clock = null
    }

    /** 改节拍必须重开定时器，setInterval 的周期是创建时就定死的 */
    private restartClock() {
        if (!this.clock) return
        this.stopClock()
        this.startClock()
    }

    private tick() {
        if (this.phase !== 'playing') return
        if (this.waiting || this.paused) return
        this.round++
        this.broadcast({ t: 'tick', round: this.round })
        this.broadcastRoom()
    }

    /** 活人都进来了就开始跑；有人在选天赋就一直等（最多等 ENTER_TIMEOUT） */
    private refreshWaiting() {
        if (this.phase !== 'playing' || !this.waiting) return
        const alive = this.alivePlayers()
        if (alive.length === 0) return
        if (!alive.every(p => this.entered.has(p.id))) return
        this.waiting = false
        if (this.enterTimer) clearTimeout(this.enterTimer)
        this.enterTimer = null
    }

    private checkOver() {
        if (this.phase !== 'playing') return
        if (this.round === 0) return
        // 全部阵亡才结算：比赛的是“谁走得远”，不是“谁活到最后”
        if (this.alivePlayers().length > 0) return
        this.phase = 'over'
        this.stopClock()
        if (this.enterTimer) clearTimeout(this.enterTimer)
        this.enterTimer = null
        this.result = [...this.players.values()]
            .sort((a, b) => b.age - a.age || b.summary - a.summary)
            .map((p, index) => ({
                id: p.id,
                name: p.name,
                age: p.age,
                summary: p.summary,
                rank: index + 1,
            }))
        // 结算完立刻收回大厅：排名跟着 room 一起下发，房间页上显示，
        // 不占着对战界面等倒计时，房主想开下一局马上就能开。
        this.resetToLobby()
    }

    /**
     * 结算完回到大厅，等房主再开一局。
     *
     * 掉线的人顺手清掉：下一局不该给幽灵玩家留位置，也不该让屏障等他们。
     */
    private resetToLobby() {
        if (this.phase !== 'over') return
        for (const [id, player] of this.players) {
            if (!player.connected) this.players.delete(id)
        }
        // 被清掉的幽灵玩家，连同限流记录一起扔
        for (const id of this.danmakuAt.keys()) {
            if (!this.players.has(id)) this.danmakuAt.delete(id)
        }
        this.phase = 'lobby'
        this.round = 0
        this.paused = false
        this.pausedBy = null
        this.waiting = false
        this.entered.clear()
        for (const player of this.players.values()) {
            player.alive = true
            player.age = 0
            player.life = 0
            player.summary = 0
            player.props = null
            player.logs = []
        }
        // 房主还在就接着当，不在了才随机换人（结算期间掉线也算不在）
        const host = this.hostId ? this.players.get(this.hostId) : undefined
        if (!host?.connected) {
            this.hostId = null
            this.transferHost()
        }
        this.broadcastRoom()
        console.log(`[${this.id}] 回到大厅，${this.players.size} 人等着下一局`)
    }

    /**
     * 房主随机换人。
     *
     * 不定顺序挑，是因为“谁排第二谁接班”会让掉线时机决定房主，反而不好解释；
     * 反正下一局谁开都行，随机最不容易扯皮。没有活人就先空着。
     */
    private transferHost() {
        for (const player of this.players.values()) player.host = false
        const candidates = [...this.players.values()].filter(p => p.connected)
        const next = candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : null
        this.hostId = next ? next.id : null
        if (next) next.host = true
        if (next) console.log(`[${this.id}] 房主换成了 ${next.name}`)
    }

    private toView(player: Player): PlayerView {
        return {
            id: player.id,
            name: player.name,
            host: player.host,
            alive: player.alive,
            connected: player.connected,
            age: player.age,
            life: player.life,
            summary: player.summary,
            props: player.props,
            logs: player.logs,
        }
    }

    view(): RoomView {
        return {
            id: this.id,
            phase: this.phase,
            round: this.round,
            interval: this.interval,
            paused: this.waiting || this.paused,
            pausedBy: this.paused ? this.pausedBy : null,
            waiting: this.waiting
                ? this.alivePlayers()
                      .filter(p => !this.entered.has(p.id))
                      .map(p => p.name)
                : [],
            result: this.result,
            players: [...this.players.values()].map(p => this.toView(p)),
        }
    }

    broadcast(msg: ServerMessage) {
        for (const p of this.players.values()) p.send(msg)
    }

    private broadcastRoom() {
        this.broadcast({ t: 'room', room: this.view() })
    }
}
