/**
 * 房间协议自测：两个假客户端跑一局，验证自动推进、暂停、结算都不出错。
 *
 * 中继由脚本自己起（见 relay.ts），所以直接 `pnpm test:protocol` 就行。
 */
import { WebSocket } from 'ws'
import type { RoomView, ServerMessage } from '@remake/multi'
import { RESULT, startRelay, TICK } from './relay'

const ROOM = 'TEST' + Math.floor(Math.random() * 900 + 100)

let passed = 0
let failed = 0

function ok(name: string, condition: boolean) {
    if (condition) {
        passed++
        console.log(`  ✓ ${name}`)
    } else {
        failed++
        console.log(`  ✗ ${name}`)
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

class Client {
    ws: WebSocket
    id = ''
    ticks: number[] = []
    rooms: RoomView[] = []
    danmaku: { name: string; text: string }[] = []
    errors: string[] = []

    constructor(
        public name: string,
        url: string,
    ) {
        this.ws = new WebSocket(url)
        this.ws.on('message', raw => {
            const msg = JSON.parse(String(raw)) as ServerMessage
            switch (msg.t) {
                case 'welcome':
                    this.id = msg.id
                    break
                case 'room':
                    this.rooms.push(msg.room)
                    break
                case 'tick':
                    this.ticks.push(msg.round)
                    break
                case 'danmaku':
                    this.danmaku.push({ name: msg.name, text: msg.text })
                    break
                case 'error':
                    this.errors.push(msg.message)
                    break
            }
        })
    }

    open() {
        return new Promise<void>(resolve => this.ws.on('open', () => resolve()))
    }

    send(msg: object) {
        this.ws.send(JSON.stringify(msg))
    }

    join(room = ROOM) {
        this.send({ t: 'join', room, name: this.name })
    }

    /** 只上报状态，不表示已经完成准备进入对局 */
    sync(age = 0) {
        this.send({
            t: 'sync',
            age,
            life: 5,
            alive: true,
            summary: 0,
            props: { charm: 1, intelligence: 1, strength: 1, money: 1, spirit: 5 },
            logs: [{ age, events: [10009], talents: [1001], achievements: [] }],
        })
    }

    /** 完成天赋与加点、进入对战页（真人这边由 Battle 挂载时发送） */
    enter(age = 0) {
        this.send({ t: 'enter' })
        this.sync(age)
    }

    lastRoom() {
        return this.rooms[this.rooms.length - 1]
    }

    /** 上一局的排名，跟着房间一起下发 */
    result() {
        return this.lastRoom()?.result ?? []
    }

    close() {
        this.ws.close()
    }
}

async function main() {
    const relay = await startRelay()
    const a = new Client('甲', relay.url)
    const b = new Client('乙', relay.url)
    await Promise.all([a.open(), b.open()])
    a.join()
    await sleep(80)
    b.join()
    await sleep(120)

    console.log('\n[1] 入房')
    ok('两人都在房间里', a.lastRoom()?.players.length === 2)
    ok('先来的成为房主', a.lastRoom()?.players.find(p => p.host)?.name === '甲')

    console.log('\n[2] 房主随时可以开始')
    b.send({ t: 'start' })
    await sleep(100)
    ok('非房主开始被拒绝', b.errors.some(e => e.includes('房主')))

    a.send({ t: 'start' })
    await sleep(100)
    ok('进入 playing', a.lastRoom()?.phase === 'playing')
    ok('第一局的局次从 1 起', a.lastRoom()?.match === 1)
    ok('开局后先停着，等所有人进入', a.lastRoom()?.paused === true)
    ok('等待名单里有两个人', a.lastRoom()?.waiting.length === 2)
    ok('等人时不会推进', a.ticks.length === 0)

    console.log('\n[3] 全员进入后自动推进')
    a.enter()
    await sleep(120)
    ok('只进了一个人，还在等', a.lastRoom()?.waiting.join() === '乙')
    // 只发 sync 说明本地有状态，不代表已经选完天赋 / 分完点数，不能算进入
    b.sync()
    await sleep(220)
    ok('只上报 sync 不算进入，仍在等', a.lastRoom()?.waiting.join() === '乙')
    ok('还有人没进入时一年都不走', a.ticks.length === 0)
    b.enter()
    await sleep(TICK + 150)
    ok('两人都进入后自动开跑', a.lastRoom()?.paused === false)
    ok('没人点“继续”也过了第一年', a.ticks.length > 0)

    const before = a.ticks.length
    await sleep(TICK * 3)
    ok('之后按节拍持续往前走', a.ticks.length > before)

    console.log('\n[4] 任意人暂停')
    a.send({ t: 'pause', on: true })
    await sleep(150)
    ok('房间进入暂停', a.lastRoom()?.paused === true)
    ok('记下了是谁暂停的', a.lastRoom()?.pausedBy === '甲')
    const frozen = a.ticks.length
    await sleep(TICK * 4)
    ok('暂停期间一年都不走', a.ticks.length === frozen)

    console.log('\n[5] 另一个人也能继续')
    b.send({ t: 'pause', on: false })
    await sleep(TICK * 3)
    ok('乙点继续后恢复推进', a.ticks.length > frozen)
    ok('暂停标记已清掉', a.lastRoom()?.paused === false)

    console.log('\n[6] 开局后拒绝新加入')
    const c = new Client('丙', relay.url)
    await c.open()
    c.join()
    await sleep(150)
    ok('中途加入被拒绝', c.errors.some(e => e.includes('已经开始')))
    ok('房间人数没变', a.lastRoom()?.players.length === 2)
    c.close()

    console.log('\n[7] 死亡后不再影响别人')
    a.send({
        t: 'sync',
        age: 30,
        life: 0,
        alive: false,
        summary: 120,
        props: { charm: 1, intelligence: 1, strength: 1, money: 1, spirit: 0 },
        logs: [
            { age: 1, events: [10009], talents: [1001], achievements: [] },
            { age: 30, events: [10010], talents: [], achievements: [1] },
        ],
        death: 10003,
    })
    await sleep(150)
    ok(
        '甲被标记为阵亡',
        a.lastRoom()?.players.find(p => p.name === '甲')?.alive === false,
    )
    ok(
        '死因 id 同步到对手列',
        a.lastRoom()?.players.find(p => p.name === '甲')?.death === 10003,
    )

    const seen = b.lastRoom()?.players.find(p => p.name === '甲')
    ok('乙能看到甲的最近日志', seen?.logs.length === 2)
    ok('日志里的年龄按年递增', seen?.logs[1]?.age === 30)
    ok('日志带上了事件 id', seen?.logs[1]?.events[0] === 10010)

    const afterDeath = b.ticks.length
    await sleep(TICK * 3)
    ok('剩下的人照旧往前走', b.ticks.length > afterDeath)

    console.log('\n[8] 结算：先停在倒计时')
    b.send({
        t: 'sync',
        age: 60,
        life: 0,
        alive: false,
        summary: 300,
        props: { charm: 2, intelligence: 2, strength: 2, money: 2, spirit: 0 },
        logs: [],
        death: 40050,
    })
    await sleep(200)
    ok('触发结算', a.result().length === 2)
    ok('按年龄排名，乙第一', a.result()[0]?.name === '乙' && a.result()[0]?.age === 60)
    ok('甲排第二', a.result()[1]?.name === '甲')
    ok(
        '死因 id 跟着排名下发',
        a.result()[0]?.death === 40050 && a.result()[1]?.death === 10003,
    )
    ok('结算阶段停在对战页', a.lastRoom()?.phase === 'over')
    ok(
        '倒计时剩余毫秒已下发',
        (a.lastRoom()?.resultLeft ?? 0) > 0 &&
            (a.lastRoom()?.resultLeft ?? Infinity) <= RESULT,
    )

    const late = new Client('丁', relay.url)
    await late.open()
    late.join()
    await sleep(150)
    ok('结算期间也不能加入', late.errors.some(e => e.includes('已经开始')))
    ok('结算时房间人数没变', a.lastRoom()?.players.length === 2)
    late.close()

    const endRound = a.ticks.length
    await sleep(TICK * 3)
    ok('结束后不再推进', a.ticks.length === endRound)
    ok('倒计时里还没回大厅', a.lastRoom()?.phase === 'over')
    ok(
        '期间会重发越来越少的剩余时间',
        a.rooms.some(
            r =>
                r.phase === 'over' &&
                r.resultLeft !== null &&
                r.resultLeft < RESULT - 100,
        ),
    )

    console.log('\n[9] 倒计时到点才回到大厅')
    await sleep(RESULT + 250)
    ok('房间回到 lobby', a.lastRoom()?.phase === 'lobby')
    ok('倒计时字段已清空', a.lastRoom()?.resultLeft === null)
    ok('年数清零', a.lastRoom()?.round === 0)
    ok(
        '所有人的年龄都归零',
        a.lastRoom()?.players.every(p => p.age === 0) === true,
    )
    ok('没退出的人还在房间里', a.lastRoom()?.players.length === 2)
    ok('房主还在，可以再开一局', a.lastRoom()?.players.some(p => p.host) === true)
    ok('排名留在房间里给房间页显示', b.result().length === 2)
    ok('死因也留在排名里', b.result()[0]?.death === 40050)

    a.send({ t: 'start' })
    await sleep(150)
    ok('房主能直接开下一局', a.lastRoom()?.phase === 'playing')
    ok('下一局局次加一', a.lastRoom()?.match === 2)
    ok('新的一局年数从 0 起', a.lastRoom()?.round === 0)
    ok('开局后清掉上一局排名', a.lastRoom()?.result === null)

    console.log('\n[10] 房主掉线后随机换人')
    const room2 = 'HOST' + Math.floor(Math.random() * 900 + 100)
    const a2 = new Client('甲二', relay.url)
    const b2 = new Client('乙二', relay.url)
    const c2 = new Client('丙二', relay.url)
    await Promise.all([a2.open(), b2.open(), c2.open()])
    a2.join(room2)
    await sleep(80)
    b2.join(room2)
    await sleep(80)
    c2.join(room2)
    await sleep(120)
    ok('先来的当房主', a2.lastRoom()?.players.find(p => p.host)?.name === '甲二')

    a2.close()
    await sleep(200)
    const hosts = b2.lastRoom()?.players.filter(p => p.host) ?? []
    ok('房主离开后有人接班', hosts.length === 1)
    ok('新房东是剩下的人', hosts[0]?.name === '乙二' || hosts[0]?.name === '丙二')

    const newHost = hosts[0]?.name === '乙二' ? b2 : c2
    const other = newHost === b2 ? c2 : b2
    newHost.send({ t: 'start' })
    await sleep(150)
    ok('新房东能开始', newHost.lastRoom()?.phase === 'playing')

    console.log('\n[11] 任意人调节拍')
    const defaultMs = newHost.lastRoom()?.interval
    ok('开局用的是默认节拍', defaultMs === TICK)
    other.send({ t: 'speed', ms: 300 })
    await sleep(150)
    ok('非房主也能把节拍调慢', newHost.lastRoom()?.interval === 300)
    other.send({ t: 'speed', ms: 50 })
    await sleep(150)
    ok('超出下限会被夹住', newHost.lastRoom()?.interval === 200)
    other.send({ t: 'speed', ms: 99999 })
    await sleep(150)
    ok('超出上限会被夹住', newHost.lastRoom()?.interval === 5000)

    b2.close()
    c2.close()

    console.log('\n[12] 弹幕')
    const aBefore = a.danmaku.length
    const bBefore = b.danmaku.length
    a.send({ t: 'danmaku', text: '  这波家境太黑了  ' })
    await sleep(200)
    ok(
        '全房间都收到弹幕',
        a.danmaku.length === aBefore + 1 && b.danmaku.length === bBefore + 1,
    )
    ok('名字由服务端补上', b.danmaku[bBefore]?.name === '甲')
    ok('首尾空白被去掉', b.danmaku[bBefore]?.text === '这波家境太黑了')

    a.send({ t: 'danmaku', text: '再来一条' })
    await sleep(150)
    ok('连发被限流，只放行一条', b.danmaku.length === bBefore + 1)
    ok('限流会给出提示', a.errors.some(e => e.includes('快')))

    await sleep(1600)
    a.send({ t: 'danmaku', text: '超'.repeat(60) })
    await sleep(200)
    ok(
        '超长文本被截断到 40 字',
        b.danmaku[b.danmaku.length - 1]?.text.length === 40,
    )

    a.send({ t: 'pause', on: true })
    await sleep(100)
    a.close()
    b.close()
    await sleep(150)

    console.log('\n[13] 上报结局就算结束')
    const roomEnd = 'END' + Math.floor(Math.random() * 900 + 100)
    const e1 = new Client('飞升', relay.url)
    const e2 = new Client('身死', relay.url)
    await Promise.all([e1.open(), e2.open()])
    e1.join(roomEnd)
    await sleep(80)
    e2.join(roomEnd)
    await sleep(120)
    e1.send({ t: 'start' })
    await sleep(100)
    e1.enter()
    e2.enter()
    await sleep(TICK + 150)
    e1.send({
        t: 'sync',
        age: 80,
        life: 1,
        alive: true,
        summary: 900,
        props: { charm: 1, intelligence: 1, strength: 1, money: 1, spirit: 5 },
        logs: [],
        ending: 'ascend',
    })
    e2.send({
        t: 'sync',
        age: 20,
        life: 0,
        alive: true,
        summary: 40,
        props: { charm: 1, intelligence: 1, strength: 1, money: 1, spirit: 0 },
        logs: [],
        ending: 'death',
    })
    await sleep(200)
    ok('飞升即使还报 alive 也被视为结束', e1.lastRoom()?.players.find(p => p.name === '飞升')?.alive === false)
    ok('两人有结局后进入结算', e1.lastRoom()?.phase === 'over')
    ok('飞升排在身死前面', e1.result()[0]?.name === '飞升')
    e1.close()
    e2.close()

    console.log('\n[14] 上报超时按结束处理')
    const stallRelay = await startRelay({ SYNC_STALL_MS: '400' })
    const s1 = new Client('甲超时', stallRelay.url)
    const s2 = new Client('乙卡死', stallRelay.url)
    await Promise.all([s1.open(), s2.open()])
    const stallRoom = 'STL' + Math.floor(Math.random() * 900 + 100)
    s1.join(stallRoom)
    await sleep(80)
    s2.join(stallRoom)
    await sleep(120)
    s1.send({ t: 'start' })
    await sleep(100)
    s1.enter()
    s2.enter()
    const keepAlive = setInterval(() => s1.sync(10), 80)
    await sleep(400 + TICK * 3)
    clearInterval(keepAlive)
    ok(
        '一直不上报的人被按结束处理',
        s1.lastRoom()?.players.find(p => p.name === '乙卡死')?.alive === false,
    )
    ok(
        '还在上报的人继续活着',
        s1.lastRoom()?.players.find(p => p.name === '甲超时')?.alive === true,
    )
    s1.send({
        t: 'sync',
        age: 12,
        life: 0,
        alive: false,
        summary: 50,
        props: { charm: 1, intelligence: 1, strength: 1, money: 1, spirit: 0 },
        logs: [],
    })
    await sleep(200)
    ok('另一人结束后可以收摊', s1.lastRoom()?.phase === 'over')
    s1.close()
    s2.close()
    await sleep(100)
    stallRelay.stop()
    relay.stop()

    console.log(`\n结果：${passed} 通过，${failed} 失败`)
    process.exit(failed === 0 ? 0 : 1)
}

main()
