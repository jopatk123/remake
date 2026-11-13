/**
 * 榜单里的「死因」。
 *
 * 协议只传致死事件的 id，文本在这里按本地事件表查 —— 中继不认识事件内容，
 * 换数据包 / 换语言都不用动服务端。房间页和结算浮层共用这一小段。
 */
import { deathText } from '@/multi/death'

export function Death({ id, age }: { id: number | null; age?: number }) {
    const text = deathText(id, age)
    return (
        <span className="death" title={text ?? undefined}>
            死因：{text ?? '不明'}
        </span>
    )
}

export default Death
