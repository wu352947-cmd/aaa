import { useMemo } from 'react'
import * as THREE from 'three'
import { stadiumShape } from '../lib/geom'
import { solid, lampMaterial } from '../lib/materials'
import { SERIF, textTexture } from '../lib/textures'
import { Block, Selectable } from './parts'
import { RoofFlags, flagLine } from './Flags'

/** 400 米标准跑道：直道 84.39 m，内侧半径 36.5 m，8 条 1.22 m 跑道 */
const STRAIGHT = 84.39
const R_IN = 36.5
const LANE = 1.22
const R_OUT = 48
const HX = STRAIGHT / 2 + R_OUT
const HZ = R_OUT
export const TRACK_CENTER: [number, number, number] = [75, 0, 95]

function stadiumPath(c: CanvasRenderingContext2D, r: number) {
  const h = STRAIGHT / 2
  c.beginPath()
  c.moveTo(-h, -r)
  c.lineTo(h, -r)
  c.arc(h, 0, r, -Math.PI / 2, Math.PI / 2)
  c.lineTo(-h, r)
  c.arc(-h, 0, r, Math.PI / 2, (Math.PI * 3) / 2)
  c.closePath()
}

function useTrackMaterial() {
  return useMemo(() => {
    const s = 14
    const cv = document.createElement('canvas')
    cv.width = Math.round(HX * 2 * s)
    cv.height = Math.round(HZ * 2 * s)
    const c = cv.getContext('2d')!
    c.setTransform(s, 0, 0, s, HX * s, HZ * s)
    // 塑胶底色 + 颗粒
    c.fillStyle = '#b4463a'
    c.fillRect(-HX, -HZ, HX * 2, HZ * 2)
    for (let i = 0; i < 60000; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(90,20,15,0.18)' : 'rgba(230,120,100,0.12)'
      c.fillRect((Math.random() - 0.5) * HX * 2, (Math.random() - 0.5) * HZ * 2, 0.15, 0.15)
    }
    // 草坪 + 修剪条纹
    c.save()
    stadiumPath(c, R_IN - 0.1)
    c.clip()
    for (let x = -HX, k = 0; x < HX; x += 5, k++) {
      c.fillStyle = k % 2 ? '#4f9a3c' : '#5aa747'
      c.fillRect(x, -HZ, 5, HZ * 2)
    }
    for (let i = 0; i < 30000; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '30,70,20' : '140,190,90'},0.12)`
      c.fillRect((Math.random() - 0.5) * HX * 2, (Math.random() - 0.5) * HZ * 2, 0.2, 0.2)
    }
    c.restore()
    // 内突沿
    c.strokeStyle = '#f2f2ee'
    c.lineWidth = 0.3
    stadiumPath(c, R_IN)
    c.stroke()
    // 分道线
    c.lineWidth = 0.05
    for (let i = 1; i <= 8; i++) {
      stadiumPath(c, R_IN + i * LANE)
      c.stroke()
    }
    // 终点线与道次号（南侧直道）
    c.fillStyle = '#f5f5f2'
    c.fillRect(STRAIGHT / 2 - 0.05, R_IN, 0.1, 8 * LANE)
    c.font = `bold 0.9px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let i = 0; i < 8; i++) {
      c.save()
      c.translate(STRAIGHT / 2 - 2.2, R_IN + LANE * (i + 0.5))
      c.rotate(Math.PI / 2)
      c.fillText(String(i + 1), 0, 0)
      c.restore()
    }
    // 起跑线（阶梯）
    for (let i = 0; i < 8; i++) c.fillRect(-STRAIGHT / 2 + i * 3.6, -R_IN - LANE * (i + 1), 0.08, LANE)
    // 足球场线
    c.strokeStyle = 'rgba(250,250,245,0.95)'
    c.lineWidth = 0.12
    const PL = 100
    const PW = 64
    c.strokeRect(-PL / 2, -PW / 2, PL, PW)
    c.beginPath()
    c.moveTo(0, -PW / 2)
    c.lineTo(0, PW / 2)
    c.stroke()
    c.beginPath()
    c.arc(0, 0, 9.15, 0, Math.PI * 2)
    c.stroke()
    for (const sgn of [-1, 1]) {
      const gx = (sgn * PL) / 2
      c.strokeRect(Math.min(gx, gx - sgn * 16.5), -20.15, 16.5, 40.3)
      c.strokeRect(Math.min(gx, gx - sgn * 5.5), -9.15, 5.5, 18.3)
      c.beginPath()
      c.arc(gx - sgn * 11, 0, 9.15, sgn > 0 ? Math.PI - 0.93 : -0.93, sgn > 0 ? Math.PI + 0.93 : 0.93)
      c.stroke()
      c.fillStyle = '#fff'
      c.beginPath()
      c.arc(gx - sgn * 11, 0, 0.15, 0, Math.PI * 2)
      c.fill()
    }
    const map = new THREE.CanvasTexture(cv)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 16
    return new THREE.MeshStandardMaterial({ map, roughness: 0.92 })
  }, [])
}

function Goal({ x, dir }: { x: number; dir: 1 | -1 }) {
  const net = useMemo(
    () =>
      textTexture('goalnet', 128, 128, (c, w) => {
        c.clearRect(0, 0, w, w)
        c.strokeStyle = 'rgba(255,255,255,0.9)'
        c.lineWidth = 2
        for (let i = 0; i <= 8; i++) {
          c.beginPath()
          c.moveTo((i * w) / 8, 0)
          c.lineTo((i * w) / 8, w)
          c.stroke()
          c.beginPath()
          c.moveTo(0, (i * w) / 8)
          c.lineTo(w, (i * w) / 8)
          c.stroke()
        }
      }),
    [],
  )
  const netMat = useMemo(() => {
    const t = net.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 2)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide })
  }, [net])
  const white = solid('#f4f4f2', 0.4, 0.3)
  return (
    <group position={[x, 0, 0]}>
      {[-3.66, 3.66].map((z) => (
        <Block key={z} size={[0.12, 2.44, 0.12]} position={[0, 1.22, z]} material={white} />
      ))}
      <Block size={[0.12, 0.12, 7.44]} position={[0, 2.44, 0]} material={white} />
      <mesh position={[dir * 1, 1.22, 0]} rotation={[0, Math.PI / 2, dir * 0.4]} material={netMat}>
        <planeGeometry args={[7.32, 2.7]} />
      </mesh>
    </group>
  )
}

function Stands() {
  const banner = useMemo(
    () =>
      textTexture('stand-banner', 2048, 96, (c, w, h) => {
        c.fillStyle = '#c8231d'
        c.fillRect(0, 0, w, h)
        c.fillStyle = '#ffffff'
        c.font = `bold 70px ${SERIF}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        const t = [...'每天锻炼一小时　健康工作五十年　幸福生活一辈子']
        t.forEach((ch, i) => c.fillText(ch, (w * (i + 0.5)) / t.length, h / 2 + 4))
      }),
    [],
  )
  const podiumTex = useMemo(
    () =>
      textTexture('podium', 1024, 256, (c, w, h) => {
        c.fillStyle = '#f3f2ee'
        c.fillRect(0, 0, w, h)
        c.fillStyle = '#c0281f'
        c.font = `bold 92px ${SERIF}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('不忘初心　砥砺奋进', w / 2, h * 0.55)
        c.beginPath()
        c.arc(w / 2, h * 0.17, 26, 0, Math.PI * 2)
        c.fillStyle = '#c0281f'
        c.fill()
      }),
    [],
  )
  const seat = solid('#2f6a52', 0.7)
  const conc = solid('#c9c6bf', 0.85)
  const white = solid('#f2f2ef', 0.4, 0.4)
  const segs = [
    { x0: 20, x1: 66 },
    { x0: 84, x1: 130 },
  ]
  const ROWS = 9
  return (
    <group position={[0, 0, 145]}>
      {segs.map((s, si) => {
        const w = s.x1 - s.x0
        const cx = (s.x0 + s.x1) / 2
        return (
          <group key={si} position={[cx, 0, 0]}>
            {Array.from({ length: ROWS }).map((_, i) => (
              <group key={i}>
                <Block size={[w, 0.45 * (i + 1), 0.85]} position={[0, (0.45 * (i + 1)) / 2, 0.42 + i * 0.85]} material={conc} />
                <Block size={[w - 0.4, 0.14, 0.45]} position={[0, 0.45 * (i + 1) + 0.07, 0.3 + i * 0.85]} material={seat} />
              </group>
            ))}
            {/* 过道 */}
            {[-w / 4, 0, w / 4].map((ax) => (
              <Block key={ax} size={[1.2, 0.02, ROWS * 0.85]} position={[ax, 0.01 + ROWS * 0.45, (ROWS * 0.85) / 2]} color="#b9b6ae" shadow={false} />
            ))}
            {/* 顶部栏杆 + 红色标语 */}
            <Block size={[w, 1.1, 0.08]} position={[0, ROWS * 0.45 + 0.6, ROWS * 0.85 - 0.1]} material={white} />
            <mesh position={[0, ROWS * 0.45 + 0.55, ROWS * 0.85 - 0.16]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[w - 1, 0.8]} />
              <meshStandardMaterial map={banner} roughness={0.8} />
            </mesh>
            <mesh position={[0, ROWS * 0.45 + 0.55, ROWS * 0.85 - 0.04]}>
              <planeGeometry args={[w - 1, 0.8]} />
              <meshStandardMaterial map={banner} roughness={0.8} />
            </mesh>
            <RoofFlags points={flagLine(-w / 2, w / 2, ROWS * 0.45 + 1.1, ROWS * 0.85 - 0.3, Math.round(w / 4))} yaw={0.4} />
          </group>
        )
      })}
      {/* 主席台 + 白色钢桁架顶棚 */}
      <group position={[75, 0, 0]}>
        <Block size={[18, 4.2, 8]} position={[0, 2.1, 4]} material={solid('#efeee9', 0.6)} />
        <mesh position={[0, 2.3, -0.01]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[16, 3.6]} />
          <meshStandardMaterial map={podiumTex} roughness={0.6} />
        </mesh>
        {[-8.5, 8.5].map((x) =>
          [1, 7].map((z) => <Block key={`${x}${z}`} size={[0.35, 5, 0.35]} position={[x, 6.7, z]} material={white} />),
        )}
        <group position={[0, 9.4, 3.2]} rotation={[0.12, 0, 0]}>
          <Block size={[20, 0.25, 10]} material={solid('#f6f6f3', 0.5, 0.2)} />
          {Array.from({ length: 11 }).map((_, i) => (
            <Block key={i} size={[0.12, 1, 10]} position={[-10 + i * 2, -0.55, 0]} material={white} />
          ))}
          <Block size={[20, 1, 0.15]} position={[0, -0.55, -5]} material={white} />
          <Block size={[20, 1, 0.15]} position={[0, -0.55, 5]} material={white} />
        </group>
        {/* 主席台 LED 屏 */}
        <Block size={[12, 0.9, 0.15]} position={[0, 4.75, -0.05]} material={lampMaterial('#ff4630', 1.5)} />
        <Block size={[12.4, 1.1, 0.1]} position={[0, 4.75, 0.05]} color="#1c1c1c" />
      </group>
    </group>
  )
}

/** 篮球场（蓝色场地 + 红色边区） */
function Courts() {
  const W = 52
  const D = 56
  const tex = useMemo(
    () =>
      textTexture('courts', W * 16, D * 16, (c) => {
        const s = 16
        c.setTransform(s, 0, 0, s, 0, 0)
        c.fillStyle = '#9c4a3e'
        c.fillRect(0, 0, W, D)
        for (const cx of [16, 36]) {
          const x0 = cx - 7.5
          const z0 = D / 2 - 14
          c.fillStyle = '#2f6db3'
          c.fillRect(x0, z0, 15, 28)
          c.fillStyle = '#b5473b'
          c.fillRect(cx - 2.45, z0, 4.9, 5.8)
          c.fillRect(cx - 2.45, z0 + 28 - 5.8, 4.9, 5.8)
          c.strokeStyle = '#f5f5f2'
          c.lineWidth = 0.06
          c.strokeRect(x0, z0, 15, 28)
          c.beginPath()
          c.moveTo(x0, D / 2)
          c.lineTo(x0 + 15, D / 2)
          c.stroke()
          c.beginPath()
          c.arc(cx, D / 2, 1.8, 0, Math.PI * 2)
          c.stroke()
          for (const e of [0, 1]) {
            const by = e ? z0 + 28 : z0
            const sg = e ? -1 : 1
            c.strokeRect(cx - 2.45, e ? by - 5.8 : by, 4.9, 5.8)
            c.beginPath()
            c.arc(cx, by + sg * 5.8, 1.8, e ? Math.PI : 0, e ? Math.PI * 2 : Math.PI)
            c.stroke()
            c.beginPath()
            c.moveTo(cx - 6.6, by)
            c.lineTo(cx - 6.6, by + sg * 1.5)
            c.arc(cx, by + sg * 1.575, 6.75, e ? -Math.PI + 0.2 : Math.PI - 0.2, e ? -0.2 : 0.2, e ? false : true)
            c.lineTo(cx + 6.6, by)
            c.stroke()
          }
        }
        for (let i = 0; i < 20000; i++) {
          c.fillStyle = 'rgba(0,0,0,0.05)'
          c.fillRect(Math.random() * W, Math.random() * D, 0.1, 0.1)
        }
      }),
    [],
  )
  const hoopWhite = solid('#f4f4f2', 0.4, 0.2)
  const pole = solid('#2a5c9a', 0.4, 0.6)
  return (
    <group position={[-40, 0, 126]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tex} roughness={0.75} />
      </mesh>
      {[-10, 10].map((cx) =>
        [-1, 1].map((e) => (
          <group key={`${cx}${e}`} position={[cx, 0, e * 14]}>
            <Block size={[0.2, 3.2, 0.2]} position={[0, 1.6, e * 1.2]} material={pole} />
            <Block size={[0.15, 0.15, 1.3]} position={[0, 3.2, e * 0.6]} material={pole} />
            <Block size={[1.8, 1.05, 0.06]} position={[0, 3.35, -e * 0.05]} material={hoopWhite} />
            <mesh position={[0, 3.05, -e * 0.3]} rotation={[Math.PI / 2, 0, 0]} material={solid('#e2581f', 0.4, 0.6)}>
              <torusGeometry args={[0.23, 0.02, 6, 20]} />
            </mesh>
          </group>
        )),
      )}
    </group>
  )
}

/** 球场灯与操场照明灯杆 */
function FloodLights() {
  const pts: [number, number][] = [
    [0, 52],
    [150, 52],
    [0, 138],
    [150, 138],
  ]
  return (
    <group>
      {pts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 11, 0]} material={solid('#9da3a8', 0.4, 0.8)} castShadow>
            <cylinderGeometry args={[0.15, 0.25, 22, 8]} />
          </mesh>
          <Block size={[2.4, 1.2, 0.3]} position={[0, 22, 0]} material={lampMaterial('#f6f4ff', 4)} />
        </group>
      ))}
    </group>
  )
}

export function Sports() {
  const trackMat = useTrackMaterial()
  const trackGeo = useMemo(() => {
    const g = new THREE.ShapeGeometry(stadiumShape(STRAIGHT, R_OUT), 64)
    const pos = g.getAttribute('position')
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + HX) / (2 * HX), (pos.getY(i) + HZ) / (2 * HZ))
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return (
    <group>
      <Selectable id="track">
        <group position={TRACK_CENTER}>
          <mesh geometry={trackGeo} material={trackMat} position={[0, 0.04, 0]} receiveShadow />
          <Goal x={-50} dir={-1} />
          <Goal x={50} dir={1} />
        </group>
        <Stands />
        <FloodLights />
      </Selectable>
      <Selectable id="banyan">
        <Courts />
      </Selectable>
    </group>
  )
}
