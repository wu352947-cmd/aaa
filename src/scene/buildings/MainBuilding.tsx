import { useMemo } from 'react'
import * as THREE from 'three'
import type { Painter } from '../../lib/painter'
import { solid } from '../../lib/materials'
import { hipRoofGeometry } from '../../lib/geom'
import { roofConcrete, roofTiles } from '../../lib/textures'
import { Block, FacadeBox, Parapet, RoofClutter, Selectable, useFacade } from '../parts'
import { RoofFlags, flagLine } from '../Flags'

/**
 * 笃行楼（新教学楼）—— 参考官网首页横幅实拍：
 * 橙色面砖 + 深灰带形窗，中央拱形玻璃中庭塔与红瓦四坡顶，两端深灰玻璃塔楼。
 */
export const ORANGE = '#ec9c33'
export const ORANGE_L = '#f3ab45'
export const GRAY_D = '#4a4f56'
export const GRAY_M = '#686d73'
const STONE = '#77797b'

const GROUND = 4.4
const FH = 3.8
const FLOORS = 4
const WING_H = GROUND + FH * FLOORS + 1.9 // 21.5

/** 教学楼标准段：底层灰石拱廊，上部每开间三樘窗 */
export function drawWing(p: Painter, W: number, H: number, bays: number, o: { arcade?: boolean } = {}) {
  const bw = W / bays
  p.tiles(0, 0, W, H, ORANGE, { tw: 0.24, th: 0.06, jitter: 0.07 })
  p.fill(0, 0, W, GROUND, STONE, 0.8)
  p.lines(0, 0, W, GROUND, '#66686a', 1.2, 0.6, 0.02)
  for (let b = 0; b < bays; b++) {
    const x0 = b * bw
    if (o.arcade !== false) p.archOpening(x0 + 0.9, 0, bw - 1.8, GROUND - 0.5, '#33363a', 0.5)
    else p.glass(x0 + 0.8, 0.3, bw - 1.6, GROUND - 1.1, { tint: '#3a4e60', frame: '#3b3f44', cols: 3, litChance: 0.6 })
    for (let f = 0; f < FLOORS; f++) {
      const y0 = GROUND + f * FH
      p.fill(x0 + 0.45, y0 + 0.95, bw - 0.9, 2.45, GRAY_D, 0.6, 0.3)
      const n = 3
      const gap = 0.32
      const ww = (bw - 0.9 - gap * (n + 1)) / n
      for (let k = 0; k < n; k++)
        p.glass(x0 + 0.45 + gap + k * (ww + gap), y0 + 1.1, ww, 2.1, {
          tint: '#3a5269',
          frame: '#d6d8da',
          cols: 2,
          transom: 1.55,
          litChance: 0.55,
        })
      p.fill(x0 + 0.45, y0 + 0.88, bw - 0.9, 0.09, '#d9d6cf')
    }
    // 顶层女儿墙：深灰带 + 浅色弧形线脚
    const yt = GROUND + FLOORS * FH
    p.fill(x0 + 0.45, yt + 0.25, bw - 0.9, H - yt - 0.45, GRAY_D, 0.6, 0.3)
    p.archTrim(x0 + 0.9, yt + 0.3, bw - 1.8, (bw - 1.8) / 2 + 0.2, '#bfc2c5', 0.12)
  }
  p.shade(0, 0, W, 1.5, false, 0.3)
  p.shade(0, GROUND - 0.6, W, 0.6, true, 0.25)
  p.weather(0, GROUND, W, H - GROUND, 0.05)
}

/** 端部深灰玻璃塔楼 */
function drawTower(p: Painter, W: number, H: number, orangeEdge: 'left' | 'right' | 'none') {
  p.fill(0, 0, W, H, '#585d63', 0.5, 0.35)
  p.lines(0, 0, W, H, '#4c5056', 1.2, 0.95, 0.02)
  const cols = Math.max(2, Math.round(W / 4.4))
  const cw = W / cols
  p.glass(0.6, 0.4, W - 1.2, GROUND - 1, { tint: '#3d5873', frame: '#3a3e44', cols: cols * 2, litChance: 0.7 })
  for (let f = 0; f < FLOORS + 1; f++) {
    const y0 = GROUND + f * FH
    if (y0 + 3.2 > H - 1.2) break
    for (let c = 0; c < cols; c++)
      p.glass(c * cw + 0.45, y0 + 0.5, cw - 0.9, 2.9, { tint: '#46698c', frame: '#3b3f45', cols: 2, rows: 2, litChance: 0.5, reflect: 0.75 })
  }
  if (orangeEdge !== 'none') {
    const x = orangeEdge === 'left' ? 0 : W - 1.1
    p.tiles(x, GROUND, 1.1, H - GROUND - 1.2, ORANGE, { jitter: 0.06 })
  }
  p.shade(0, 0, W, 1.2, false, 0.25)
}

/** 中央拱窗塔 */
function drawPavilionFront(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, ORANGE_L, { tw: 0.24, th: 0.06, jitter: 0.07 })
  p.fill(0, 0, W, 6, STONE, 0.8)
  const aw = 9.4
  const ax = (W - aw) / 2
  p.archTrim(ax - 0.35, 6.4, aw + 0.7, 16.9, '#5d6268', 0.45)
  p.archGlass(ax, 6.6, aw, 16.5, { tint: '#355a7d', frame: '#3f444a', frameW: 0.12, cols: 6, rows: 6, litChance: 0.85, reflect: 0.8 })
  // 两侧竖窗
  for (const x of [1.1, W - 3.1])
    for (let f = 0; f < 5; f++) p.glass(x, 7 + f * 3.4, 2, 2.4, { tint: '#3a5269', frame: '#d6d8da', litChance: 0.5 })
  p.fill(0, H - 1, W, 1, GRAY_D, 0.6, 0.3)
  p.weather(0, 6, W, H - 7, 0.06)
}

function drawPavilionSide(p: Painter, W: number, H: number) {
  p.tiles(0, 0, W, H, ORANGE_L, { jitter: 0.07 })
  p.fill(0, 0, W, 6, STONE, 0.8)
  const n = 4
  for (let i = 0; i < n; i++)
    for (let f = 0; f < 5; f++) p.glass(1.5 + i * ((W - 3) / n) + 0.6, 7 + f * 3.4, (W - 3) / n - 1.2, 2.3, { tint: '#3a5269', frame: '#d6d8da', litChance: 0.5 })
  p.fill(0, H - 1, W, 1, GRAY_D, 0.6, 0.3)
}

function drawPortal(p: Painter, W: number, H: number) {
  p.fill(0, 0, W, H, '#5c6066', 0.7, 0.2)
  p.lines(0, 0, W, H, '#4d5156', 1.0, 0.75, 0.02)
  const n = 3
  const dw = 2.8
  for (let i = 0; i < n; i++) {
    const x = W / 2 + (i - 1) * 4 - dw / 2
    p.glass(x, 0, dw, 3.6, { tint: '#2c3d4e', frame: '#2b2e33', cols: 2, transom: 2.7, litChance: 1, curtains: false })
  }
  p.text('笃 行 楼', W / 2, H - 0.85, 0.75, '#e9d7a2', { glow: true })
}

export function MainBuilding() {
  const FW = 37 // 中段宽
  const D = 18
  const wingL = useFacade(FW, WING_H, (p) => drawWing(p, FW, WING_H, 5), 11)
  const wingR = useFacade(FW, WING_H, (p) => drawWing(p, FW, WING_H, 5), 12)
  const towerL = useFacade(14, 24.5, (p) => drawTower(p, 14, 24.5, 'right'), 13)
  const towerR = useFacade(14, 24.5, (p) => drawTower(p, 14, 24.5, 'left'), 14)
  const towerSide = useFacade(21, 24.5, (p) => drawTower(p, 21, 24.5, 'none'), 15)
  const pavFront = useFacade(18, 25.5, (p) => drawPavilionFront(p, 18, 25.5), 16, 32)
  const pavSide = useFacade(20, 25.5, (p) => drawPavilionSide(p, 20, 25.5), 17)
  const rear = useFacade(100, WING_H, (p) => drawWing(p, 100, WING_H, 13, { arcade: false }), 18, 18)
  const rearSide = useFacade(16, WING_H, (p) => drawWing(p, 16, WING_H, 2, { arcade: false }), 19)
  const link = useFacade(23, WING_H, (p) => drawWing(p, 23, WING_H, 3, { arcade: false }), 20)
  const portal = useFacade(14, 5.8, (p) => drawPortal(p, 14, 5.8), 21, 40)

  const roof = useMemo(() => {
    const t = roofConcrete().clone()
    t.needsUpdate = true
    t.repeat.set(12, 3)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })
  }, [])
  const redRoof = useMemo(() => {
    const t = roofTiles('#b9472f', 'roofRedMain').clone()
    t.needsUpdate = true
    t.repeat.set(3, 3)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 })
  }, [])
  const hip = useMemo(() => hipRoofGeometry(19.6, 21.6, 3.6), [])
  const orange = solid(ORANGE, 0.8)
  const grayD = solid(GRAY_D, 0.6, 0.3)
  const lip = solid('#d6d3cc', 0.8)

  const front = -13 // 中段前立面 z
  const pilasters: [number, number, number][] = []
  for (const side of [-1, 1])
    for (let i = 0; i <= 5; i++) pilasters.push([side * (9 + (FW * i) / 5), GROUND + (FH * FLOORS) / 2, front + 0.3])

  return (
    <Selectable id="duxing">
      {/* 中段两翼 */}
      <FacadeBox size={[FW, WING_H, D]} position={[-9 - FW / 2, 0, front - D / 2]} front={wingL} back={wingL} roof={roof} />
      <FacadeBox size={[FW, WING_H, D]} position={[9 + FW / 2, 0, front - D / 2]} front={wingR} back={wingR} roof={roof} />
      {pilasters.map((p, i) => (
        <Block key={i} size={[0.8, FH * FLOORS, 0.6]} position={p} material={orange} />
      ))}
      {[-1, 1].map((s) =>
        [0, 1, 2, 3, 4].map((f) => (
          <Block key={`${s}${f}`} size={[FW, 0.22, 0.55]} position={[s * (9 + FW / 2), GROUND + f * FH, front + 0.25]} material={lip} />
        )),
      )}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (9 + FW / 2), 0, front - D / 2]}>
          <Block size={[FW + 0.4, 0.45, D + 0.6]} position={[0, WING_H + 0.2, 0]} material={grayD} />
          <RoofClutter w={FW} d={D} y={WING_H + 0.4} seed={s + 3} />
        </group>
      ))}

      {/* 两端塔楼 */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 53, 0, -22.5]}>
          <FacadeBox size={[14, 24.5, 21]} front={s < 0 ? towerL : towerR} back={s < 0 ? towerR : towerL} left={towerSide} right={towerSide} roof={roof} />
          <Block size={[14.8, 0.6, 21.8]} position={[0, 24.6, 0]} material={grayD} />
          {/* 顶部竖向格栅冠 */}
          {Array.from({ length: 9 }).map((_, i) => (
            <Block key={i} size={[0.25, 2.2, 0.8]} position={[-6 + i * 1.5, 25.9, 10.6]} material={solid('#5d6268', 0.5, 0.4)} />
          ))}
          <Block size={[13, 2.2, 0.2]} position={[0, 25.9, 10.2]} material={solid('#454a50', 0.5, 0.3)} />
          <Parapet w={14} d={21} y={24.9} h={0.9} material={grayD} />
        </group>
      ))}

      {/* 中央拱窗塔 */}
      <group position={[0, 0, -21]}>
        <FacadeBox size={[18, 25.5, 20]} front={pavFront} back={pavFront} left={pavSide} right={pavSide} roof={grayD} />
        <Block size={[20.4, 1.1, 22.4]} position={[0, 26.05, 0]} material={grayD} />
        <Block size={[19.2, 0.5, 21.2]} position={[0, 26.85, 0]} material={solid('#3c4046', 0.6, 0.2)} />
        <mesh geometry={hip} material={redRoof} position={[0, 27.1, 0]} castShadow receiveShadow />
        {/* 入口门廊 */}
        <FacadeBox size={[14, 5.8, 3.2]} position={[0, 0, 11.6]} front={portal} roof={grayD} />
        <Block size={[15, 0.5, 4.2]} position={[0, 6.05, 11.8]} material={grayD} />
        {[0, 1, 2].map((i) => (
          <Block key={i} size={[16 - i * 0.6, 0.16, 2.4 - i * 0.7]} position={[0, 0.08 + i * 0.16, 14.4 - i * 0.35]} color="#c9c6bf" />
        ))}
      </group>

      {/* 后排教学楼与连接翼（形成回字形院落） */}
      <FacadeBox size={[100, WING_H, 16]} position={[0, 0, -64]} front={rear} back={rear} left={rearSide} right={rearSide} roof={roof} />
      <Block size={[100.4, 0.45, 16.6]} position={[0, WING_H + 0.2, -64]} material={grayD} />
      <RoofClutter w={96} d={14} y={WING_H + 0.4} seed={7} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <FacadeBox size={[12, WING_H, 23]} position={[s * 40, 0, -44.5]} left={link} right={link} roof={roof} />
          <Block size={[12.4, 0.45, 23]} position={[s * 40, WING_H + 0.2, -44.5]} material={grayD} />
        </group>
      ))}

      <RoofFlags points={[...flagLine(-46, -9.5, WING_H + 0.4, front - 0.4, 6), ...flagLine(9.5, 46, WING_H + 0.4, front - 0.4, 6)]} />
      <RoofFlags points={flagLine(-7, 7, 26.6, -10.1, 3)} />
    </Selectable>
  )
}
