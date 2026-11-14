/**
 * 多人中继协议（方案 B：客户端各自算，服务端只做房间与节拍）
 *
 * 关键约定：
 * - 服务端**不**跑游戏逻辑，也不知道事件内容，只负责“什么时候一起过一年”。
 * - 每个客户端在收到 tick 后本地推进一年，把结果 sync 回去，供别人看进度。
 * - 推进是全自动的：服务端按固定节拍发 tick，谁都不用点“继续”。
 *   想停下来看文字就发 pause，任何人再发一次就能继续；
 *   嫌太快 / 太慢就发 speed，同样不分是谁改的。
 * - 所有人结束后先停在结算倒计时（RESULT_MS），到点才收回大厅。
 * - 死因只上报事件 id，文本由各端查本地数据表，服务端仍然不懂内容。
 *   上报的是「真正导致这一结局的事件」：分支死法取「你死了。」前面那条，
 *   飞升 / 穿越这类自带结局文本的事件就取它自己。
 */

export type Phase = 'lobby' | 'playing' | 'over'

/** 结局类型，与 @remake/data 的同名类型保持一致（这里不依赖数据表） */
export type EndingType =
    | 'death'
    | 'ascend'
    | 'transcend'
    | 'leave-world'
    | 'reincarnation'

/** 单人人生没有年龄上限了，房间层面仍需一个回合保护，避免一局永远不结束 */
export const MAX_ROUNDS = 3000

export interface Props {
    charm: number
    intelligence: number
    strength: number
    money: number
    spirit: number
}

/**
 * 一年的人生摘要。
 *
 * 只传 id 不传文本：文本和数值都在本地数据表里，按 id 查表渲染即可，
 * 传输量比传字符串小一个数量级，也能保证同一年在所有人屏幕上长得一样。
 */
export interface LogLine {
    age: number
    events: number[]
    talents: number[]
    achievements: number[]
}

/** 每人最多同步多少年日志。整列要能塞进一屏，太久远的滚出去就行 */
export const LOG_LIMIT = 18

/** 自动推进的节拍：每年间隔多少毫秒。服务端可用 ROUND_MS 环境变量覆盖 */
export const ROUND_MS = 1500

/**
 * 可选的节拍档位：慢 / 正常 / 快 / 极速。
 *
 * 每个人读字速度不一样，有人一秒一年刚好，有人想一口气看完 —— 所以把节拍
 * 做成人人都能改的房间设置，而不是写死的常量。服务端只存一个毫秒数，
 * 前端按这里列出的档位渲染，加档位不用改协议。
 */
export const SPEEDS = [3000, 1500, 800, 400] as const

/** 节拍的合法区间，防止有人把值改成 1ms 把房间刷爆 */
export const MIN_SPEED = 200
export const MAX_SPEED = 5000

/**
 * 结算后留在对战页的时间（毫秒）。
 *
 * 所有人结束那一拍如果立刻把房间放回大厅，最后一年刚滚出来的日志和名次
 * 一闪就没了，太突然。改成先停在结算浮层上倒计时，到点再回房间页。
 * 服务端可用 RESULT_MS 环境变量覆盖（测试里通常调小）。
 */
export const RESULT_MS = 5000

/** 弹幕文本上限（字），超出的截断 */
export const DANMAKU_LIMIT = 40

/** 同一个人两次发弹幕的最小间隔（毫秒），挡住了就丢弃并提示 */
export const DANMAKU_GAP = 1500

/**
 * 本地最多记着多少条弹幕。
 *
 * 弹幕不像原来那样飞过就没了：留着当聊天记录，只有新的进来把位置占满，
 * 最旧的才被挤掉。屏幕上只画最后几条，多留一些是为了切页面那一两秒不空。
 */
export const DANMAKU_KEEP = 6

/** 一条弹幕。服务端只负责补上名字和 id 后转发，不存历史 */
export interface Danmaku {
    /** 消息 id，前端拿它做 key 和去重 */
    id: string
    /** 发送者玩家 id，用来高亮自己发的那条 */
    from: string
    name: string
    text: string
    /** 服务端收到的时间，只用来排序 —— 各端时钟不一定准，别拿它算动画 */
    at: number
}

export interface PlayerView {
    id: string
    name: string
    host: boolean
    /** 是否还活着（生命值归零即为 false） */
    alive: boolean
    /** 连接是否还在，掉线的人保留在榜单上 */
    connected: boolean
    /** 当前年龄，未开始时为 0 */
    age: number
    /** 当前生命值 */
    life: number
    /** 最高属性换算的总评，用于并列时比较 */
    summary: number
    /** 当前属性快照，用于对手列的属性条 */
    props: Props | null
    /** 最近几年的日志，用于把对手这一列也画成一条人生 */
    logs: LogLine[]
    /**
     * 死因事件 id，活着时为 null。
     * 只传 id 不传文本：和日志一样由各端查本地数据表渲染。
     */
    death: number | null
    /** 修仙境界序号，旧客户端不上报时缺省按 0 处理 */
    realm?: number
    /** 当前境界文案（可选，纯展示用） */
    realmTitle?: string
    /** 结局类型；飞升 / 超脱会优先排到榜首，但不会让别人提前结束 */
    ending?: EndingType | null
}

export interface RoomView {
    id: string
    phase: Phase
    /** 已完成多少年，0 表示还没开始推进 */
    round: number
    /** 当前节拍：每年间隔多少毫秒，任何人改都会广播给全房间 */
    interval: number
    /** 是否停着（等人进入对局，或被某个人按了暂停） */
    paused: boolean
    /** 按暂停的人名，null 表示不是玩家暂停（多半是还在等人进入） */
    pausedBy: string | null
    /** 还没进入对局的玩家，非空表示正在等他们（在选天赋 / 分配属性） */
    waiting: string[]
    /**
     * 上一局的排名，开局后清空。
     *
     * 结算那一拍就填好，对战页的倒计时浮层先用它播名次，
     * 回到大厅后房间页接着显示 —— 打完那一瞬间界面不会突然换掉。
     */
    result: RankingItem[] | null
    /**
     * 距离回到大厅还剩多少毫秒，不在结算阶段时为 null。
     *
     * 用「剩余时长」而不是绝对时间戳，各端时钟不准也能对上。
     * 每次下发 room 时由服务端按截止时间重算，中途加入的人也拿得到。
     */
    resultLeft: number | null
    players: PlayerView[]
}

export interface RankingItem {
    id: string
    name: string
    age: number
    summary: number
    rank: number
    /** 死因事件 id，和 PlayerView.death 同源；非死亡结局时为 null */
    death: number | null
    /** 结算时是否还活着：超时收摊时可能出现，用来区分「未阵亡」和「死因缺失」 */
    alive?: boolean
    /** 结算时连接是否还在：掉线的人没有死因，不能显示成「不明」 */
    connected?: boolean
    /** 最终境界，用于「飞升 > 境界 > 年龄」的排名展示 */
    realm?: number
    realmTitle?: string
    /** 结局类型 */
    ending?: EndingType | null
}

export type ClientMessage =
    | { t: 'join'; room: string; name: string }
    | { t: 'start' }
    /** 任意玩家都能停 / 继续，服务端只认最后一条 */
    | { t: 'pause'; on: boolean }
    /** 任意玩家都能调节拍，ms 会被服务端夹到 [MIN_SPEED, MAX_SPEED] */
    | { t: 'speed'; ms: number }
    /** 发弹幕：文本由服务端净化、截断、限流后广播给全房间 */
    | { t: 'danmaku'; text: string }
    | {
          t: 'sync'
          age: number
          life: number
          alive: boolean
          summary: number
          props: Props
          logs: LogLine[]
          /** 阵亡那年死因事件的 id，活着时给 null；缺省按 null 处理 */
          death?: number | null
          /** 修仙进度（可选字段，旧客户端不带也能正常跑） */
          realm?: number
          realmTitle?: string
          ending?: EndingType | null
      }

export type ServerMessage =
    | { t: 'welcome'; id: string; room: string }
    /** 房间全量视图，`room.result` 里带着上一局的排名 */
    | { t: 'room'; room: RoomView }
    | { t: 'tick'; round: number }
    /** 一条弹幕，全房间都收到（发的人自己也收到一份，界面逻辑统一） */
    | ({ t: 'danmaku' } & Danmaku)
    | { t: 'error'; message: string }

export const MAX_PLAYERS = 8
export const DEFAULT_PORT = 8787
