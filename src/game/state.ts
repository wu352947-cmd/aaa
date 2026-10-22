import { useSyncExternalStore } from 'react'
import * as THREE from 'three'

export type Phase = 'menu' | 'playing' | 'caught' | 'escaped'

export interface GameUI {
  phase: Phase
  pages: number
  stamina: number
  battery: number
  flashlight: boolean
  subtitle: string | null
  letter: { title: string; body: string } | null
  location: string | null
  prompt: string | null
  fear: number
  /** 被抓时的随机死亡语，结束页显示 */
  epitaph: string
  runId: number
  time: number
}

let ui: GameUI = {
  phase: 'menu',
  pages: 0,
  stamina: 1,
  battery: 1,
  flashlight: true,
  subtitle: null,
  letter: null,
  location: null,
  prompt: null,
  fear: 0,
  epitaph: '',
  runId: 0,
  time: 0,
}
const listeners = new Set<() => void>()

export const game = {
  get: () => ui,
  set(patch: Partial<GameUI>) {
    ui = { ...ui, ...patch }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useGame<T>(sel: (s: GameUI) => T): T {
  return useSyncExternalStore(game.subscribe, () => sel(ui))
}

/** 每帧都要读写的共享数据，不进 React */
export const G = {
  player: new THREE.Vector3(),
  playerYaw: 0,
  look: new THREE.Vector3(0, 0, -1),
  killer: new THREE.Vector3(150, 0, -40),
  killerVisible: false,
  killerDist: 999,
  /** 杀手是否在玩家视野内（屏幕中央附近、未被遮挡） */
  killerSeen: false,
  fear: 0,
  scare: 0, // 惊吓脉冲 0..1，驱动画面故障
  pagesTaken: new Set<number>(),
  sprinting: false,
  moving: false,
  flashlightOn: true,
  battery: 1,
  stamina: 1,
  aggression: 0,
  caughtAt: 0,
  startedAt: 0,
  /** 调试：跳过开局缓冲 */
  noGrace: false,
}

export const PAGE_COUNT = 6

let subTimer = 0
export function say(text: string, ms = 4200) {
  game.set({ subtitle: text })
  clearTimeout(subTimer)
  subTimer = window.setTimeout(() => game.set({ subtitle: null }), ms)
}

export function resetRun() {
  G.pagesTaken.clear()
  G.killer.set(150, 0, -40)
  G.fear = 0
  G.scare = 0
  G.battery = 1
  G.stamina = 1
  G.aggression = 0
  G.flashlightOn = true
  G.startedAt = performance.now()
  game.set({
    phase: 'playing',
    pages: 0,
    stamina: 1,
    battery: 1,
    flashlight: true,
    letter: null,
    subtitle: null,
    prompt: null,
    fear: 0,
    runId: ui.runId + 1,
  })
}

// 调试钩子：便于在浏览器控制台里查看或跳转状态
Object.assign(((window as unknown as { __horror?: Record<string, unknown> }).__horror ??= {}), { G, game })
