import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { G, game } from './state'
import { sfx } from './audio'
import { freeSpotNear, haunt } from './Events'
import { lineOfSight, GATE_Z } from './collision'
import { BLOOD_WORDS } from './story'
import { textTexture } from '../lib/textures'
import { flashFace } from './face'

/** 白衣长发女学生的幽灵：低头站立，长发遮脸，靠近或盯着看就会消失 */
function useGhostParts() {
  return useMemo(() => {
    const dress = new THREE.LatheGeometry(
      [
        [0.02, 0],
        [0.3, 0.02],
        [0.24, 0.6],
        [0.17, 1.1],
        [0.15, 1.32],
        [0.06, 1.42],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      18,
    )
    const hair = new THREE.CylinderGeometry(0.13, 0.19, 0.95, 16, 4, true)
    const pos = hair.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.sin(pos.getY(i) * 9 + pos.getZ(i) * 20) * 0.015)
    hair.computeVertexNormals()
    const white = new THREE.MeshStandardMaterial({ color: '#d9dde0', emissive: '#7f8fa0', emissiveIntensity: 0.35, roughness: 0.9, transparent: true, opacity: 0.88 })
    const skin = new THREE.MeshStandardMaterial({ color: '#c9cdd0', emissive: '#6b7480', emissiveIntensity: 0.3, roughness: 0.8, transparent: true, opacity: 0.9 })
    const black = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    return { dress, hair, white, skin, black }
  }, [])
}

function GhostBody({ parts }: { parts: ReturnType<typeof useGhostParts> }) {
  return (
    <group>
      <mesh geometry={parts.dress} material={parts.white} />
      <mesh position={[0, 1.5, 0.02]} material={parts.skin}>
        <sphereGeometry args={[0.11, 16, 12]} />
      </mesh>
      {/* 长发垂过脸，一直到腰 */}
      <mesh geometry={parts.hair} material={parts.black} position={[0, 1.18, 0.01]} rotation={[0.12, 0, 0]} />
      <mesh position={[0, 1.58, 0]} material={parts.black}>
        <sphereGeometry args={[0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.19, 1.0, 0.03]} rotation={[0, 0, s * 0.08]} material={parts.skin}>
          <cylinderGeometry args={[0.028, 0.022, 0.62, 8]} />
        </mesh>
      ))}
    </group>
  )
}

interface Ghost {
  pos: THREE.Vector3
  alive: boolean
  stare: number
  respawn: number
  lunge: boolean
}

export function Ghosts() {
  const parts = useGhostParts()
  const groups = useRef<(THREE.Group | null)[]>([])
  const ghosts = useRef<Ghost[]>(Array.from({ length: 6 }, () => ({ pos: new THREE.Vector3(), alive: false, stare: 0, respawn: 6 + Math.random() * 20, lunge: false })))

  useFrame((_, dt) => {
    const playing = game.get().phase === 'playing'
    const swarm = performance.now() / 1000 < haunt.ghostSwarmUntil
    const maxAlive = swarm ? 6 : 1 + Math.min(2, G.aggression > 2 ? 2 : 0)
    let alive = 0
    ghosts.current.forEach((g, i) => {
      const obj = groups.current[i]
      if (!obj) return
      if (!playing) {
        obj.visible = false
        return
      }
      if (!g.alive) {
        g.respawn -= dt * (swarm ? 4 : 1)
        if (g.respawn <= 0 && alive < maxAlive) {
          const p = freeSpotNear(G.player.x, G.player.z, swarm ? 7 : 16, swarm ? 14 : 30, true)
          if (p) {
            g.pos.copy(p)
            g.alive = true
            g.stare = 0
            g.lunge = false
          }
        }
      }
      if (g.alive) {
        alive++
        const d = g.pos.distanceTo(new THREE.Vector3(G.player.x, 0, G.player.z))
        const to = new THREE.Vector3().subVectors(g.pos, G.player).setY(0).normalize()
        const looking = G.look.x * to.x + G.look.z * to.z > 0.93 && lineOfSight(G.player, g.pos)
        if (looking) g.stare += dt
        // 盯着她看太久：一半概率尖叫着扑到你脸上
        if (!g.lunge && g.stare > 1.1 && Math.random() < 0.55) {
          g.lunge = true
          sfx.shriek()
        }
        if (g.lunge) {
          const step = Math.min(d, 17 * dt)
          g.pos.addScaledVector(new THREE.Vector3().subVectors(G.player, g.pos).setY(0).normalize(), step)
          if (d < 1.1) {
            flashFace(380, 'girl', 1)
            sfx.stinger(1)
            G.scare = 1
            g.alive = false
            g.respawn = 20 + Math.random() * 25
          }
        }
        // 被盯太久或靠得太近：伴随低语消失
        else if (d < (swarm ? 4 : 8) || g.stare > 1.6 || d > 60) {
          g.alive = false
          g.respawn = 8 + Math.random() * 25
          if (d < 20) {
            sfx.whisper(1.6)
            G.scare = Math.max(G.scare, 0.6)
          }
        }
        obj.position.copy(g.pos)
        // 转身面向玩家，身体轻微漂浮、偶尔一抖
        obj.rotation.y = Math.atan2(G.player.x - g.pos.x, G.player.z - g.pos.z)
        obj.position.y = g.lunge ? 0.25 : 0.05 + Math.sin(performance.now() / 600 + i) * 0.04
        obj.visible = Math.random() > 0.06
        if (Math.random() < 0.02) obj.rotation.z = (Math.random() - 0.5) * 0.4
        else obj.rotation.z *= 0.8
      } else obj.visible = false
    })
  })

  return (
    <group>
      {ghosts.current.map((_, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)} visible={false}>
          <GhostBody parts={parts} />
        </group>
      ))}
    </group>
  )
}

/** 墙上的血字：随剧情逐渐浮现 */
const WRITINGS: { text: string; pos: [number, number, number]; rotY: number; w: number; min: number }[] = [
  { text: BLOOD_WORDS[0], pos: [-96, 3.2, 80.05], rotY: 0, w: 7, min: 0 },
  { text: BLOOD_WORDS[1], pos: [-27, 2.6, -12.7], rotY: 0, w: 9, min: 0.3 },
  { text: BLOOD_WORDS[2], pos: [-42, 4.5, 88.05], rotY: 0, w: 8, min: 0.6 },
  { text: BLOOD_WORDS[3], pos: [30, 2.6, -12.7], rotY: 0, w: 6, min: 0.6 },
  { text: BLOOD_WORDS[4], pos: [-122, 2.2, -44.4], rotY: 0, w: 7, min: 0.6 },
  { text: BLOOD_WORDS[5], pos: [102 - 0.05, 4, -80], rotY: -Math.PI / 2, w: 8, min: 0.6 },
  { text: BLOOD_WORDS[6], pos: [-150.95, 3, 60], rotY: Math.PI / 2, w: 8, min: 0.6 },
  { text: BLOOD_WORDS[7], pos: [-91 + 0.05, 3, -52], rotY: Math.PI / 2, w: 8, min: 0.6 },
]

function bloodTexture(text: string) {
  return textTexture(`blood-${text}`, 1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h)
    c.font = `900 150px "Noto Serif SC","WenQuanYi Zen Hei",serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#7c0606'
    c.save()
    c.translate(w / 2, h * 0.42)
    c.rotate(-0.03)
    c.fillText(text, 0, 0)
    c.restore()
    // 往下流的血痕
    for (let i = 0; i < 46; i++) {
      const x = w * 0.12 + Math.random() * w * 0.76
      const y = h * 0.42 + (Math.random() - 0.3) * 50
      const len = 20 + Math.random() * 110
      const g = c.createLinearGradient(0, y, 0, y + len)
      g.addColorStop(0, 'rgba(110,4,4,0.95)')
      g.addColorStop(1, 'rgba(80,0,0,0)')
      c.fillStyle = g
      c.fillRect(x, y, 2 + Math.random() * 4, len)
    }
    // 手印
    for (let i = 0; i < 2; i++) {
      c.fillStyle = 'rgba(100,5,5,0.7)'
      const x = Math.random() * w
      c.beginPath()
      c.ellipse(x, h * 0.75, 18, 24, 0, 0, Math.PI * 2)
      c.fill()
      for (let f = 0; f < 4; f++) c.fillRect(x - 16 + f * 10, h * 0.75 - 58, 6, 34)
    }
  })
}

export function BloodWriting() {
  const mats = useMemo(
    () =>
      WRITINGS.map(
        (wr) =>
          new THREE.MeshStandardMaterial({
            map: bloodTexture(wr.text),
            transparent: true,
            opacity: 0,
            roughness: 0.25,
            metalness: 0.1,
            emissive: '#3a0000',
            emissiveIntensity: 0.6,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
      ),
    [],
  )
  useFrame((_, dt) => {
    WRITINGS.forEach((wr, i) => {
      const target = haunt.bloodLevel >= wr.min ? 0.95 : 0
      mats[i].opacity += (target - mats[i].opacity) * Math.min(1, dt * 0.4)
    })
  })
  return (
    <group>
      {WRITINGS.map((wr, i) => (
        <mesh key={i} position={wr.pos} rotation={[0, wr.rotY, 0]} material={mats[i]}>
          <planeGeometry args={[wr.w, wr.w / 4]} />
        </mesh>
      ))}
      {/* 广场地面上的血迹 */}
      <mesh rotation={[-Math.PI / 2, 0, 0.4]} position={[-6, 0.06, 30]} material={mats[0]}>
        <planeGeometry args={[8, 2]} />
      </mesh>
    </group>
  )
}

/** 东门铁栅门：集齐信件前锁死，之后缓缓滑开 */
export function IronGate() {
  const ref = useRef<THREE.Group>(null)
  const len = GATE_Z[1] - GATE_Z[0]
  useFrame((_, dt) => {
    if (!ref.current) return
    const open = haunt.gateOpen ? len : 0
    ref.current.position.z += (GATE_Z[0] + len / 2 - open - ref.current.position.z) * Math.min(1, dt * 0.6)
  })
  const bars = useMemo(() => Array.from({ length: Math.round(len / 0.25) }, (_, i) => -len / 2 + i * 0.25), [len])
  return (
    <group ref={ref} position={[174, 0, GATE_Z[0] + len / 2]}>
      {bars.map((z) => (
        <mesh key={z} position={[0, 1.4, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 2.8, 6]} />
          <meshStandardMaterial color="#2b2a2a" metalness={0.8} roughness={0.5} />
        </mesh>
      ))}
      {[0.3, 2.7].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.08, 0.08, len]} />
          <meshStandardMaterial color="#2b2a2a" metalness={0.8} roughness={0.5} />
        </mesh>
      ))}
      {/* 挂锁与铁链 */}
      <mesh position={[0.1, 1.4, 0]}>
        <boxGeometry args={[0.12, 0.3, 0.24]} />
        <meshStandardMaterial color="#7a6a3a" metalness={0.9} roughness={0.4} />
      </mesh>
    </group>
  )
}
