import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { G } from './state'
import { textTexture } from '../lib/textures'

/** 贴地雾团：一圈始终围着玩家漂移的半透明雾片 */
export function GroundFog() {
  const N = 70
  const ref = useRef<THREE.InstancedMesh>(null)
  const tex = useMemo(
    () =>
      textTexture('fogpuff', 256, 256, (c, w) => {
        c.clearRect(0, 0, w, w)
        for (let i = 0; i < 26; i++) {
          const x = w / 2 + (Math.random() - 0.5) * w * 0.45
          const y = w / 2 + (Math.random() - 0.5) * w * 0.25
          const r = w * (0.12 + Math.random() * 0.2)
          const g = c.createRadialGradient(x, y, 0, x, y, r)
          g.addColorStop(0, 'rgba(255,255,255,0.22)')
          g.addColorStop(1, 'rgba(255,255,255,0)')
          c.fillStyle = g
          c.fillRect(0, 0, w, w)
        }
      }),
    [],
  )
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, color: '#8a7480', transparent: true, opacity: 0.55, depthWrite: false, fog: true }), [tex])
  const puffs = useMemo(
    () =>
      Array.from({ length: N }, () => ({
        p: new THREE.Vector3((Math.random() - 0.5) * 60, 0.4 + Math.random() * 1.6, (Math.random() - 0.5) * 60),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5),
        s: 5 + Math.random() * 7,
      })),
    [],
  )
  useLayoutEffect(() => {
    ref.current!.frustumCulled = false
  }, [])
  useFrame(({ camera }, dt) => {
    const m = new THREE.Matrix4()
    puffs.forEach((f, i) => {
      f.p.addScaledVector(f.v, dt)
      const dx = f.p.x - G.player.x
      const dz = f.p.z - G.player.z
      if (Math.hypot(dx, dz) > 34) {
        const a = Math.random() * Math.PI * 2
        f.p.set(G.player.x + Math.sin(a) * 30, f.p.y, G.player.z + Math.cos(a) * 30)
      }
      m.compose(f.p, camera.quaternion, new THREE.Vector3(f.s, f.s * 0.45, 1))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[new THREE.PlaneGeometry(1, 1), mat, N]} renderOrder={5} />
}

/** 手电光里漂浮的灰尘 */
export function Dust() {
  const N = 400
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const a = new Float32Array(N * 3)
    for (let i = 0; i < N * 3; i++) a[i] = (Math.random() - 0.5) * 16
    g.setAttribute('position', new THREE.BufferAttribute(a, 3))
    return g
  }, [])
  const ref = useRef<THREE.Points>(null)
  useFrame(({ camera, clock }) => {
    if (!ref.current) return
    ref.current.position.set(Math.floor(camera.position.x / 16) * 16, camera.position.y, Math.floor(camera.position.z / 16) * 16)
    ref.current.rotation.y = clock.elapsedTime * 0.02
    ;(ref.current.material as THREE.PointsMaterial).opacity = G.flashlightOn ? 0.55 : 0.15
  })
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.035} color="#d8c6b0" transparent opacity={0.5} depthWrite={false} sizeAttenuation />
    </points>
  )
}
