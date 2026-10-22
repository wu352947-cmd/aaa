import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { merge } from '../lib/geom'
import { mulberry32, makeNoise2D, type Rand } from '../lib/random'
import { CAMPUS, ROADS, STREETS, isBlocked, inRect, type Rect } from '../data/site'
import { BANYANS } from './Ground'
import { useStore } from '../lib/store'

/* ======================= 共享材质 ======================= */

const windUniform = { value: 0 }

function leafTexture(seed: number, hue = 0.28) {
  const s = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const c = cv.getContext('2d')!
  const r = mulberry32(seed)
  c.clearRect(0, 0, s, s)
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * s * 0.42
    const x = s / 2 + Math.cos(a) * d
    const y = s / 2 + Math.sin(a) * d
    const l = 55 + r() * 35
    c.fillStyle = `hsl(${hue * 360 + (r() - 0.5) * 20},${25 + r() * 25}%,${l}%)`
    c.save()
    c.translate(x, y)
    c.rotate(r() * Math.PI * 2)
    c.beginPath()
    c.ellipse(0, 0, 9 + r() * 7, 4 + r() * 3, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function swayMaterial(params: THREE.MeshStandardMaterialParameters, strength: number) {
  const m = new THREE.MeshStandardMaterial(params)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniform
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;
        #else
          float ph = 0.0;
        #endif
        float hk = max(position.y - 2.0, 0.0) * ${strength.toFixed(3)};
        transformed.x += sin(uTime * 1.7 + ph + position.y * 0.6) * hk;
        transformed.z += cos(uTime * 1.3 + ph * 1.3 + position.x * 0.4) * hk * 0.8;`,
      )
  }
  return m
}

/* ======================= 几何体生成 ======================= */

interface TreeGeo {
  trunk: THREE.BufferGeometry
  blob: THREE.BufferGeometry
  cards: THREE.BufferGeometry
}

function shadeByHeight(g: THREE.BufferGeometry, base: THREE.Color, y0: number, y1: number, r: Rand, jitter = 0.12) {
  const pos = g.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1)
    const k = (0.5 + 0.6 * t) * (1 + (r() - 0.5) * jitter)
    col[i * 3] = base.r * k
    col[i * 3 + 1] = base.g * k
    col[i * 3 + 2] = base.b * k
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}

/** 阔叶树：若干扰动球团 + 叶片卡片 */
function broadleaf(seed: number, o: { R: number; H: number; trunkH: number; blobs: number; cards: number; color: string; flat?: number; trunkR?: number; roots?: number }): TreeGeo {
  const r = mulberry32(seed)
  const n = makeNoise2D(seed)
  const base = new THREE.Color(o.color)
  const blobs: THREE.BufferGeometry[] = []
  const centers: { c: THREE.Vector3; rad: number }[] = []
  const flat = o.flat ?? 1
  for (let i = 0; i < o.blobs; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * o.R * 0.55
    const c = new THREE.Vector3(Math.cos(a) * d, o.trunkH + (o.H - o.trunkH) * (0.35 + r() * 0.35) * (1 - (d / o.R) * 0.4), Math.sin(a) * d)
    const rad = o.R * (0.38 + r() * 0.22) * (1 - (d / o.R) * 0.3)
    centers.push({ c, rad })
    const g = new THREE.IcosahedronGeometry(rad, 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k)
      const disp = 1 + (n.fbm(v.x * 0.5 + i * 3, v.y * 0.5 + v.z * 0.5, 3) - 0.5) * 0.45
      v.multiplyScalar(disp)
      v.y *= 0.82 * flat
      p.setXYZ(k, v.x + c.x, v.y + c.y, v.z + c.z)
    }
    g.computeVertexNormals()
    blobs.push(g)
  }
  const blob = shadeByHeight(merge(blobs), base.clone().multiplyScalar(0.8), o.trunkH, o.H, r)

  const cardGeos: THREE.BufferGeometry[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < o.cards; i++) {
    const b = centers[Math.floor(r() * centers.length)]
    const dir = new THREE.Vector3(r() * 2 - 1, r() * 1.6 - 0.45, r() * 2 - 1).normalize()
    const p = b.c.clone().add(dir.clone().multiplyScalar(b.rad * (0.82 + r() * 0.3)))
    p.y = b.c.y + (p.y - b.c.y) * 0.82 * flat
    const size = o.R * (0.32 + r() * 0.22)
    const g = new THREE.PlaneGeometry(size, size)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().lerp(up, 0.25).normalize())
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r() * Math.PI * 2)
    g.applyQuaternion(spin)
    g.applyQuaternion(q)
    g.translate(p.x, p.y, p.z)
    cardGeos.push(g)
  }
  const cards = shadeByHeight(merge(cardGeos), base, o.trunkH, o.H, r, 0.25)

  // 树干 + 分枝
  const tr = o.trunkR ?? o.R * 0.07
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(tr * 0.7, tr, o.trunkH + 1.2, 9, 3)
  trunk.translate(0, (o.trunkH + 1.2) / 2, 0)
  parts.push(trunk)
  for (let i = 0; i < 4; i++) {
    const len = o.R * (0.5 + r() * 0.3)
    const br = new THREE.CylinderGeometry(tr * 0.25, tr * 0.5, len, 6)
    br.translate(0, len / 2, 0)
    br.rotateZ(0.5 + r() * 0.4)
    br.rotateY(r() * Math.PI * 2)
    br.translate(0, o.trunkH * (0.75 + r() * 0.2), 0)
    parts.push(br)
  }
  // 气根（古榕）
  for (let i = 0; i < (o.roots ?? 0); i++) {
    const a = r() * Math.PI * 2
    const d = o.R * (0.15 + r() * 0.55)
    const h = o.trunkH * (0.8 + r() * 0.5)
    const rt = new THREE.CylinderGeometry(tr * 0.05 + r() * tr * 0.12, tr * 0.12 + r() * tr * 0.15, h, 5)
    rt.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d)
    parts.push(rt)
  }
  const tg = merge(parts)
  const bark = new THREE.Color('#5b4c3e')
  const pos = tg.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + r() * 0.35
    col[i * 3] = bark.r * k
    col[i * 3 + 1] = bark.g * k
    col[i * 3 + 2] = bark.b * k
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return { trunk: tg, blob, cards }
}

/** 柏树：细高圆锥 */
function cypress(seed: number): TreeGeo {
  const r = mulberry32(seed)
  const n = makeNoise2D(seed)
  const H = 16
  const parts: THREE.BufferGeometry[] = []
  const centers: { c: THREE.Vector3; rad: number }[] = []
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const rad = 2.6 * (1 - t * 0.78) + 0.3
    const c = new THREE.Vector3((r() - 0.5) * 0.5, 1.8 + t * (H - 3.5), (r() - 0.5) * 0.5)
    centers.push({ c, rad })
    const g = new THREE.IcosahedronGeometry(rad, 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k)
      v.multiplyScalar(1 + (n.fbm(v.x + i, v.y + v.z, 3) - 0.5) * 0.4)
      v.y *= 1.4
      p.setXYZ(k, v.x + c.x, v.y + c.y, v.z + c.z)
    }
    g.computeVertexNormals()
    parts.push(g)
  }
  const base = new THREE.Color('#2f5a33')
  const blob = shadeByHeight(merge(parts), base.clone().multiplyScalar(0.85), 0, H, r)
  const cardGeos: THREE.BufferGeometry[] = []
  for (let i = 0; i < 160; i++) {
    const b = centers[Math.floor(r() * centers.length)]
    const dir = new THREE.Vector3(r() * 2 - 1, (r() - 0.5) * 1.2, r() * 2 - 1).normalize()
    const p = b.c.clone().add(dir.clone().multiplyScalar(b.rad))
    const g = new THREE.PlaneGeometry(1.3, 1.6)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir))
    g.translate(p.x, p.y, p.z)
    cardGeos.push(g)
  }
  const cards = shadeByHeight(merge(cardGeos), base, 0, H, r, 0.25)
  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3, 7)
  trunk.translate(0, 1.5, 0)
  return { trunk: shadeByHeight(trunk, new THREE.Color('#5b4c3e'), 0, 3, r), blob, cards }
}

/** 棕榈：弯曲树干 + 下垂羽状叶 */
function palm(seed: number) {
  const r = mulberry32(seed)
  const H = 9 + r() * 3
  const lean = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize().multiplyScalar(0.8 + r())
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean.x * 0.2, H * 0.5, lean.z * 0.2), new THREE.Vector3(lean.x, H, lean.z))
  const trunk = new THREE.TubeGeometry(curve, 12, 0.24, 8, false)
  const tp = trunk.getAttribute('position')
  const col = new Float32Array(tp.count * 3)
  for (let i = 0; i < tp.count; i++) {
    const k = 0.75 + 0.25 * Math.sin(tp.getY(i) * 6)
    col[i * 3] = 0.42 * k
    col[i * 3 + 1] = 0.37 * k
    col[i * 3 + 2] = 0.3 * k
  }
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  const fronds: THREE.BufferGeometry[] = []
  const N = 14
  for (let i = 0; i < N; i++) {
    const L = 3.8 + r() * 1.4
    const g = new THREE.PlaneGeometry(L, 1.5, 10, 1)
    g.translate(L / 2, 0, 0)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const droop = 1.2 + r() * 1.4
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k)
      const t = x / L
      p.setY(k, p.getY(k) * (1 - t * 0.6))
      p.setZ(k, -t * t * droop * L * 0.45)
    }
    g.rotateX(-Math.PI / 2)
    g.rotateZ(0.35 + r() * 0.5)
    g.rotateY((i / N) * Math.PI * 2 + r() * 0.3)
    g.translate(lean.x, H, lean.z)
    fronds.push(g)
  }
  const crown = shadeByHeight(merge(fronds), new THREE.Color('#5d8c3b'), H - 3, H + 1, r, 0.2)
  return { trunk, crown }
}

function frondTexture() {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 64
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, 256, 64)
  c.strokeStyle = '#d9e6b8'
  c.lineWidth = 3
  c.beginPath()
  c.moveTo(0, 32)
  c.lineTo(256, 32)
  c.stroke()
  for (let x = 4; x < 250; x += 5) {
    const len = 28 * (1 - x / 300)
    for (const s of [-1, 1]) {
      c.strokeStyle = `hsl(${85 + Math.random() * 20},40%,${60 + Math.random() * 25}%)`
      c.lineWidth = 2.4
      c.beginPath()
      c.moveTo(x, 32)
      c.lineTo(x + 10, 32 + s * len)
      c.stroke()
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 修剪球形灌木 */
function shrubBall(seed: number) {
  const r = mulberry32(seed)
  const n = makeNoise2D(seed)
  const g = new THREE.IcosahedronGeometry(1, 3)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  for (let k = 0; k < p.count; k++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, k)
    v.multiplyScalar(1 + (n.fbm(v.x * 3, v.y * 3 + v.z * 3, 3) - 0.5) * 0.18)
    v.y = v.y * 0.85 + 0.85
    p.setXYZ(k, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return shadeByHeight(g, new THREE.Color('#4f7f36'), 0, 1.7, r, 0.15)
}

/* ======================= 布点 ======================= */

interface Inst {
  x: number
  z: number
  s: number
  rot: number
  tint: number
}

function scatter(r: Rand, area: Rect, count: number, ok: (x: number, z: number) => boolean, smin = 0.8, smax = 1.2): Inst[] {
  const out: Inst[] = []
  let tries = 0
  while (out.length < count && tries < count * 30) {
    tries++
    const x = area[0] + r() * (area[1] - area[0])
    const z = area[2] + r() * (area[3] - area[2])
    if (!ok(x, z)) continue
    if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 30)) continue
    out.push({ x, z, s: smin + r() * (smax - smin), rot: r() * Math.PI * 2, tint: r() })
  }
  return out
}

function rows(r: Rand, pts: [number, number, number, number][], step: number, jitter = 0.5): Inst[] {
  const out: Inst[] = []
  for (const [ax, az, bx, bz] of pts) {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.floor(len / step))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      out.push({ x: ax + (bx - ax) * t + (r() - 0.5) * jitter, z: az + (bz - az) * t + (r() - 0.5) * jitter, s: 0.85 + r() * 0.3, rot: r() * 6.28, tint: r() })
    }
  }
  return out
}

/* ======================= 组件 ======================= */

function InstancedTree({ geo, items, leafMap, leafColor = '#ffffff', sway = 0.012 }: { geo: TreeGeo; items: Inst[]; leafMap: THREE.Texture; leafColor?: string; sway?: number }) {
  const trunk = useRef<THREE.InstancedMesh>(null)
  const blob = useRef<THREE.InstancedMesh>(null)
  const cards = useRef<THREE.InstancedMesh>(null)
  const mats = useMemo(
    () => ({
      trunk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      blob: swayMaterial({ vertexColors: true, roughness: 0.9, color: leafColor }, sway * 0.6),
      cards: swayMaterial({ vertexColors: true, roughness: 0.8, map: leafMap, alphaTest: 0.45, side: THREE.DoubleSide, color: leafColor }, sway),
    }),
    [leafMap, leafColor, sway],
  )
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const c = new THREE.Color()
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot)
      m.compose(new THREE.Vector3(it.x, 0, it.z), q, new THREE.Vector3(it.s, it.s, it.s))
      trunk.current!.setMatrixAt(i, m)
      blob.current!.setMatrixAt(i, m)
      cards.current!.setMatrixAt(i, m)
      c.setHSL(0.2 + it.tint * 0.1, 0.12 + it.tint * 0.15, 0.45 + it.tint * 0.1)
      c.multiplyScalar(2.0)
      blob.current!.setColorAt(i, c)
      cards.current!.setColorAt(i, c)
    })
    for (const ref of [trunk, blob, cards]) {
      ref.current!.instanceMatrix.needsUpdate = true
      if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true
      ref.current!.computeBoundingSphere()
    }
  }, [items])
  return (
    <group>
      <instancedMesh ref={trunk} args={[geo.trunk, mats.trunk, items.length]} castShadow receiveShadow />
      <instancedMesh ref={blob} args={[geo.blob, mats.blob, items.length]} castShadow receiveShadow />
      <instancedMesh ref={cards} args={[geo.cards, mats.cards, items.length]} castShadow receiveShadow />
    </group>
  )
}

function InstancedSimple({ geo, mat, items, yScale = 1 }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[]; yScale?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot)
      m.compose(new THREE.Vector3(it.x, 0, it.z), q, new THREE.Vector3(it.s, it.s * yScale, it.s))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [items, yScale])
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow receiveShadow />
}

function WindClock() {
  useFrame(({ clock }) => (windUniform.value = clock.elapsedTime))
  return null
}

export function Vegetation() {
  const quality = useStore((s) => s.quality)
  const lite = quality === 'low'

  const data = useMemo(() => {
    const r = mulberry32(2024)
    const camphorA = broadleaf(1, { R: 5, H: 11, trunkH: 3.2, blobs: 7, cards: lite ? 60 : 130, color: '#4d7a35' })
    const camphorB = broadleaf(2, { R: 4.2, H: 9, trunkH: 2.8, blobs: 6, cards: lite ? 50 : 110, color: '#557f3a' })
    const roundT = broadleaf(3, { R: 3.6, H: 7.5, trunkH: 2.4, blobs: 5, cards: lite ? 40 : 90, color: '#5f8a3e' })
    const banyan = broadleaf(4, { R: 14, H: 17, trunkH: 4.5, blobs: 16, cards: lite ? 300 : 700, color: '#3f6e2e', flat: 0.8, trunkR: 1.1, roots: 26 })
    const cyp = cypress(5)
    const palmA = palm(6)
    const shrub = shrubBall(7)

    const inCampus = (x: number, z: number) => inRect(x, z, CAMPUS, -3)
    const freeIn = (x: number, z: number) => inCampus(x, z) && !isBlocked(x, z, 3)
    const nearBanyan = (x: number, z: number) => BANYANS.some(([bx, bz]) => (bx - x) ** 2 + (bz - z) ** 2 < 260)

    // 行道树：校内环路两侧
    const roadTrees: [number, number, number, number][] = []
    for (const rd of ROADS) {
      const alongX = rd[1] - rd[0] > rd[3] - rd[2]
      if (alongX) {
        roadTrees.push([rd[0] + 4, rd[2] - 3, rd[1] - 4, rd[2] - 3], [rd[0] + 4, rd[3] + 3, rd[1] - 4, rd[3] + 3])
      } else {
        roadTrees.push([rd[0] - 3, rd[2] + 4, rd[0] - 3, rd[3] - 4], [rd[1] + 3, rd[2] + 4, rd[1] + 3, rd[3] - 4])
      }
    }
    const streetTrees: [number, number, number, number][] = []
    for (const s of STREETS) {
      const alongZ = s[3] - s[2] > s[1] - s[0]
      if (alongZ) streetTrees.push([s[0] - 2.5, s[2], s[0] - 2.5, s[3]], [s[1] + 2.5, s[2], s[1] + 2.5, s[3]])
      else streetTrees.push([s[0], s[2] - 2.5, s[1], s[2] - 2.5], [s[0], s[3] + 2.5, s[1], s[3] + 2.5])
    }
    const roadItems = rows(r, roadTrees, 9).filter((it) => !isBlocked(it.x, it.z, 1.5))
    const streetItems = rows(r, streetTrees, 10).filter((it) => !STREETS.some((s) => inRect(it.x, it.z, s, 0.5)))

    // 校内绿地散布
    const campusA = scatter(r, CAMPUS, lite ? 90 : 170, (x, z) => freeIn(x, z) && !nearBanyan(x, z), 0.8, 1.25)
    const campusB = scatter(r, CAMPUS, lite ? 60 : 110, (x, z) => freeIn(x, z) && !nearBanyan(x, z), 0.8, 1.2)

    // 校外林地（西侧丘陵与北侧绿带）
    const outside = (x: number, z: number) => !inRect(x, z, CAMPUS, 6) && !STREETS.some((s) => inRect(x, z, s, 4))
    const forestA = scatter(r, [-420, -232, -320, 420], lite ? 120 : 260, outside, 0.9, 1.5)
    const forestB = scatter(r, [-230, 230, -186, -162], lite ? 40 : 80, outside, 0.9, 1.4)
    const forestC = scatter(r, [204, 226, -320, 420], lite ? 30 : 60, outside, 0.9, 1.4)

    // 古榕
    const banyans: Inst[] = BANYANS.map(([x, z], i) => ({ x, z, s: 0.85 + (i % 3) * 0.12, rot: i * 1.7, tint: 0.3 + (i % 2) * 0.2 }))

    // 棕榈：钟楼前庭、校门、广场两侧
    const palms: Inst[] = [
      ...rows(r, [[-146, 96, -146, 124], [-74, 96, -74, 124]], 7),
      ...rows(r, [[168, -54, 168, -44], [168, -8, 168, 2]], 5),
      ...rows(r, [[-28, 2, -28, 40], [28, 2, 28, 40]], 9.5),
    ]
    // 柏树：钟楼周边（第 5 张实拍中的高大柏树）
    const cypresses: Inst[] = [
      ...rows(r, [[-136, 90, -136, 120]], 10),
      ...rows(r, [[-84, 90, -84, 120]], 10),
      ...rows(r, [[-66, -40, -66, -8]], 8),
      { x: -125, z: 128, s: 1.1, rot: 0, tint: 0.5 },
      { x: -96, z: 128, s: 1.0, rot: 0, tint: 0.4 },
    ]
    // 修剪球：广场边、楼前
    const shrubs: Inst[] = [
      ...rows(r, [[-50, 48.5, -8, 48.5], [8, 48.5, 50, 48.5]], 3.2, 0.2),
      ...rows(r, [[-58, -6, -58, 44], [58, -6, 58, 44]], 3.5, 0.2),
      ...rows(r, [[-140, 90, -80, 90]], 3.4, 0.2),
      ...rows(r, [[60, 14, 102, 14]], 3.4, 0.2),
      ...scatter(r, CAMPUS, lite ? 60 : 150, (x, z) => freeIn(x, z), 0.6, 1.3),
    ].map((s) => ({ ...s, s: s.s * 0.9 }))
    // 圆形花坛中的灌木
    for (const [cx, cz] of [[-36, 22], [36, 22]] as const)
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        shrubs.push({ x: cx + Math.cos(a) * 4.5, z: cz + Math.sin(a) * 4.5, s: 1, rot: a, tint: 0.5 })
      }

    const campusTrees = [...roadItems.filter((it) => inRect(it.x, it.z, CAMPUS)), ...campusA]
    return {
      camphorA,
      camphorB,
      roundT,
      banyan,
      cyp,
      palmA,
      shrub,
      itemsA: [...campusTrees, ...forestA],
      itemsB: [...campusB, ...streetItems, ...forestB],
      itemsC: [...roadItems.filter((it) => !inRect(it.x, it.z, CAMPUS)), ...forestC],
      banyans,
      palms,
      cypresses,
      shrubs,
    }
  }, [lite])

  const leafA = useMemo(() => leafTexture(1, 0.27), [])
  const leafB = useMemo(() => leafTexture(2, 0.25), [])
  const leafD = useMemo(() => leafTexture(3, 0.3), [])
  const frond = useMemo(() => frondTexture(), [])
  const palmMats = useMemo(
    () => ({
      trunk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      crown: swayMaterial({ vertexColors: true, map: frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }, 0.02),
    }),
    [frond],
  )
  const shrubMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), [])

  return (
    <group>
      <WindClock />
      <InstancedTree geo={data.camphorA} items={data.itemsA} leafMap={leafA} />
      <InstancedTree geo={data.camphorB} items={data.itemsB} leafMap={leafB} />
      <InstancedTree geo={data.roundT} items={data.itemsC} leafMap={leafA} />
      <InstancedTree geo={data.banyan} items={data.banyans} leafMap={leafD} sway={0.004} />
      <InstancedTree geo={data.cyp} items={data.cypresses} leafMap={leafD} leafColor="#c8d8c0" sway={0.006} />
      <InstancedSimple geo={data.palmA.trunk} mat={palmMats.trunk} items={data.palms} />
      <InstancedSimple geo={data.palmA.crown} mat={palmMats.crown} items={data.palms} />
      <InstancedSimple geo={data.shrub} mat={shrubMat} items={data.shrubs} />
    </group>
  )
}
