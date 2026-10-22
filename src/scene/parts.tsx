import * as THREE from 'three'
import { useMemo, type ReactNode } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { paintFacade, type Painter } from '../lib/painter'
import { facadeMaterial, solid } from '../lib/materials'
import { store } from '../lib/store'

type V3 = [number, number, number]

/** 普通实体盒子 */
export function Block({
  size,
  position,
  color,
  material,
  rough = 0.85,
  metal = 0,
  shadow = true,
  ...rest
}: {
  size: V3
  position?: V3
  color?: string
  material?: THREE.Material | THREE.Material[]
  rough?: number
  metal?: number
  shadow?: boolean
} & Omit<ThreeElements['mesh'], 'position' | 'material'>) {
  const mat = material ?? solid(color ?? '#cccccc', rough, metal)
  return (
    <mesh position={position} material={mat} castShadow={shadow} receiveShadow {...rest}>
      <boxGeometry args={size} />
    </mesh>
  )
}

/** 立面贴图（米制尺寸 + 绘制脚本），按依赖缓存 */
export function useFacade(W: number, H: number, draw: (p: Painter) => void, seed = 1, ppm = 24, glow = 1.6) {
  return useMemo(() => facadeMaterial(paintFacade(W, H, draw, { ppm, seed }), { glow }), [W, H, seed, ppm, glow])
}

/**
 * 带四个立面贴图的楼体。position 为底面中心。
 * BoxGeometry 材质顺序：+x, -x, +y, -y, +z, -z
 */
export function FacadeBox({
  size,
  position = [0, 0, 0],
  rotation,
  front,
  back,
  left,
  right,
  roof,
  name,
}: {
  size: V3
  position?: V3
  rotation?: V3
  front?: THREE.Material
  back?: THREE.Material
  left?: THREE.Material
  right?: THREE.Material
  roof?: THREE.Material
  name?: string
}) {
  const [w, h, d] = size
  const fallback = solid('#d8d4cc', 0.85)
  const roofMat = roof ?? solid('#a9a7a2', 0.95)
  const mats = [right ?? fallback, left ?? fallback, roofMat, roofMat, front ?? fallback, back ?? front ?? fallback]
  return (
    <mesh
      name={name}
      position={[position[0], position[1] + h / 2, position[2]]}
      rotation={rotation}
      material={mats}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[w, h, d]} />
    </mesh>
  )
}

/** 可点击的建筑分组：点击后选中并飞往对应视点 */
export function Selectable({ id, children, position, rotation }: { id: string; children: ReactNode; position?: V3; rotation?: V3 }) {
  return (
    <group
      position={position}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation()
        store.set({ selected: id, flyTo: id, touring: false })
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {children}
    </group>
  )
}

/** 屋顶女儿墙：沿矩形四周的矮墙 */
export function Parapet({
  w,
  d,
  y,
  h = 1.1,
  t = 0.3,
  color = '#d9d6cf',
  material,
}: {
  w: number
  d: number
  y: number
  h?: number
  t?: number
  color?: string
  material?: THREE.Material
}) {
  const m = material ?? solid(color, 0.85)
  return (
    <group position={[0, y + h / 2, 0]}>
      <mesh material={m} position={[0, 0, d / 2 - t / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh material={m} position={[0, 0, -d / 2 + t / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh material={m} position={[w / 2 - t / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h, d]} />
      </mesh>
      <mesh material={m} position={[-w / 2 + t / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[t, h, d]} />
      </mesh>
    </group>
  )
}

/** 屋顶设备：空调外机、水箱，让屋顶不至于空荡 */
export function RoofClutter({ w, d, y, seed = 1 }: { w: number; d: number; y: number; seed?: number }) {
  const items = useMemo(() => {
    const out: { p: V3; s: V3; c: string }[] = []
    let a = seed * 9301
    const r = () => ((a = (a * 9301 + 49297) % 233280) / 233280)
    const n = Math.max(2, Math.floor((w * d) / 220))
    for (let i = 0; i < n; i++) {
      const big = r() < 0.25
      const s: V3 = big ? [2.4 + r() * 2, 1.6 + r(), 2 + r() * 2] : [0.9 + r() * 0.5, 0.7, 0.5]
      out.push({
        p: [(r() - 0.5) * (w - 4), y + s[1] / 2, (r() - 0.5) * (d - 4)],
        s,
        c: big ? '#b9bcbf' : '#e7e7e2',
      })
    }
    return out
  }, [w, d, y, seed])
  return (
    <group>
      {items.map((it, i) => (
        <mesh key={i} position={it.p} material={solid(it.c, 0.6, 0.2)} castShadow>
          <boxGeometry args={it.s} />
        </mesh>
      ))}
    </group>
  )
}

export function useTiledTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 512, repeat: [number, number] = [1, 1], srgb = true) {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const ctx = cv.getContext('2d')!
    draw(ctx, size)
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
    t.anisotropy = 8
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, repeat[0], repeat[1]])
}
