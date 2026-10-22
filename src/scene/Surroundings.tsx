import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { paintFacade, type Painter } from '../lib/painter'
import { facadeMaterial, solid } from '../lib/materials'
import { hipRoofGeometry } from '../lib/geom'
import { makeNoise2D, mulberry32 } from '../lib/random'
import { roofTiles } from '../lib/textures'

/* ---------------- 周边住宅高层（实拍背景中密集的白色塔楼） ---------------- */

function drawResidential(p: Painter, W: number, H: number, tone: string) {
  p.fill(0, 0, W, H, tone, 0.75)
  const floors = Math.floor(H / 2.95)
  const bays = Math.max(2, Math.round(W / 3.4))
  const bw = W / bays
  for (let f = 1; f < floors; f++)
    for (let b = 0; b < bays; b++) {
      const y = f * 2.95
      if (b % 3 === 1) {
        p.glass(b * bw + 0.3, y + 0.2, bw - 0.6, 2.2, { tint: '#55697c', frame: '#cfd3d6', cols: 3, litChance: 0.35, curtains: true })
        p.fill(b * bw + 0.1, y + 0.05, bw - 0.2, 0.9, '#e4e3df')
      } else p.glass(b * bw + 0.6, y + 0.8, bw - 1.2, 1.5, { tint: '#55697c', frame: '#d6d8da', cols: 2, litChance: 0.3 })
    }
  // 竖向装饰线条
  for (let b = 0; b <= bays; b += 3) p.fill(b * bw - 0.3, 0, 0.6, H, '#d0cfca', 0.7)
  p.fill(0, H - 3, W, 3, '#bfc3c7', 0.6)
  p.fill(0, 0, W, 3, '#9b9a95', 0.8)
  p.weather(0, 0, W, H, 0.1)
}

function drawLowRes(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, '#dcd8cf', { tw: 0.3, th: 0.1, jitter: 0.05 })
  const floors = 5
  const bays = Math.round(W / 3.6)
  const bw = W / bays
  for (let f = 0; f < floors; f++)
    for (let b = 0; b < bays; b++) {
      const y = 0.5 + f * 2.9
      p.glass(b * bw + 0.5, y + 0.6, bw - 1, 1.6, { tint: '#53687a', frame: '#e6e6e2', cols: 2, litChance: 0.4 })
      if (b % 2 === 0) p.railing(b * bw + 0.3, y + 0.5, bw - 0.6, 0.9, '#9aa0a5', 0.12)
    }
  p.weather(0, 0, W, H, 0.15)
}

interface Proto {
  size: [number, number, number]
  mats: THREE.Material[]
  roof?: THREE.BufferGeometry
}

function useProtos(): Proto[] {
  return useMemo(() => {
    const mk = (W: number, H: number, D: number, tone: string, seed: number): Proto => {
      const f = facadeMaterial(paintFacade(W, H, (p) => drawResidential(p, W, H, tone), { ppm: 6, seed }), { glow: 1.2 })
      const s = facadeMaterial(paintFacade(D, H, (p) => drawResidential(p, D, H, tone), { ppm: 6, seed: seed + 1 }), { glow: 1.2 })
      const roof = solid('#b4b2ad', 0.9)
      return { size: [W, H, D], mats: [s, s, roof, roof, f, f] }
    }
    const low = (W: number, D: number): Proto => {
      const H = 15
      const f = facadeMaterial(paintFacade(W, H, (p) => drawLowRes(p, W, H), { ppm: 10, seed: 301 }), { glow: 1.2 })
      const s = facadeMaterial(paintFacade(D, H, (p) => drawLowRes(p, D, H), { ppm: 10, seed: 302 }), { glow: 1.2 })
      const roof = solid('#8d8b86', 0.9)
      const r = hipRoofGeometry(W + 1.2, D + 1.2, 3.6)
      r.translate(0, H, 0)
      return { size: [W, H, D], mats: [s, s, roof, roof, f, f], roof: r }
    }
    return [mk(28, 96, 18, '#eceae4', 201), mk(22, 72, 22, '#e6e4de', 211), mk(44, 54, 15, '#f0eee9', 221), mk(26, 84, 20, '#dfe1e3', 231), low(46, 13)]
  }, [])
}

function ProtoInstances({ proto, items }: { proto: Proto; items: { x: number; z: number; rot: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const roofRef = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(...proto.size)
    g.translate(0, proto.size[1] / 2, 0)
    return g
  }, [proto])
  const roofMat = useMemo(() => {
    const t = roofTiles('#6f7378', 'roofGray').clone()
    t.needsUpdate = true
    t.repeat.set(8, 3)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot)
      m.compose(new THREE.Vector3(it.x, 0, it.z), q, new THREE.Vector3(1, 1, 1))
      ref.current!.setMatrixAt(i, m)
      roofRef.current?.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
    if (roofRef.current) {
      roofRef.current.instanceMatrix.needsUpdate = true
      roofRef.current.computeBoundingSphere()
    }
  }, [items])
  return (
    <group>
      <instancedMesh ref={ref} args={[geo, proto.mats, items.length]} castShadow receiveShadow />
      {proto.roof && <instancedMesh ref={roofRef} args={[proto.roof, roofMat, items.length]} castShadow receiveShadow />}
    </group>
  )
}

function City() {
  const protos = useProtos()
  const sets = useMemo(() => {
    const r = mulberry32(77)
    const towers: { x: number; z: number; rot: number }[][] = [[], [], [], []]
    const place = (x: number, z: number, k: number, rot = 0) => towers[k].push({ x, z, rot })
    // 北侧：主楼背后的高层住宅群
    for (let i = 0; i < 9; i++) place(-170 + i * 46 + (r() - 0.5) * 8, -205 - (i % 2) * 48 - r() * 10, i % 4)
    for (let i = 0; i < 8; i++) place(-150 + i * 52 + (r() - 0.5) * 10, -320 - r() * 40, (i + 1) % 4)
    // 东侧
    for (let i = 0; i < 7; i++) place(240 + (i % 2) * 52, -140 + i * 62 + (r() - 0.5) * 10, (i + 2) % 4, Math.PI / 2)
    for (let i = 0; i < 6; i++) place(350 + (i % 2) * 40, -200 + i * 80, i % 4, Math.PI / 2)
    // 南侧远处
    for (let i = 0; i < 7; i++) place(-120 + i * 60, 330 + (i % 2) * 40, (i + 3) % 4)
    const low: { x: number; z: number; rot: number }[] = []
    // 南侧坡屋顶多层住宅（操场看台后）
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) low.push({ x: -150 + i * 56 + row * 10, z: 212 + row * 30, rot: 0 })
    return { towers, low }
  }, [])
  return (
    <group>
      {sets.towers.map((items, k) => (
        <ProtoInstances key={k} proto={protos[k]} items={items} />
      ))}
      <ProtoInstances proto={protos[4]} items={sets.low} />
    </group>
  )
}

/* ---------------- 远山（福州连江一带的丘陵） ---------------- */
function Mountains() {
  const geo = useMemo(() => {
    const n = makeNoise2D(9)
    const SEG = 260
    const RINGS = 16
    const R0 = 900
    const R1 = 3400
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const near = new THREE.Color('#4f6b4a')
    const far = new THREE.Color('#6d8197')
    for (let j = 0; j <= RINGS; j++) {
      const t = j / RINGS
      const rr = R0 + (R1 - R0) * t
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2
        const env = Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.8
        // 北、西北方向山更高（实拍远景的山脊）
        const dirBoost = 0.65 + 0.55 * Math.max(0, -Math.sin(a + 0.4))
        const h = env * dirBoost * (n.fbm(Math.cos(a) * 3 + t * 2, Math.sin(a) * 3 + t * 2, 6) * 2 - 0.35) * 520
        const x = Math.cos(a) * rr
        const z = Math.sin(a) * rr
        pos.push(x, Math.max(-10, h), z)
        const c = near.clone().lerp(far, t)
        c.multiplyScalar(0.85 + 0.25 * Math.min(1, Math.max(0, h / 400)))
        col.push(c.r, c.g, c.b)
      }
    }
    for (let j = 0; j < RINGS; j++)
      for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i
        const b = a + SEG + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}

/** 远处山头上的古塔（第 7 张实拍中可见） */
function Pagoda() {
  const stone = solid('#cfc8b8', 0.9)
  const roof = solid('#5b5d5f', 0.8)
  return (
    <group position={[-620, 0, -980]}>
      <mesh position={[0, 60, 0]} material={solid('#4d6a45', 1)}>
        <coneGeometry args={[260, 120, 24]} />
      </mesh>
      <group position={[0, 112, 0]} scale={1.6}>
        {Array.from({ length: 7 }).map((_, i) => (
          <group key={i} position={[0, i * 3.4, 0]}>
            <mesh material={stone} position={[0, 1.5, 0]}>
              <cylinderGeometry args={[3.2 - i * 0.3, 3.4 - i * 0.3, 3, 8]} />
            </mesh>
            <mesh material={roof} position={[0, 3.1, 0]}>
              <cylinderGeometry args={[3.2 - i * 0.3, 4.4 - i * 0.3, 0.6, 8]} />
            </mesh>
          </group>
        ))}
        <mesh material={roof} position={[0, 25, 0]}>
          <coneGeometry args={[1.2, 3, 8]} />
        </mesh>
      </group>
    </group>
  )
}

export function Surroundings() {
  return (
    <group>
      <City />
      <Mountains />
      <Pagoda />
    </group>
  )
}
