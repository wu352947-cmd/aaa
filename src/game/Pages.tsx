import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { G, game, PAGE_COUNT, say } from './state'
import { LETTERS } from './story'
import { sfx } from './audio'
import { scripted } from './Events'
import { textTexture } from '../lib/textures'

const PICK_R = 1.9

function letterTexture(i: number) {
  return textTexture(`letter-${i}`, 256, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#d8c9a4')
    g.addColorStop(1, '#a8916a')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    // 折痕与污渍
    c.fillStyle = 'rgba(70,40,20,0.18)'
    c.fillRect(0, h / 2 - 1, w, 2)
    c.fillRect(w / 2 - 1, 0, 2, h)
    for (let k = 0; k < 18; k++) {
      c.fillStyle = `rgba(${90 + Math.random() * 40},10,8,${0.2 + Math.random() * 0.5})`
      c.beginPath()
      c.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 18, 0, Math.PI * 2)
      c.fill()
    }
    // 潦草的红色字迹
    c.strokeStyle = 'rgba(120,10,10,0.85)'
    c.lineWidth = 2
    for (let l = 0; l < 11; l++) {
      c.beginPath()
      let x = 24
      const y = 36 + l * 24
      c.moveTo(x, y)
      while (x < w - 30) {
        x += 6 + Math.random() * 10
        c.lineTo(x, y + (Math.random() - 0.5) * 8)
      }
      c.stroke()
    }
  })
}

function Letter({ index }: { index: number }) {
  const L = LETTERS[index]
  const ref = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: letterTexture(index), roughness: 0.9, emissive: '#5a1a10', emissiveIntensity: 0.6, side: THREE.DoubleSide }), [index])
  const haloMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: textTexture('halo', 128, 128, (c, w) => {
          const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
          g.addColorStop(0, 'rgba(255,60,30,0.9)')
          g.addColorStop(1, 'rgba(255,0,0,0)')
          c.fillStyle = g
          c.fillRect(0, 0, w, w)
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  useFrame(({ clock }) => {
    const taken = G.pagesTaken.has(index)
    if (ref.current) ref.current.visible = !taken && game.get().phase === 'playing'
    if (taken || game.get().phase !== 'playing') return
    const t = clock.elapsedTime
    if (halo.current) {
      halo.current.scale.setScalar(1.2 + Math.sin(t * 3 + index) * 0.25)
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.random() * 0.25
    }
    const d = Math.hypot(G.player.x - L.pos[0], G.player.z - L.pos[2])
    if (d < PICK_R) collect(index)
  })
  return (
    <group ref={ref} position={L.pos}>
      <mesh rotation={[-Math.PI / 2 + 0.15, 0, index]} position={[0, 0.05, 0]} material={mat} castShadow>
        <planeGeometry args={[0.42, 0.52]} />
      </mesh>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} material={haloMat}>
        <planeGeometry args={[1.6, 1.6]} />
      </mesh>
      {/* 一支将熄的蜡烛 */}
      <mesh position={[0.35, 0.12, 0.1]}>
        <cylinderGeometry args={[0.03, 0.035, 0.24, 10]} />
        <meshStandardMaterial color="#e9e1cf" roughness={0.7} />
      </mesh>
      <mesh position={[0.35, 0.27, 0.1]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#ffb060" />
      </mesh>
      <CandleLight />
    </group>
  )
}

function CandleLight() {
  const ref = useRef<THREE.PointLight>(null)
  useFrame(() => {
    if (ref.current) ref.current.intensity = 1.6 + Math.random() * 1.2
  })
  return <pointLight ref={ref} position={[0.35, 0.4, 0.1]} color="#ff8a3a" distance={6} decay={2} />
}

function collect(i: number) {
  if (G.pagesTaken.has(i)) return
  G.pagesTaken.add(i)
  const n = G.pagesTaken.size
  G.aggression = n
  G.battery = Math.min(1, G.battery + 0.3)
  sfx.paper()
  const L = LETTERS[i]
  game.set({ pages: n, letter: { title: L.title, body: L.body } })
  window.setTimeout(() => {
    if (game.get().letter?.title === L.title) game.set({ letter: null })
  }, 11000)
  if (n === PAGE_COUNT) say('远处传来铁链落地的声音……东门的锁开了。', 6000)
  scripted(n)
}

export function Pages() {
  return (
    <group>
      {LETTERS.map((_, i) => (
        <Letter key={i} index={i} />
      ))}
    </group>
  )
}
