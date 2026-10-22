import { RoundedBox } from '@react-three/drei'
import type { Painter } from '../../lib/painter'
import { solid } from '../../lib/materials'
import { Block, FacadeBox, Selectable, useFacade } from '../parts'

/**
 * 艺体馆：白色铝板外壳，南侧整体外挑的蓝色玻璃幕墙，下部圆柱架空，
 * 侧墙菱形洞口阵列（官网横幅与校门实拍）。
 */
const WHITE = '#ecebe6'

function drawHall(p: Painter, W: number, H: number, diamonds: boolean) {
  p.fill(0, 0, W, H, WHITE, 0.45, 0.15)
  p.lines(0, 0, W, H, '#b8b9b6', 1.5, 1.2, 0.025)
  // 底层通高玻璃
  p.glass(1.5, 0.2, W - 3, 4.6, { tint: '#2f4a66', frame: '#c9cbcc', cols: Math.round(W / 2), transom: 3.4, litChance: 0.9, curtains: false })
  if (diamonds) {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 4 + (r % 2); c++) {
        const cx = W * 0.12 + c * 1.6 + (r % 2 ? 0 : 0.8)
        const cy = H * 0.42 + r * 1.3
        p.fill(cx - 0.32, cy - 0.32, 0.64, 0.64, '#30353b', 0.6)
      }
    p.glass(W * 0.45, 7, W * 0.48, H - 9.5, { tint: '#2f5b94', frame: '#26292d', cols: 10, rows: 4, litChance: 0.8, reflect: 0.85, curtains: false })
  } else {
    for (let i = 0; i < Math.floor(W / 6); i++) p.glass(2 + i * 6, 8, 3.6, H - 11, { tint: '#3d618a', frame: '#d9dad8', cols: 2, rows: 4, litChance: 0.6, curtains: false })
  }
  p.shade(0, 0, W, 1.2, false, 0.2)
}

function drawCurtain(p: Painter, W: number, H: number) {
  p.glass(0, 0, W, H, { tint: '#2a62b8', frame: '#1f2328', frameW: 0.09, cols: Math.round(W / 1.45), rows: 7, litChance: 1, reflect: 0.9, curtains: false })
  // 局部开启扇
  for (let i = 0; i < 6; i++) p.fill(W * (0.2 + i * 0.12), H * 0.42, 0.6, 1.1, '#1d2a3a', 0.2, 0.5)
}

export function ArtsHall() {
  const front = useFacade(56, 18, (p) => drawHall(p, 56, 18, false), 41)
  const side = useFacade(40, 18, (p) => drawHall(p, 40, 18, true), 42)
  const curtain = useFacade(42, 9.2, (p) => drawCurtain(p, 42, 9.2), 43, 30, 1.2)
  const white = solid(WHITE, 0.4, 0.15)

  return (
    <Selectable id="yiti" position={[130, 0, -87]}>
      <FacadeBox size={[56, 18, 40]} front={front} back={front} left={side} right={side} roof={white} />
      {/* 屋面：圆角白色顶盖 */}
      <RoundedBox args={[57.6, 2.2, 41.6]} radius={1} smoothness={4} position={[0, 18.6, 0]} material={white} castShadow receiveShadow />
      <RoundedBox args={[40, 1.6, 26]} radius={0.7} smoothness={4} position={[0, 20.2, -2]} material={solid('#dfe0dd', 0.5, 0.2)} castShadow />

      {/* 外挑玻璃幕墙体 */}
      <group position={[0, 13.2, 23.5]} rotation={[-0.07, 0, 0]}>
        <RoundedBox args={[46, 11.6, 7]} radius={1.1} smoothness={5} material={white} castShadow receiveShadow />
        <mesh position={[0, 0.2, 3.52]} material={curtain}>
          <planeGeometry args={[42, 9.2]} />
        </mesh>
      </group>
      {/* 架空圆柱 */}
      {[-18, -9, 0, 9, 18].map((x) => (
        <mesh key={x} position={[x, 3.7, 24.6]} material={white} castShadow receiveShadow>
          <cylinderGeometry args={[0.65, 0.65, 7.4, 24]} />
        </mesh>
      ))}
      {/* 底层灯带吊顶 */}
      <Block size={[44, 0.25, 6]} position={[0, 7.3, 23.5]} material={solid('#f2f1ec', 0.6)} shadow={false} />
      {/* 台阶 */}
      {[0, 1, 2].map((i) => (
        <Block key={i} size={[50 - i, 0.15, 3 - i * 0.8]} position={[0, 0.075 + i * 0.15, 27.6 - i * 0.4]} color="#cfccc5" />
      ))}
    </Selectable>
  )
}
