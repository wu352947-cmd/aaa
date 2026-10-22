import * as THREE from 'three'
import { mulberry32, type Rand } from './random'

/**
 * 立面贴图绘制器：同一段绘制脚本分别跑三遍，产出
 *  - color：基础色（面砖、玻璃反射、窗框）
 *  - pbr：G 通道 = 粗糙度，B 通道 = 金属度（three.js 约定）
 *  - emit：夜景亮灯窗户
 * 坐标以“米”为单位，原点在立面左下角，y 向上。
 */
export type Layer = 'color' | 'pbr' | 'emit'

export interface GlassOpts {
  tint?: string
  frame?: string
  frameW?: number
  cols?: number
  rows?: number
  transom?: number // 距底部的横档高度（米），0 表示无
  litChance?: number
  curtains?: boolean
  reflect?: number // 天空反射强度 0..1
}

export class Painter {
  readonly ctx: CanvasRenderingContext2D
  readonly layer: Layer
  readonly s: number
  readonly W: number
  readonly H: number
  rand: Rand

  constructor(ctx: CanvasRenderingContext2D, layer: Layer, ppm: number, W: number, H: number, seed: number) {
    this.ctx = ctx
    this.layer = layer
    this.s = ppm
    this.W = W
    this.H = H
    this.rand = mulberry32(seed)
  }

  private X(x: number) {
    return x * this.s
  }
  private Y(y: number) {
    return (this.H - y) * this.s
  }

  private pbr(rough: number, metal: number) {
    return `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`
  }

  /** 纯色块 */
  fill(x: number, y: number, w: number, h: number, color: string, rough = 0.85, metal = 0) {
    const c = this.ctx
    if (this.layer === 'color') c.fillStyle = color
    else if (this.layer === 'pbr') c.fillStyle = this.pbr(rough, metal)
    else c.fillStyle = '#000'
    c.fillRect(this.X(x), this.Y(y + h), w * this.s, h * this.s)
  }

  /** 面砖墙：带细微色差与勾缝 */
  tiles(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    o: { tw?: number; th?: number; jitter?: number; grout?: string; rough?: number; stagger?: boolean } = {},
  ) {
    const { tw = 0.24, th = 0.06, jitter = 0.05, grout, rough = 0.8, stagger = true } = o
    this.fill(x, y, w, h, color, rough)
    if (this.layer !== 'color') return
    const c = this.ctx
    const base = new THREE.Color(color)
    const hsl = { h: 0, s: 0, l: 0 }
    base.getHSL(hsl)
    const pxW = tw * this.s
    const pxH = th * this.s
    // 像素太小时只画噪点色差，避免摩尔纹
    if (pxW < 3 || pxH < 1.5) {
      const n = Math.floor(w * h * 2)
      for (let i = 0; i < n; i++) {
        const l = hsl.l + (this.rand() - 0.5) * jitter * 1.6
        c.fillStyle = `hsl(${hsl.h * 360},${hsl.s * 100}%,${l * 100}%)`
        const px = x + this.rand() * w
        const py = y + this.rand() * h
        c.fillRect(this.X(px), this.Y(py), Math.max(1, pxW * 2), Math.max(1, pxH * 2))
      }
      return
    }
    const g = grout ?? `hsl(${hsl.h * 360},${hsl.s * 60}%,${Math.min(95, hsl.l * 100 + 8)}%)`
    for (let ty = y, row = 0; ty < y + h; ty += th, row++) {
      const off = stagger && row % 2 ? tw / 2 : 0
      for (let tx = x - off; tx < x + w; tx += tw) {
        const l = hsl.l + (this.rand() - 0.5) * jitter
        c.fillStyle = `hsl(${hsl.h * 360},${hsl.s * 100}%,${l * 100}%)`
        const x0 = Math.max(tx, x)
        const x1 = Math.min(tx + tw, x + w)
        const y1 = Math.min(ty + th, y + h)
        c.fillRect(this.X(x0), this.Y(y1), (x1 - x0) * this.s - 1, (y1 - ty) * this.s - 1)
      }
    }
    c.fillStyle = g
    c.globalAlpha = 0.35
    for (let ty = y; ty < y + h; ty += th) c.fillRect(this.X(x), this.Y(ty) - 0.5, w * this.s, 1)
    c.globalAlpha = 1
  }

  /** 马赛克/小方砖（弧形阳台楼的白色马赛克） */
  mosaic(x: number, y: number, w: number, h: number, color: string, size = 0.05) {
    this.fill(x, y, w, h, color, 0.6)
    if (this.layer !== 'color') return
    const c = this.ctx
    const step = Math.max(2, size * this.s)
    const base = new THREE.Color(color)
    for (let py = this.Y(y + h); py < this.Y(y); py += step) {
      for (let px = this.X(x); px < this.X(x + w); px += step) {
        const k = 1 + (this.rand() - 0.5) * 0.08
        c.fillStyle = `rgb(${base.r * 255 * k},${base.g * 255 * k},${base.b * 255 * k})`
        c.fillRect(px, py, step - 0.6, step - 0.6)
      }
    }
  }

  /** 竖向、横向线条（勾缝、铝板分缝） */
  lines(x: number, y: number, w: number, h: number, color: string, dx: number, dy: number, width = 0.03) {
    if (this.layer !== 'color') return
    const c = this.ctx
    c.fillStyle = color
    const lw = Math.max(1, width * this.s)
    if (dx > 0) for (let lx = x + dx; lx < x + w - 1e-3; lx += dx) c.fillRect(this.X(lx) - lw / 2, this.Y(y + h), lw, h * this.s)
    if (dy > 0) for (let ly = y + dy; ly < y + h - 1e-3; ly += dy) c.fillRect(this.X(x), this.Y(ly) - lw / 2, w * this.s, lw)
  }

  private glassFill(x: number, y: number, w: number, h: number, o: GlassOpts, lit: boolean, warm: number) {
    const c = this.ctx
    const X0 = this.X(x)
    const Y0 = this.Y(y + h)
    const pw = w * this.s
    const ph = h * this.s
    if (this.layer === 'pbr') {
      c.fillStyle = this.pbr(0.06, 0.85)
      c.fillRect(X0, Y0, pw, ph)
      return
    }
    if (this.layer === 'emit') {
      if (lit) {
        const g = c.createLinearGradient(0, Y0, 0, Y0 + ph)
        const a = 0.55 + warm * 0.45
        g.addColorStop(0, `rgba(255,${200 + warm * 30},${130 + warm * 60},${a})`)
        g.addColorStop(1, `rgba(255,${180 + warm * 40},${110 + warm * 60},${a * 0.8})`)
        c.fillStyle = g
      } else c.fillStyle = 'rgba(8,10,16,1)'
      c.fillRect(X0, Y0, pw, ph)
      return
    }
    const tint = new THREE.Color(o.tint ?? '#3d5a73')
    const refl = o.reflect ?? 0.55
    const g = c.createLinearGradient(0, Y0, 0, Y0 + ph)
    const sky = new THREE.Color('#cfe2f2')
    const top = tint.clone().lerp(sky, refl * 0.7)
    const bot = tint.clone().multiplyScalar(0.55)
    g.addColorStop(0, `#${top.getHexString()}`)
    g.addColorStop(0.55, `#${tint.getHexString()}`)
    g.addColorStop(1, `#${bot.getHexString()}`)
    c.fillStyle = g
    c.fillRect(X0, Y0, pw, ph)
    // 窗帘与室内暗影，让玻璃不显得“假”
    if (o.curtains !== false && this.rand() < 0.45) {
      c.fillStyle = this.rand() < 0.5 ? 'rgba(235,232,220,0.55)' : 'rgba(120,150,170,0.45)'
      const cw = pw * (0.2 + this.rand() * 0.35)
      c.fillRect(this.rand() < 0.5 ? X0 : X0 + pw - cw, Y0, cw, ph)
    }
    // 斜向高光
    c.fillStyle = 'rgba(255,255,255,0.10)'
    c.save()
    c.beginPath()
    c.rect(X0, Y0, pw, ph)
    c.clip()
    c.beginPath()
    c.moveTo(X0 + pw * 0.2, Y0)
    c.lineTo(X0 + pw * 0.5, Y0)
    c.lineTo(X0 + pw * 0.1, Y0 + ph)
    c.lineTo(X0 - pw * 0.2, Y0 + ph)
    c.fill()
    c.restore()
  }

  private frameRect(x: number, y: number, w: number, h: number, color: string, fw: number) {
    // 窗框只在 color / pbr 层画；emit 层窗框为黑
    this.fill(x, y, w, fw, color, 0.45, 0.4)
    this.fill(x, y + h - fw, w, fw, color, 0.45, 0.4)
    this.fill(x, y, fw, h, color, 0.45, 0.4)
    this.fill(x + w - fw, y, fw, h, color, 0.45, 0.4)
  }

  /** 矩形玻璃窗，含分格与框 */
  glass(x: number, y: number, w: number, h: number, o: GlassOpts = {}) {
    const lit = this.rand() < (o.litChance ?? 0.5)
    const warm = this.rand()
    this.glassFill(x, y, w, h, o, lit, warm)
    const fc = o.frame ?? '#e8e8e4'
    const fw = o.frameW ?? 0.06
    const cols = o.cols ?? 2
    const rows = o.rows ?? 1
    for (let i = 1; i < cols; i++) this.fill(x + (w * i) / cols - fw / 2, y, fw, h, fc, 0.45, 0.4)
    for (let j = 1; j < rows; j++) this.fill(x, y + (h * j) / rows - fw / 2, w, fw, fc, 0.45, 0.4)
    if (o.transom) this.fill(x, y + o.transom - fw / 2, w, fw, fc, 0.45, 0.4)
    this.frameRect(x, y, w, h, fc, fw * 1.4)
  }

  /** 拱形窗：矩形 + 半圆顶 */
  archGlass(x: number, y: number, w: number, h: number, o: GlassOpts & { archOnly?: boolean } = {}) {
    const c = this.ctx
    const r = w / 2
    const rectH = h - r
    c.save()
    c.beginPath()
    c.moveTo(this.X(x), this.Y(y))
    c.lineTo(this.X(x), this.Y(y + rectH))
    c.arc(this.X(x + r), this.Y(y + rectH), r * this.s, Math.PI, 0)
    c.lineTo(this.X(x + w), this.Y(y))
    c.closePath()
    c.clip()
    const lit = this.rand() < (o.litChance ?? 0.5)
    this.glassFill(x, y, w, h, o, lit, this.rand())
    const fc = o.frame ?? '#e8e8e4'
    const fw = o.frameW ?? 0.06
    const cols = o.cols ?? 2
    for (let i = 1; i < cols; i++) this.fill(x + (w * i) / cols - fw / 2, y, fw, h, fc, 0.45, 0.4)
    const rows = o.rows ?? 1
    for (let j = 1; j < rows; j++) this.fill(x, y + (rectH * j) / rows - fw / 2, w, fw, fc, 0.45, 0.4)
    this.fill(x, y + rectH - fw / 2, w, fw, fc, 0.45, 0.4)
    c.restore()
    // 拱框
    if (this.layer !== 'emit') {
      c.strokeStyle = this.layer === 'color' ? fc : this.pbr(0.45, 0.4)
      c.lineWidth = Math.max(1, fw * 2 * this.s)
      c.beginPath()
      c.moveTo(this.X(x), this.Y(y))
      c.lineTo(this.X(x), this.Y(y + rectH))
      c.arc(this.X(x + r), this.Y(y + rectH), r * this.s, Math.PI, 0)
      c.lineTo(this.X(x + w), this.Y(y))
      c.stroke()
    }
  }

  /** 半圆拱形描边（白色拱券线脚） */
  archTrim(x: number, y: number, w: number, h: number, color: string, width: number) {
    if (this.layer === 'emit') return
    const c = this.ctx
    const r = w / 2
    c.strokeStyle = this.layer === 'color' ? color : this.pbr(0.7, 0)
    c.lineWidth = width * this.s
    c.beginPath()
    c.moveTo(this.X(x), this.Y(y))
    c.lineTo(this.X(x), this.Y(y + h - r))
    c.arc(this.X(x + r), this.Y(y + h - r), r * this.s, Math.PI, 0)
    c.lineTo(this.X(x + w), this.Y(y))
    c.stroke()
  }

  /** 暗色开口（走廊、门洞），夜间可透出暖光 */
  opening(x: number, y: number, w: number, h: number, color = '#2a2d31', glow = 0.4) {
    const c = this.ctx
    if (this.layer === 'emit') {
      c.fillStyle = `rgba(255,214,160,${glow})`
      c.fillRect(this.X(x), this.Y(y + h), w * this.s, h * this.s)
      return
    }
    this.fill(x, y, w, h, color, 0.9)
    if (this.layer === 'color') {
      const g = c.createLinearGradient(0, this.Y(y + h), 0, this.Y(y))
      g.addColorStop(0, 'rgba(0,0,0,0.45)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = g
      c.fillRect(this.X(x), this.Y(y + h), w * this.s, h * this.s)
    }
  }

  /** 拱形开口（拱廊） */
  archOpening(x: number, y: number, w: number, h: number, color = '#2a2d31', glow = 0.35) {
    const c = this.ctx
    const r = w / 2
    c.save()
    c.beginPath()
    c.moveTo(this.X(x), this.Y(y))
    c.lineTo(this.X(x), this.Y(y + h - r))
    c.arc(this.X(x + r), this.Y(y + h - r), r * this.s, Math.PI, 0)
    c.lineTo(this.X(x + w), this.Y(y))
    c.closePath()
    c.clip()
    this.opening(x, y, w, h, color, glow)
    c.restore()
  }

  /** 栏杆（竖杆 + 扶手） */
  railing(x: number, y: number, w: number, h: number, color: string, step = 0.15) {
    if (this.layer === 'emit') return
    this.fill(x, y + h - 0.06, w, 0.06, color, 0.4, 0.5)
    for (let px = x; px < x + w; px += step) this.fill(px, y, 0.025, h, color, 0.4, 0.5)
  }

  /** 竖向红色对联条幅 */
  banner(x: number, y: number, w: number, h: number, text: string, bg = '#c8231d', fg = '#ffd76a') {
    this.fill(x, y, w, h, bg, 0.9)
    if (this.layer !== 'color') return
    const c = this.ctx
    c.fillStyle = fg
    const fs = Math.min(w * 0.75, h / text.length) * this.s
    c.font = `bold ${fs}px "Noto Serif SC","Songti SC","SimSun","WenQuanYi Zen Hei",serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const step = h / text.length
    ;[...text].forEach((ch, i) => c.fillText(ch, this.X(x + w / 2), this.Y(y + h - step * (i + 0.5))))
  }

  text(
    str: string,
    x: number,
    y: number,
    size: number,
    color: string,
    o: { font?: string; align?: CanvasTextAlign; weight?: string; glow?: boolean; spacing?: number } = {},
  ) {
    const c = this.ctx
    if (this.layer === 'pbr') return
    if (this.layer === 'emit' && !o.glow) return
    c.fillStyle = this.layer === 'emit' ? '#ffe0a0' : color
    c.font = `${o.weight ?? 'bold'} ${size * this.s}px ${o.font ?? '"Noto Serif SC","Songti SC","SimSun","WenQuanYi Zen Hei",serif'}`
    c.textAlign = o.align ?? 'center'
    c.textBaseline = 'middle'
    if (o.spacing) {
      const chars = [...str]
      const total = (chars.length - 1) * o.spacing
      chars.forEach((ch, i) => c.fillText(ch, this.X(x - total / 2 + i * o.spacing!), this.Y(y)))
    } else c.fillText(str, this.X(x), this.Y(y))
  }

  /** 竖向渐变阴影（墙脚 AO、檐下阴影） */
  shade(x: number, y: number, w: number, h: number, fromTop: boolean, alpha = 0.25) {
    if (this.layer !== 'color') return
    const c = this.ctx
    const g = c.createLinearGradient(0, this.Y(y + h), 0, this.Y(y))
    g.addColorStop(fromTop ? 0 : 1, `rgba(0,0,0,${alpha})`)
    g.addColorStop(fromTop ? 1 : 0, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(this.X(x), this.Y(y + h), w * this.s, h * this.s)
  }

  /** 雨渍/老化 */
  weather(x: number, y: number, w: number, h: number, amount = 0.08) {
    if (this.layer !== 'color') return
    const c = this.ctx
    const n = Math.floor(w * amount * 3)
    for (let i = 0; i < n; i++) {
      const sx = x + this.rand() * w
      const len = h * (0.1 + this.rand() * 0.5)
      const g = c.createLinearGradient(0, this.Y(y + h), 0, this.Y(y + h - len))
      g.addColorStop(0, `rgba(60,55,50,${0.05 + this.rand() * 0.06})`)
      g.addColorStop(1, 'rgba(60,55,50,0)')
      c.fillStyle = g
      c.fillRect(this.X(sx), this.Y(y + h), (0.2 + this.rand() * 0.6) * this.s, len * this.s)
    }
  }
}

export interface FacadeTextures {
  map: THREE.CanvasTexture
  pbr: THREE.CanvasTexture
  emit: THREE.CanvasTexture
}

const MAX = 4096

export function paintFacade(
  W: number,
  H: number,
  draw: (p: Painter) => void,
  opts: { ppm?: number; seed?: number; anisotropy?: number } = {},
): FacadeTextures {
  let ppm = opts.ppm ?? 24
  ppm = Math.min(ppm, MAX / W, MAX / H)
  const cw = Math.max(4, Math.round(W * ppm))
  const ch = Math.max(4, Math.round(H * ppm))
  const seed = opts.seed ?? 1
  const make = (layer: Layer) => {
    const cv = document.createElement('canvas')
    cv.width = cw
    cv.height = ch
    const ctx = cv.getContext('2d')!
    if (layer === 'pbr') {
      ctx.fillStyle = 'rgb(0,217,0)'
      ctx.fillRect(0, 0, cw, ch)
    } else if (layer === 'emit') {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, cw, ch)
    }
    draw(new Painter(ctx, layer, cw / W, W, H, seed))
    const t = new THREE.CanvasTexture(cv)
    t.anisotropy = opts.anisotropy ?? 8
    t.colorSpace = layer === 'pbr' ? THREE.NoColorSpace : THREE.SRGBColorSpace
    t.generateMipmaps = true
    t.minFilter = THREE.LinearMipmapLinearFilter
    return t
  }
  return { map: make('color'), pbr: make('pbr'), emit: make('emit') }
}
