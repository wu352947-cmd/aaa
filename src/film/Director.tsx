import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { film } from './clock'
import { DURATION, SHOTS, type CamKey, type Shot } from './script'
import type { Score } from './score'
import { atmosOverride } from '../scene/Atmosphere'
import { store } from '../lib/store'
import { haunt } from '../game/Events'
import { power } from '../lib/materials'

const ease = {
  smooth: (x: number) => x * x * (3 - 2 * x),
  linear: (x: number) => x,
  in: (x: number) => x * x * x * 0.4 + x * 0.6,
  out: (x: number) => 1 - Math.pow(1 - x, 2),
}

export function shotAt(t: number): Shot {
  for (const s of SHOTS) if (t >= s.start && t < s.end) return s
  return SHOTS[SHOTS.length - 1]
}

function sample(keys: CamKey[], u: number) {
  if (keys.length === 1) return { p: new THREE.Vector3(...keys[0].p), t: new THREE.Vector3(...keys[0].t), fov: keys[0].fov ?? 40, roll: keys[0].roll ?? 0 }
  let i = 0
  while (i < keys.length - 2 && u > keys[i + 1].u) i++
  const a = keys[i]
  const b = keys[i + 1]
  const span = Math.max(1e-6, b.u - a.u)
  let f = THREE.MathUtils.clamp((u - a.u) / span, 0, 1)
  if (keys.length > 2) f = f * f * (3 - 2 * f)
  // 两个关键帧几乎同一时刻 = 镜头内硬切
  if (span < 0.02) f = u >= b.u ? 1 : 0
  const lerp = (x: number, y: number) => x + (y - x) * f
  return {
    p: new THREE.Vector3(lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2])),
    t: new THREE.Vector3(lerp(a.t[0], b.t[0]), lerp(a.t[1], b.t[1]), lerp(a.t[2], b.t[2])),
    fov: lerp(a.fov ?? 40, b.fov ?? a.fov ?? 40),
    roll: lerp(a.roll ?? 0, b.roll ?? a.roll ?? 0),
  }
}

/** 手持晃动：几组不同频率的正弦叠加，比随机噪声更像人在呼吸、奔跑 */
function handheld(t: number, amp: number) {
  return new THREE.Vector3(
    (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 3.7 + 1) * 0.3 + Math.sin(t * 11.3) * 0.1) * amp,
    (Math.sin(t * 1.7 + 2) * 0.5 + Math.sin(t * 5.1) * 0.3 + Math.sin(t * 13.7 + 3) * 0.2) * amp,
    (Math.sin(t * 2.1 + 4) * 0.5 + Math.sin(t * 4.3) * 0.5) * amp,
  )
}

export function Director({ score, onEnd }: { score: Score; onEnd: () => void }) {
  const lastShot = useRef('')
  const povLight = useRef<THREE.SpotLight>(null)
  const povTarget = useMemo(() => new THREE.Object3D(), [])
  const ended = useRef(false)

  useFrame(({ camera, scene }) => {
    if (!povTarget.parent) scene.add(povTarget)
    if (film.playing) film.t = score.time()
    const t = THREE.MathUtils.clamp(film.t, 0, DURATION)
    if (film.playing && t >= DURATION - 0.05 && !ended.current) {
      ended.current = true
      onEnd()
    }
    if (t < DURATION - 1) ended.current = false

    const shot = shotAt(t)
    const cut = shot.id !== lastShot.current
    lastShot.current = shot.id
    const u = THREE.MathUtils.clamp((t - shot.start) / (shot.end - shot.start), 0, 1)
    const e = ease[shot.ease ?? 'smooth'](u)
    const k = sample(shot.keys, shot.keys.length > 2 ? u : e)

    const cam = camera as THREE.PerspectiveCamera
    const sh = shot.shake ? handheld(t * (shot.shake > 0.03 ? 2.2 : 1), shot.shake * 40) : new THREE.Vector3()
    cam.position.copy(k.p).add(sh.clone().multiplyScalar(0.05))
    const look = k.t.clone().add(sh.multiplyScalar(0.12))
    cam.up.set(0, 1, 0)
    cam.lookAt(look)
    cam.rotateZ(k.roll + (shot.shake ? Math.sin(t * 1.9) * shot.shake * 0.6 : 0))
    if (Math.abs(cam.fov - k.fov) > 0.01) {
      cam.fov = k.fov
      cam.updateProjectionMatrix()
    }

    // 天空、雾与月亮
    const tod = shot.time ?? 'horror'
    if (store.get().time !== tod) store.set({ time: tod })
    atmosOverride.moonDir = shot.moon ? new THREE.Vector3(...shot.moon).normalize() : null
    atmosOverride.fogD = shot.fog ?? null
    atmosOverride.instant = cut
    atmosOverride.light = shot.light ?? 0.5

    // 东门铁栅：她跑到时自己打开
    haunt.gateOpen = t >= 133.5 && t < 165

    // 供电：平时轻微闪烁；点名时剧烈闪烁
    let lvl = 1
    if ((t > 74.6 && t < 76) || (t > 150 && t < 153) || (t > 128.6 && t < 130)) lvl = Math.random() < 0.4 ? 0.05 : 0.9
    else if (Math.random() < 0.006) lvl = 0.3
    power.level += (lvl - power.level) * 0.6

    // 主观镜头的手电：逐渐暗下去、闪烁、熄灭
    if (povLight.current) {
      const on = shot.flashlight === true
      let I = 0
      if (on) {
        const fade = THREE.MathUtils.clamp(1 - (t - 157.5) / 2.2, 0, 1)
        I = 150 * fade * (Math.random() < 0.18 + (1 - fade) * 0.5 ? 0.15 : 1)
        if (t > 159.7) I = 0
      }
      povLight.current.intensity = I
      const fwd = new THREE.Vector3()
      cam.getWorldDirection(fwd)
      povLight.current.position.copy(cam.position).add(new THREE.Vector3(0.2, -0.3, 0))
      povTarget.position.copy(cam.position).addScaledVector(fwd, 10)
      povLight.current.target = povTarget
    }
  })

  return <spotLight ref={povLight} angle={0.42} penumbra={0.6} distance={60} decay={1.5} color="#fff0d2" castShadow shadow-mapSize={[1024, 1024]} />
}
