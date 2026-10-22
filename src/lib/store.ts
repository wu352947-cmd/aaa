import { useSyncExternalStore } from 'react'

export type TimeOfDay = 'day' | 'dusk' | 'night' | 'horror'
export type Quality = 'high' | 'low'

export interface AppState {
  time: TimeOfDay
  quality: Quality
  labels: boolean
  selected: string | null
  /** 正在飞往的视点 id，相机控制器消费后置空 */
  flyTo: string | null
  touring: boolean
  ready: boolean
}

let state: AppState = {
  time: 'horror',
  quality: 'high',
  labels: true,
  selected: null,
  flyTo: null,
  touring: false,
  ready: false,
}

const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(patch: Partial<AppState>) {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state))
}
