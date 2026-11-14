import { useEffect, useRef } from 'react'
import { useTalentPuller, useTalentPicker, useProfile } from '@remake/hooks'
import { useTalentSubmit, useSubmitIsEnable } from '@remake/hooks'
import { talents as talentData } from '@remake/data'
import { PullCount, dev } from '@/config'
import { toastMsg } from '@/toast'
import { emitPullRareFx } from '@/fx/rare'
import Talent from '@/components/Talent'
import './Pick.css'

export function Pick() {
    const [pulled, puller] = useTalentPuller()
    const [talents, picker] = useTalentPicker()
    const [profile] = useProfile()
    const shown = useRef('')
    useEffect(() => {
        if (!pulled) return
        const key = pulled.join(',')
        if (shown.current === key) return
        shown.current = key
        emitPullRareFx(pulled, profile)
    }, [pulled, profile])
    const { enabled, min, max } = useSubmitIsEnable()
    const submit = useTalentSubmit()
    const msg = enabled
        ? '下一步'
        : `请选取 ${min == max ? min : `${min}~${max}`} 个天赋`
    const handleSubmit = () => {
        if (enabled) return submit()
        toastMsg(msg, 'pick-toast')
    }
    if (!pulled)
        return (
            <div className="screen talent-pick">
                <button
                    className="primary font-mono focus"
                    onClick={() => puller()}
                >
                    {PullCount} 连抽!
                </button>
            </div>
        )
    const ps = dev.locked
        ? Array.from(new Set([...dev.locked, ...pulled]))
        : pulled
    return (
        <div className="screen talent-pick">
            <ul className="talent-list">
                {ps.map((id, index) => (
                    <li
                        key={id}
                        className={
                            talentData.get(id)?.grade === 3
                                ? 'talent-reveal rare'
                                : 'talent-reveal'
                        }
                        style={{ ['--reveal-order' as string]: index }}
                        onClick={() => picker(id)}
                        onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            picker(id)
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={talents.has(id)}
                    >
                        <Talent id={id} selected={talents.has(id)} />
                    </li>
                ))}
            </ul>
            <button
                className={enabled ? 'primary' : 'error'}
                onClick={handleSubmit}
            >
                {msg}
            </button>
        </div>
    )
}
export default Pick
