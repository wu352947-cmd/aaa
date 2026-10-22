import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { film } from './clock'
import { CARDS, COUNTER, COUNTER_SPAN, studio, type Card } from './script'
import { shotAt } from './Director'
import { scareFace } from '../game/face'

/**
 * 字幕层：遮幅、黑场、闪脸、字幕卡、存活计数——全部画进一张贴在镜头前的画布，
 * 与画面一起经过噪点、色差等后期，质感统一。
 */

/** 剪辑点的黑场（硬切、一帧黑、尖叫后的断电） */
const BLACKS: [number, number][] = [
  [32.1, 33.6],
  [75.45, 75.9],
  [107.93, 108.03],
  [110.93, 111.03],
  [113.93, 114.03],
  [129.95, 132.2],
  [160.95, 162],
]
/** 渐显 / 渐隐：[开始, 结束, 起始黑度, 终止黑度] */
const FADES: [number, number, number, number][] = [
  [9, 11, 1, 0],
  [39, 40.4, 1, 0],
  [132.2, 133.4, 1, 0],
  [170, 172.5, 1, 0],
  [185.2, 187, 0, 1],
]
const FLASHES: [number, number, 'ripper' | 'girl'][] = [
  [101, 101.12, 'girl'],
  [129.55, 129.95, 'ripper'],
  [160.6, 160.95, 'ripper'],
]

const FONT = {
  brush: '"Zhi Mang Xing","Noto Serif SC",serif',
  serif: '"Noto Serif SC","Songti SC",serif',
  old: '"IM Fell English","Noto Serif SC",serif',
  mono: '"IBM Plex Mono",ui-monospace,monospace',
}

function alphaOf(c: Card, t: number) {
  const fin = c.style === 'title' ? 1.2 : c.style === 'whisper' ? 1.4 : 0.5
  const fout = c.style === 'epigraph' ? 1.5 : 0.6
  return Math.min(1, (t - c.start) / fin, (c.end - t) / fout)
}

function spaced(c: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'center' | 'left' = 'center') {
  const chars = [...text]
  const widths = chars.map((ch) => c.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let cx = align === 'center' ? x - total / 2 : x
  c.textAlign = 'left'
  chars.forEach((ch, i) => {
    c.fillText(ch, cx, y)
    cx += widths[i] + spacing
  })
}

function drawCard(c: CanvasRenderingContext2D, card: Card, t: number, W: number, H: number, bar: number) {
  const a = Math.max(0, alphaOf(card, t))
  if (a <= 0) return
  const S = studio()
  const zh = card.zh.split('{STUDIO}').join(S)
  const en = (card.en ?? '').split('{STUDIO}').join(S.toUpperCase())
  const u = H / 1080
  c.save()
  c.globalAlpha = a
  c.textBaseline = 'middle'
  switch (card.style) {
    case 'whisper': {
      // 像接触不良的日光灯一样闪烁着亮起
      const flick = t - card.start < 1.2 && Math.random() < 0.35 ? 0.2 : 1
      c.globalAlpha = a * flick
      c.fillStyle = '#d9d2c6'
      c.font = `400 ${34 * u}px ${FONT.serif}`
      const y = card.zh.startsWith('皆') ? H * 0.53 : H * 0.45
      spaced(c, zh, W / 2, y, 14 * u)
      c.font = `400 ${17 * u}px ${FONT.mono}`
      c.fillStyle = '#8f877c'
      spaced(c, en, W / 2, y + 44 * u, 7 * u)
      break
    }
    case 'title': {
      const k = THREE.MathUtils.clamp((t - card.start) / 5, 0, 1)
      const scale = 1 + k * 0.06
      c.translate(W / 2, H * 0.46)
      c.scale(scale, scale)
      c.shadowColor = 'rgba(200,0,0,0.6)'
      c.shadowBlur = 40 * u
      c.fillStyle = '#c4130d'
      c.font = `400 ${210 * u}px ${FONT.brush}`
      spaced(c, zh, 0, 0, 24 * u)
      c.shadowBlur = 0
      // 血滴
      c.fillStyle = '#7d0806'
      for (let i = 0; i < 9; i++) {
        const x = (-0.38 + (i * 0.76) / 8 + Math.sin(i * 7.1) * 0.02) * W * 0.62
        const len = (20 + ((i * 37) % 60)) * u * Math.min(1, (t - card.start) * 0.6)
        c.fillRect(x, 70 * u, 3 * u, len)
        c.beginPath()
        c.arc(x + 1.5 * u, 70 * u + len, 3.4 * u, 0, Math.PI * 2)
        c.fill()
      }
      c.fillStyle = '#e8ddd0'
      c.font = `400 ${30 * u}px ${FONT.old}`
      spaced(c, en, 0, 160 * u, 12 * u)
      break
    }
    case 'pa': {
      // 广播字幕：压在下遮幅里
      const y0 = H - bar / 2 - 18 * u
      c.textAlign = 'center'
      c.fillStyle = '#f1e9dc'
      c.font = `500 ${30 * u}px ${FONT.serif}`
      const n = Math.ceil(((t - card.start) / 1.2) * [...zh].length)
      c.fillText([...zh].slice(0, n).join(''), W / 2, y0)
      c.font = `italic 400 ${23 * u}px ${FONT.old}`
      c.fillStyle = '#d6cbb9'
      c.fillText(en, W / 2, y0 + 36 * u)
      break
    }
    case 'loc': {
      // 打字机
      const n = Math.floor((t - card.start) * 18)
      c.textAlign = 'left'
      c.fillStyle = '#e9e1d4'
      c.font = `500 ${24 * u}px ${FONT.mono}`
      const x = W * 0.06
      const y = bar + 54 * u
      c.fillText([...zh].slice(0, n).join('') + (Math.floor(t * 3) % 2 ? '▌' : ''), x, y)
      c.fillStyle = '#9b9083'
      c.font = `400 ${16 * u}px ${FONT.mono}`
      c.fillText(en.slice(0, Math.max(0, n * 2 - 8)), x, y + 32 * u)
      break
    }
    case 'chapter': {
      c.fillStyle = '#efe6d8'
      c.font = `400 ${56 * u}px ${FONT.brush}`
      spaced(c, zh, W / 2, H * 0.5, 18 * u)
      c.font = `400 ${18 * u}px ${FONT.mono}`
      c.fillStyle = '#a99c8a'
      spaced(c, en, W / 2, H * 0.5 + 56 * u, 8 * u)
      break
    }
    case 'epigraph': {
      c.fillStyle = '#ece4d6'
      c.font = `400 ${40 * u}px ${FONT.serif}`
      spaced(c, zh, W / 2, H * 0.47, 10 * u)
      c.font = `italic 400 ${24 * u}px ${FONT.old}`
      c.fillStyle = '#a2988a'
      spaced(c, en, W / 2, H * 0.47 + 58 * u, 4 * u)
      break
    }
    case 'credit': {
      const [role, ...name] = zh.split('　')
      const x = W * 0.08
      const y = H * 0.62
      c.textAlign = 'left'
      c.fillStyle = '#c7cfdb'
      c.font = `400 ${18 * u}px ${FONT.mono}`
      spaced(c, en.replace(S.toUpperCase(), '').trim(), x, y - 40 * u, 5 * u, 'left')
      c.fillStyle = '#f2f4f8'
      c.font = `400 ${26 * u}px ${FONT.serif}`
      spaced(c, role, x, y, 8 * u, 'left')
      c.font = `400 ${64 * u}px ${FONT.old}`
      c.fillText(name.join(' ').trim(), x, y + 62 * u)
      break
    }
    case 'final': {
      c.fillStyle = '#f2f4f8'
      c.font = `400 ${34 * u}px ${FONT.serif}`
      spaced(c, zh, W / 2, H * 0.47, 6 * u)
      c.font = `400 ${19 * u}px ${FONT.mono}`
      c.fillStyle = '#b8c2d0'
      spaced(c, en, W / 2, H * 0.47 + 48 * u, 6 * u)
      break
    }
  }
  c.restore()
}

export function Titles() {
  const { size } = useThree()
  const aspect = size.width / size.height
  const { canvas, tex, W, H } = useMemo(() => {
    const W = 1920
    const H = Math.round(W / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    return { canvas, tex, W, H }
  }, [aspect])
  const mesh = useRef<THREE.Mesh>(null)
  const faces = useMemo(() => {
    const load = (v: 'ripper' | 'girl') => {
      const img = new Image()
      img.src = scareFace(v, 1024)
      return img
    }
    return { ripper: load('ripper'), girl: load('girl') }
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  const lastCount = useRef(13)
  const countFlash = useRef(0)

  useFrame(({ camera }) => {
    const m = mesh.current
    if (!m) return
    const cam = camera as THREE.PerspectiveCamera
    const d = 1
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * d
    m.position.copy(cam.position)
    m.quaternion.copy(cam.quaternion)
    m.translateZ(-d)
    m.scale.set(h * aspect, h, 1)

    const t = film.t
    const c = canvas.getContext('2d')!
    c.clearRect(0, 0, W, H)
    const shot = shotAt(t)
    // 黑场与渐变
    let black = shot.black ? 1 : 0
    for (const [a, b] of BLACKS) if (t >= a && t < b) black = 1
    for (const [a, b, from, to] of FADES) if (t >= a && t < b) black = Math.max(black, from + (to - from) * ((t - a) / (b - a)))
    if (black > 0) {
      c.fillStyle = `rgba(0,0,0,${black})`
      c.fillRect(0, 0, W, H)
    }
    // 闪脸
    for (const [a, b, v] of FLASHES)
      if (t >= a && t < b) {
        const img = faces[v]
        if (img.complete) {
          const s = 1.05 + Math.random() * 0.2
          const iw = W * s
          const ih = iw
          c.save()
          c.globalAlpha = 0.8 + Math.random() * 0.2
          c.drawImage(img, (W - iw) / 2 + (Math.random() - 0.5) * 60, (H - ih) / 2 + (Math.random() - 0.5) * 40, iw, ih)
          c.restore()
        }
      }
    // 2.39:1 遮幅
    const bar = Math.max(0, (H - W / 2.39) / 2)
    c.fillStyle = '#000'
    c.fillRect(0, 0, W, bar)
    c.fillRect(0, H - bar, W, bar)

    for (const card of CARDS) if (t >= card.start && t < card.end) drawCard(c, card, t, W, H, bar)

    // 存活人数
    if (t >= COUNTER_SPAN[0] && t < COUNTER_SPAN[1] && black < 0.5) {
      let n = 13
      for (const [at, v] of COUNTER) if (t >= at) n = v
      if (n !== lastCount.current) {
        lastCount.current = n
        countFlash.current = t
      }
      const u = H / 1080
      const fl = t - countFlash.current < 0.6
      c.save()
      c.textAlign = 'right'
      c.textBaseline = 'alphabetic'
      c.font = `400 ${15 * u}px ${FONT.mono}`
      c.fillStyle = '#9d9284'
      c.fillText('存活 · SURVIVORS', W * 0.94, bar + 46 * u)
      c.font = `400 ${72 * u}px ${FONT.old}`
      c.fillStyle = fl ? (Math.random() < 0.5 ? '#ff2a1a' : '#ffffff') : '#e8dfd2'
      c.fillText(String(n).padStart(2, '0'), W * 0.94 + (fl ? (Math.random() - 0.5) * 10 : 0), bar + 120 * u)
      c.restore()
    }
    tex.needsUpdate = true
  })

  return (
    <mesh ref={mesh} renderOrder={999} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  )
}
