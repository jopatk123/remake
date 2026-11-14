import { useEffect, useLayoutEffect, useRef } from 'react'
import { useInit, useWatcher } from '@/hooks/storage'
import { useStep, useSetStep, Step } from '@remake/hooks'
import ToastContainer from '@/toast'
import RareFxLayer from '@/components/RareFx'
import Home from '@/containers/Home'
import Room from '@/containers/Room'
import Mode from '@/containers/Mode'
import Chara from '@/containers/Chara'
import Pick from '@/containers/Pick'
import Alloc from '@/containers/Alloc'
import Play from '@/containers/Play'
import Summary from '@/containers/Summary'
import Achv from '@/containers/Achv'
import Thanks from '@/containers/Thanks'
import './Game.css'

export function Container() {
    /* prettier-ignore */
    switch (useStep()) {
        case Step.Idle: return <Home />
        case Step.Room: return <Room />
        case Step.Mode: return <Mode />
        case Step.Chara: return <Chara />
        case Step.Pick: return <Pick />
        case Step.Alloc: return <Alloc />
        case Step.Play: return <Play />
        case Step.Summary: return <Summary />
        case Step.Achv: return <Achv />
        case Step.Thanks: return <Thanks />
        default: return null
    }
}

/* prettier-ignore */
const Loading = () => <div className="screen loading"><h2>载入中...</h2></div>
const Saving = ({ active }: { active: boolean }) => (
    <div className={`saving ${active ? 'active' : ''}`}>保存中...</div>
)

/* prettier-ignore */
export function Game() {
    const [inited, init] = useInit()
    const saving = useWatcher()
    const setStep = useSetStep()
    const booted = useRef(false)
    // 邀请链接（?room=XXXX）直接进房间，不用先点「多人对战」
    useLayoutEffect(() => {
        if (booted.current) return
        booted.current = true
        if (new URLSearchParams(location.search).get('room')) setStep(Step.Room)
    }, [setStep])
    useEffect(() => { if (!inited) init() }, [inited, init])
    if (!inited) return <Loading />
    return <><Container /><RareFxLayer /><ToastContainer /><Saving active={saving} /></>
}
export default Game
