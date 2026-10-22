/** 影片时钟：Director 每帧从音频时钟同步，其余组件只读 */
export const film = { t: 0, playing: false }

// 调试钩子：便于逐帧检查
;(window as unknown as { __film: unknown }).__film = film
