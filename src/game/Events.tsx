import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { G, game, say } from './state'
import { sfx } from './audio'
import { power } from '../lib/materials'
import { blockedAt } from './collision'
import { TRACK_CENTER } from '../scene/Sports'

/** 剧情事件与随机灵异事件 */
const fx = {
  outageUntil: 0,
  floodUntil: 0,
  bloodLevel: 0, // 墙上血字显现程度（0..1）
  ghostSwarmUntil: 0,
  gateOpen: false,
  nextAmbient: 18,
}
export const haunt = fx

const now = () => performance.now() / 1000

export function scripted(n: number) {
  const t = now()
  switch (n) {
    case 1:
      window.setTimeout(() => {
        sfx.bell(13, 1.6)
        say('钟楼……敲了十三下？', 5000)
      }, 2500)
      break
    case 2:
      fx.outageUntil = t + 7
      sfx.radio(3)
      window.setTimeout(() => sfx.speak('同学们，请不要离开教室。重复，请不要离开教室。'), 800)
      say('整个校园的灯一下子全灭了。广播里有人在说话。', 5000)
      break
    case 3:
      window.setTimeout(() => {
        fx.floodUntil = now() + 2.2
        G.killer.set(TRACK_CENTER[0] + (Math.random() - 0.5) * 10, 0, TRACK_CENTER[2])
        sfx.stinger(1)
        G.scare = 1
        sfx.musicBox(true)
        say('探照灯亮了。操场中央站着一个人。', 4500)
      }, 3500)
      break
    case 4:
      fx.bloodLevel = 1
      sfx.whisper(4, -0.6)
      window.setTimeout(() => sfx.whisper(3.5, 0.7), 1500)
      say('墙上……什么时候多了这些字？', 4500)
      break
    case 5:
      fx.ghostSwarmUntil = t + 25
      sfx.musicBox(false)
      sfx.stinger(0.8)
      say('她们都在看着你。', 4000)
      break
    case 6:
      fx.gateOpen = true
      fx.outageUntil = t + 3
      G.aggression = 8
      sfx.stinger(1)
      sfx.bell(3, 1.2)
      window.setTimeout(() => say('去东门！就在天文台东边！', 6000), 6500)
      break
  }
}

export function resetHaunt() {
  fx.outageUntil = 0
  fx.floodUntil = 0
  fx.bloodLevel = 0.35
  fx.ghostSwarmUntil = 0
  fx.gateOpen = false
  fx.nextAmbient = 18
  sfx.musicBox(false)
}

const AMBIENT_LINES = ['你听见有人在叫你的名字。', '走廊的窗户后面，好像有张脸。', '风里有铁锈的味道。', '刚才那是……笑声？', '手机没有信号。时间停在 00:13。']

/** 每帧：断电闪烁、探照灯爆闪、随机灵异事件、逃脱判定 */
export function Events() {
  const flood = useRef<THREE.PointLight>(null)
  useFrame((_, dt) => {
    const ui = game.get()
    const t = now()
    // 供电：平时轻微闪烁，断电时几乎全黑，杀手靠近时剧烈闪烁
    let lvl = 1
    if (t < fx.outageUntil) lvl = Math.random() < 0.06 ? 0.7 : 0.02
    else if (G.killerDist < 30) lvl = Math.random() < 0.25 ? Math.random() * 0.4 : 1
    else if (Math.random() < 0.01) lvl = 0.2
    power.level += (lvl - power.level) * 0.5
    if (flood.current) flood.current.intensity = t < fx.floodUntil ? (Math.random() < 0.8 ? 25000 : 0) : 0

    if (ui.phase !== 'playing') return

    // 随机灵异事件
    fx.nextAmbient -= dt
    if (fx.nextAmbient <= 0) {
      fx.nextAmbient = 16 + Math.random() * 22
      const r = Math.random()
      if (r < 0.3) sfx.whisper(2.5)
      else if (r < 0.5) {
        sfx.radio(1.8)
        if (Math.random() < 0.5) window.setTimeout(() => sfx.speak(['回教室去', '还没到放学时间', '最后一个人，请锁好门'][Math.floor(Math.random() * 3)]), 600)
      } else if (r < 0.65) sfx.phantomSteps(3, (Math.random() - 0.5) * 2)
      else if (r < 0.78) {
        fx.outageUntil = t + 1.5 + Math.random() * 2
      } else if (r < 0.88) sfx.bell(1)
      else sfx.musicBox(true)
      if (Math.random() < 0.4) say(AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)], 3500)
      if (r >= 0.88) window.setTimeout(() => sfx.musicBox(false), 9000)
    }

    // 逃出东门
    if (fx.gateOpen && G.player.x > 175) {
      sfx.stopAll()
      document.exitPointerLock?.()
      game.set({ phase: 'escaped', time: (performance.now() - G.startedAt) / 1000 })
    }
  })
  return <pointLight ref={flood} position={[TRACK_CENTER[0], 24, TRACK_CENTER[2]]} distance={160} decay={1.2} color="#e8f0ff" />
}

export function freeSpotNear(cx: number, cz: number, rMin: number, rMax: number, inFront: boolean) {
  for (let i = 0; i < 30; i++) {
    let a = Math.random() * Math.PI * 2
    if (inFront) a = Math.atan2(G.look.x, G.look.z) + (Math.random() - 0.5) * 1.6
    const r = rMin + Math.random() * (rMax - rMin)
    const x = cx + Math.sin(a) * r
    const z = cz + Math.cos(a) * r
    if (!blockedAt(x, z, 1.5)) return new THREE.Vector3(x, 0, z)
  }
  return null
}
