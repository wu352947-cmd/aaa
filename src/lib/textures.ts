import * as THREE from 'three'
import { mulberry32 } from './random'

const cache = new Map<string, THREE.Texture>()

function canvasTex(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, srgb = true, w = size) {
  const hit = cache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = size
  const c = cv.getContext('2d')!
  draw(c, size)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  cache.set(key, t)
  return t
}

/** 中式筒瓦/机制瓦屋面 */
export function roofTiles(color = '#b04a35', key = 'roofRed') {
  return canvasTex(key, 256, (c, s) => {
    const base = new THREE.Color(color)
    const r = mulberry32(7)
    c.fillStyle = color
    c.fillRect(0, 0, s, s)
    const cols = 16
    const rows = 12
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = 0.85 + r() * 0.25
        const x = (i / cols) * s
        const y = (j / rows) * s
        const w = s / cols
        const h = s / rows
        const g = c.createLinearGradient(x, 0, x + w, 0)
        const col = base.clone().multiplyScalar(k)
        g.addColorStop(0, `#${col.clone().multiplyScalar(0.7).getHexString()}`)
        g.addColorStop(0.5, `#${col.clone().multiplyScalar(1.15).getHexString()}`)
        g.addColorStop(1, `#${col.clone().multiplyScalar(0.7).getHexString()}`)
        c.fillStyle = g
        c.fillRect(x, y, w, h)
        c.fillStyle = 'rgba(0,0,0,0.25)'
        c.fillRect(x, y + h - 2, w, 2)
      }
  })
}

/** 平屋面：浅灰隔热砖 */
export function roofConcrete() {
  return canvasTex('roofConcrete', 256, (c, s) => {
    const r = mulberry32(3)
    c.fillStyle = '#b7b4ad'
    c.fillRect(0, 0, s, s)
    const n = 8
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = 175 + r() * 25
        c.fillStyle = `rgb(${k},${k - 3},${k - 9})`
        c.fillRect((i * s) / n + 1, (j * s) / n + 1, s / n - 2, s / n - 2)
      }
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(60,60,55,${r() * 0.12})`
      c.fillRect(r() * s, r() * s, 3 + r() * 10, 3 + r() * 10)
    }
  })
}

/** 地面细节噪声（灰度），叠加到大尺寸总平面贴图上 */
export function detailNoise() {
  return canvasTex(
    'detailNoise',
    256,
    (c, s) => {
      const r = mulberry32(11)
      const img = c.createImageData(s, s)
      // 多尺度噪声，平铺无缝
      const grid = (n: number) => {
        const g: number[] = []
        for (let i = 0; i < n * n; i++) g.push(r())
        return (x: number, y: number) => {
          const fx = (x / s) * n
          const fy = (y / s) * n
          const x0 = Math.floor(fx) % n
          const y0 = Math.floor(fy) % n
          const x1 = (x0 + 1) % n
          const y1 = (y0 + 1) % n
          const tx = fx - Math.floor(fx)
          const ty = fy - Math.floor(fy)
          const a = g[y0 * n + x0]
          const b = g[y0 * n + x1]
          const cc = g[y1 * n + x0]
          const d = g[y1 * n + x1]
          return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty
        }
      }
      const g1 = grid(8)
      const g2 = grid(32)
      const g3 = grid(128)
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          const v = g1(x, y) * 0.45 + g2(x, y) * 0.3 + g3(x, y) * 0.15 + r() * 0.1
          const i = (y * s + x) * 4
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255
          img.data[i + 3] = 255
        }
      c.putImageData(img, 0, 0)
    },
    false,
  )
}

/** 铝板分缝贴图（艺体馆） */
export function panelTexture() {
  return canvasTex('panel', 512, (c, s) => {
    c.fillStyle = '#ecebe7'
    c.fillRect(0, 0, s, s)
    const r = mulberry32(5)
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 2; i++) {
        const k = 228 + r() * 14
        c.fillStyle = `rgb(${k},${k},${k - 4})`
        c.fillRect((i * s) / 2 + 2, (j * s) / 4 + 2, s / 2 - 4, s / 4 - 4)
      }
    c.fillStyle = '#a9aaa8'
    for (let i = 0; i <= 2; i++) c.fillRect((i * s) / 2 - 1, 0, 2, s)
    for (let j = 0; j <= 4; j++) c.fillRect(0, (j * s) / 4 - 1, s, 2)
  })
}

/** 球形网架（天文台穹顶） */
export function domeTexture() {
  return canvasTex('dome', 512, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s)
    g.addColorStop(0, '#e9ecef')
    g.addColorStop(1, '#a8adb3')
    c.fillStyle = g
    c.fillRect(0, 0, s, s)
    c.strokeStyle = 'rgba(80,85,92,0.65)'
    c.lineWidth = 2
    const n = 24
    for (let i = 0; i <= n; i++) {
      c.beginPath()
      c.moveTo((i * s) / n, 0)
      c.lineTo((i * s) / n, s)
      c.stroke()
    }
    for (let j = 0; j <= 12; j++) {
      c.beginPath()
      c.moveTo(0, (j * s) / 12)
      c.lineTo(s, (j * s) / 12)
      c.stroke()
    }
    // 斜向网格，形成三角网壳
    c.strokeStyle = 'rgba(80,85,92,0.35)'
    for (let i = -n; i <= n * 2; i++) {
      c.beginPath()
      c.moveTo((i * s) / n, 0)
      c.lineTo(((i + 12) * s) / n, s)
      c.stroke()
    }
  })
}

export function textTexture(
  key: string,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const hit = cache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!
  draw(c, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(key, t)
  return t
}

export const SERIF = '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun","WenQuanYi Zen Hei",serif'
export const KAI = '"STKaiti","KaiTi","Kaiti SC","Noto Serif SC","WenQuanYi Zen Hei",serif'
