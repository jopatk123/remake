import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { Game } from './Game'
import './styles/colors.css'
import './styles/common.css'

// 主题必须早于页面挂载：邀请链接会直接进入房间，不一定经过首页的主题按钮。
const storedTheme = localStorage.getItem('theme')
const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
const dark = storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark)
document.documentElement.dataset.theme = dark ? 'dark' : 'light'

const container = document.getElementById('remake')!
const root = createRoot(container)
root.render(
    <StrictMode>
        <Game />
    </StrictMode>,
)
