import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { G, game, say } from './state'
import { blockedAt, lineOfSight, resolve } from './collision'
import { sfx } from './audio'
import { textTexture } from '../lib/textures'
import { flashFace } from './face'

/**
 * 开膛手杰克（Jack the Ripper，1888 年伦敦白教堂）
 * 维多利亚式高礼帽、黑色长披风、惨白面孔、空洞双眼里的红光、手术刀。
 */
function useKillerParts() {
  return useMemo(() => {
    const coat = new THREE.LatheGeometry(
      [
        [0.05, 0],
        [0.42, 0.02],
        [0.36, 0.5],
        [0.27, 1.1],
        [0.24, 1.5],
        [0.2, 1.72],
        [0.08, 1.8],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      24,
    )
    const cape = new THREE.LatheGeometry(
      [
        [0.5, 1.2],
        [0.42, 1.4],
        [0.3, 1.62],
        [0.16, 1.76],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      24,
    )
    const face = textTexture('ripper-face', 256, 256, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, w * 0.6)
      g.addColorStop(0, '#d9d4cc')
      g.addColorStop(1, '#8a8379')
      c.fillStyle = g
      c.fillRect(0, 0, w, h)
      // 深陷的眼窝
      for (const x of [0.36, 0.64]) {
        const eg = c.createRadialGradient(w * x, h * 0.42, 2, w * x, h * 0.42, 34)
        eg.addColorStop(0, '#000')
        eg.addColorStop(0.7, '#120808')
        eg.addColorStop(1, 'rgba(40,20,20,0)')
        c.fillStyle = eg
        c.beginPath()
        c.ellipse(w * x, h * 0.42, 30, 24, 0, 0, Math.PI * 2)
        c.fill()
      }
      // 咧到耳根的笑
      c.strokeStyle = '#1a0606'
      c.lineWidth = 7
      c.beginPath()
      c.moveTo(w * 0.2, h * 0.62)
      c.quadraticCurveTo(w * 0.5, h * 0.84, w * 0.8, h * 0.62)
      c.stroke()
      c.fillStyle = '#e8e1d0'
      for (let i = 0; i < 13; i++) {
        const t = i / 12
        const x = w * (0.24 + t * 0.52)
        const y = h * (0.64 + Math.sin(t * Math.PI) * 0.15)
        c.fillRect(x - 3, y - 7, 5, 9)
      }
      // 血迹
      c.fillStyle = 'rgba(110,8,8,0.85)'
      for (let i = 0; i < 9; i++) c.fillRect(w * (0.3 + Math.random() * 0.4), h * (0.72 + Math.random() * 0.1), 3, 10 + Math.random() * 40)
    })
    const eyes = textTexture('ripper-eyes', 256, 256, (c, w, h) => {
      c.fillStyle = '#000'
      c.fillRect(0, 0, w, h)
      for (const x of [0.36, 0.64]) {
        const g = c.createRadialGradient(w * x, h * 0.42, 0, w * x, h * 0.42, 12)
        g.addColorStop(0, '#fff2e0')
        g.addColorStop(0.3, '#ff2a14')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        c.fillStyle = g
        c.fillRect(0, 0, w, h)
      }
    })
    return {
      coat,
      cape,
      coatMat: new THREE.MeshStandardMaterial({ color: '#0e0d10', roughness: 0.92 }),
      lining: new THREE.MeshStandardMaterial({ color: '#3d0a0c', roughness: 0.8, side: THREE.BackSide }),
      faceMat: new THREE.MeshStandardMaterial({ map: face, emissiveMap: eyes, emissive: new THREE.Color('#ff3020'), emissiveIntensity: 6, roughness: 0.6 }),
      hatMat: new THREE.MeshStandardMaterial({ color: '#09080a', roughness: 0.5, metalness: 0.1 }),
      skin: new THREE.MeshStandardMaterial({ color: '#b9b1a5', roughness: 0.7 }),
      blade: new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.15, metalness: 1 }),
      blood: new THREE.MeshStandardMaterial({ color: '#4a0303', roughness: 0.3 }),
    }
  }, [])
}

type Mode = 'stalk' | 'chase' | 'search'

export function Killer() {
  const p = useKillerParts()
  const root = useRef<THREE.Group>(null)
  const knifeArm = useRef<THREE.Group>(null)
  const eyeLight = useRef<THREE.PointLight>(null)
  const head = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const s = useRef({
    mode: 'stalk' as Mode,
    lastSeen: new THREE.Vector3(),
    lostFor: 0,
    nextTeleport: 40,
    stuck: 0,
    lastPos: new THREE.Vector3(),
    flicker: 0,
    seenLatch: false,
    chaseNoticed: false,
    stare: 0,
    tilt: 0,
    behindArmed: false,
    stepT: 0,
    runId: -1,
    t: 0,
  })

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const st = s.current
    const ui = game.get()
    const g = root.current
    if (!g) return
    if (st.runId !== ui.runId) {
      st.runId = ui.runId
      st.mode = 'stalk'
      st.nextTeleport = 45
      st.t = 0
      st.seenLatch = false
    }

    // 被抓：贴脸惊吓
    if (ui.phase === 'caught') {
      const fwd = new THREE.Vector3()
      camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      g.position.copy(camera.position).addScaledVector(fwd, 0.95)
      g.position.y = camera.position.y - 1.97
      g.lookAt(camera.position.x, g.position.y, camera.position.z)
      g.visible = Math.random() > 0.08
      if (knifeArm.current) knifeArm.current.rotation.x = -2.2 + Math.sin(performance.now() / 40) * 0.3
      if (eyeLight.current) eyeLight.current.intensity = 1.2
      return
    }
    if (ui.phase !== 'playing') {
      g.visible = false
      return
    }
    st.t += dt

    const pos = G.killer
    const toP = new THREE.Vector3().subVectors(G.player, pos).setY(0)
    const dist = toP.length()
    G.killerDist = dist
    const los = dist < 80 && lineOfSight(pos, G.player)
    const aggr = G.aggression
    const grace = st.t < 25 && !G.noGrace // 开局缓冲

    // 感知：看见手电光、听见奔跑、近距离直接发现
    const detectR = 16 + aggr * 3 + (G.flashlightOn ? 12 : 0)
    const hearR = 24 + aggr * 3
    // 潜伏阶段他喜欢“玩弄”你：只在你奔跑或靠得太近时才扑上来
    const detected = !grace && ((st.mode !== 'stalk' && los && dist < detectR) || (G.sprinting && dist < hearR) || dist < 8)
    if (detected) {
      if (st.mode !== 'chase') {
        st.chaseNoticed = true
        sfx.stinger(0.7)
        G.scare = 1
        say(['他发现你了，快跑！', '别回头，跑！', '刀锋划过空气的声音越来越近……'][Math.floor(Math.random() * 3)], 3000)
      }
      st.mode = 'chase'
      st.lastSeen.copy(G.player)
      st.lostFor = 0
    } else if (st.mode === 'chase') {
      st.lostFor += dt
      if (st.lostFor > 4) {
        st.mode = 'search'
        say('脚步声停了。他在找你。', 3000)
      }
    } else if (st.mode === 'search') {
      st.lostFor += dt
      if (st.lostFor > 14) st.mode = 'stalk'
    }

    // 移动目标与速度
    let goal = G.player
    let speed = 2.2 + aggr * 0.25
    if (st.mode === 'chase') {
      goal = los ? G.player : st.lastSeen
      speed = 4.7 + aggr * 0.28
    } else if (st.mode === 'search') {
      goal = st.lastSeen
      speed = 3
    } else if (!grace) {
      // “木头人”：被你看着时一动不动，一转开视线就迅速逼近
      if (G.killerSeen) {
        speed = 0
        st.stare += dt
        if (st.stare > 0.4 && st.stare - dt <= 0.4 && dist < 40) sfx.laugh()
        // 盯得太久，他会扑过来
        if (st.stare > 3.2 && dist < 24) {
          st.mode = 'chase'
          st.lastSeen.copy(G.player)
          sfx.stinger(1)
          flashFace(140, 'ripper', 0.8)
          G.scare = 1
        }
      } else {
        st.stare = Math.max(0, st.stare - dt * 0.5)
        speed = dist > 13 ? 5.6 + aggr * 0.3 : 0.4
      }
    } else if (dist < 34) speed = 0.6

    const dir = new THREE.Vector3().subVectors(goal, pos).setY(0)
    if (dir.lengthSq() > 0.04) {
      dir.normalize()
      // 简单避障：前方被挡时向两侧试探
      const probe = (d: THREE.Vector3) => !blockedAt(pos.x + d.x * 2.5, pos.z + d.z * 2.5, 0.6)
      if (!probe(dir)) {
        for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
          if (probe(d2)) {
            dir.copy(d2)
            break
          }
        }
      }
      pos.addScaledVector(dir, speed * dt)
      resolve(pos, 0.5, false)
    }

    // 卡住：瞬移到玩家附近看不见的地方
    st.stuck += dt
    if (st.stuck > 2.5) {
      if (pos.distanceTo(st.lastPos) < 1 && st.mode !== 'stalk') teleportNear(10, 16)
      st.lastPos.copy(pos)
      st.stuck = 0
    }

    // 灵异瞬移：出现在你身后
    st.nextTeleport -= dt * (1 + aggr * 0.35)
    if (st.nextTeleport <= 0 && st.mode === 'stalk' && !grace) {
      st.nextTeleport = 30 + Math.random() * 30
      if (teleportNear(7, 11, true)) {
        st.behindArmed = true
        sfx.phantomSteps(5, (Math.random() - 0.5) * 1.4)
        say('身后……好像有脚步声。', 3500)
      }
    }

    // 被看到的一瞬间
    const fwd = G.look
    const toK = new THREE.Vector3().subVectors(pos, G.player).setY(0).normalize()
    const facing = fwd.x * toK.x + fwd.z * toK.z
    G.killerSeen = los && facing > 0.88 && dist < 50 && g.visible
    if (G.killerSeen && st.behindArmed && dist < 20) {
      // 你回头的那一瞬间
      st.behindArmed = false
      flashFace(320, 'ripper', 1)
      sfx.stinger(1.2)
      sfx.laugh()
      G.scare = 1
    }
    if (G.killerSeen && !st.seenLatch) {
      st.seenLatch = true
      if (st.mode !== 'chase') {
        sfx.stinger(0.55)
        G.scare = Math.max(G.scare, 0.8)
      }
    } else if (!G.killerSeen && facing < 0.6) st.seenLatch = false

    // 外观：远处若隐若现，追逐时偶尔“掉帧”般跳动
    st.flicker -= dt
    if (st.mode !== 'chase' && dist > 22) {
      if (st.flicker <= 0) {
        g.visible = Math.random() < 0.75
        st.flicker = 0.05 + Math.random() * 0.4
      }
    } else g.visible = Math.random() > 0.03
    g.position.set(pos.x, 0, pos.z)
    if (st.mode === 'chase' && Math.random() < 0.04) g.position.addScaledVector(dir, 0.6)
    g.rotation.y = Math.atan2(G.player.x - pos.x, G.player.z - pos.z)
    const sway = Math.sin(st.t * (st.mode === 'chase' ? 9 : 3)) * (st.mode === 'chase' ? 0.07 : 0.025)
    g.rotation.z = sway
    g.position.y = Math.abs(Math.sin(st.t * (st.mode === 'chase' ? 9 : 3))) * (st.mode === 'chase' ? 0.06 : 0.01)
    if (knifeArm.current) knifeArm.current.rotation.x = st.mode === 'chase' ? -0.9 + Math.sin(st.t * 9) * 0.5 : -0.15
    if (eyeLight.current) eyeLight.current.intensity = 2 + Math.random() * 1.5

    // 被注视时脖子慢慢歪到一个不自然的角度
    st.tilt += ((G.killerSeen && st.mode !== 'chase' ? Math.min(1.25, 0.3 + st.stare * 0.4) : Math.sin(st.t * 0.7) * 0.08) - st.tilt) * Math.min(1, dt * 3)
    if (head.current) {
      head.current.rotation.z = st.tilt + (Math.random() < 0.03 ? (Math.random() - 0.5) * 0.3 : 0)
      head.current.rotation.y = Math.sin(st.t * 13) * (st.mode === 'chase' ? 0.06 : 0)
    }
    // 方位声
    sfx.spatial(camera.position, G.look, pos, st.mode === 'chase', dist < 45)
    const moving = speed > 1 && dir.lengthSq() > 0
    st.stepT -= dt
    if (moving && st.stepT <= 0) {
      st.stepT = st.mode === 'chase' ? 0.3 : 0.48
      sfx.killerStep(st.mode === 'chase')
    }

    // 恐惧值
    const target = THREE.MathUtils.clamp((st.mode === 'chase' ? 0.55 : 0) + (1 - dist / 45) * 0.7 + (G.killerSeen ? 0.25 : 0), 0, 1)
    G.fear += (target - G.fear) * Math.min(1, dt * 1.5)
    G.scare = Math.max(0, G.scare - dt * 0.8)
    sfx.update(G.fear, st.mode === 'chase')

    // 抓住
    if (dist < 1.15 && !grace) {
      G.caughtAt = performance.now()
      flashFace(1500, 'ripper', 1)
      sfx.scream()
      sfx.stopAll()
      G.scare = 1
      const lines = ['他在你耳边轻声说：“From Hell.”', '刀锋冰冷。雾气吞没了最后的光。', '钟楼敲响了第十三下。', '明天的早读，你的座位空着。']
      game.set({ phase: 'caught', epitaph: lines[Math.floor(Math.random() * lines.length)] })
      document.exitPointerLock?.()
    }

    function teleportNear(rMin: number, rMax: number, behind = false) {
      for (let i = 0; i < 24; i++) {
        let a = Math.random() * Math.PI * 2
        if (behind) a = Math.atan2(-G.look.x, -G.look.z) + (Math.random() - 0.5) * 1.2
        const r = rMin + Math.random() * (rMax - rMin)
        const x = G.player.x + Math.sin(a) * r
        const z = G.player.z + Math.cos(a) * r
        if (blockedAt(x, z, 1)) continue
        const cand = new THREE.Vector3(x, 0, z)
        // 只在玩家看不到的位置出现
        const d = new THREE.Vector3().subVectors(cand, G.player).normalize()
        if (G.look.x * d.x + G.look.z * d.z > 0.3) continue
        pos.copy(cand)
        resolve(pos, 0.5, false)
        return true
      }
      return false
    }
  })

  return (
    <group ref={root}>
      <mesh geometry={p.coat} material={p.coatMat} castShadow />
      <mesh geometry={p.coat} material={p.lining} scale={[0.97, 1, 0.97]} />
      <mesh geometry={p.cape} material={p.coatMat} castShadow />
      {/* 头（含礼帽），可歪头 */}
      <group ref={head} position={[0, 1.8, 0]}>
      <group position={[0, -1.8, 0]}>
      <mesh position={[0, 1.93, 0.01]} scale={[1, 1.18, 1]} material={p.faceMat} rotation={[0, -Math.PI / 2, 0]}>
        <sphereGeometry args={[0.13, 32, 24]} />
      </mesh>
      {/* 高礼帽 */}
      <mesh position={[0, 2.06, 0]} material={p.hatMat} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.02, 32]} />
      </mesh>
      <mesh position={[0, 2.2, 0]} material={p.hatMat} castShadow>
        <cylinderGeometry args={[0.135, 0.125, 0.27, 32]} />
      </mesh>
      </group>
      </group>
      {/* 左臂：垂在身侧，指节细长 */}
      <group position={[-0.28, 1.62, 0]} rotation={[0.1, 0, 0.12]}>
        <mesh position={[0, -0.42, 0]} material={p.coatMat}>
          <cylinderGeometry args={[0.055, 0.045, 0.84, 10]} />
        </mesh>
        <mesh position={[0, -0.9, 0]} material={p.skin}>
          <boxGeometry args={[0.07, 0.2, 0.04]} />
        </mesh>
      </group>
      {/* 右臂 + 手术刀 */}
      <group ref={knifeArm} position={[0.28, 1.62, 0]} rotation={[-0.15, 0, -0.1]}>
        <mesh position={[0, -0.42, 0]} material={p.coatMat}>
          <cylinderGeometry args={[0.055, 0.045, 0.84, 10]} />
        </mesh>
        <mesh position={[0, -0.88, 0]} material={p.skin}>
          <boxGeometry args={[0.08, 0.14, 0.06]} />
        </mesh>
        <mesh position={[0, -0.97, 0.13]} rotation={[Math.PI / 2, 0, 0]} material={p.blade}>
          <boxGeometry args={[0.015, 0.28, 0.035]} />
        </mesh>
        <mesh position={[0, -0.97, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={p.blood}>
          <boxGeometry args={[0.017, 0.1, 0.037]} />
        </mesh>
      </group>
      <pointLight ref={eyeLight} position={[0, 1.95, 0.3]} color="#ff2a10" distance={5} decay={2} intensity={2} />
    </group>
  )
}
