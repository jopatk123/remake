import type {
    LogLine,
    Phase,
    Props,
    PlayerView,
    RoomView,
    RankingItem,
    ServerMessage,
    EndingType,
} from '@remake/multi'
import {
    DANMAKU_GAP,
    DANMAKU_LIMIT,
    LOG_LIMIT,
    MAX_PLAYERS,
    MAX_ROUNDS,
    MAX_SPEED,
    MIN_SPEED,
    RESULT_MS,
    ROUND_MS,
} from '@remake/multi'

type Send = (msg: ServerMessage) => void

/** 每年之间的节拍，测试时可以调小：ROUND_MS=150 bun run src/index.ts */
const ROUND = Math.max(60, Number(process.env.ROUND_MS ?? ROUND_MS))
/**
 * 结算浮层停留时长。默认 5 秒，测试里调小：RESULT_MS=600 bun run src/index.ts
 * 用环境变量而不是协议常量，是为了让同一份代码在测试和线上跑不同节奏。
 */
// 注意别把 RESULT_MS= 这种空值当成 0：空字符串 Number('') === 0，
// 会让结算浮层一闪而过，看起来就像「直接跳回房间」。
const RESULT_ENV = process.env.RESULT_MS?.trim()
    ? Number(process.env.RESULT_MS)
    : NaN
const RESULT = Number.isFinite(RESULT_ENV)
    ? Math.max(0, RESULT_ENV)
    : RESULT_MS
/** 结算期间重发房间视图的间隔：后加入 / 网络慢的人也能对上倒计时 */
const RESULT_TICK = 500
/** 每人最多记多少个天赋 id，防止异常客户端把包撑大 */
const TALENT_LIMIT = 64

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
    /** 本局已获得的天赋 id，对战页用来在列顶部展示稀有天赋 */
    talents: number[]
    /** 最近几年的人生摘要，别人的屏幕靠它把这一列画出来 */
    logs: LogLine[]
    /** 死因事件 id，活着时为 null；客户端上报，服务端只转发不解析 */
    death: number | null
    /** 修仙境界 / 结局：只用于排名与展示，服务端不理解内容 */
    realm: number
    realmTitle: string | null
    ending: EndingType | null
    send: Send
}

export interface SyncPayload {
    age: number
    life: number
    alive: boolean
    summary: number
    props: Props
    logs: LogLine[]
    /** 本局已获得的天赋 id，老客户端可能不带 */
    talents?: number[]
    /** 阵亡那年死因事件的 id，老客户端可能不带 */
    death?: number | null
    /** 修仙进度，老客户端可能不带 */
    realm?: number
    realmTitle?: string
    ending?: EndingType | null
}

/** 结局权重：飞升 / 超脱是圆满通关，优先于其他所有结局 */
function endingScore(ending: EndingType | null, alive: boolean): number {
    switch (ending) {
        case 'ascend':
        case 'transcend':
            return 4
        case 'leave-world':
            return 3
        case 'reincarnation':
            return 2
        case 'death':
            return 0
        default:
            // 旧客户端不上报结局时，还活着的人仍应排在已阵亡的人前面
            return alive ? 1 : 0
    }
}

/**
 * 一个房间就是一组独立的人生赛跑。
 *
 * 开局后先停在原地，等每个人选完天赋、分完点数、进入对战页并发来 enter。
 * 全体存活玩家都报到后才发第一拍；有人还没准备好就一直等，不会强行开跑。
 *
 * 推进是全自动的：服务端按 interval 的节拍发 tick，各端本地过一年再 sync 回来。
 * 谁都可能想停下来读一眼文字，所以 pause 不做权限 —— 任何人按下去都停，
 * 任何人再按一次都继续，这是唯一不会把人卡住的规则。节拍同理，谁都能调。
 *
 * 所有人跑完（阵亡 / 飞升 / 离世 / 转世）后不立刻收摊：先停在 over 阶段
 * 播 RESULT_MS（默认 5 秒）的结算倒计时，让对战页把名次和死因看完，
 * 到点才回大厅等下一局。
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
    /** 已发来 enter 的玩家：集齐所有存活玩家才开跑 */
    private entered = new Set<string>()
    /** 当前节拍：每年间隔毫秒。任何人改了都立刻重开定时器 */
    private interval = ROUND
    /** 上一局的排名，结算那一拍就填好，开局清空 */
    private result: RankingItem[] | null = null
    private clock: ReturnType<typeof setInterval> | null = null
    /** 结算倒计时的截止时间与定时器，到点才收回大厅 */
    private resultDeadline = 0
    private resultTimer: ReturnType<typeof setTimeout> | null = null
    private resultClock: ReturnType<typeof setInterval> | null = null
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
            talents: [],
            logs: [],
            death: null,
            realm: 0,
            realmTitle: null,
            ending: null,
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
            if (!this.checkOver()) this.broadcastRoom()
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
            player.talents = []
            player.logs = []
            player.death = null
            player.realm = 0
            player.realmTitle = null
            player.ending = null
        }
        this.startClock()
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
        if (!player || this.phase !== 'playing') return
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

    /**
     * 玩家完成选天赋与加点、真正进入对战页后报到。
     *
     * 只认这条消息，不再拿第一条 sync 当“进入”：sync 只说明本地有状态，
     * 不能保证人已经走完准备流程。全部存活玩家都 enter 过才开跑。
     */
    enter(id: string) {
        const player = this.players.get(id)
        if (!player || this.phase !== 'playing') return
        if (this.entered.has(id)) return
        this.entered.add(id)
        this.refreshWaiting()
        this.broadcastRoom()
    }

    sync(id: string, payload: SyncPayload) {
        const player = this.players.get(id)
        if (!player) return
        // 结算那一拍可能还有在路上的 sync，进了结算 / 落回大厅就别再写进来了
        if (this.phase !== 'playing') return
        player.age = payload.age
        player.life = payload.life
        player.summary = payload.summary
        player.props = payload.props
        // 天赋只做去重和截断：服务端不认识稀有度，筛选与排序交给各端
        if (Array.isArray(payload.talents)) {
            const ids = payload.talents.filter(
                id => Number.isFinite(id) && id > 0,
            )
            player.talents = [...new Set(ids)].slice(-TALENT_LIMIT)
        }
        // 只留最近若干年：整列要塞进一屏，历史太长既没必要也压包
        player.logs = payload.logs.slice(-LOG_LIMIT)
        // 死因只上报事件 id：校验完类型就存着，文本由各端查本地数据表渲染
        if (
            !payload.alive &&
            typeof payload.death === 'number' &&
            Number.isFinite(payload.death)
        )
            player.death = payload.death
        // 修仙进度只做类型校验后存着：飞升决定冠军归属，但不提前收摊
        if (typeof payload.realm === 'number' && Number.isFinite(payload.realm))
            player.realm = Math.max(0, Math.min(9, Math.round(payload.realm)))
        if (typeof payload.realmTitle === 'string')
            player.realmTitle = payload.realmTitle.slice(0, 24)
        if (payload.ending) player.ending = payload.ending
        if (player.alive && !payload.alive) player.alive = false
        // 这一拍要是刚好结算了，checkOver 会自己广播带倒计时的房间视图
        if (!this.checkOver()) this.broadcastRoom()
    }

    /** 房间被回收时一定要调，否则定时器会一直跑着占 CPU */
    dispose() {
        this.stopClock()
        this.stopResult()
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
        // 人生不再有 500 岁上限，房间层面留一个很长的回合保护，
        // 免得极端情况下（谁都没飞升也没死）一局永远收不了摊。
        if (this.round >= MAX_ROUNDS && this.checkOver()) return
        this.broadcastRoom()
    }

    /** 活人都完成准备并进入对局后才开始跑；有人没报到就一直等 */
    private refreshWaiting() {
        if (this.phase !== 'playing' || !this.waiting) return
        const alive = this.alivePlayers()
        if (alive.length === 0) return
        if (!alive.every(p => this.entered.has(p.id))) return
        this.waiting = false
        console.log(`[${this.id}] 全员进入对局，开始推进`)
    }

    /** 所有人跑完后结算；返回 true 表示刚结算完、房间视图已经广播过了 */
    private checkOver(): boolean {
        if (this.phase !== 'playing') return false
        if (this.round === 0) return false
        const players = [...this.players.values()]
        // 两种收摊条件：所有人都结束（阵亡 / 飞升 / 离世 / 转世）/ 回合保护。
        // 不再「有人飞升就提前收摊」：最后一个人结束前，其他列继续跑，
        // 否则活着的人没有死因，榜单会出现一排「不明」。
        // 开跑前已经等齐所有存活玩家，所以推进中活着的人必然进入过对局。
        const allEnded = players.every(p => !p.alive)
        const timeout = this.round >= MAX_ROUNDS
        if (!allEnded && !timeout) return false
        this.phase = 'over'
        this.stopClock()
        this.result = players
            .sort((a, b) => {
                const av = endingScore(a.ending, a.alive)
                const bv = endingScore(b.ending, b.alive)
                if (av !== bv) return bv - av
                if (a.realm !== b.realm) return b.realm - a.realm
                return b.age - a.age || b.summary - a.summary
            })
            .map((p, index) => ({
                id: p.id,
                name: p.name,
                age: p.age,
                summary: p.summary,
                rank: index + 1,
                death: p.death,
                alive: p.alive,
                connected: p.connected,
                realm: p.realm,
                realmTitle: p.realmTitle ?? undefined,
                ending: p.ending,
            }))
        // 先停在对战页的结算浮层上：最后一年刚滚出来的日志、名次和死因
        // 都来得及看，倒计时到点才把房间收回大厅。
        this.resultDeadline = Date.now() + RESULT
        this.resultTimer = setTimeout(() => {
            this.resultTimer = null
            this.resetToLobby()
        }, RESULT)
        // 期间定期重发房间视图：后加入的人、网络慢的人都能对上剩余秒数
        this.resultClock = setInterval(() => this.broadcastRoom(), RESULT_TICK)
        this.broadcastRoom()
        console.log(`[${this.id}] 结算，${RESULT}ms 后回到大厅`)
        return true
    }

    /** 结算定时器用完就清，别让已回大厅的房间还在后台广播 */
    private stopResult() {
        if (this.resultTimer) clearTimeout(this.resultTimer)
        if (this.resultClock) clearInterval(this.resultClock)
        this.resultTimer = null
        this.resultClock = null
        this.resultDeadline = 0
    }

    /**
     * 结算完回到大厅，等房主再开一局。
     *
     * 掉线的人顺手清掉：下一局不该给幽灵玩家留位置，也不该让屏障等他们。
     */
    private resetToLobby() {
        if (this.phase !== 'over') return
        this.stopResult()
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
            player.talents = []
            player.logs = []
            player.death = null
            player.realm = 0
            player.realmTitle = null
            player.ending = null
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
            talents: player.talents,
            logs: player.logs,
            death: player.death,
            realm: player.realm,
            realmTitle: player.realmTitle ?? undefined,
            ending: player.ending,
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
            // 用「剩余时长」而不是绝对时间戳，各端时钟不准也能对上；
            // 每次下发都按截止时间重算，中途加入的人拿到的也是当前值。
            resultLeft:
                this.phase === 'over'
                    ? Math.max(0, this.resultDeadline - Date.now())
                    : null,
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
