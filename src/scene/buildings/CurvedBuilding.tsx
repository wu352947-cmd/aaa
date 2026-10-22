import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Painter } from '../../lib/painter'
import { solid } from '../../lib/materials'
import { mulberry32 } from '../../lib/random'
import { Block, FacadeBox, Parapet, Selectable, useFacade, useTiledTexture } from '../parts'

/**
 * 弧形阳台楼（践行楼）—— 第 5、7 张实拍：
 * 白色马赛克墙，橙色面砖弧形阳台逐层错落，阳台上摆放盆栽；南端白色圆柱楼梯塔，连廊接钟楼。
 */
const FH = 3.4
const G = 3.6
const FLOORS = 6
const H = G + FH * (FLOORS - 1) + 1.4
const LEN = 56
const BAY = 4.6

function drawFace(p: Painter, W: number, Hh: number, balconies: boolean) {
  p.mosaic(0, 0, W, Hh, '#eeeeea', 0.06)
  const bays = Math.round(W / BAY)
  const bw = W / bays
  for (let b = 0; b < bays; b++) {
    const x0 = b * bw
    p.glass(x0 + 0.6, 0.3, bw - 1.2, G - 0.9, { tint: '#3a4a58', frame: '#cfd2d4', cols: 3, litChance: 0.5 })
    for (let f = 1; f < FLOORS; f++) {
      const y0 = G + (f - 1) * FH
      if (balconies) {
        // 阳台后的推拉门 + 两侧小窗
        p.glass(x0 + bw / 2 - 1.1, y0 + 0.2, 2.2, 2.5, { tint: '#3b4f5f', frame: '#e3e3df', cols: 2, litChance: 0.55 })
        p.glass(x0 + 0.25, y0 + 1, 0.5, 1.5, { tint: '#3b4f5f', frame: '#e3e3df', cols: 1, litChance: 0.4 })
      } else p.glass(x0 + 0.9, y0 + 0.9, bw - 1.8, 1.8, { tint: '#3b4f5f', frame: '#e3e3df', cols: 2, litChance: 0.5 })
    }
  }
  p.weather(0, 0, W, Hh, 0.18)
  p.shade(0, 0, W, 1.2, false, 0.25)
}

function drawCylinder(p: Painter, W: number, Hh: number) {
  p.mosaic(0, 0, W, Hh, '#f1f1ed', 0.07)
  for (const x of [W * 0.25, W * 0.5, W * 0.75]) p.glass(x - 0.35, 2, 0.7, Hh - 6, { tint: '#2f3a44', frame: '#d8d8d4', rows: 12, cols: 1, litChance: 0.6 })
  p.fill(0, Hh - 2.6, W, 2.6, '#3a3d42', 0.5, 0.2)
  p.weather(0, 0, W, Hh, 0.2)
}

export function CurvedBuilding() {
  const face = useFacade(LEN, H, (p) => drawFace(p, LEN, H, true), 61)
  const back = useFacade(LEN, H, (p) => drawFace(p, LEN, H, false), 62)
  const end = useFacade(14, H, (p) => drawFace(p, 14, H, false), 63)
  const cyl = useFacade(28.3, 25, (p) => drawCylinder(p, 28.3, 25), 64)

  const brick = useTiledTexture(
    (c, s) => {
      const r = mulberry32(4)
      c.fillStyle = '#c8743f'
      c.fillRect(0, 0, s, s)
      const rows = 8
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < 16; i++) {
          const k = 0.88 + r() * 0.2
          c.fillStyle = `rgb(${200 * k},${118 * k},${66 * k})`
          c.fillRect(i * (s / 16) + (j % 2) * 8, j * (s / rows), s / 16 - 3, s / rows - 3)
        }
      c.fillStyle = '#f1ece2'
      c.fillRect(0, 0, s, s * 0.08)
    },
    256,
    [3, 1],
  )
  const balconyMat = useMemo(() => new THREE.MeshStandardMaterial({ map: brick, roughness: 0.8 }), [brick])
  const balconyGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(1.55, 1.55, 1.15, 28, 1, false, 0, Math.PI)
    g.scale(1, 1, 1.28)
    return g
  }, [])
  const slabGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(1.65, 1.65, 0.18, 28, 1, false, 0, Math.PI)
    g.scale(1, 1, 1.28)
    return g
  }, [])
  const potGeo = useMemo(() => new THREE.IcosahedronGeometry(0.32, 1), [])

  const balc = useRef<THREE.InstancedMesh>(null)
  const slab = useRef<THREE.InstancedMesh>(null)
  const pots = useRef<THREE.InstancedMesh>(null)
  const bays = Math.round(LEN / BAY)
  const count = bays * (FLOORS - 1)
  const x = -151 // 东立面
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const r = mulberry32(9)
    let i = 0
    let k = 0
    const c = new THREE.Color()
    for (let b = 0; b < bays; b++)
      for (let f = 1; f < FLOORS; f++) {
        const z = 90 - (b + 0.5) * (LEN / bays)
        const y = G + (f - 1) * FH
        m.makeTranslation(x, y + 0.58, z)
        balc.current!.setMatrixAt(i, m)
        m.makeTranslation(x, y - 0.05, z)
        slab.current!.setMatrixAt(i, m)
        i++
        for (let n = 0; n < 4; n++) {
          if (r() < 0.25) continue
          const zz = z + (n - 1.5) * 0.85
          const s = 0.7 + r() * 0.6
          m.compose(new THREE.Vector3(x + 1.1 + r() * 0.3, y + 1.35, zz), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.9, s))
          pots.current!.setMatrixAt(k, m)
          pots.current!.setColorAt(k, c.setHSL(0.27 + r() * 0.08, 0.5, 0.25 + r() * 0.12))
          k++
        }
      }
    pots.current!.count = k
    balc.current!.instanceMatrix.needsUpdate = true
    slab.current!.instanceMatrix.needsUpdate = true
    pots.current!.instanceMatrix.needsUpdate = true
    if (pots.current!.instanceColor) pots.current!.instanceColor.needsUpdate = true
  }, [bays])

  return (
    <Selectable id="hulou">
      <FacadeBox size={[14, H, LEN]} position={[-158, 0, 62]} right={face} left={back} front={end} back={end} roof={solid('#b0aca4', 0.95)} />
      <Parapet w={14} d={LEN} y={H} h={0.9} color="#efefeb" />
      <group position={[-158, 0, 62]}>
        <Block size={[14.5, 0.3, LEN + 0.5]} position={[0, H, 0]} color="#e9e8e3" />
      </group>
      <instancedMesh ref={balc} args={[balconyGeo, balconyMat, count]} castShadow receiveShadow />
      <instancedMesh ref={slab} args={[slabGeo, solid('#efece5', 0.8), count]} castShadow receiveShadow />
      <instancedMesh ref={pots} args={[potGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count * 4]} castShadow />

      {/* 圆柱楼梯塔 */}
      <mesh position={[-153, 12.5, 93.5]} material={cyl} castShadow receiveShadow>
        <cylinderGeometry args={[4.5, 4.5, 25, 48]} />
      </mesh>
      <mesh position={[-153, 25.1, 93.5]} material={solid('#e9e8e3', 0.8)} castShadow>
        <cylinderGeometry args={[4.75, 4.75, 0.3, 48]} />
      </mesh>

      {/* 通往钟楼的连廊（二、四层） */}
      {[7.6, 14.4].map((y) => (
        <group key={y} position={[-146.5, y, 74]}>
          <Block size={[9.2, 0.35, 3.2]} color="#e7e4dc" />
          <Block size={[9.2, 1.1, 0.15]} position={[0, 0.7, 1.55]} color="#d8a988" />
          <Block size={[9.2, 1.1, 0.15]} position={[0, 0.7, -1.55]} color="#d8a988" />
          <Block size={[9.2, 0.25, 3.4]} position={[0, 2.9, 0]} color="#e7e4dc" />
        </group>
      ))}
    </Selectable>
  )
}
