import { useMemo } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import type { Painter } from '../../lib/painter'
import { solid } from '../../lib/materials'
import { SERIF, textTexture } from '../../lib/textures'
import { Block, FacadeBox, Parapet, RoofClutter, Selectable, useFacade, useTiledTexture } from '../parts'
import { RoofFlags, flagLine } from '../Flags'

/* ---------------- 食堂：浅绿弧形屋面 ---------------- */
function drawCanteen(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, '#e5ab8d', { tw: 0.22, th: 0.07, jitter: 0.08 })
  p.glass(1, 0.4, W - 2, 3.2, { tint: '#355a55', frame: '#ecebe6', cols: Math.round(W / 1.8), litChance: 0.9, curtains: false })
  p.fill(0, 3.9, W, 0.5, '#f3efe6')
  p.glass(1, 5, W - 2, 2.6, { tint: '#3f6b66', frame: '#ecebe6', cols: Math.round(W / 1.8), litChance: 0.8, curtains: false })
  p.fill(0, H - 0.8, W, 0.8, '#f3efe6')
  p.shade(0, 0, W, 1, false, 0.25)
}

export function Canteen() {
  const long = useFacade(40, 9, (p) => drawCanteen(p, 40, 9), 71)
  const short = useFacade(36, 9, (p) => drawCanteen(p, 36, 9), 72)
  const ribs = useTiledTexture(
    (c, s) => {
      c.fillStyle = '#86bba6'
      c.fillRect(0, 0, s, s)
      for (let i = 0; i < 16; i++) {
        c.fillStyle = 'rgba(255,255,255,0.22)'
        c.fillRect((i * s) / 16, 0, 3, s)
        c.fillStyle = 'rgba(0,40,30,0.15)'
        c.fillRect((i * s) / 16 + 3, 0, 2, s)
      }
    },
    256,
    [6, 1],
  )
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ map: ribs, roughness: 0.4, metalness: 0.45 }), [ribs])
  const roofGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-19.5, 0)
    s.quadraticCurveTo(0, 7, 19.5, 0)
    s.lineTo(19.5, -0.5)
    s.lineTo(-19.5, -0.5)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 42, bevelEnabled: false, curveSegments: 32 })
    g.translate(0, 0, -21)
    g.rotateY(Math.PI / 2)
    // 让条纹沿坡向
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 40, uv.getY(i) / 40)
    return g
  }, [])
  return (
    <Selectable id="canteen">
      <FacadeBox size={[40, 9, 36]} position={[-42, 0, 70]} front={long} back={long} left={short} right={short} />
      <mesh geometry={roofGeo} material={roofMat} position={[-42, 9.5, 70]} castShadow receiveShadow />
    </Selectable>
  )
}

/* ---------------- 致远楼：图书馆 + 办公，“书”形屋顶 ---------------- */
function drawLibrary(p: Painter, W: number, H: number) {
  p.fill(0, 0, W, H, '#e4e2dc', 0.6)
  p.lines(0, 0, W, H, '#c9c7c0', 1.6, 0.8, 0.02)
  const n = Math.floor(W / 3.2)
  for (let i = 0; i < n; i++) p.glass(1 + i * ((W - 2) / n) + 0.4, 1, (W - 2) / n - 0.8, H - 4, { tint: '#3d5f7d', frame: '#6b7076', rows: 7, cols: 1, litChance: 0.6, reflect: 0.7 })
  p.text('致 远 楼', W / 2, H - 1.4, 1.2, '#7a2a20', { glow: true })
  p.shade(0, 0, W, 1.2, false, 0.2)
}

export function Library() {
  const f = useFacade(26, 24, (p) => drawLibrary(p, 26, 24), 81)
  const s = useFacade(32, 24, (p) => drawLibrary(p, 32, 24), 82)
  const white = solid('#f1f0ec', 0.5, 0.1)
  return (
    <Selectable id="zhiyuan">
      <FacadeBox size={[26, 24, 32]} position={[-75, 0, -16]} front={f} back={f} left={s} right={s} />
      {/* 翻开的书页 */}
      {[-1, 1].map((k) => (
        <group key={k} position={[-75 + k * 6.6, 25.3, -16]} rotation={[0, 0, k * 0.2]}>
          <Block size={[13.8, 0.5, 33]} material={white} />
          <Block size={[13.8, 0.12, 32.6]} position={[0, -0.3, 0]} color="#d9d6cf" />
        </group>
      ))}
      <Block size={[1, 1.6, 33]} position={[-75, 24.6, -16]} material={white} />
    </Selectable>
  )
}

/* ---------------- 宿舍：宁逸楼、静逸楼 ---------------- */
function drawDorm(p: Painter, W: number, H: number, floors: number, balcony: boolean) {
  p.tiles(0, 0, W, H, '#efede7', { tw: 0.24, th: 0.08, jitter: 0.03 })
  const bays = Math.round(W / 3.9)
  const bw = W / bays
  for (let b = 0; b < bays; b++)
    for (let f = 0; f < floors; f++) {
      const y = 0.4 + f * 3.2
      if (f === 0) {
        p.opening(b * bw + 0.5, 0, bw - 1, 2.8, '#3a3d40', 0.35)
        continue
      }
      if (balcony) {
        p.glass(b * bw + 0.5, y, bw - 1, 2.5, { tint: '#46617a', frame: '#dcdcd8', cols: 3, litChance: 0.65 })
        p.fill(b * bw + 0.3, y - 0.2, bw - 0.6, 1.05, '#d7d5ce')
        p.railing(b * bw + 0.3, y + 0.85, bw - 0.6, 0.35, '#9aa3ab', 0.12)
        // 晾晒的衣物
        if (p.rand() < 0.35) p.fill(b * bw + 0.8 + p.rand() * 1.5, y + 1.3, 0.5, 0.7, ['#4b78c4', '#f2f2f2', '#c84b4b', '#e6c24a'][Math.floor(p.rand() * 4)])
      } else p.glass(b * bw + 1, y + 0.6, bw - 2, 1.6, { tint: '#46617a', frame: '#dcdcd8', cols: 2, litChance: 0.55 })
    }
  p.weather(0, 0, W, H, 0.12)
  p.shade(0, 0, W, 1, false, 0.2)
}

function Dorm({ position, name, seed }: { position: [number, number, number]; name: string; seed: number }) {
  const W = 62
  const H = 27
  const front = useFacade(W, H, (p) => drawDorm(p, W, H, 8, true), seed)
  const back = useFacade(W, H, (p) => drawDorm(p, W, H, 8, false), seed + 1)
  const side = useFacade(15, H, (p) => drawDorm(p, 15, H, 8, false), seed + 2)
  const sign = useMemo(
    () =>
      textTexture(`dorm-${name}`, 512, 128, (c, w, h) => {
        c.fillStyle = 'rgba(0,0,0,0)'
        c.clearRect(0, 0, w, h)
        c.fillStyle = '#b3261e'
        c.font = `bold 96px ${SERIF}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(name, w / 2, h / 2)
      }),
    [name],
  )
  return (
    <group position={position}>
      <FacadeBox size={[W, H, 15]} front={front} back={back} left={side} right={side} />
      {Array.from({ length: 7 }).map((_, f) => (
        <Block key={f} size={[W, 0.2, 1.2]} position={[0, 3.6 + f * 3.2, 8]} color="#e6e4de" />
      ))}
      <Parapet w={W} d={15} y={H} h={1} color="#e9e7e1" />
      <Block size={[6, 3, 4]} position={[18, H + 1.5, -2]} color="#dad8d2" />
      <mesh position={[0, H + 2.4, 7.4]}>
        <planeGeometry args={[10, 2.5]} />
        <meshStandardMaterial map={sign} transparent roughness={0.6} />
      </mesh>
      <RoofClutter w={W} d={15} y={H} seed={seed} />
    </group>
  )
}

export function Dorms() {
  return (
    <Selectable id="dorm">
      <Dorm position={[-122, 0, -88]} name="宁逸楼" seed={91} />
      <Dorm position={[-122, 0, -52]} name="静逸楼" seed={95} />
    </Selectable>
  )
}

/* ---------------- 规划中的科学楼（半透明体量） ---------------- */
export function PlannedScience() {
  return (
    <group position={[-70, 0, -92]}>
      <mesh position={[0, 11.5, 0]}>
        <boxGeometry args={[28, 23, 20]} />
        <meshPhysicalMaterial color="#cfe6ff" transparent opacity={0.28} roughness={0.1} metalness={0.1} depthWrite={false} />
        <Edges color="#e8f4ff" threshold={15} />
      </mesh>
      {[1, 2, 3, 4, 5].map((f) => (
        <mesh key={f} position={[0, f * 3.8, 0]}>
          <boxGeometry args={[28, 0.05, 20]} />
          <meshBasicMaterial color="#e8f4ff" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 东校门 ---------------- */
export function Gate() {
  const plaque = useMemo(
    () =>
      textTexture('gate-plaque', 2048, 256, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h)
        g.addColorStop(0, '#8b8e90')
        g.addColorStop(1, '#6f7275')
        c.fillStyle = g
        c.fillRect(0, 0, w, h)
        for (let i = 0; i < 3000; i++) {
          c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`
          c.fillRect(Math.random() * w, Math.random() * h, 3, 3)
        }
        c.fillStyle = '#e8d9a8'
        c.font = `bold 150px ${SERIF}`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        const t = [...'福建省连江第一中学']
        t.forEach((ch, i) => c.fillText(ch, w * 0.08 + (i * w * 0.84) / (t.length - 1), h / 2 + 6))
      }),
    [],
  )
  const plaqueMat = useMemo(() => new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.35, metalness: 0.2, emissive: '#000' }), [plaque])
  const white = solid('#f0eee8', 0.55)
  const glass = solid('#3c6688', 0.06, 0.8)
  return (
    <Selectable id="gate" position={[174, 0, -26]}>
      {/* 北侧门墙 + 铭牌 */}
      <Block size={[3, 6.2, 20]} position={[0, 3.1, -19]} material={white} />
      <Block size={[3.4, 0.5, 20.4]} position={[0, 6.45, -19]} material={solid('#d9d6cf', 0.6)} />
      <mesh position={[1.52, 3.6, -19]} rotation={[0, Math.PI / 2, 0]} material={plaqueMat}>
        <planeGeometry args={[17, 2.1]} />
      </mesh>
      {/* 南侧门卫室：玻璃盒 */}
      <Block size={[7, 4.2, 12]} position={[-1.5, 2.1, 16]} material={white} />
      <Block size={[0.2, 3, 10]} position={[2.05, 2.1, 16]} material={glass} />
      <Block size={[8.5, 0.6, 13.5]} position={[-1.5, 4.5, 16]} material={white} />
      {/* 电动伸缩门 */}
      <Block size={[0.6, 1.5, 12]} position={[0.5, 0.75, 3.5]} color="#a7acb1" rough={0.3} metal={0.8} />
      <Block size={[0.4, 0.15, 19]} position={[0.5, 0.02, 0]} color="#2c2c2c" />
      {/* 门前铺装 */}
      <Block size={[16, 0.04, 44]} position={[6, 0.02, 0]} color="#bdb8ae" shadow={false} />
      <RoofFlags points={flagLine(-27, -11, 6.7, 0, 5).map(([z, y]) => [0, y, z] as [number, number, number])} yaw={-1.2} />
    </Selectable>
  )
}

/* ---------------- 校园围墙 ---------------- */
export function CampusWall() {
  const segs: { p: [number, number, number]; s: [number, number, number] }[] = []
  const X0 = -178
  const X1 = 173
  const Z0 = -128
  const Z1 = 170
  const t = 0.5
  segs.push({ p: [(X0 + X1) / 2, 0, Z0], s: [X1 - X0, 1, t] })
  segs.push({ p: [(X0 + X1) / 2, 0, Z1], s: [X1 - X0, 1, t] })
  segs.push({ p: [X0, 0, (Z0 + Z1) / 2], s: [t, 1, Z1 - Z0] })
  // 东墙在校门处断开
  segs.push({ p: [X1, 0, (Z0 + -46) / 2], s: [t, 1, -46 - Z0] })
  segs.push({ p: [X1, 0, (-12 + Z1) / 2], s: [t, 1, Z1 - -12] })
  const rail = useTiledTexture(
    (c, s) => {
      c.clearRect(0, 0, s, s)
      c.fillStyle = '#2f3438'
      c.fillRect(0, 0, s, 10)
      c.fillRect(0, s - 14, s, 14)
      for (let i = 0; i < 8; i++) c.fillRect(i * (s / 8) + s / 16 - 4, 0, 8, s)
    },
    128,
    [1, 1],
  )
  const railMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: rail, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 })
    return m
  }, [rail])
  return (
    <group>
      {segs.map((sg, i) => {
        const len = Math.max(sg.s[0], sg.s[2])
        const alongX = sg.s[0] > sg.s[2]
        const tex = railMat.clone()
        tex.map = rail.clone()
        tex.map.needsUpdate = true
        tex.map.repeat.set(len / 1.6, 1)
        return (
          <group key={i} position={sg.p}>
            <Block size={sg.s} position={[0, 0.5, 0]} color="#e3ddd2" />
            <mesh position={[0, 1.8, 0]} rotation={[0, alongX ? 0 : Math.PI / 2, 0]} material={tex}>
              <planeGeometry args={[len, 1.6]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
