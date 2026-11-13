/**
 * 测试用中继：自己起一个临时服务器，节拍调到 150ms、结算倒计时 1200ms，跑完就杀。
 *
 * 这样 `pnpm test:protocol` / `pnpm test:client` 不依赖手动开服务，
 * 也不会撞上 8787 上正在跑的那个开发中继。
 */
import { spawn } from 'node:child_process'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RelayHandle {
    url: string
    port: number
    stop: () => void
}

export const TICK = 150
/** 结算倒计时在测试里调短，免得每个用例都等 5 秒 */
export const RESULT = 1200

export async function startRelay(
    env: Record<string, string> = {},
): Promise<RelayHandle> {
    const port = 18000 + Math.floor(Math.random() * 2000)
    const cwd = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')
    const child = spawn(process.execPath, [resolvePath(cwd, 'src/index.ts')], {
        cwd,
        env: {
            ...process.env,
            PORT: String(port),
            ROUND_MS: String(TICK),
            RESULT_MS: String(RESULT),
            ENTER_TIMEOUT: '4000',
            ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stderr.on('data', chunk => process.stderr.write(chunk))

    await new Promise<void>((done, fail) => {
        const timer = setTimeout(() => fail(new Error('中继启动超时')), 8000)
        let buffer = ''
        child.stdout.on('data', chunk => {
            buffer += String(chunk)
            if (buffer.includes('已启动')) {
                clearTimeout(timer)
                done()
            }
        })
    })

    return {
        url: `ws://127.0.0.1:${port}`,
        port,
        stop: () => child.kill(),
    }
}
