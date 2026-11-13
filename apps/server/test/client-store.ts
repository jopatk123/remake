/**
 * 端到端：拿真实的前端存储模块去打真实的中继服务器。
 *
 * 只验证「客户端状态机」这一段（连接→入房→开局→自动推进→暂停→阵亡→结算），
 * UI 层只是按钮调这些方法，所以这段通了，联调就基本稳了。
 *
 * 中继由脚本自己起，直接 `pnpm test:client` 即可。
 */
import { WebSocket } from 'ws'
import { DANMAKU_GAP } from '@remake/multi'
import { RESULT, startRelay, TICK } from './relay'

const relay = await startRelay()

// 前端模块会读 location / import.meta.env，这里补一个最小环境。
// ?ws= 的优先级最高，正好用来指到临时中继上。
const anyGlobal = globalThis as unknown as Record<string, unknown>
anyGlobal.location = {
    search: `?ws=${relay.url}`,
    protocol: 'http:',
    hostname: '127.0.0.1',
    origin: 'http://127.0.0.1',
    pathname: '/',
}

const client = await import('../../web/src/multi/client.ts')

const ROOM = 'E2E' + Math.floor(Math.random() * 900 + 100)
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

const PROPS = { charm: 1, intelligence: 1, strength: 1, money: 5, spirit: 5 }

/** 陪练：直接用一个裸 WebSocket，冒充另一个玩家 */
class Peer {
    ws: WebSocket
    ticks: number[] = []
    constructor() {
        this.ws = new WebSocket(relay.url)
        this.ws.on('message', raw => {
            const msg = JSON.parse(String(raw))
            if (msg.t === 'tick') this.ticks.push(msg.round)
        })
    }
    open() {
        return new Promise<void>(r => this.ws.on('open', () => r()))
    }
    send(msg: object) {
        this.ws.send(JSON.stringify(msg))
    }
    enter(age = 0) {
        this.send({
            t: 'sync',
            age,
            life: 5,
            alive: true,
            summary: 0,
            props: PROPS,
            logs: [{ age, events: [10009], talents: [1001], achievements: [] }],
        })
    }
    close() {
        this.ws.close()
    }
}

async function main() {
    console.log(`房间 ${ROOM}`)
    client.connect(ROOM, '甲')
    await sleep(300)

    let snap = client.getSnapshot()
    ok('连接已建立', snap.status === 'connected')
    ok('拿到自己的 id', typeof snap.id === 'string' && snap.id.length > 0)
    ok('房间信息已下发', snap.room?.players.length === 1)

    const peer = new Peer()
    await peer.open()
    peer.send({ t: 'join', room: ROOM, name: '乙' })
    await sleep(250)
    snap = client.getSnapshot()
    ok('第二个人进房后本地同步到 2 人', snap.room?.players.length === 2)

    console.log('\n[开局]')
    client.start()
    await sleep(200)
    ok('进入 playing', client.getSnapshot().room?.phase === 'playing')
    ok('开局后先停着等人进入', client.getSnapshot().room?.paused === true)

    console.log('\n[自动推进]')
    client.sync({ age: 0, life: 5, alive: true, summary: 0, props: PROPS, logs: [] })
    peer.enter()
    await sleep(TICK * 3)
    ok('两人进入后不再等', client.getSnapshot().room?.paused === false)
    ok('没人点继续也推进了', client.getSnapshot().round >= 1)
    ok('陪练也收到同一节拍', peer.ticks.length > 0)

    console.log('\n[暂停与继续]')
    client.setPaused(true)
    await sleep(150)
    ok('暂停标记同步到本地', client.getSnapshot().room?.paused === true)
    ok('知道是谁按的', client.getSnapshot().room?.pausedBy === '甲')
    const frozen = client.getSnapshot().round
    await sleep(TICK * 4)
    ok('暂停期间不推进', client.getSnapshot().round === frozen)

    peer.send({ t: 'pause', on: false })
    await sleep(TICK * 3)
    ok('另一个人点继续也能恢复', client.getSnapshot().round > frozen)
    ok('暂停标记已清掉', client.getSnapshot().room?.paused === false)

    console.log('\n[节拍]')
    client.setSpeed(800)
    await sleep(200)
    ok('节拍改动同步到本地', client.getSnapshot().room?.interval === 800)
    // 调回测试用的快节拍，后面的断言才不用等太久
    client.setSpeed(TICK)
    await sleep(200)
    ok('调回去也生效', client.getSnapshot().room?.interval === 200)

    console.log('\n[弹幕]')
    client.sendDanmaku('这波稳了')
    await sleep(250)
    const shots = client.getSnapshot().danmaku
    ok('自己发的弹幕也能收到一份', shots.length === 1 && shots[0]?.text === '这波稳了')
    ok('弹幕带上发送者名字', shots[0]?.name === '甲')
    client.sendDanmaku('再来一条')
    await sleep(250)
    ok('连发被服务端限流', client.getSnapshot().danmaku.length === 1)

    // 等过限流窗口：弹幕不像以前飞过就清空，攒在列表里当聊天记录
    await sleep(DANMAKU_GAP + 300)
    client.sendDanmaku('第二条')
    await sleep(250)
    const kept = client.getSnapshot().danmaku
    ok('新的一条追加在后面', kept.length === 2 && kept[1]?.text === '第二条')
    ok('前一条还留着，不会自己消失', kept[0]?.text === '这波稳了')

    console.log('\n[对手阵亡]')
    peer.send({
        t: 'sync',
        age: 25,
        life: 0,
        alive: false,
        summary: 80,
        props: PROPS,
        logs: [
            { age: 1, events: [10009], talents: [1001], achievements: [] },
            { age: 25, events: [10010], talents: [], achievements: [] },
        ],
    })
    await sleep(250)
    const dead = client
        .getSnapshot()
        .room?.players.find(p => p.name === '乙')
    ok('本地能看到的对手已阵亡', dead?.alive === false)
    ok('对手年龄同步过来', dead?.age === 25)
    ok('对手的人生日志同步过来', dead?.logs.length === 2)

    console.log('\n[结算倒计时]')
    client.sync({
        age: 40,
        life: 0,
        alive: false,
        summary: 90,
        props: PROPS,
        logs: [],
        death: 10003,
    })
    await sleep(250)
    const snapOver = client.getSnapshot()
    const result = snapOver.room?.result ?? []
    ok('全员阵亡后拿到排名', result.length === 2)
    ok('自己排第一', result[0]?.name === '甲')
    ok('死因 id 跟着排名下发', result[0]?.death === 10003)
    ok('先停在结算阶段，不切页面', snapOver.room?.phase === 'over')
    ok('下发倒计时剩余毫秒', (snapOver.room?.resultLeft ?? 0) > 0)

    await sleep(RESULT + 250)
    const snapLobby = client.getSnapshot()
    ok('倒计时到点才回到大厅', snapLobby.room?.phase === 'lobby')
    ok('年数清零，不带进下一局', snapLobby.round === 0)

    peer.close()
    client.disconnect()
    await sleep(150)
    relay.stop()

    console.log(`\n结果：${passed} 通过，${failed} 失败`)
    process.exit(failed === 0 ? 0 : 1)
}

main()
