import * as THREE from 'three'
import { CAMPUS, FOOTPRINTS, type Rect } from '../data/site'

/** 不可穿行的区域：建筑占地（跑道与球场可以走） */
const WALKABLE: Rect[] = [
  [-14, 165, 46, 144],
  [-66, -14, 98, 154],
  [165, 182, -48, -4], // 校门整体占地，下面拆成门墙与门卫室
]
export const BLOCKERS: Rect[] = [
  ...FOOTPRINTS.filter((f) => !WALKABLE.some((w) => w.every((v, i) => v === f[i]))),
  [-7.2, 7.2, 9, 19], // 升旗台
  [-7, 7, 19, 21.5], // 升旗台台阶
  [171.5, 176.5, -56, -34.5], // 校门北侧门墙
  [168.5, 178.5, -16.5, -3], // 门卫室
]

/** 东校门：校门开口位置 */
export const GATE_Z: [number, number] = [-34, -17]
export const GATE_X = 170

/** 把圆形碰撞体推出所有矩形，并限制在校园围墙内 */
export function resolve(p: THREE.Vector3, r: number, gateOpen: boolean) {
  for (const b of BLOCKERS) {
    const cx = THREE.MathUtils.clamp(p.x, b[0], b[1])
    const cz = THREE.MathUtils.clamp(p.z, b[2], b[3])
    const dx = p.x - cx
    const dz = p.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2)
        p.x = cx + (dx / d) * r
        p.z = cz + (dz / d) * r
      } else {
        // 圆心在矩形内：沿最近的边推出
        const opts = [
          [p.x - b[0], -1, 0],
          [b[1] - p.x, 1, 0],
          [p.z - b[2], 0, -1],
          [b[3] - p.z, 0, 1],
        ].sort((a, c) => a[0] - c[0])[0]
        p.x += opts[1] * (opts[0] + r)
        p.z += opts[2] * (opts[0] + r)
      }
    }
  }
  const [x0, x1, z0, z1] = CAMPUS
  const m = 1.2
  p.z = THREE.MathUtils.clamp(p.z, z0 + m, z1 - m)
  const inGate = p.z > GATE_Z[0] && p.z < GATE_Z[1]
  const east = gateOpen && inGate ? 400 : x1 - m
  p.x = THREE.MathUtils.clamp(p.x, x0 + m, east)
  return p
}

/** 线段与矩形相交（2D，xz 平面），用于视线判断 */
function segRect(ax: number, az: number, bx: number, bz: number, r: Rect) {
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dz = bz - az
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return clip(-dx, ax - r[0]) && clip(dx, r[1] - ax) && clip(-dz, az - r[2]) && clip(dz, r[3] - az) && t0 <= t1
}

export function lineOfSight(a: THREE.Vector3, b: THREE.Vector3) {
  for (const r of BLOCKERS) if (segRect(a.x, a.z, b.x, b.z, r)) return false
  return true
}

export function blockedAt(x: number, z: number, m = 0) {
  return BLOCKERS.some((b) => x > b[0] - m && x < b[1] + m && z > b[2] - m && z < b[3] + m)
}
