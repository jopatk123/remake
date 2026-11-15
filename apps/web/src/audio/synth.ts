/**
 * 合成原语。
 *
 * 四种振荡器型（拨弦 / 钟磬 / 噪声 / 低频冲击）覆盖了这套配乐要用的全部音色，
 * 不引第三方合成库 —— 一个文字游戏不值得为此加依赖，而且这几个音色本来
 * 就是中式乐器里最容易用减法合成近似出来的。
 *
 * 约定：
 * - 所有时间参数都是 ctx 时间轴上的绝对秒数，由调用方负责前瞻调度；
 * - 包络一律用 setValueAtTime + 指数衰减，避免 linearRamp 造成的拉链噪声；
 * - 每个音自己决定混响湿量，干声与湿声分别接总线。
 */

import type { AudioGraph } from './context'

/** MIDI 音高 → 频率。音效里所有音高都写成 MIDI 号，读起来比赫兹直观 */
export function midiToHz(midi: number) {
    return 440 * Math.pow(2, (midi - 69) / 12)
}

/** 一个音源：直连总线，另外按 wet 送一份到混响 */
function emit(
    g: AudioGraph,
    node: AudioNode,
    bus: GainNode,
    wet: number,
) {
    const dry = g.ctx.createGain()
    dry.gain.value = 1
    node.connect(dry)
    dry.connect(bus)
    if (wet > 0) {
        const send = g.ctx.createGain()
        send.gain.value = wet
        node.connect(send)
        send.connect(g.convolver)
    }
}

/**
 * 拨弦：古琴 / 古筝 / 八音盒。
 * 三角波打底 + 一个高八度的锯齿提供起音的锐度，低通在 140ms 内快速下扫，
 * 听感上就是"拨"出去那一瞬间的明亮然后迅速收敛成木质共鸣。
 */
export function pluck(
    g: AudioGraph,
    freq: number,
    time: number,
    duration: number,
    gain: number,
    bus: GainNode,
    detuneCents = 0,
) {
    const { ctx } = g
    const body = ctx.createOscillator()
    const edge = ctx.createOscillator()
    body.type = 'triangle'
    edge.type = 'sawtooth'
    body.frequency.value = freq
    edge.frequency.value = freq * 2.004
    if (detuneCents > 0) {
        body.detune.value = (Math.random() * 2 - 1) * detuneCents
        edge.detune.value = (Math.random() * 2 - 1) * detuneCents
    }

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.9
    filter.frequency.setValueAtTime(Math.min(6400, freq * 9), time)
    filter.frequency.exponentialRampToValueAtTime(
        Math.max(220, freq * 1.8),
        time + 0.14,
    )

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(gain, time + 0.005)
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration)

    body.connect(filter)
    edge.connect(filter)
    filter.connect(env)
    emit(g, env, bus, 0.35)

    const stop = time + duration + 0.05
    body.start(time)
    edge.start(time)
    body.stop(stop)
    edge.stop(stop)
}

/**
 * 磬 / 钟：FM 合成。
 * 载波正弦，调制比 3.51（非整数比才有金属的不谐和泛音），
 * 调制指数从 4.5 倍频快速衰减到接近零 —— 起音是"铛"，之后只剩纯净的余韵。
 */
export function bell(
    g: AudioGraph,
    freq: number,
    time: number,
    duration: number,
    gain: number,
    bus: GainNode,
    wet = 0.85,
    pan = 0,
) {
    const { ctx } = g
    const carrier = ctx.createOscillator()
    const modulator = ctx.createOscillator()
    carrier.type = 'sine'
    modulator.type = 'sine'
    carrier.frequency.value = freq
    modulator.frequency.value = freq * 3.51

    const index = ctx.createGain()
    index.gain.setValueAtTime(freq * 4.5, time)
    index.gain.exponentialRampToValueAtTime(freq * 0.02, time + duration * 0.45)
    modulator.connect(index)
    index.connect(carrier.frequency)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(gain, time + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration)

    carrier.connect(env)
    if (pan !== 0) {
        /* 多人对战里的「远处有人死了」按列序放到左右，才听得出方位 */
        const panner = ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, pan))
        env.connect(panner)
        emit(g, panner, bus, wet)
    } else {
        emit(g, env, bus, wet)
    }

    const stop = time + duration + 0.1
    carrier.start(time)
    modulator.start(time)
    carrier.stop(stop)
    modulator.stop(stop)
}

/** 大鼓：正弦从 112Hz 迅速滑到 44Hz，就是一个"咚" */
export function drum(
    g: AudioGraph,
    time: number,
    gain: number,
    bus: GainNode,
) {
    const { ctx } = g
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(112, time)
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.2)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(gain, time + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.42)

    osc.connect(env)
    emit(g, env, bus, 0.3)
    osc.start(time)
    osc.stop(time + 0.5)
}

/** 木鱼 / 木块：极短噪声 + 带通，靠 Q 值定音高感 */
export function woodblock(
    g: AudioGraph,
    time: number,
    gain: number,
    bus: GainNode,
    pitch = 900,
) {
    const { ctx } = g
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.09))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
        data[i] =
            (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.16))
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = pitch
    band.Q.value = 7

    const env = ctx.createGain()
    env.gain.value = gain
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.09)

    source.connect(band)
    band.connect(env)
    emit(g, env, bus, 0.18)
    source.start(time)
}

/**
 * 噪声冲击：雷、刀光、纸页。
 * 滤波器类型与扫频方向决定性格 —— 低通下扫是雷，高通上扫是刀。
 */
export function noiseBurst(
    g: AudioGraph,
    time: number,
    duration: number,
    gain: number,
    bus: GainNode,
    options: {
        type?: BiquadFilterType
        from?: number
        to?: number
        q?: number
        wet?: number
        attack?: number
    } = {},
) {
    const { ctx } = g
    const source = ctx.createBufferSource()
    source.buffer = g.noise
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = options.type ?? 'lowpass'
    filter.Q.value = options.q ?? 1
    const from = options.from ?? 4000
    const to = options.to ?? 400
    filter.frequency.setValueAtTime(Math.max(20, from), time)
    filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, to),
        time + duration,
    )

    const env = ctx.createGain()
    const attack = options.attack ?? 0.012
    env.gain.setValueAtTime(0.0001, time)
    env.gain.linearRampToValueAtTime(gain, time + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration)

    source.connect(filter)
    filter.connect(env)
    emit(g, env, bus, options.wet ?? 0.3)
    source.start(time)
    source.stop(time + duration + 0.05)
}

/** 心跳：两下低频闷击，用于魔修偷袭之后的余悸 */
export function heartbeat(
    g: AudioGraph,
    time: number,
    gain: number,
    bus: GainNode,
) {
    drum(g, time, gain, bus)
    drum(g, time + 0.22, gain * 0.72, bus)
}

/** 界面轻叩：比木鱼更短更钝，用于按钮 */
export function click(g: AudioGraph, time: number, gain: number, bus: GainNode) {
    noiseBurst(g, time, 0.055, gain, bus, {
        type: 'bandpass',
        from: 2400,
        to: 1200,
        q: 2.4,
        wet: 0.06,
        attack: 0.002,
    })
}
