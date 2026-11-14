import { useRemake, useFeatures, useGoAchv, useGoThanks, useSetStep, Step } from '@remake/hooks'
import ThemeToggle from '@/components/ThemeToggle'
import Github from '@/components/Github'
import './Home.css'

export default function Home() {
    const remake = useRemake()
    const features = useFeatures()
    const goAchv = useGoAchv()
    const goThanks = useGoThanks()
    const setStep = useSetStep()
    return (
        <div className="screen home">
            <div className="home-hero">
                <span className="home-eyebrow font-mono">
                    LIFE RESTART · 轮回命书
                </span>
                <div className="home-title-row">
                    <div className="home-sigil" aria-hidden="true">
                        <span>轮</span>
                    </div>
                    <div className="title">
                        <h1 className="main font-display">人生重开模拟器</h1>
                        <p className="sub">这垃圾人生一秒也不想待了</p>
                    </div>
                    <span className="home-seal" aria-hidden="true">
                        重<br />开
                    </span>
                </div>
                <p className="home-lede">
                    抽一纸天赋，落一笔命数。每次睁眼，都是另一世。
                </p>
            </div>
            <div className="controls">
                <div className="primary-control">
                    <button className="primary focus" onClick={remake}>
                        立即重开
                    </button>
                </div>
                <div>
                    <button
                        className="secondary"
                        onClick={() => setStep(Step.Room)}
                    >
                        多人游戏
                    </button>
                </div>
                {features && (
                    <div>
                        <button className="secondary" onClick={goAchv}>
                            成就
                        </button>
                        <button className="secondary" onClick={goThanks}>
                            感谢
                        </button>
                    </div>
                )}
            </div>
            <div className="actions">
                {features && <Github />}
                <ThemeToggle />
            </div>
        </div>
    )
}
