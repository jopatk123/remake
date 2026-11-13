/**
 * 一局的排名条：房间页「上一局排名」和对战页结算浮层共用同一套排版。
 *
 * 名次跟着房间下发，开局清空；死因只是其中一个事件 id，交给 Death 查表。
 */
import type { RankingItem } from '@remake/multi'
import { Death } from './Death'
import './Ranking.css'

interface RankingProps {
    items: RankingItem[]
    /** 自己的玩家 id，用来高亮自己那一行 */
    me?: string | null
    title?: string
    note?: string
}

export function Ranking({ items, me, title, note }: RankingProps) {
    const champion = items[0]
    return (
        <div className="ranking">
            {title && <h3>{title}</h3>}
            {champion && (
                <div className="ranking-champion">
                    <span className="champion-label">冠军</span>
                    <strong>{champion.name}</strong>
                    <span className="champion-score font-mono">
                        {champion.age} 岁 · 总评 {champion.summary}
                    </span>
                </div>
            )}
            <ol>
                {items.map((item, index) => (
                    <li
                        key={item.id}
                        className={`rank-${item.rank} ${item.id === me ? 'me' : ''}`}
                        style={{ ['--rank-order' as string]: index }}
                    >
                        <span className="rank font-mono">{item.rank}</span>
                        <span className="name">{item.name}</span>
                        <span className="age font-mono">{item.age} 岁</span>
                        <span className="score font-mono">{item.summary}</span>
                        <Death id={item.death} age={item.age} />
                    </li>
                ))}
            </ol>
            {note && <p className="ranking-note">{note}</p>}
        </div>
    )
}

export default Ranking
