import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { solid } from '../lib/materials'
import { textTexture } from '../lib/textures'

/** 所有屋顶小红旗共用一份布料几何体，每帧统一形变 */
const SMALL_W = 1.15
const SMALL_H = 0.78
const smallCloth = new THREE.PlaneGeometry(SMALL_W, SMALL_H, 10, 4)
smallCloth.translate(SMALL_W / 2, 0, 0)
const smallRest = (smallCloth.getAttribute('position').array as Float32Array).slice()

function wave(geo: THREE.BufferGeometry, rest: Float32Array, t: number, len: number, amp: number, speed: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const a = pos.array as Float32Array
  for (let i = 0; i < a.length; i += 3) {
    const x = rest[i]
    const y = rest[i + 1]
    const k = x / len
    a[i + 2] = Math.sin(x * 3.2 - t * speed + y * 0.6) * amp * k + Math.sin(x * 7.1 - t * speed * 1.7) * amp * 0.3 * k
    a[i] = x - Math.abs(a[i + 2]) * 0.25 * k
    a[i + 1] = y - k * k * amp * 0.25
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

export function FlagAnimator() {
  useFrame(({ clock }) => wave(smallCloth, smallRest, clock.elapsedTime, SMALL_W, 0.16, 5.5))
  return null
}

const clothMat = new THREE.MeshStandardMaterial({ color: '#d4161c', roughness: 0.75, side: THREE.DoubleSide })

/** 一组屋顶小红旗（旗杆 + 旗面）。points 为旗杆底部坐标 */
export function RoofFlags({ points, height = 2.6, yaw = -0.3 }: { points: [number, number, number][]; height?: number; yaw?: number }) {
  const poles = useRef<THREE.InstancedMesh>(null)
  const cloths = useRef<THREE.InstancedMesh>(null)
  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.03, 0.035, height, 5).translate(0, height / 2, 0), [height])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    points.forEach((p, i) => {
      m.makeTranslation(p[0], p[1], p[2])
      poles.current!.setMatrixAt(i, m)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.sin(i * 2.3) * 0.15)
      m.compose(new THREE.Vector3(p[0], p[1] + height - SMALL_H / 2 - 0.05, p[2]), q, new THREE.Vector3(1, 1, 1))
      cloths.current!.setMatrixAt(i, m)
    })
    poles.current!.instanceMatrix.needsUpdate = true
    cloths.current!.instanceMatrix.needsUpdate = true
  }, [points, height, yaw])
  return (
    <group>
      <instancedMesh ref={poles} args={[poleGeo, solid('#d9d9d9', 0.4, 0.8), points.length]} castShadow />
      <instancedMesh ref={cloths} args={[smallCloth, clothMat, points.length]} castShadow />
    </group>
  )
}

/** 沿一条线均匀排布旗杆 */
export function flagLine(x0: number, x1: number, y: number, z: number, n: number): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * (i + 0.5)) / n, y, z])
  return out
}

/** 五星红旗（升旗台） */
export function NationalFlag({ position, poleH = 24 }: { position: [number, number, number]; poleH?: number }) {
  const W = 4.8
  const H = 3.2
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, 24, 12)
    g.translate(W / 2, 0, 0)
    return g
  }, [])
  const rest = useMemo(() => (geo.getAttribute('position').array as Float32Array).slice(), [geo])
  const tex = useMemo(
    () =>
      textTexture('cnflag', 600, 400, (c, w, h) => {
        c.fillStyle = '#de2910'
        c.fillRect(0, 0, w, h)
        const star = (cx: number, cy: number, r: number, rot: number) => {
          c.beginPath()
          for (let i = 0; i < 5; i++) {
            const a = rot + (i * 4 * Math.PI) / 5 - Math.PI / 2
            c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
          }
          c.closePath()
          c.fillStyle = '#ffde00'
          c.fill()
        }
        const u = w / 30
        star(5 * u, 5 * u, 3 * u, 0)
        const small: [number, number][] = [[10, 2], [12, 4], [12, 7], [10, 9]]
        small.forEach(([x, y]) => star(x * u, y * u, u, Math.atan2(5 - y, 5 - x) + Math.PI / 2))
      }),
    [],
  )
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }), [tex])
  useFrame(({ clock }) => wave(geo, rest, clock.elapsedTime, W, 0.55, 3.2))
  return (
    <group position={position}>
      <mesh material={solid('#e6e6e6', 0.25, 0.9)} position={[0, poleH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.13, poleH, 12]} />
      </mesh>
      <mesh material={solid('#d8b04a', 0.3, 0.9)} position={[0, poleH + 0.15, 0]}>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
      <mesh geometry={geo} material={mat} position={[0.1, poleH - H / 2 - 0.2, 0]} rotation={[0, -0.5, 0]} castShadow />
    </group>
  )
}
