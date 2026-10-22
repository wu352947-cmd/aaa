import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** 四坡屋顶（庑殿顶），屋脊沿较长边 */
export function hipRoofGeometry(w: number, d: number, h: number) {
  const swap = d > w
  const L = swap ? d : w
  const S = swap ? w : d
  const r = Math.max(0, (L - S) / 2)
  const hx = L / 2
  const hz = S / 2
  const v = [
    // 底面四角
    [-hx, 0, -hz],
    [hx, 0, -hz],
    [hx, 0, hz],
    [-hx, 0, hz],
    // 屋脊两端
    [-r, h, 0],
    [r, h, 0],
  ]
  const tris = [
    [3, 2, 5], [3, 5, 4], // 前坡
    [1, 0, 4], [1, 4, 5], // 后坡
    [0, 3, 4], // 左
    [2, 1, 5], // 右
  ]
  const pos: number[] = []
  const uv: number[] = []
  for (const t of tris) {
    for (const i of t) {
      let [x, y, z] = v[i]
      if (swap) [x, z] = [z, -x]
      pos.push(x, y, z)
      uv.push(x / 2, z / 2 + y / 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** 金字塔尖顶 */
export function pyramidGeometry(w: number, h: number) {
  const g = new THREE.ConeGeometry(w / Math.SQRT2, h, 4, 1)
  g.rotateY(Math.PI / 4)
  g.translate(0, h / 2, 0)
  return g.toNonIndexed()
}

/** 体育场跑道形状（两直道 + 两半圆） */
export function stadiumShape(straight: number, radius: number, segments = 48) {
  const s = new THREE.Shape()
  const hs = straight / 2
  s.moveTo(-hs, -radius)
  s.lineTo(hs, -radius)
  s.absarc(hs, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  s.lineTo(-hs, radius)
  s.absarc(-hs, 0, radius, Math.PI / 2, (Math.PI * 3) / 2, false)
  s.getPoints(segments)
  return s
}

export function merge(geoms: THREE.BufferGeometry[]) {
  const prepared = geoms.map((g) => (g.index ? g.toNonIndexed() : g))
  // 统一属性，避免 merge 失败
  for (const g of prepared) {
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2))
    if (!g.getAttribute('normal')) g.computeVertexNormals()
  }
  const hasColor = prepared.some((g) => g.getAttribute('color'))
  if (hasColor)
    for (const g of prepared)
      if (!g.getAttribute('color')) {
        const n = g.getAttribute('position').count
        g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3))
      }
  return mergeGeometries(prepared, false)!
}

export function colorize(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, rand = Math.random) {
  const c = new THREE.Color(color)
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const k = 1 + (rand() - 0.5) * jitter
    arr[i * 3] = c.r * k
    arr[i * 3 + 1] = c.g * k
    arr[i * 3 + 2] = c.b * k
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3))
  return g
}
