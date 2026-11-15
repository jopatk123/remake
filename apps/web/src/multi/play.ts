import { useEffect, useRef } from 'react'
import { summary as score } from '@remake/core/state'
import { realmTitle, type NextResult } from '@remake/core'
import { useGameState, useLogs, useProfile } from '@remake/hooks'
import { LOG_LIMIT, type LogLine } from '@remake/multi'
import * as client from './client'
import { deathEventId } from './death'
import { useInMatch, useMulti } from './useMulti'
import { toastAchvs } from '@/toast/Achv'
import { emitRareFxFromNext } from '@/fx/rare'

/**
 * 自动推进：服务端按节拍发 tick，收到就在本地过一年。
 *
 * 注意这里一次只推进一年、靠 `next` 换新再进下一轮。原因是 useNext 的闭包
 * 拿的是上一次的 state，在同一个 effect 里连调两次会把同一年算两遍。
 * 用「推进一年 → setState → next 换新 → effect 再跑」这个链子追赶，
 * 即使某次收到两拍也不会漏年。
 */
export function useMultiMatch(
    next: () => Omit<NextResult, 'state'>,
    ended: boolean,
) {
    const active = useInMatch()
    const mp = useMulti()
    const state = useGameState()
    const logs = useLogs()
    const [profile] = useProfile()
    const advanced = useRef(0)
    const synced = useRef('')
    const entered = useRef(false)

    // 对战页真正挂载（天赋与加点都完成）后才报到；服务端集齐所有人才开跑
    useEffect(() => {
        if (!active || !state || entered.current) return
        entered.current = true
        client.enter()
    }, [active, state])

    useEffect(() => {
        if (!active) return
        // 一局结束房间回到大厅时 round 会归零，计数器得跟着回落，
        // 否则下一局每一拍都会因为「比上次小」而白跑
        if (mp.round < advanced.current) advanced.current = mp.round
        if (mp.round <= advanced.current) return
        if (ended) {
            // 自己已经跑完，把计数对齐，免得每一拍都白跑一次
            advanced.current = mp.round
            return
        }
        try {
            const result = next()
            advanced.current += 1
            try {
                toastAchvs(result.achievements)
                emitRareFxFromNext(result, profile)
            } catch (error) {
                console.error('[多人] 成就提示或特效失败', error)
            }
        } catch (error) {
            // 引擎失败本拍重试，不再假装判死——空事件池已经不会抛错
            console.error('[多人] 推进失败，本拍将重试', error)
        }
    }, [active, mp.round, ended, next, profile])

    useEffect(() => {
        if (!active || !state) return
        const { age, charm, intelligence, strength, money, spirit } =
            state.props.current
        const key = `${age}:${state.life}`
        if (synced.current === key) return
        // 死亡那一年的日志还没写进 atom 时先别上报：否则 deathEventId
        // 会去上一年的日志里找死因，榜单就会出现错误 / 空白的死因。
        // 等 logs 更新后 effect 会再跑一次，那时才真正 sync 阵亡状态。
        if (state.life <= 0 && logs.at(-1)?.age !== age) return
        synced.current = key
        const lines: LogLine[] = logs.slice(-LOG_LIMIT).map(log => ({
            age: log.age,
            events: log.events,
            talents: log.talents,
            achievements: log.achievements,
        }))
        client.sync({
            age,
            life: state.life,
            alive: state.life > 0,
            summary: score(state),
            props: { charm, intelligence, strength, money, spirit },
            logs: lines,
            talents: [...state.talents],
            death: state.life > 0 ? null : deathEventId(lines),
            realm: state.cultivation.realm,
            realmTitle: state.cultivation.started
                ? realmTitle(state.cultivation.realm, state.cultivation.minor)
                : undefined,
            ending: state.ending,
        })
    }, [active, state, logs])

    return { active, mp }
}
