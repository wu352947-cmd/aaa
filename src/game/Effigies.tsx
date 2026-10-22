import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { G, game } from './state'
import { sfx } from './audio'
import { blockedAt } from './collision'
import { textTexture } from '../lib/textures'
import { TRACK_CENTER } from '../scene/Sports'

/**
 * 纸扎人：中式民俗恐怖。白纸脸、两团腮红、黑点眼、朱红小嘴，纸糊的长袍。
 * 你看不到它们的时候，它们会转过来对着你；有几个还会悄悄挪近。
 */
export function useEffigyParts() {
  return useMemo(() => {
    const face = textTexture('effigy-face', 256, 256, (c, w, h) => {
      c.fillStyle = '#f3efe6'
      c.fillRect(0, 0, w, h)
      for (const x of [0.3, 0.7]) {
        const g = c.createRadialGradient(w * x, h * 0.62, 0, w * x, h * 0.62, w * 0.13)
        g.addColorStop(0, 'rgba(230,60,80,0.85)')
        g.addColorStop(1, 'rgba(230,60,80,0)')
        c.fillStyle = g
        c.fillRect(0, 0, w, h)
        c.fillStyle = '#0b0b0b'
        c.beginPath()
        c.ellipse(w * x, h * 0.46, w * 0.035, w * 0.045, 0, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#111'
        c.lineWidth = 3
        c.beginPath()
        c.moveTo(w * (x - 0.08), h * 0.36)
        c.quadraticCurveTo(w * x, h * 0.32, w * (x + 0.08), h * 0.36)
        c.stroke()
      }
      c.fillStyle = '#b3121a'
      c.beginPath()
      c.ellipse(w * 0.5, h * 0.77, w * 0.05, w * 0.025, 0, 0, Math.PI * 2)
      c.fill()
    })
    const robe = (base: string, trim: string, key: string) =>
      textTexture(key, 256, 256, (c, w, h) => {
        c.fillStyle = base
        c.fillRect(0, 0, w, h)
        c.fillStyle = trim
        for (let y = 0; y < h; y += 46) c.fillRect(0, y, w, 7)
        c.fillStyle = 'rgba(255,215,120,0.7)'
        for (let i = 0; i < 40; i++) {
          c.beginPath()
          c.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 4, 0, Math.PI * 2)
          c.fill()
        }
        // 纸张褶皱
        c.strokeStyle = 'rgba(0,0,0,0.15)'
        for (let i = 0; i < 30; i++) {
          c.beginPath()
          const x = Math.random() * w
          c.moveTo(x, 0)
          c.lineTo(x + (Math.random() - 0.5) * 30, h)
          c.stroke()
        }
      })
    const body = new THREE.LatheGeometry(
      [
        [0.02, 0],
        [0.32, 0.02],
        [0.26, 0.5],
        [0.18, 1.05],
        [0.12, 1.22],
        [0.04, 1.26],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      12,
    )
    return {
      body,
      faceMat: new THREE.MeshStandardMaterial({ map: face, roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.06 }),
      robes: [
        new THREE.MeshStandardMaterial({ map: robe('#9c1a1a', '#e2b04a', 'robe-red'), roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: robe('#1d5a4a', '#e8d9a0', 'robe-green'), roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: robe('#e8e2d4', '#2a2a2a', 'robe-white'), roughness: 0.95 }),
      ],
      hair: new THREE.MeshStandardMaterial({ color: '#070707', roughness: 0.6 }),
      paper: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.95 }),
    }
  }, [])
}

interface Eff {
  pos: THREE.Vector3
  robe: number
  creeper: boolean
  unseen: number
  noticed: boolean
}

function layout(): Eff[] {
  const out: Eff[] = []
  const add = (x: number, z: number, creeper = false) => out.push({ pos: new THREE.Vector3(x, 0, z), robe: out.length % 3, creeper, unseen: 0, noticed: false })
  // 操场中央：三排，像在“做早操”
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) add(TRACK_CENTER[0] - 12 + c * 6, TRACK_CENTER[2] - 8 + r * 6, (r + c) % 4 === 0)
  // 古榕下
  add(-11, 62, true)
  add(9, 74)
  add(-13, 86)
  add(2, 100, true)
  // 钟楼前圆形草坪四周
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    add(-110 + Math.cos(a) * 13, 108 + Math.sin(a) * 13, i % 2 === 0)
  }
  // 升旗台两侧
  add(-10, 16, true)
  add(10, 16)
  return out
}

export function Effigies() {
  const parts = useEffigyParts()
  const data = useMemo(layout, [])
  const groups = useRef<(THREE.Group | null)[]>([])
  const runId = useRef(-1)
  const home = useMemo(() => data.map((e) => e.pos.clone()), [data])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const ui = game.get()
    if (ui.runId !== runId.current) {
      runId.current = ui.runId
      data.forEach((e, i) => {
        e.pos.copy(home[i])
        e.unseen = 0
        e.noticed = false
      })
    }
    data.forEach((e, i) => {
      const g = groups.current[i]
      if (!g) return
      const dx = e.pos.x - G.player.x
      const dz = e.pos.z - G.player.z
      const d = Math.hypot(dx, dz)
      const inView = (G.look.x * dx + G.look.z * dz) / (d || 1) > 0.45
      if (!inView) {
        // 趁你不注意：转身对着你
        g.rotation.y = Math.atan2(-dx, -dz)
        e.unseen += dt
        if (e.creeper && e.unseen > 2.5 && d > 5 && ui.phase === 'playing') {
          const step = Math.min(1.8, d - 4.5)
          const nx = e.pos.x - (dx / d) * step
          const nz = e.pos.z - (dz / d) * step
          if (!blockedAt(nx, nz, 0.5)) e.pos.set(nx, 0, nz)
          e.unseen = 0
        }
      } else {
        e.unseen = 0
        if (d < 6 && !e.noticed && ui.phase === 'playing') {
          e.noticed = true
          sfx.whisper(1.2, 0)
          G.scare = Math.max(G.scare, 0.45)
        }
        if (d > 10) e.noticed = false
      }
      g.position.copy(e.pos)
      // 纸人在风里轻轻颤
      g.rotation.z = Math.sin(performance.now() / 300 + i * 1.7) * 0.02
    })
  })

  return (
    <group>
      {data.map((e, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)} position={e.pos}>
          <EffigyBody parts={parts} robe={e.robe} />
        </group>
      ))}
    </group>
  )
}

/** 纸扎人模型本体（游戏与短片共用） */
export function EffigyBody({ parts, robe }: { parts: ReturnType<typeof useEffigyParts>; robe: number }) {
  const e = { robe }
  return (
    <>
          <mesh geometry={parts.body} material={parts.robes[e.robe]} castShadow />
          {/* 纸糊的扁平脸 */}
          <mesh position={[0, 1.42, 0.02]} scale={[1, 1.15, 0.55]} material={parts.paper}>
            <sphereGeometry args={[0.15, 16, 12]} />
          </mesh>
          <mesh position={[0, 1.43, 0.105]} material={parts.faceMat}>
            <circleGeometry args={[0.13, 24]} />
          </mesh>
          {/* 后脑勺的黑发：转身前后一眼可辨 */}
          <mesh position={[0, 1.44, 0]} scale={[1.04, 1.2, 0.62]} material={parts.hair}>
            <sphereGeometry args={[0.155, 16, 12, Math.PI, Math.PI]} />
          </mesh>
          <mesh position={[0, 1.6, -0.02]} material={parts.hair}>
            <sphereGeometry args={[0.1, 12, 10]} />
          </mesh>
          <mesh position={[0, 1.52, -0.05]} scale={[1.05, 0.7, 0.9]} material={parts.hair}>
            <sphereGeometry args={[0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          {/* 僵直下垂的纸手 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.2, 0.85, 0.02]} rotation={[0, 0, s * 0.12]} material={parts.robes[e.robe]}>
              <cylinderGeometry args={[0.045, 0.06, 0.6, 8]} />
            </mesh>
          ))}
    </>
  )
}
