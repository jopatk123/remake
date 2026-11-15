/**
 * 音频模块的对外出口。
 *
 * 组件层只需要 AudioRoot 与 AudioToggle；playSfx 留给需要精确控制
 * 具体音效的交互（抽卡的翻牌、属性跨档）。
 */

export { AudioRoot, AudioToggle } from './bridge'
export { playSfx, type SfxName } from './sfx'
export { getAudioSettings, setAudioSettings, toggleMuted } from './settings'
export { unlockAudio } from './context'
