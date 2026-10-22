import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { merge, colorize } from '../lib/geom'
import { mulberry32 } from '../lib/random'
import { solid } from '../lib/materials'
import { BANYANS } from './Ground'
import { TRACK_CENTER } from './Sports'

/** 穿校服的学生：白色上衣 + 藏青长裤，或红色运动服（操场上） */
function personGeometry(top: string, legs: string) {
  const r = mulberry32(3)
  const legsG = colorize(new THREE.CylinderGeometry(0.13, 0.11, 0.85, 6).translate(0, 0.42, 0), legs, 0.05, r)
  const body = colorize(new THREE.CapsuleGeometry(0.19, 0.42, 3, 8).translate(0, 1.15, 0), top, 0.05, r)
  const head = colorize(new THREE.SphereGeometry(0.115, 10, 8).translate(0, 1.6, 0), '#2a2522', 0.05, r)
  const face = colorize(new THREE.SphereGeometry(0.105, 10, 8).translate(0, 1.57, 0.03), '#e3b896', 0.05, r)
  const bag = colorize(new THREE.BoxGeometry(0.28, 0.32, 0.12).translate(0, 1.18, -0.2), '#2d3c5c', 0.05, r)
  return merge([legsG, body, head, face, bag])
}

function Crowd({ geo, spots }: { geo: THREE.BufferGeometry; spots: { x: number; z: number; rot: number; s: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    spots.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot)
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [spots])
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} castShadow />
}

export function People() {
  const uniform = useMemo(() => personGeometry('#f3f3f0', '#26314d'), [])
  const sport = useMemo(() => personGeometry('#c9302c', '#1f2a44'), [])
  const { walkers, runners } = useMemo(() => {
    const r = mulberry32(88)
    const walkers: { x: number; z: number; rot: number; s: number }[] = []
    const add = (x0: number, x1: number, z0: number, z1: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0)
        const z = z0 + r() * (z1 - z0)
        // 避开升旗台与两侧花坛
        if (Math.abs(x) < 8 && z > 8 && z < 22) continue
        if (Math.hypot(Math.abs(x) - 36, z - 22) < 8.5) continue
        walkers.push({ x, z, rot: r() * Math.PI * 2, s: 0.92 + r() * 0.14 })
      }
    }
    // 小群体聚集：三五成群更自然
    const group = (x: number, z: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        walkers.push({ x: x + Math.cos(a) * 0.9, z: z + Math.sin(a) * 0.9, rot: a + Math.PI / 2 + Math.PI, s: 0.92 + r() * 0.14 })
      }
    }
    add(-50, 50, 0, 44, 46) // 升旗广场
    add(-15, 10, 48, 98, 18) // 古榕广场
    add(-145, -60, 41, 49, 16) // 西向步道
    add(60, 160, -32, -20, 20) // 东校门大道
    add(-150, -70, 94, 124, 14) // 钟楼前庭
    group(-20, 18, 4)
    group(14, 30, 3)
    group(-120, 104, 5)
    group(-2, 64, 4)
    group(90, -26, 3)
    const runners: { x: number; z: number; rot: number; s: number }[] = []
    // 跑道上的学生沿南侧直道跑步，球场中有人踢球
    for (let i = 0; i < 18; i++) {
      const t = r()
      const x = TRACK_CENTER[0] - 40 + t * 80
      const lane = Math.floor(r() * 6)
      runners.push({ x, z: TRACK_CENTER[2] + 37.1 + lane * 1.22, rot: Math.PI / 2, s: 0.95 + r() * 0.1 })
    }
    for (let i = 0; i < 16; i++) runners.push({ x: TRACK_CENTER[0] + (r() - 0.5) * 80, z: TRACK_CENTER[2] + (r() - 0.5) * 50, rot: r() * 6.28, s: 0.95 + r() * 0.1 })
    // 篮球场
    for (let i = 0; i < 14; i++) runners.push({ x: -50 + (i % 2) * 20 + (r() - 0.5) * 10, z: 126 + (r() - 0.5) * 22, rot: r() * 6.28, s: 0.95 + r() * 0.1 })
    return { walkers, runners }
  }, [])
  return (
    <group>
      <Crowd geo={uniform} spots={walkers} />
      <Crowd geo={sport} spots={runners} />
    </group>
  )
}

/** 古榕树下环形石凳 */
export function BanyanBenches() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.BoxGeometry(1.6, 0.45, 0.45).translate(0, 0.225, 0), [])
  const items = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (const [bx, bz] of BANYANS) {
      const n = 12
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(bx + Math.cos(a) * 4.4, 0, bz + Math.sin(a) * 4.4),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2),
          new THREE.Vector3(1, 1, 1),
        )
        out.push(m)
      }
    }
    return out
  }, [])
  useLayoutEffect(() => {
    items.forEach((m, i) => ref.current!.setMatrixAt(i, m))
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geo, solid('#bdb6a8', 0.8), items.length]} castShadow receiveShadow />
}
