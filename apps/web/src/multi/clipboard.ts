/**
 * 复制文本。
 *
 * `navigator.clipboard` 只在 https 或 localhost 下可用，用局域网 IP 打开
 * 开发服务器时会静默失败（连异常都不抛），所以失败后要退回到老办法：
 * 塞一个看不见的 textarea + `execCommand('copy')`。两条都失败才算失败，
 * 由调用方提示用户手动复制。
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // 没权限 / 非安全上下文，继续走兜底
    }
    try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '0'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        return ok
    } catch {
        return false
    }
}
