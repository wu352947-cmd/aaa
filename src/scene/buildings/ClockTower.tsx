import { useMemo } from 'react'
import * as THREE from 'three'
import type { Painter } from '../../lib/painter'
import { solid } from '../../lib/materials'
import { pyramidGeometry } from '../../lib/geom'
import { textTexture } from '../../lib/textures'
import { Block, FacadeBox, Parapet, Selectable, useFacade } from '../parts'
import { RoofFlags, flagLine } from '../Flags'

/**
 * 状元楼（旧教学楼）与钟楼 —— 参考第 1、5、7 张实拍：
 * 米黄 + 浅粉面砖，顶层白色拱券连廊，中央方形钟楼带蓝色钟面、绿色竖向玻璃带与尖顶，
 * 底部暗红圆形门厅，红色楹联竖贯立面；右侧为更高的浅橙粉色翼楼。
 */
const BEIGE = '#dcc2a2'
const PINK = '#e6b49a'
const CREAM = '#efe4cf'
const MAROON = '#9b3a33'
const FH = 3.5

function drawOld(p: Painter, W: number, H: number, floors: number, o: { banners?: number[]; pink?: boolean; arches?: boolean } = {}) {
  const top = floors * FH
  p.tiles(0, 0, W, H, o.pink ? PINK : BEIGE, { tw: 0.22, th: 0.07, jitter: 0.08 })
  // 底层粉色勒脚
  p.tiles(0, 0, W, FH, o.pink ? '#c98a72' : PINK, { tw: 0.22, th: 0.07, jitter: 0.08 })
  const bays = Math.max(1, Math.round(W / 4.2))
  const bw = W / bays
  for (let b = 0; b < bays; b++) {
    const x0 = b * bw
    for (let f = 0; f < floors; f++) {
      const y0 = f * FH
      const archRow = o.arches !== false && f === floors - 1
      if (archRow) {
        // 顶层拱券连廊
        p.fill(x0 + 0.25, y0 + 0.3, bw - 0.5, FH - 0.2, CREAM, 0.8)
        p.archOpening(x0 + 0.6, y0 + 0.35, bw - 1.2, FH - 0.55, '#3d3b39', 0.45)
        p.railing(x0 + 0.6, y0 + 0.35, bw - 1.2, 1.0, '#f2efe8', 0.18)
        p.archTrim(x0 + 0.5, y0 + 0.35, bw - 1, FH - 0.45, '#fbf8f1', 0.14)
      } else {
        p.glass(x0 + 0.7, y0 + 0.9, bw - 1.4, 1.9, { tint: o.pink ? '#3f6f6a' : '#3d6c64', frame: '#eeeeea', cols: 3, transom: 1.35, litChance: 0.5 })
        p.fill(x0 + 0.55, y0 + 0.78, bw - 1.1, 0.12, '#f1ede4')
      }
    }
  }
  // 楼层白色腰线
  for (let f = 1; f <= floors; f++) p.fill(0, f * FH - 0.12, W, 0.18, '#f4f0e6')
  p.fill(0, top, W, H - top, CREAM, 0.8)
  for (const x of o.banners ?? []) p.banner(x, FH * 1.2, 0.85, top - FH * 1.8, '百年一中桃李芬芳', '#c9271f', '#ffd76a')
  p.weather(0, 0, W, H, 0.15)
  p.shade(0, 0, W, 1.2, false, 0.25)
}

function drawTower(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, BEIGE, { tw: 0.22, th: 0.07, jitter: 0.08 })
  // 正中绿色竖向玻璃带
  p.glass(W / 2 - 0.9, 3, 1.8, H - 9.5, { tint: '#2f7d6d', frame: '#d7e3dc', rows: 16, cols: 1, litChance: 0.7, reflect: 0.5 })
  p.fill(0, H - 6.2, W, 0.25, '#f4f0e6')
  p.fill(0, H - 0.6, W, 0.6, '#f4f0e6')
  p.weather(0, 0, W, H, 0.2)
}

function drawDrum(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, MAROON, { tw: 0.24, th: 0.07, jitter: 0.1 })
  for (let f = 0; f < 2; f++) {
    const y = 0.6 + f * 3.4
    const n = Math.floor(W / 2.6)
    for (let i = 0; i < n; i++) p.glass(i * (W / n) + 0.35, y, W / n - 0.7, 2.4, { tint: '#3f8a76', frame: '#efe8de', cols: 1, litChance: 0.75 })
  }
  p.fill(0, H - 0.8, W, 0.8, '#f2ede3')
}

export function ClockTower() {
  const main = useFacade(64, 19, (p) => drawOld(p, 64, 19, 5, { banners: [24.6, 38.5] }), 51)
  const mainBack = useFacade(64, 19, (p) => drawOld(p, 64, 19, 5, { arches: false }), 52)
  const mainSide = useFacade(16, 19, (p) => drawOld(p, 16, 19, 5), 53)
  const wing = useFacade(16, 26, (p) => drawOld(p, 16, 26, 7, { pink: true }), 54)
  const wingSide = useFacade(30, 26, (p) => drawOld(p, 30, 26, 7, { pink: true, banners: [3, 26] }), 55)
  const tower = useFacade(6.5, 31, (p) => drawTower(p, 6.5, 31), 56, 32)
  const drumTex = useFacade(28, 7.6, (p) => drawDrum(p, 28, 7.6), 57, 32)

  const clockTex = useMemo(
    () =>
      textTexture('clock-blue', 256, 256, (c, w) => {
        const r = w / 2
        c.fillStyle = '#2d6fb7'
        c.beginPath()
        c.arc(r, r, r - 6, 0, Math.PI * 2)
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
        c.strokeStyle = '#ffffff'
        c.lineCap = 'round'
        c.lineWidth = 11
        c.beginPath()
        c.moveTo(r, r)
        c.lineTo(r + 55, r + 10)
        c.stroke()
        c.lineWidth = 7
        c.beginPath()
        c.moveTo(r, r)
        c.lineTo(r - 20, r - 88)
        c.stroke()
      }),
    [],
  )
  const clockMat = useMemo(() => new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.35, metalness: 0.1 }), [clockTex])
  const spire = useMemo(() => pyramidGeometry(5.6, 6.5), [])
  const cream = solid(CREAM, 0.8)

  return (
    <Selectable id="zhuangyuan">
      {/* 主楼：x -142..-78，前立面 z=80 */}
      <FacadeBox size={[64, 19, 16]} position={[-110, 0, 72]} front={main} back={mainBack} left={mainSide} right={mainSide} roof={solid('#b3afa6', 0.95)} />
      <group position={[-110, 0, 72]}>
        <Parapet w={64} d={16} y={19} h={1} color={CREAM} />
      </group>
      <group position={[-110, 0, 72]}>
        <Block size={[64.6, 0.35, 16.6]} position={[0, 19, 0]} material={cream} />
      </group>
      <RoofFlags points={flagLine(-141, -80, 20, 79.6, 12)} />

      {/* 右侧高翼楼 */}
      <FacadeBox size={[16, 26, 30]} position={[-70, 0, 70]} front={wing} back={wing} left={wingSide} right={wingSide} roof={solid('#b3afa6', 0.95)} />
      <group position={[-70, 0, 70]}>
        <Parapet w={16} d={30} y={26} h={1} color={CREAM} />
      </group>
      <group position={[-70, 0, 70]}>
        <Block size={[16.6, 0.4, 30.6]} position={[0, 26, 0]} material={cream} />
        {/* 底部红色基座 */}
        <Block size={[16.3, 3.5, 30.3]} position={[0, 1.75, 0]} color="#a8473c" />
      </group>
      <RoofFlags points={flagLine(-77, -63, 27, 84.6, 4)} />

      {/* 钟楼 */}
      <group position={[-118, 0, 79]}>
        <FacadeBox size={[6.5, 31, 6.5]} front={tower} back={tower} left={tower} right={tower} roof={cream} />
        <Block size={[7.4, 0.5, 7.4]} position={[0, 31.2, 0]} material={cream} />
        {/* 钟亭 */}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => <Block key={`${sx}${sz}`} size={[0.9, 3, 0.9]} position={[sx * 2.7, 32.9, sz * 2.7]} material={cream} />),
        )}
        <Block size={[7.6, 0.5, 7.6]} position={[0, 34.6, 0]} material={cream} />
        <mesh geometry={spire} material={solid('#c9a985', 0.7)} position={[0, 34.85, 0]} castShadow />
        <mesh position={[0, 42, 0]} material={solid('#d9b25a', 0.3, 0.8)}>
          <coneGeometry args={[0.18, 1.6, 8]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2
          return (
            <mesh key={i} material={clockMat} position={[Math.sin(a) * 3.27, 28.2, Math.cos(a) * 3.27]} rotation={[0, a, 0]}>
              <circleGeometry args={[1.85, 48]} />
            </mesh>
          )
        })}
      </group>

      {/* 暗红圆形门厅 */}
      <group position={[-118, 0, 80.5]}>
        <mesh position={[0, 3.8, 0]} castShadow receiveShadow material={drumTex}>
          <cylinderGeometry args={[8.9, 8.9, 7.6, 64, 1, false, -Math.PI / 2, Math.PI]} />
        </mesh>
        <mesh position={[0, 7.75, 0]} material={cream} castShadow>
          <cylinderGeometry args={[9.4, 9.4, 0.5, 64, 1, false, -Math.PI / 2, Math.PI]} />
        </mesh>
        {/* 门厅屋顶栏杆 */}
        <mesh position={[0, 8.45, 0]} material={solid('#f0ece4', 0.6)}>
          <cylinderGeometry args={[9.2, 9.2, 0.9, 64, 1, true, -Math.PI / 2, Math.PI]} />
        </mesh>
        {/* 入口雨棚 */}
        <Block size={[6, 0.4, 3]} position={[0, 3.6, 9.6]} material={cream} />
        {[-2.7, 2.7].map((x) => (
          <mesh key={x} position={[x, 1.7, 10.8]} material={cream} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 3.4, 16]} />
          </mesh>
        ))}
        {[0, 1, 2].map((i) => (
          <Block key={i} size={[9 - i, 0.15, 2.4 - i * 0.6]} position={[0, 0.075 + i * 0.15, 11.6 - i * 0.3]} color="#d1cdc4" />
        ))}
      </group>
    </Selectable>
  )
}
