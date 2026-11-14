/**
 * 榜单里的「死因」。
 *
 * 协议只传致死事件的 id，文本在这里按本地事件表查 —— 中继不认识事件内容，
 * 换数据包 / 换语言都不用动服务端。
 *
 * 不是所有结局都有死因：
 * - 飞升 / 超脱 / 离世 / 转世：没有「死因」，结局徽章已经说明了，不再补一行；
 * - 掉线：服务端只知道连接没了，没有致死事件，显示「已离线」而不是「不明」；
 * - 超时收摊时还活着：显示「未阵亡」；
 * - 真正的阵亡：显示事件文本；连通用死亡事件都查不到时退回「已身故」。
 */
import type { EndingType } from '@remake/multi'
import { deathText } from '@/multi/death'

interface DeathProps {
    id: number | null
    age?: number
    ending?: EndingType | null
    alive?: boolean
    connected?: boolean
}

export function Death({ id, age, ending, alive, connected }: DeathProps) {
    // 非死亡结局不显示死因，避免「飞升的人死因不明」这种怪画面
    if (ending && ending !== 'death') return null
    // 先看有没有真实死因：阵亡后再掉线的人，死因仍然应该保留
    const text = deathText(id, age)
    if (text) {
        return (
            <span className="death" title={text}>
                死因：{text}
            </span>
        )
    }
    if (connected === false) {
        return <span className="death">状态：已离线</span>
    }
    // 有死亡结局 / 已经阵亡但查不到事件：至少别写「不明」
    if (ending === 'death' || alive === false) {
        return <span className="death">死因：身故</span>
    }
    // 超时收摊 / 旧服务端没带结局时的兜底
    return <span className="death">状态：未阵亡</span>
}

export default Death
