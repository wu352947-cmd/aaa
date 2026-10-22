import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { G, game, PAGE_COUNT, say } from './state'
import { bindKeyboard, input, moveAxes, sprintHeld } from './input'
import { resolve } from './collision'
import { sfx } from './audio'
import { PLACES } from '../data/places'

export const SPAWN = new THREE.Vector3(-110, 0, 120)
const EYE = 1.62
const WALK = 3.3
const RUN = 6.4

/** 第一人称：指针锁定视角、移动、碰撞、头部晃动、手电筒 */
export function Player() {
  const { camera, gl } = useThree()
  const yaw = useRef(Math.PI) // 面向北（-z）
  const pitch = useRef(-0.08)
  const bob = useRef(0)
  const lastStep = useRef(0)
  const light = useRef<THREE.SpotLight>(null)
  const fill = useRef<THREE.PointLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const runId = useRef(-1)

  useEffect(() => bindKeyboard(), [])

  // 鼠标视角：点击画布进入指针锁定；拒绝时退回按住拖动
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    const onDown = () => {
      if (game.get().phase !== 'playing') return
      try {
        const r = el.requestPointerLock() as unknown as Promise<void> | undefined
        r?.catch?.(() => (dragging = true))
      } catch {
        dragging = true
      }
      dragging = true
    }
    const onUp = () => (dragging = false)
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === el || dragging) {
        input.lookDX += e.movementX
        input.lookDY += e.movementY
      }
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
    }
  }, [gl])

  // 手电筒开关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && game.get().phase === 'playing') {
        G.flashlightOn = !G.flashlightOn
        sfx.click()
        game.set({ flashlight: G.flashlightOn })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame(({ scene }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const ui = game.get()
    if (ui.runId !== runId.current) {
      runId.current = ui.runId
      G.player.copy(SPAWN)
      yaw.current = Math.PI
      pitch.current = -0.08
    }
    if (!target.parent) scene.add(target)

    if (ui.phase === 'menu') yaw.current += dt * 0.04 // 菜单背景：缓缓环顾
    if (ui.phase === 'playing') {
      yaw.current -= input.lookDX * 0.0022
      pitch.current = THREE.MathUtils.clamp(pitch.current - input.lookDY * 0.0022, -1.3, 1.3)
    }
    input.lookDX = 0
    input.lookDY = 0

    // 移动
    const { x, y } = ui.phase === 'playing' ? moveAxes() : { x: 0, y: 0 }
    const moving = Math.hypot(x, y) > 0.05
    const wantRun = sprintHeld() && moving && G.stamina > 0.02
    G.sprinting = wantRun
    G.moving = moving
    G.stamina = THREE.MathUtils.clamp(G.stamina + (wantRun ? -0.2 : moving ? 0.08 : 0.14) * dt, 0, 1)
    const speed = wantRun ? RUN : WALK * (G.stamina < 0.15 ? 0.75 : 1)
    const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    G.player.addScaledVector(fwd, y * speed * dt).addScaledVector(right, x * speed * dt)
    resolve(G.player, 0.45, G.pagesTaken.size >= PAGE_COUNT)

    // 头部晃动与脚步
    if (moving) bob.current += dt * (wantRun ? 11 : 7.2)
    const bobY = Math.sin(bob.current) * (wantRun ? 0.075 : 0.045)
    const bobX = Math.cos(bob.current * 0.5) * (wantRun ? 0.05 : 0.025)
    const stepPhase = Math.floor(bob.current / Math.PI)
    if (moving && stepPhase !== lastStep.current) {
      lastStep.current = stepPhase
      sfx.footstep(wantRun)
    }
    // 恐惧时的镜头颤抖
    const shake = G.fear * 0.012 + G.scare * 0.04
    camera.position.set(
      G.player.x + right.x * bobX + (Math.random() - 0.5) * shake,
      EYE + bobY + (Math.random() - 0.5) * shake,
      G.player.z + right.z * bobX,
    )
    const e = new THREE.Euler(pitch.current, yaw.current, Math.sin(bob.current * 0.5) * 0.006 + (Math.random() - 0.5) * shake * 0.5, 'YXZ')
    camera.quaternion.setFromEuler(e)
    camera.getWorldDirection(G.look)
    G.playerYaw = yaw.current

    // 手电筒：电量、靠近杀手时闪烁
    if (G.flashlightOn) G.battery = Math.max(0, G.battery - dt / 260)
    let lum = G.flashlightOn ? (G.battery > 0 ? 1 : 0.08) : 0
    if (G.battery < 0.15 && G.flashlightOn) lum *= Math.random() < 0.08 ? 0.1 : 0.55 + G.battery * 3
    if (G.killerDist < 26 && Math.random() < 0.12 + (26 - G.killerDist) / 90) lum *= 0.25 + Math.random() * 0.5
    if (G.scare > 0.5) lum *= Math.random()
    if (light.current) {
      light.current.position.copy(camera.position).addScaledVector(right, 0.25).add(new THREE.Vector3(0, -0.25, 0))
      target.position.copy(camera.position).addScaledVector(G.look, 10)
      light.current.target = target
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, (ui.phase === 'caught' ? 6 : 140) * lum, 0.5)
    }
    if (fill.current) {
      fill.current.position.copy(camera.position)
      fill.current.intensity = 2.5 + lum * 2
    }

    // 地点提示
    if (Math.random() < 0.05) {
      let best: string | null = null
      let bd = 26
      for (const p of PLACES) {
        const d = Math.hypot(p.label[0] - G.player.x, p.label[2] - G.player.z)
        if (d < bd) {
          bd = d
          best = p.name
        }
      }
      if (best !== ui.location) game.set({ location: best })
    }
    // HUD 数据（节流）
    if (Math.random() < 0.15) game.set({ stamina: G.stamina, battery: G.battery, fear: G.fear })
    if (G.battery === 0 && ui.battery > 0) say('手电筒没电了……只剩微弱的余光。')
  })

  return (
    <>
      <spotLight
        ref={light}
        angle={0.42}
        penumbra={0.65}
        distance={70}
        decay={1.6}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-camera-near={0.3}
        shadow-camera-far={60}
      />
      <pointLight ref={fill} distance={7} decay={2} color="#9fa7c4" />
    </>
  )
}
