import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { film } from './clock'
import { DOTS, heroineAt, ripperAt, studio } from './script'
import { RipperBody, useKillerParts } from '../game/Killer'
import { EffigyBody, useEffigyParts } from '../game/Effigies'
import { GhostBody, useGhostParts } from '../game/Ghosts'
import { textTexture } from '../lib/textures'
import { mulberry32 } from '../lib/random'
import { TRACK_CENTER } from '../scene/Sports'

const between = (t: number, a: number, b: number) => t >= a && t < b

/* ===================== 学生（程序化人体 + 奔跑循环） ===================== */

const mats = {
  shirt: new THREE.MeshStandardMaterial({ color: '#e9e8e3', roughness: 0.8 }),
  navy: new THREE.MeshStandardMaterial({ color: '#1f2a46', roughness: 0.85 }),
  skin: new THREE.MeshStandardMaterial({ color: '#d6b298', roughness: 0.7 }),
  hair: new THREE.MeshStandardMaterial({ color: '#0b0a0a', roughness: 0.55 }),
  torch: new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.4, metalness: 0.7 }),
  beam: new THREE.MeshBasicMaterial({ color: '#fff0cf', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }),
  lens: new THREE.MeshBasicMaterial({ color: '#fff6dc' }),
}
const beamGeo = new THREE.ConeGeometry(2.6, 14, 24, 1, true)
beamGeo.translate(0, -7, 0)
beamGeo.rotateX(-Math.PI / 2) // 光锥朝 +z

export interface PersonHandle {
  root: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  beam: THREE.Mesh
}

function Person({ girl, onReady, torch = true }: { girl: boolean; onReady: (h: PersonHandle) => void; torch?: boolean }) {
  const refs = useRef<Partial<PersonHandle>>({})
  const set = (k: keyof PersonHandle) => (el: THREE.Object3D | null) => {
    if (!el) return
    ;(refs.current as Record<string, unknown>)[k] = el
    const r = refs.current
    if (r.root && r.legL && r.legR && r.armL && r.armR && r.beam) onReady(r as PersonHandle)
  }
  return (
    <group ref={set('root')}>
      {(['legL', 'legR'] as const).map((k, i) => (
        <group key={k} ref={set(k)} position={[(i ? 1 : -1) * 0.09, 0.88, 0]}>
          <mesh position={[0, -0.43, 0]} material={girl ? mats.skin : mats.navy} castShadow>
            <capsuleGeometry args={[0.055, 0.74, 4, 8]} />
          </mesh>
          <mesh position={[0, -0.84, 0.05]} material={mats.hair}>
            <boxGeometry args={[0.09, 0.07, 0.22]} />
          </mesh>
        </group>
      ))}
      {girl && (
        <mesh position={[0, 0.82, 0]} material={mats.navy} castShadow>
          <cylinderGeometry args={[0.17, 0.26, 0.42, 14]} />
        </mesh>
      )}
      <mesh position={[0, 1.18, 0]} material={mats.shirt} castShadow>
        <capsuleGeometry args={[0.17, 0.32, 4, 10]} />
      </mesh>
      <mesh position={[0, 1.43, 0.02]} material={mats.navy}>
        <torusGeometry args={[0.1, 0.025, 6, 16]} />
      </mesh>
      {(['armL', 'armR'] as const).map((k, i) => (
        <group key={k} ref={set(k)} position={[(i ? 1 : -1) * 0.22, 1.36, 0]}>
          <mesh position={[0, -0.3, 0]} material={mats.shirt} castShadow>
            <capsuleGeometry args={[0.045, 0.5, 4, 8]} />
          </mesh>
          <mesh position={[0, -0.6, 0]} material={mats.skin}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
          {i === 1 && torch && (
            <group position={[0, -0.62, 0.06]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.torch}>
                <cylinderGeometry args={[0.025, 0.02, 0.18, 8]} />
              </mesh>
              <mesh position={[0, 0, 0.095]} material={mats.lens}>
                <circleGeometry args={[0.025, 10]} />
              </mesh>
            </group>
          )}
        </group>
      ))}
      <mesh ref={set('beam')} geometry={beamGeo} material={mats.beam} position={[0.22, 0.75, 0.15]} rotation={[0.18, 0, 0]} visible={torch} />
      <mesh position={[0, 1.6, 0]} material={mats.skin} castShadow>
        <sphereGeometry args={[0.11, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.64, -0.015]} scale={[1.08, 1, 1.1]} material={mats.hair}>
        <sphereGeometry args={[0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
      </mesh>
      {girl ? (
        <mesh position={[0, 1.45, -0.13]} rotation={[0.25, 0, 0]} material={mats.hair}>
          <coneGeometry args={[0.07, 0.42, 10]} />
        </mesh>
      ) : null}
    </group>
  )
}

function animatePerson(h: PersonHandle, phase: number, run: number, look = 0) {
  const s = Math.sin(phase)
  h.legL.rotation.x = s * 0.8 * run
  h.legR.rotation.x = -s * 0.8 * run
  h.armL.rotation.x = -s * 0.9 * run
  h.armR.rotation.x = s * 0.5 * run - 0.9 + look
  h.root.position.y = Math.abs(Math.cos(phase)) * 0.08 * run
  h.root.rotation.x = run * 0.12
}

/* ===================== 场景 S05/S07：人群 ===================== */

export function Crowd() {
  const N = 24
  const handles = useRef<(PersonHandle | null)[]>([])
  const people = useMemo(() => {
    const r = mulberry32(13)
    return Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 + r() * 0.3
      const rad = 1.5 + r() * 4.5
      return {
        girl: i % 2 === 0,
        x: 2 + Math.cos(a) * rad,
        z: 30 + Math.sin(a) * rad * 0.7,
        face: r() * Math.PI * 2,
        fleeA: a + (r() - 0.5) * 0.6,
        speed: 4.5 + r() * 2,
        delay: r() * 0.8,
      }
    })
  }, [])
  useFrame(() => {
    const t = film.t
    const show = between(t, 39, 70)
    people.forEach((p, i) => {
      const h = handles.current[i]
      if (!h) return
      h.root.visible = show
      if (!show) return
      if (t < 60) {
        // 惊慌地四处张望，手电乱晃
        const look = Math.sin(t * 0.8 + i * 1.7) * 0.9 + Math.sin(t * 2.3 + i) * 0.25
        h.root.position.set(p.x, 0, p.z)
        h.root.rotation.y = p.face + look
        animatePerson(h, t * 2 + i, 0.05, Math.sin(t * 1.3 + i) * 0.4)
      } else {
        const k = Math.max(0, t - 60 - p.delay)
        const d = k * p.speed
        h.root.position.set(p.x + Math.cos(p.fleeA) * d, 0, p.z + Math.sin(p.fleeA) * d)
        h.root.rotation.y = Math.atan2(Math.cos(p.fleeA), Math.sin(p.fleeA))
        animatePerson(h, k * 11 + i, Math.min(1, k * 2))
      }
    })
  })
  return (
    <group>
      {people.map((p, i) => (
        <Person key={i} girl={p.girl} onReady={(h) => (handles.current[i] = h)} />
      ))}
      {/* 人群里几支真实的手电，照亮彼此 */}
      <CrowdLights />
    </group>
  )
}

function CrowdLights() {
  const L = useRef<(THREE.SpotLight | null)[]>([])
  const tg = useMemo(() => [0, 1, 2].map(() => new THREE.Object3D()), [])
  useFrame(({ scene }) => {
    const t = film.t
    const on = between(t, 39, 70)
    tg.forEach((o, i) => {
      if (!o.parent) scene.add(o)
      const l = L.current[i]
      if (!l) return
      l.intensity = on ? 90 * (Math.random() < 0.03 ? 0.2 : 1) : 0
      const a = t * (0.6 + i * 0.3) + i * 2
      l.position.set(2 + Math.cos(i * 2.1) * 3, 1.3, 30 + Math.sin(i * 2.1) * 2)
      o.position.set(l.position.x + Math.cos(a) * 10, 0, l.position.z + Math.sin(a) * 10)
      l.target = o
    })
  })
  return (
    <>
      {[0, 1, 2].map((i) => (
        <spotLight key={i} ref={(el) => (L.current[i] = el)} angle={0.4} penumbra={0.7} distance={40} decay={1.6} color="#ffeccc" />
      ))}
    </>
  )
}

/* ===================== 女主角与林晓 ===================== */

export function Heroine() {
  const h = useRef<PersonHandle | null>(null)
  const light = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ scene }) => {
    const t = film.t
    const s = heroineAt(t)
    if (!target.parent) scene.add(target)
    if (!h.current) return
    h.current.root.visible = s.visible
    const torchOn = s.visible && !(t >= 119.5 && t < 132) && t < 160.2
    h.current.beam.visible = torchOn
    if (light.current) light.current.intensity = torchOn ? 120 * (t > 156 ? Math.max(0, 1 - (t - 156) / 4.2) * (Math.random() < 0.3 ? 0.3 : 1) : 1) : 0
    if (!s.visible) return
    h.current.root.position.set(s.x, 0, s.z)
    h.current.root.rotation.y = s.yaw
    animatePerson(h.current, t * 11, s.run ? 1 : 0.02, t >= 118 && t < 132 ? 0.6 : 0)
    // 躲藏时背贴树干、微微发抖
    if (t >= 118 && t < 132) h.current.root.position.x += Math.sin(t * 40) * 0.006
    const fx = Math.sin(s.yaw)
    const fz = Math.cos(s.yaw)
    light.current?.position.set(s.x + fx * 0.4, 1.0, s.z + fz * 0.4)
    target.position.set(s.x + fx * 10, 0, s.z + fz * 10)
    if (light.current) light.current.target = target
  })
  return (
    <group>
      <Person girl onReady={(x) => (h.current = x)} />
      <spotLight ref={light} angle={0.38} penumbra={0.6} distance={50} decay={1.5} color="#fff0d2" castShadow shadow-mapSize={[1024, 1024]} />
    </group>
  )
}

/** S08：古榕下的林晓，被点名后只剩滚落的手电与一个纸人 */
export function LinXiao() {
  const h = useRef<PersonHandle | null>(null)
  const torch = useRef<THREE.Group>(null)
  const light = useRef<THREE.SpotLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ scene }) => {
    const t = film.t
    if (!target.parent) scene.add(target)
    const alive = between(t, 70, 75.45)
    if (h.current) {
      h.current.root.visible = alive
      h.current.root.position.set(-12, 0, 62)
      h.current.root.rotation.y = 0.9 + Math.sin(t * 1.7) * 0.25
      animatePerson(h.current, t * 3, 0.03, 0.3 + Math.sin(t * 2.4) * 0.3)
      h.current.beam.visible = alive && !(t > 74 && Math.random() < 0.4)
    }
    const fallen = between(t, 75.45, 80)
    if (torch.current) {
      torch.current.visible = fallen
      torch.current.rotation.y = 0.4 + (t - 75.45) * 0.6 * Math.exp(-(t - 75.45) * 0.4)
    }
    if (light.current) {
      light.current.intensity = alive ? 70 : fallen ? 60 : 0
      if (alive) {
        light.current.position.set(-11.6, 1.0, 62.3)
        target.position.set(-2, 0, 66)
      } else {
        const a = torch.current?.rotation.y ?? 0
        light.current.position.set(-11.6, 0.12, 62.6)
        target.position.set(-11.6 + Math.sin(a) * 8, 0.0, 62.6 + Math.cos(a) * 8)
      }
      light.current.target = target
    }
  })
  return (
    <group>
      <Person girl onReady={(x) => (h.current = x)} />
      <group ref={torch} position={[-11.6, 0.05, 62.6]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.torch}>
          <cylinderGeometry args={[0.03, 0.025, 0.2, 8]} />
        </mesh>
      </group>
      <spotLight ref={light} angle={0.42} penumbra={0.5} distance={30} decay={1.6} color="#fff0d2" castShadow />
    </group>
  )
}

/* ===================== 开膛手 ===================== */

export function RipperActor() {
  const parts = useKillerParts()
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const eye = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const t = film.t
    const s = ripperAt(t)
    const g = root.current
    if (!g) return
    g.visible = s.visible
    if (!s.visible) return
    g.position.set(s.x, s.y, s.z)
    g.rotation.y = s.yaw
    // 楼顶：披风在风里起伏
    g.rotation.z = Math.sin(t * 2.2) * 0.02
    if (head.current) head.current.rotation.z = s.tilt + (Math.random() < 0.02 ? (Math.random() - 0.5) * 0.25 : 0)
    if (arm.current) arm.current.rotation.x = s.knife
    if (eye.current) eye.current.intensity = (t >= 156 ? 5 : 2) + Math.random()
  })
  return (
    <group ref={root}>
      <RipperBody parts={parts} headRef={head} armRef={arm} eyeRef={eye} />
    </group>
  )
}

/* ===================== 纸人方阵 ===================== */

interface EffSpot {
  pos: THREE.Vector3
  yaw: number
  from: number
  to: number
  turnAt?: number
  turnTo?: number
  robe: number
}

export function EffigyCast() {
  const parts = useEffigyParts()
  const spots = useMemo<EffSpot[]>(() => {
    const out: EffSpot[] = []
    // S08：林晓站过的地方
    out.push({ pos: new THREE.Vector3(-12, 0, 62), yaw: 2.4, from: 75.9, to: 80, robe: 2 })
    // S10：操场中央三排五列，背对镜头“做早操”，101 秒时一起转头
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++)
        out.push({ pos: new THREE.Vector3(TRACK_CENTER[0] - 14 + c * 7, 0, TRACK_CENTER[2] - 6 + r * 5.5), yaw: 0, from: 92, to: 104, turnAt: 101, turnTo: Math.PI, robe: (r + c) % 3 })
    // S14：东门大道上的方阵，面向她
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) out.push({ pos: new THREE.Vector3(118 + r * 7, 0, -31 + c * 3.8), yaw: Math.PI / 2, from: 144, to: 156, robe: (r * 4 + c) % 3 })
    // S17：旗杆下的第十三个
    out.push({ pos: new THREE.Vector3(2.2, 0, 22.6), yaw: 0, from: 170, to: 999, robe: 2 })
    return out
  }, [])
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const t = film.t
    spots.forEach((s, i) => {
      const g = groups.current[i]
      if (!g) return
      g.visible = between(t, s.from, s.to)
      if (!g.visible) return
      g.position.copy(s.pos)
      g.rotation.y = s.turnAt !== undefined && t >= s.turnAt ? s.turnTo! : s.yaw
      g.rotation.z = Math.sin(t * 3 + i) * 0.015
      // 第十三声钟响时，所有纸人一起抬头
      g.rotation.x = between(t, 152, 156) ? -0.12 : 0
    })
  })
  return (
    <group>
      {spots.map((s, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)}>
          <EffigyBody parts={parts} robe={s.robe} />
        </group>
      ))}
    </group>
  )
}

export function GhostCast() {
  const parts = useGhostParts()
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const t = film.t
    if (!ref.current) return
    ref.current.visible = between(t, 96.5, 104) && Math.random() > 0.05
    ref.current.position.set(79.5, 0.05 + Math.sin(t * 2) * 0.03, 92.8)
    ref.current.rotation.y = Math.atan2(camera.position.x - 79.5, camera.position.z - 92.8)
  })
  return (
    <group ref={ref}>
      <GhostBody parts={parts} />
    </group>
  )
}

/* ===================== 上帝视角：光点与血雾圈 ===================== */

export function BattleMap() {
  const dots = useRef<(THREE.Mesh | null)[]>([])
  const ring = useRef<THREE.Mesh>(null)
  const ringTex = useMemo(
    () =>
      textTexture('fogring', 512, 128, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h)
        g.addColorStop(0, 'rgba(255,40,30,0)')
        g.addColorStop(0.55, 'rgba(255,40,30,0.55)')
        g.addColorStop(1, 'rgba(255,60,40,0.95)')
        c.fillStyle = g
        c.fillRect(0, 0, w, h)
        for (let i = 0; i < 400; i++) {
          c.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`
          c.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 3 + Math.random() * 10)
        }
      }),
    [],
  )
  const ringMat = useMemo(() => {
    const t = ringTex.clone()
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(10, 1)
    t.needsUpdate = true
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  }, [ringTex])
  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3d6', fog: false }), [])
  useFrame(() => {
    const t = film.t
    const on = between(t, 80, 92)
    if (ring.current) {
      ring.current.visible = on
      const k = THREE.MathUtils.clamp((t - 80) / 12, 0, 1)
      const r = 280 - k * 115
      ring.current.scale.set(r, 1, r)
      ;(ringMat.map as THREE.Texture).offset.x = t * 0.02
    }
    DOTS.forEach(([, , off], i) => {
      const m = dots.current[i]
      if (!m) return
      const alive = t < off
      m.visible = on && (alive || (t - off < 0.25 && Math.random() < 0.5))
      m.scale.setScalar(alive ? 1 + Math.sin(t * 6 + i) * 0.25 : 2.5)
    })
  })
  return (
    <group>
      <mesh ref={ring} position={[10, 20, 30]} material={ringMat}>
        <cylinderGeometry args={[1, 1, 40, 96, 1, true]} />
      </mesh>
      {DOTS.map(([x, z], i) => (
        <mesh key={i} ref={(el) => (dots.current[i] = el)} position={[x, 2, z]} material={dotMat}>
          <sphereGeometry args={[1.8, 12, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/* ===================== 融入画面的署名 ===================== */

function creditTexture(key: string, zh: string, en: string, color: string, w = 2048, h = 512) {
  return textTexture(key, w, h, (c) => {
    c.clearRect(0, 0, w, h)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = color
    c.font = `400 ${h * 0.36}px "Zhi Mang Xing","Noto Serif SC",serif`
    c.fillText(zh, w / 2, h * 0.38)
    c.font = `400 ${h * 0.13}px "IM Fell English","Noto Serif SC",serif`
    c.fillText(en, w / 2, h * 0.78)
  })
}

/** S02：悬在云层中的出品字样，镜头会从中穿过 */
export function CloudCredit() {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => {
    const s = studio()
    const t = creditTexture('cloud-credit', `${s} 出品`, `${s.toUpperCase()} PRESENTS`, '#f2e4d8')
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, opacity: 0 })
  }, [])
  useFrame(({ camera }) => {
    const t = film.t
    if (!ref.current) return
    ref.current.visible = between(t, 9, 18)
    const k = THREE.MathUtils.clamp((t - 10) / 2, 0, 1) * THREE.MathUtils.clamp((16.8 - t) / 1.2, 0, 1)
    mat.opacity = k * 0.92
    ref.current.lookAt(camera.position)
  })
  return (
    <mesh ref={ref} position={[176, 380, 500]} material={mat}>
      <planeGeometry args={[150, 37.5]} />
    </mesh>
  )
}

/** S02 的血色云层：一片片贴近镜头路径的云 */
export function CloudLayer() {
  const N = 40
  const ref = useRef<THREE.InstancedMesh>(null)
  const tex = useMemo(
    () =>
      textTexture('cloudpuff', 256, 256, (c, w) => {
        c.clearRect(0, 0, w, w)
        for (let i = 0; i < 40; i++) {
          const x = w / 2 + (Math.random() - 0.5) * w * 0.5
          const y = w / 2 + (Math.random() - 0.5) * w * 0.4
          const r = w * (0.1 + Math.random() * 0.2)
          const g = c.createRadialGradient(x, y, 0, x, y, r)
          g.addColorStop(0, 'rgba(255,255,255,0.2)')
          g.addColorStop(1, 'rgba(255,255,255,0)')
          c.fillStyle = g
          c.fillRect(0, 0, w, w)
        }
      }),
    [],
  )
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, color: '#6a2a2e', transparent: true, depthWrite: false, fog: false, opacity: 0.9 }), [tex])
  const puffs = useMemo(() => {
    const r = mulberry32(5)
    return Array.from({ length: N }, () => {
      const k = r()
      return new THREE.Vector3(300 - k * 260 + (r() - 0.5) * 160, 330 + (r() - 0.5) * 90, 760 - k * 480 + (r() - 0.5) * 160)
    })
  }, [])
  useFrame(({ camera }) => {
    const t = film.t
    if (!ref.current) return
    ref.current.visible = between(t, 9, 24)
    const m = new THREE.Matrix4()
    puffs.forEach((p, i) => {
      m.compose(p, camera.quaternion, new THREE.Vector3(120, 70, 1))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[new THREE.PlaneGeometry(1, 1), mat, N]} frustumCulled={false} />
}

/** S05：笃行楼墙上的血字署名 */
export function WallCredit() {
  const mat = useMemo(() => {
    const s = studio()
    const t = creditTexture('wall-credit', `编剧 导演　${s}`, `WRITTEN & DIRECTED BY ${s.toUpperCase()}`, '#8a0707')
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, emissive: '#5a0000', emissiveIntensity: 0.9, emissiveMap: t, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 })
  }, [])
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (ref.current) ref.current.visible = film.t < 70
  })
  return (
    <mesh ref={ref} position={[27, 4.2, -12.68]} material={mat}>
      <planeGeometry args={[18, 4.5]} />
    </mesh>
  )
}

/** S10：主席台 LED 屏上滚动的配乐署名 */
export function LedCredit() {
  const cv = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 80
    return c
  }, [])
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [cv])
  useFrame(() => {
    const t = film.t
    if (t < 90 || t > 104) return
    const c = cv.getContext('2d')!
    c.fillStyle = '#100202'
    c.fillRect(0, 0, 1024, 80)
    c.font = '600 54px "IBM Plex Mono","Noto Serif SC",monospace'
    c.fillStyle = '#ff3a22'
    const s = studio()
    const msg = `配乐 · 音效　${s}　　MUSIC & SOUND BY ${s.toUpperCase()}　　　`
    const w = c.measureText(msg).width
    const x = -(((t - 90) * 160) % w)
    c.fillText(msg, x, 58)
    c.fillText(msg, x + w, 58)
    // LED 点阵
    c.fillStyle = 'rgba(0,0,0,0.45)'
    for (let i = 0; i < 1024; i += 4) c.fillRect(i, 0, 1, 80)
    for (let j = 0; j < 80; j += 4) c.fillRect(0, j, 1024, 1)
    tex.needsUpdate = true
  })
  return (
    <mesh position={[75, 4.75, 144.88]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[12, 0.94]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

/* ===================== S03：倒转的钟 ===================== */

export function ClockHands() {
  const hour = useRef<THREE.Group>(null)
  const min = useRef<THREE.Group>(null)
  useFrame(() => {
    const t = film.t
    // 从 23:58 一路倒转，最后停在 00:13（对应时针约 0.43°/分，分针 6°/分）
    const k = THREE.MathUtils.clamp((t - 24) / 7.6, 0, 1)
    const e = 1 - Math.pow(1 - k, 3)
    const minutes = 13 + (1 - e) * 60 * 11
    const mAng = -(minutes / 60) * Math.PI * 2
    const hAng = -(minutes / 720) * Math.PI * 2
    if (min.current) min.current.rotation.z = mAng
    if (hour.current) hour.current.rotation.z = hAng
  })
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f2ea', roughness: 0.4, metalness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.15 }), [])
  // 盖住原钟面上画死的指针：只有刻度的空白钟面
  const face = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: textTexture('clock-blank', 256, 256, (c, w) => {
          const r = w / 2
          c.fillStyle = '#2d6fb7'
          c.beginPath()
          c.arc(r, r, r - 4, 0, Math.PI * 2)
          c.fill()
          c.lineWidth = 10
          c.strokeStyle = '#f2f2ee'
          c.stroke()
          c.fillStyle = '#f5f5f0'
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2
            c.beginPath()
            c.arc(r + Math.cos(a) * (r - 26), r + Math.sin(a) * (r - 26), i % 3 ? 5 : 9, 0, Math.PI * 2)
            c.fill()
          }
        }),
        roughness: 0.35,
        emissive: '#1a3a66',
        emissiveIntensity: 0.4,
      }),
    [],
  )
  return (
    <group position={[-118, 28.2, 82.31]}>
      <mesh position={[0, 0, -0.025]} material={face}>
        <circleGeometry args={[1.86, 48]} />
      </mesh>
      <group ref={hour}>
        <mesh position={[0, 0.5, 0]} material={m}>
          <boxGeometry args={[0.12, 1.0, 0.04]} />
        </mesh>
      </group>
      <group ref={min}>
        <mesh position={[0, 0.75, 0.02]} material={m}>
          <boxGeometry args={[0.07, 1.5, 0.04]} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.05]} material={m}>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 16]} />
      </mesh>
    </group>
  )
}

/* ===================== S06b：1888 年白教堂 ===================== */

export function Whitechapel() {
  const cobble = useMemo(
    () =>
      textTexture('cobble', 512, 512, (c, w) => {
        c.fillStyle = '#1a1716'
        c.fillRect(0, 0, w, w)
        for (let y = 0; y < w; y += 22)
          for (let x = (y / 22) % 2 ? 11 : 0; x < w; x += 22) {
            const k = 40 + Math.random() * 35
            c.fillStyle = `rgb(${k},${k - 4},${k - 8})`
            c.beginPath()
            c.ellipse(x + 11, y + 11, 10, 9, 0, 0, Math.PI * 2)
            c.fill()
          }
      }),
    [],
  )
  const brick = useMemo(
    () =>
      textTexture('brick1888', 512, 512, (c, w) => {
        c.fillStyle = '#2a1712'
        c.fillRect(0, 0, w, w)
        for (let y = 0; y < w; y += 16)
          for (let x = (y / 16) % 2 ? 0 : 20; x < w; x += 40) {
            const k = 0.6 + Math.random() * 0.4
            c.fillStyle = `rgb(${90 * k},${42 * k},${30 * k})`
            c.fillRect(x, y, 37, 13)
          }
      }),
    [],
  )
  const floorMat = useMemo(() => {
    const t = cobble.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(4, 12)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.2 })
  }, [cobble])
  const wallMat = useMemo(() => {
    const t = brick.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(8, 3)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })
  }, [brick])
  const lamp = useRef<THREE.PointLight>(null)
  useFrame(() => {
    if (lamp.current) lamp.current.intensity = between(film.t, 56, 58) ? 40 + Math.sin(film.t * 30) * 6 : 0
  })
  return (
    <group position={[0, -500, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -10]} material={floorMat} receiveShadow>
        <planeGeometry args={[8, 50]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 4, 6, -10]} rotation={[0, -s * Math.PI / 2, 0]} material={wallMat}>
          <planeGeometry args={[50, 12]} />
        </mesh>
      ))}
      {/* 煤气灯 */}
      <group position={[-2.6, 0, -8]}>
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.05, 0.08, 3.6, 8]} />
          <meshStandardMaterial color="#111" metalness={0.8} roughness={0.4} />
        </mesh>
        <mesh position={[0, 3.75, 0]}>
          <boxGeometry args={[0.32, 0.4, 0.32]} />
          <meshStandardMaterial color="#ffcf7a" emissive="#ffb04a" emissiveIntensity={4} />
        </mesh>
        <pointLight ref={lamp} position={[0, 3.7, 0]} color="#ffb85a" distance={18} decay={1.8} castShadow />
      </group>
    </group>
  )
}
