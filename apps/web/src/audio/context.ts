/**
 * 音频图与解锁。
 *
 * 这里只有一条总线：所有音效从各自音源汇到 sfxBus，再经主增益与压缩器出声；
 * 混响是并行的一条支路。没有音乐总线，也没有闪避节点 —— 背景音乐已按需求移除，
 * 详见 docs/audio-design.md 末尾的说明。
 *
 * 浏览器要求 AudioContext 必须由一次用户手势创建／恢复，所以这里不主动建图。
 */

import { getAudioSettings, subscribeAudioSettings } from './settings'

export interface AudioGraph {
    ctx: AudioContext
    master: GainNode
    sfxBus: GainNode
    convolver: ConvolverNode
    /** 复用同一段白噪声，音效里所有噪声类音色都来自它 */
    noise: AudioBuffer
}

/** 音效基准增益，用户音量在这个之上做乘法 */
const SFX_BASE = 0.62

let graph: AudioGraph | null = null

/** 程序生成的混响脉冲：白噪声 + 指数衰减，省掉一个 IR 文件 */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
    const rate = ctx.sampleRate
    const length = Math.max(1, Math.floor(rate * seconds))
    const buffer = ctx.createBuffer(2, length, rate)
    for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel)
        for (let i = 0; i < length; i += 1) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
        }
    }
    return buffer
}

function makeNoise(ctx: AudioContext, seconds: number) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1
    }
    return buffer
}

function applyVolume(g: AudioGraph) {
    const settings = getAudioSettings()
    const level = settings.muted ? 0 : SFX_BASE * settings.sfx
    g.sfxBus.gain.setTargetAtTime(level, g.ctx.currentTime, 0.08)
}

function build(): AudioGraph | null {
    if (typeof window === 'undefined') return null
    const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
    if (!Ctor) return null

    const ctx = new Ctor()

    /**
     * 项目里没有母带流程，这个压缩器负责兜住多个音效同时触发时的爆音。
     * 阈值与比率沿用设计稿：-12dB / 4:1 / 250ms 释放。
     */
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -12
    compressor.knee.value = 6
    compressor.ratio.value = 4
    compressor.attack.value = 0.004
    compressor.release.value = 0.25
    compressor.connect(ctx.destination)

    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(compressor)

    const sfxBus = ctx.createGain()
    sfxBus.connect(master)

    const convolver = ctx.createConvolver()
    convolver.buffer = makeImpulse(ctx, 1.8, 2.6)
    const reverbReturn = ctx.createGain()
    reverbReturn.gain.value = 0.9
    convolver.connect(reverbReturn)
    reverbReturn.connect(master)

    const next: AudioGraph = {
        ctx,
        master,
        sfxBus,
        convolver,
        noise: makeNoise(ctx, 2),
    }

    applyVolume(next)
    return next
}

/**
 * 解锁音频。幂等，可以在任何手势里放心调用。
 * 返回图对象，没有音频能力时返回 null（老浏览器 / 被策略禁用）。
 */
export function unlockAudio(): AudioGraph | null {
    if (!graph) {
        graph = build()
        if (graph) {
            subscribeAudioSettings(() => {
                if (graph) applyVolume(graph)
            })
        }
    }
    if (graph && graph.ctx.state === 'suspended') {
        void graph.ctx.resume()
    }
    return graph
}

export function getGraph() {
    return graph
}

export function suspendAudio() {
    if (graph && graph.ctx.state === 'running') void graph.ctx.suspend()
}

export function resumeAudio() {
    if (graph && graph.ctx.state === 'suspended') void graph.ctx.resume()
}
