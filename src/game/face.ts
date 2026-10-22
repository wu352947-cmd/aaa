/**
 * 程序化绘制的恐怖鬼脸（用于全屏闪现与被抓瞬间）。
 * 惨白凹陷的脸、全黑的眼窝里一点针尖般的白瞳、血泪、被撕裂到耳根的嘴。
 */
const cache = new Map<string, string>()

export function scareFace(variant: 'ripper' | 'girl' = 'ripper', size = 768) {
  const key = `${variant}-${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')!
  const S = size
  const cx = S / 2
  const r = Math.random

  c.fillStyle = '#000'
  c.fillRect(0, 0, S, S)

  // 头发 / 礼帽阴影
  if (variant === 'girl') {
    c.fillStyle = '#050304'
    c.beginPath()
    c.ellipse(cx, S * 0.48, S * 0.42, S * 0.56, 0, 0, Math.PI * 2)
    c.fill()
  }

  // 脸型：瘦长、颧骨凹陷
  const skin = c.createRadialGradient(cx, S * 0.42, S * 0.05, cx, S * 0.5, S * 0.42)
  skin.addColorStop(0, variant === 'girl' ? '#e8e6e2' : '#d9d2c6')
  skin.addColorStop(0.55, variant === 'girl' ? '#b9b8b6' : '#9e958a')
  skin.addColorStop(1, '#2a2522')
  c.fillStyle = skin
  c.beginPath()
  c.moveTo(cx, S * 0.08)
  c.bezierCurveTo(S * 0.86, S * 0.1, S * 0.82, S * 0.62, S * 0.66, S * 0.86)
  c.quadraticCurveTo(cx, S * 1.02, S * 0.34, S * 0.86)
  c.bezierCurveTo(S * 0.18, S * 0.62, S * 0.14, S * 0.1, cx, S * 0.08)
  c.fill()

  // 颧骨与太阳穴阴影
  for (const sx of [-1, 1]) {
    const g = c.createRadialGradient(cx + sx * S * 0.2, S * 0.6, 0, cx + sx * S * 0.2, S * 0.6, S * 0.16)
    g.addColorStop(0, 'rgba(30,20,20,0.55)')
    g.addColorStop(1, 'rgba(30,20,20,0)')
    c.fillStyle = g
    c.fillRect(0, 0, S, S)
  }

  // 皮肤裂纹与血管
  c.strokeStyle = 'rgba(60,20,30,0.45)'
  c.lineWidth = S / 600
  for (let i = 0; i < 70; i++) {
    let x = cx + (r() - 0.5) * S * 0.5
    let y = S * (0.15 + r() * 0.7)
    c.beginPath()
    c.moveTo(x, y)
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * S * 0.04
      y += (r() - 0.3) * S * 0.03
      c.lineTo(x, y)
    }
    c.stroke()
  }

  // 眼窝：全黑、深陷
  const eyeY = S * 0.42
  for (const sx of [-1, 1]) {
    const ex = cx + sx * S * 0.15
    const g = c.createRadialGradient(ex, eyeY, 0, ex, eyeY, S * 0.13)
    g.addColorStop(0, '#000')
    g.addColorStop(0.6, '#050202')
    g.addColorStop(1, 'rgba(20,5,5,0)')
    c.fillStyle = g
    c.beginPath()
    c.ellipse(ex, eyeY, S * 0.12, S * 0.095, sx * 0.15, 0, Math.PI * 2)
    c.fill()
    // 针尖般的瞳孔
    c.fillStyle = variant === 'girl' ? '#f4f4f0' : '#ff3a22'
    c.shadowColor = c.fillStyle
    c.shadowBlur = S * 0.03
    c.beginPath()
    c.arc(ex + sx * S * 0.01, eyeY + S * 0.005, S * 0.009, 0, Math.PI * 2)
    c.fill()
    c.shadowBlur = 0
    // 血泪
    for (let k = 0; k < 3; k++) {
      const tx = ex + (r() - 0.5) * S * 0.06
      const len = S * (0.18 + r() * 0.25)
      const tg = c.createLinearGradient(0, eyeY, 0, eyeY + len)
      tg.addColorStop(0, 'rgba(90,0,0,0.95)')
      tg.addColorStop(0.8, 'rgba(70,0,0,0.6)')
      tg.addColorStop(1, 'rgba(70,0,0,0)')
      c.fillStyle = tg
      c.beginPath()
      c.moveTo(tx - S * 0.006, eyeY + S * 0.05)
      c.quadraticCurveTo(tx + (r() - 0.5) * S * 0.03, eyeY + len * 0.6, tx, eyeY + len)
      c.lineTo(tx + S * 0.008, eyeY + S * 0.05)
      c.fill()
    }
  }

  // 撕裂到耳根的嘴
  const my = S * 0.7
  c.fillStyle = '#0a0000'
  c.beginPath()
  c.moveTo(S * 0.2, my - S * 0.06)
  c.bezierCurveTo(S * 0.35, my + S * 0.02, S * 0.65, my + S * 0.02, S * 0.8, my - S * 0.06)
  c.bezierCurveTo(S * 0.66, my + S * 0.2, S * 0.34, my + S * 0.2, S * 0.2, my - S * 0.06)
  c.fill()
  // 参差的牙
  c.fillStyle = '#d8cfb8'
  for (let i = 0; i < 26; i++) {
    const t = i / 25
    const x = S * (0.24 + t * 0.52)
    const top = my - S * 0.02 + Math.sin(t * Math.PI) * S * 0.02
    const bot = my + S * 0.1 + Math.sin(t * Math.PI) * S * 0.05
    const h = S * (0.03 + r() * 0.035)
    c.beginPath()
    c.moveTo(x - S * 0.008, top)
    c.lineTo(x + S * 0.008, top)
    c.lineTo(x, top + h)
    c.fill()
    c.beginPath()
    c.moveTo(x - S * 0.008, bot)
    c.lineTo(x + S * 0.008, bot)
    c.lineTo(x, bot - h * 0.8)
    c.fill()
  }
  // 嘴角撕裂的血
  for (const sx of [0.2, 0.8]) {
    c.fillStyle = 'rgba(110,0,0,0.9)'
    c.beginPath()
    c.ellipse(S * sx, my - S * 0.06, S * 0.03, S * 0.012, 0, 0, Math.PI * 2)
    c.fill()
    for (let k = 0; k < 4; k++) c.fillRect(S * sx + (r() - 0.5) * S * 0.04, my - S * 0.06, S * 0.005, S * (0.05 + r() * 0.15))
  }

  // 礼帽（开膛手）
  if (variant === 'ripper') {
    c.fillStyle = '#030203'
    c.fillRect(S * 0.18, S * 0.02, S * 0.64, S * 0.05)
    c.fillRect(S * 0.3, -S * 0.2, S * 0.4, S * 0.24)
  }

  // 整体噪点与暗角
  const img = c.getImageData(0, 0, S, S)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 38
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  c.putImageData(img, 0, 0)
  const v = c.createRadialGradient(cx, S / 2, S * 0.3, cx, S / 2, S * 0.72)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.95)')
  c.fillStyle = v
  c.fillRect(0, 0, S, S)

  const url = cv.toDataURL('image/jpeg', 0.9)
  cache.set(key, url)
  return url
}

/** 全屏闪脸请求，HUD 读取 */
export const flash = { until: 0, variant: 'ripper' as 'ripper' | 'girl', strength: 1 }

export function flashFace(ms: number, variant: 'ripper' | 'girl' = 'ripper', strength = 1) {
  flash.until = performance.now() + ms
  flash.variant = variant
  flash.strength = strength
}

;((window as unknown as { __horror?: Record<string, unknown> }).__horror ??= {}).flashFace = flashFace
