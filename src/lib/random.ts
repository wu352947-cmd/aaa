// 可复现的伪随机数，保证每次加载校园的细节（亮灯窗户、树的位置）一致
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = () => number

export const range = (r: Rand, a: number, b: number) => a + (b - a) * r()
export const pick = <T,>(r: Rand, arr: readonly T[]) => arr[Math.floor(r() * arr.length)]

// 简单的 2D value noise，用于山体与地面细节
export function makeNoise2D(seed: number) {
  const r = mulberry32(seed)
  const perm = new Uint8Array(512)
  const vals = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    perm[i] = i
    vals[i] = r()
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]
  const fade = (t: number) => t * t * (3 - 2 * t)
  const at = (x: number, y: number) => vals[perm[(perm[x & 255] + y) & 255]]
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = fade(x - xi)
    const yf = fade(y - yi)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
  }
  const fbm = (x: number, y: number, oct = 5) => {
    let s = 0
    let amp = 0.5
    let f = 1
    for (let i = 0; i < oct; i++) {
      s += amp * noise(x * f, y * f)
      f *= 2
      amp *= 0.5
    }
    return s
  }
  return { noise, fbm }
}
