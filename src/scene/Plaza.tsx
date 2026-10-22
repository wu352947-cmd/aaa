import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { solid, lampMaterial } from '../lib/materials'
import { Block, Selectable } from './parts'
import { NationalFlag } from './Flags'

const MARBLE = '#f3f1ec'

/** 实例化的一组相同物件 */
function Instances({ geo, mat, points, cast = true }: { geo: THREE.BufferGeometry; mat: THREE.Material; points: THREE.Matrix4[]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    points.forEach((m, i) => ref.current!.setMatrixAt(i, m))
    ref.current!.instanceMatrix.needsUpdate = true
  }, [points])
  return <instancedMesh ref={ref} args={[geo, mat, points.length]} castShadow={cast} receiveShadow />
}

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)

/** 汉白玉升旗台：台基 + 正面台阶 + 环绕栏杆 */
function FlagPlatform() {
  const W = 13
  const D = 9
  const H = 1.5
  const marble = solid(MARBLE, 0.45)
  const posts = useMemo(() => {
    const out: THREE.Matrix4[] = []
    const step = 1.3
    for (let x = -W / 2 + 0.2; x <= W / 2 - 0.2 + 1e-3; x += step) {
      out.push(T(x, H + 0.5, -D / 2 + 0.2))
      if (Math.abs(x) > 2.4) out.push(T(x, H + 0.5, D / 2 - 0.2))
    }
    for (let z = -D / 2 + 0.2 + step; z < D / 2 - 0.2; z += step) {
      out.push(T(-W / 2 + 0.2, H + 0.5, z))
      out.push(T(W / 2 - 0.2, H + 0.5, z))
    }
    // 台阶两侧栏杆柱
    for (const sx of [-2.4, 2.4]) for (let i = 0; i < 4; i++) out.push(T(sx, H + 0.5 - i * 0.36, D / 2 + 0.4 + i * 0.6))
    return out
  }, [])
  const postGeo = useMemo(() => new THREE.BoxGeometry(0.26, 1.0, 0.26), [])
  const capGeo = useMemo(() => new THREE.SphereGeometry(0.17, 12, 8), [])
  const caps = useMemo(() => posts.map((m) => m.clone().multiply(T(0, 0.6, 0))), [posts])
  return (
    <group position={[0, 0, 14]}>
      <Block size={[W, H, D]} position={[0, H / 2, 0]} material={marble} />
      <Block size={[W + 0.4, 0.18, D + 0.4]} position={[0, H + 0.09, 0]} material={marble} />
      <Block size={[W + 0.6, 0.25, D + 0.6]} position={[0, 0.12, 0]} material={solid('#e3e0d9', 0.5)} />
      {/* 正面台阶 */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Block key={i} size={[4.6, 0.3 * (i + 1), 0.45]} position={[0, 0.15 * (i + 1), D / 2 + 2.25 - i * 0.45]} material={marble} />
      ))}
      <Instances geo={postGeo} mat={marble} points={posts} />
      <Instances geo={capGeo} mat={marble} points={caps} />
      {/* 栏板 */}
      <Block size={[W - 0.4, 0.55, 0.12]} position={[0, H + 0.4, -D / 2 + 0.2]} material={marble} />
      <Block size={[0.12, 0.55, D - 0.4]} position={[-W / 2 + 0.2, H + 0.4, 0]} material={marble} />
      <Block size={[0.12, 0.55, D - 0.4]} position={[W / 2 - 0.2, H + 0.4, 0]} material={marble} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[W / 2 - 2.6, 0.55, 0.12]} position={[s * (W / 4 + 1.3), H + 0.4, D / 2 - 0.2]} material={marble} />
      ))}
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.12, 0.5, 2.6]} position={[s * 2.4, H - 0.15, D / 2 + 1.3]} rotation={[0.52, 0, 0]} material={marble} />
      ))}
      <NationalFlag position={[0, H + 0.18, -1.2]} poleH={22} />
    </group>
  )
}

/** 石球路障 */
function StoneBalls() {
  const pts = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (let x = -50; x <= 50; x += 4) if (Math.abs(x) > 6) out.push(T(x, 0.42, 46))
    for (let z = 2; z <= 44; z += 4) {
      out.push(T(55, 0.42, z))
      out.push(T(-55, 0.42, z))
    }
    return out
  }, [])
  const geo = useMemo(() => new THREE.SphereGeometry(0.42, 20, 14), [])
  return <Instances geo={geo} mat={solid('#e9e6df', 0.5)} points={pts} />
}

/** 庭院灯 */
export function StreetLamps({ points }: { points: [number, number][] }) {
  const poles = useMemo(() => points.map(([x, z]) => T(x, 2.2, z)), [points])
  const heads = useMemo(() => points.map(([x, z]) => T(x, 4.5, z)), [points])
  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.06, 0.09, 4.4, 8), [])
  const headGeo = useMemo(() => new THREE.CylinderGeometry(0.28, 0.18, 0.5, 12), [])
  return (
    <group>
      <Instances geo={poleGeo} mat={solid('#3a3e42', 0.4, 0.7)} points={poles} />
      <Instances geo={headGeo} mat={lampMaterial('#ffd59a', 8)} points={heads} cast={false} />
    </group>
  )
}

export function Plaza() {
  const lamps = useMemo(() => {
    const out: [number, number][] = []
    for (let x = -48; x <= 48; x += 16) out.push([x, 44])
    for (let z = -4; z <= 40; z += 11) {
      out.push([-53, z])
      out.push([53, z])
    }
    for (let x = 64; x <= 160; x += 12) out.push([x, -35.5], [x, -16.5])
    for (let x = -148; x <= -60; x += 11) out.push([x, 51.5])
    for (let z = -110; z <= 160; z += 18) out.push([-166, z], [158, z])
    return out
  }, [])
  return (
    <group>
      <Selectable id="flag">
        <FlagPlatform />
      </Selectable>
      <StoneBalls />
      <StreetLamps points={lamps} />
      {/* 广场两侧花坛 */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 36, 0, 22]}>
          <mesh position={[0, 0.3, 0]} material={solid('#e6e2d9', 0.6)} castShadow receiveShadow>
            <cylinderGeometry args={[7.6, 7.8, 0.6, 48, 1, true]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
