/**
 * 一年人生日志的渲染。
 *
 * 单人页用的是本地完整日志，多人页对手列用的是网络同步过来的日志 ——
 * 两者字段一致（年龄 + 三类 id），所以都用这里这一套组件画，
 * 保证「自己看到的人生」和「别人看到你的人生」长得一样。
 */
import { achievements, events, talents } from '@remake/data'
import { format } from '@remake/vitex'

/** 一条人生日志的最小字段集，本地日志和同步日志都满足这个结构 */
export interface LogLike {
    age: number
    events: number[]
    talents: number[]
    achievements: number[]
}

const year = new Date().getFullYear()

function LogTalent({ id }: { id: number }) {
    const talent = talents.get(id)
    if (!talent) return null
    const { name, description, grade } = talent
    return (
        <li className={`grade-${grade}`}>
            <span className="tag font-mono">[天赋]</span>
            <span className="name">{name}</span>
            <span className="description">{description}</span>
        </li>
    )
}

function LogTalents({ items }: { items: number[] }) {
    if (items.length === 0) return null
    return (
        <ul className="log-inner log-talents">
            {items.map(id => (
                <LogTalent key={id} id={id} />
            ))}
        </ul>
    )
}

interface LogEventProps {
    id: number
    post: boolean
    /** 相对开局年份的偏移，用来替换文本里的 {CurrentYear} */
    offset: number
}

function LogEvent({ id, post, offset }: LogEventProps) {
    const item = events.get(id)
    if (!item) return null
    let { event, postEvent, grade, format: f } = item
    if (f) {
        const g = (key: string) => ({ CurrentYear: year + offset })[key]
        event = format(event, g)
        if (post && postEvent) postEvent = format(postEvent, g)
    }
    return (
        <>
            <li className={`grade-${grade}`}>{event}</li>
            {post && postEvent && (
                <li className={`grade-${grade}`}>{postEvent}</li>
            )}
        </>
    )
}

function LogEvents({ items, offset }: { items: number[]; offset: number }) {
    const last = items.length - 1
    return (
        <ul className="log-inner log-events">
            {items.map((id, i) => (
                <LogEvent key={id} id={id} post={i === last} offset={offset} />
            ))}
        </ul>
    )
}

function LogAchievement({ id }: { id: number }) {
    const achievement = achievements.get(id)
    if (!achievement) return null
    const { name, description, grade } = achievement
    return (
        <li className={`grade-${grade}`}>
            <span className="tag font-mono">[成就]</span>
            <span className="name">{name}</span>
            <span className="description">{description}</span>
        </li>
    )
}

function LogAchievements({ items }: { items: number[] }) {
    if (items.length === 0) return null
    return (
        <ul className="log-inner log-achievements">
            {items.map(id => (
                <LogAchievement key={id} id={id} />
            ))}
        </ul>
    )
}

export function Log({ log }: { log: LogLike }) {
    // 第一年是 1 岁，对应首次推进，偏移就是 age - 1
    const offset = log.age - 1
    return (
        <li className="log">
            <span className="age font-mono">{log.age}岁</span>
            <div className="content">
                <LogTalents items={log.talents} />
                <LogEvents items={log.events} offset={offset} />
                <LogAchievements items={log.achievements} />
            </div>
        </li>
    )
}

export function Logs({ logs }: { logs: LogLike[] }) {
    return (
        <>
            {logs.map((log, index) => (
                <Log key={index} log={log} />
            ))}
        </>
    )
}

export default Logs
