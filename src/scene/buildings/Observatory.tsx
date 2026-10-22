import { useMemo } from 'react'
import * as THREE from 'three'
import type { Painter } from '../../lib/painter'
import { solid } from '../../lib/materials'
import { domeTexture, textTexture } from '../../lib/textures'
import { Block, FacadeBox, Parapet, RoofClutter, Selectable, useFacade } from '../parts'
import { RoofFlags, flagLine } from '../Flags'

/** 天文台：浅灰石材方塔 + 四面钟 + 银色网壳球顶；后接深灰实验楼（躬行楼） */
const TOWER_H = 31

function drawTowerFace(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, '#d8d5ce', { tw: 0.6, th: 0.3, jitter: 0.04, stagger: true })
  p.lines(0, 0, W, H, 'rgba(120,118,112,0.35)', 0.6, 0.3, 0.015)
  // 竖向窄窗
  for (let f = 0; f < 6; f++) p.glass(W / 2 - 0.7, 3 + f * 3.6, 1.4, 2.4, { tint: '#3c5064', frame: '#8b8d8f', litChance: 0.4 })
  // 底部门洞
  p.opening(W / 2 - 1.6, 0, 3.2, 3.4, '#2d3035', 0.6)
  p.fill(0, H - 6.4, W, 0.35, '#bdb9b1')
  p.weather(0, 0, W, H, 0.12)
  p.shade(0, 0, W, 1.5, false, 0.3)
}

function drawLab(p: Painter, W: number, H: number, bays: number) {
  p.fill(0, 0, W, H, '#71767c', 0.6, 0.25)
  p.lines(0, 0, W, H, '#62676c', 1.25, 0, 0.02)
  const bw = W / bays
  for (let b = 0; b < bays; b++)
    for (let f = 0; f < 5; f++) {
      const y = 0.6 + f * 3.9
      if (f === 0) p.glass(b * bw + 0.5, y, bw - 1, 3, { tint: '#334454', frame: '#3b3f44', cols: 3, litChance: 0.6 })
      else {
        p.fill(b * bw + 0.3, y + 0.2, bw - 0.6, 2.9, '#4f545a', 0.5, 0.3)
        p.glass(b * bw + 0.6, y + 0.4, bw - 1.2, 2.4, { tint: '#3e5a75', frame: '#c9cdd1', cols: 3, transom: 1.8, litChance: 0.45 })
      }
    }
  p.fill(0, H - 1.1, W, 1.1, '#5d6268', 0.5, 0.3)
  p.shade(0, 0, W, 1.3, false, 0.25)
}

export function Observatory() {
  const face = useFacade(9, TOWER_H, (p) => drawTowerFace(p, 9, TOWER_H), 31, 32)
  const lab = useFacade(40, 21, (p) => drawLab(p, 40, 21, 8), 32)
  const labSide = useFacade(20, 21, (p) => drawLab(p, 20, 21, 4), 33)
  const domeMat = useMemo(() => {
    const t = domeTexture()
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.3 })
  }, [])
  const clockTex = useMemo(
    () =>
      textTexture('clock-obs', 256, 256, (c, w) => {
        const r = w / 2
        c.fillStyle = '#f5f3ee'
        c.beginPath()
        c.arc(r, r, r - 4, 0, Math.PI * 2)
        c.fill()
        c.lineWidth = 8
        c.strokeStyle = '#3a3f46'
        c.stroke()
        c.fillStyle = '#3a3f46'
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2
          c.save()
          c.translate(r + Math.cos(a) * (r - 22), r + Math.sin(a) * (r - 22))
          c.rotate(a)
          c.fillRect(-10, -3, 20, 6)
          c.restore()
        }
        c.lineCap = 'round'
        c.lineWidth = 10
        c.beginPath()
        c.moveTo(r, r)
        c.lineTo(r + 50, r - 30)
        c.stroke()
        c.lineWidth = 6
        c.beginPath()
        c.moveTo(r, r)
        c.lineTo(r - 10, r - 90)
        c.stroke()
      }),
    [],
  )
  const clockMat = useMemo(() => new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.5, emissive: '#fff4d6', emissiveIntensity: 0 }), [clockTex])
  const stone = solid('#cfcbc3', 0.85)
  const gray = solid('#5d6268', 0.5, 0.3)

  return (
    <Selectable id="observatory">
      {/* 躬行楼（新实验楼） */}
      <FacadeBox size={[40, 21, 20]} position={[90, 0, -27]} front={lab} back={lab} left={labSide} right={labSide} roof={solid('#a7a5a0', 0.95)} />
      <Parapet w={40} d={20} y={21} h={0.9} material={gray} />
      <group position={[90, 0, -27]}>
        <RoofClutter w={36} d={16} y={21} seed={21} />
      </group>
      <RoofFlags points={flagLine(71, 109, 21.9, -17.2, 7)} />

      {/* 塔身 */}
      <group position={[72, 0, -10]}>
        <FacadeBox size={[9, TOWER_H, 9]} front={face} back={face} left={face} right={face} roof={stone} />
        {/* 塔顶线脚与鼓座 */}
        <Block size={[10, 0.7, 10]} position={[0, TOWER_H + 0.35, 0]} material={stone} />
        <Block size={[9.4, 0.4, 9.4]} position={[0, TOWER_H - 6.2, 0]} material={stone} />
        <mesh position={[0, TOWER_H + 1.4, 0]} material={stone} castShadow receiveShadow>
          <cylinderGeometry args={[4.3, 4.5, 1.4, 48]} />
        </mesh>
        <mesh position={[0, TOWER_H + 2.1, 0]} material={domeMat} castShadow>
          <sphereGeometry args={[4.25, 64, 32, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
        </mesh>
        {/* 观测窗缝 */}
        <mesh position={[0, TOWER_H + 2.1, 0]} rotation={[0, 0.6, 0]} material={solid('#3b4048', 0.4, 0.6)}>
          <sphereGeometry args={[4.28, 8, 24, -0.12, 0.24, 0.05, Math.PI / 2]} />
        </mesh>
        {/* 四面钟 */}
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2
          return (
            <mesh key={i} material={clockMat} position={[Math.sin(a) * 4.53, TOWER_H - 3.1, Math.cos(a) * 4.53]} rotation={[0, a, 0]}>
              <circleGeometry args={[1.55, 48]} />
            </mesh>
          )
        })}
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2
          return (
            <mesh key={i} material={gray} position={[Math.sin(a) * 4.51, TOWER_H - 3.1, Math.cos(a) * 4.51]} rotation={[0, a, 0]}>
              <ringGeometry args={[1.55, 1.85, 48]} />
            </mesh>
          )
        })}
      </group>

      {/* 塔楼与实验楼之间的深灰玻璃连廊 */}
      <group position={[70, 0, -18]}>
        {[1, 2, 3].map((f) => (
          <group key={f}>
            <Block size={[8.6, 0.35, 3.2]} position={[-5.7, 4.4 + f * 3.8, 0]} material={gray} />
            <Block size={[8.6, 2.6, 2.8]} position={[-5.7, 4.4 + f * 3.8 + 1.45, 0]} material={solid('#3f5f7d', 0.08, 0.7)} />
          </group>
        ))}
      </group>
    </Selectable>
  )
}
