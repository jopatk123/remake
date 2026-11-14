import { useState } from 'react'
import { useAllocator, usePointRandomizer, useLeftPoints } from '@remake/hooks'
import { usePicked, useReplaced, useStart, useIsClassic } from '@remake/hooks'
import type { AdditionalPoint } from '@remake/hooks'
import { properties } from '@remake/data/etc/display'
import { keys } from '@remake/vitex'
import { judgeGradeByValue } from '@/config'
import { talents } from '@remake/data'
import { toastAchvs, toastMsg } from '@/toast'
import Replaced from '@/components/Replaced'
import './Alloc.css'

interface AllocInputProps {
    point: number
    name: string
    onChange: (point: number) => void
}

function AllocInput(props: AllocInputProps) {
    return (
        <div className="allocation-input">
            <button
                aria-label={`${props.name}减少一点`}
                onClick={() => props.onChange(props.point - 1)}
            >
                −
            </button>
            <input
                className="font-mono"
                type="number"
                aria-label={`${props.name}分配点数`}
                value={props.point}
                onChange={e => props.onChange(Number(e.target.value))}
            />
            <button
                aria-label={`${props.name}增加一点`}
                onClick={() => props.onChange(props.point + 1)}
            >
                +
            </button>
        </div>
    )
}

interface PointsDetailProps {
    base: number
    source: AdditionalPoint[]
    fixed?: boolean
}

function PointsDetail({ base, source, fixed }: PointsDetailProps) {
    return (
        <ul className="points-detail">
            <li>
                <span>{fixed ? '固定' : '基础'}</span>
                <span className="font-mono">{base}</span>
            </li>
            {source.map(({ talent, points }) => (
                <li key={talent}>
                    <span>{talents.get(talent)?.name ?? talent}</span>
                    <span className="font-mono">{points}</span>
                </li>
            ))}
        </ul>
    )
}

export function Alloc() {
    const isClassic = useIsClassic()
    const picked = usePicked()
    const {
        talents: { chains },
        additionalPoints: { source },
    } = useReplaced()
    const { base, left } = useLeftPoints()
    const [{ alloc, final, base: ba }, allocator] = useAllocator()
    const random = usePointRandomizer()
    const start = useStart()
    const [showDetail, setShowDetail] = useState(false)
    const handleNext = () => {
        if (left != 0) return toastMsg('还有剩余点数未分配', 'alloc-toast')
        const achievements = start()
        toastAchvs(achievements)
    }
    return (
        <div className="screen point-allocation">
            <header className="alloc-head">
                <span className="alloc-kicker font-mono">命格已定 · 落笔成章</span>
                <h1 className="font-display">分配此生资质</h1>
                <p>起点只是墨迹，往后的人生仍由天意与你共同写成。</p>
            </header>
            <ul className="talent-list">
                {Array.from(picked, id => (
                    <li key={id}>
                        <Replaced id={id} chains={chains.get(id)} />
                    </li>
                ))}
            </ul>
            <section className="alloc-panel" aria-label="资质分配">
                <div className="alloc-panel-head">
                    <div
                        className={`alloc-budget ${left ? 'pending' : 'ready'}`}
                    >
                        <span className="alloc-budget-name">剩余点数</span>
                        <button
                            className="font-mono"
                            aria-expanded={showDetail}
                            aria-label={`剩余点数 ${left}，点按查看明细`}
                            onClick={() => setShowDetail(!showDetail)}
                        >
                            {left}
                        </button>
                    </div>
                    <p
                        className={`alloc-hint ${left ? '' : 'ready'}`}
                        aria-live="polite"
                    >
                        {left
                            ? '将点数分配至资质，归零方可启程'
                            : '点数已清 · 可以落笔成章'}
                    </p>
                    {showDetail && (
                        <PointsDetail
                            base={base}
                            source={source}
                            fixed={!isClassic}
                        />
                    )}
                </div>
                <ul className={`alloc ${isClassic ? 'classic' : 'modify'}`}>
                    {keys(alloc).map(key => (
                        <li
                            key={key}
                            className={`property grade-${judgeGradeByValue(key, final[key])}`}
                        >
                            <span className="name">
                                {properties[key]}
                                {!isClassic && (
                                    <span className="font-mono">[{ba[key]}]</span>
                                )}
                            </span>
                            {!isClassic && (
                                <span className="final font-mono">
                                    {final[key]}
                                </span>
                            )}
                            <AllocInput
                                point={alloc[key]}
                                name={properties[key]}
                                onChange={value => allocator(key, value)}
                            />
                        </li>
                    ))}
                </ul>
            </section>
            <div className="controls">
                <button className="secondary" onClick={() => random()}>
                    随机分配
                </button>
                <button
                    className={left ? 'pending' : 'primary'}
                    onClick={handleNext}
                >
                    开始新人生
                </button>
            </div>
        </div>
    )
}
export default Alloc
