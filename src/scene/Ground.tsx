import { useMemo } from 'react'
import * as THREE from 'three'
import { CAMPUS, GROUND_EXTENT, PAVED, ROADS, ROUND_LAWNS, STREETS, FOOTPRINTS, type Rect } from '../data/site'
import { mulberry32 } from '../lib/random'
import { detailNoise } from '../lib/textures'

const PPM = 6

/** 总平面地面：一张大画布 + 高频细节噪声叠加 */
export function Ground() {
  const [x0, x1, z0, z1] = GROUND_EXTENT
  const W = x1 - x0
  const D = z1 - z0
  const material = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = W * PPM
    cv.height = D * PPM
    const c = cv.getContext('2d')!
    const r = mulberry32(42)
    const X = (x: number) => (x - x0) * PPM
    const Z = (z: number) => (z - z0) * PPM
    const rect = (rc: Rect, color: string) => {
      c.fillStyle = color
      c.fillRect(X(rc[0]), Z(rc[2]), (rc[1] - rc[0]) * PPM, (rc[3] - rc[2]) * PPM)
    }

    // 1. 草地底色 + 色斑
    c.fillStyle = '#6a8a45'
    c.fillRect(0, 0, cv.width, cv.height)
    for (let i = 0; i < 9000; i++) {
      const h = 80 + r() * 25
      const l = 28 + r() * 14
      c.fillStyle = `hsla(${h},38%,${l}%,0.35)`
      const s = 2 + r() * 14
      c.beginPath()
      c.arc(r() * cv.width, r() * cv.height, s, 0, Math.PI * 2)
      c.fill()
    }

    // 2. 校外：人行道 + 市政道路
    for (const s of STREETS) {
      rect([s[0] - 4, s[1] + 4, s[2] - 4, s[3] + 4], '#b9b4a9')
    }
    for (const s of STREETS) {
      rect(s, '#4a4d52')
      const alongZ = s[3] - s[2] > s[1] - s[0]
      c.fillStyle = 'rgba(255,255,255,0.85)'
      if (alongZ) {
        const mid = (s[0] + s[1]) / 2
        c.fillStyle = '#e8c547'
        c.fillRect(X(mid) - 1.5, Z(s[2]), 3, (s[3] - s[2]) * PPM)
        c.fillStyle = 'rgba(255,255,255,0.8)'
        for (const k of [0.25, 0.75]) {
          const lx = s[0] + (s[1] - s[0]) * k
          for (let z = s[2]; z < s[3]; z += 9) c.fillRect(X(lx) - 1, Z(z), 2, 4 * PPM)
        }
      } else {
        const mid = (s[2] + s[3]) / 2
        c.fillStyle = '#e8c547'
        c.fillRect(X(s[0]), Z(mid) - 1.5, (s[1] - s[0]) * PPM, 3)
        c.fillStyle = 'rgba(255,255,255,0.8)'
        for (let x = s[0]; x < s[1]; x += 9) c.fillRect(X(x), Z(mid - 3.5) - 1, 4 * PPM, 2)
      }
    }

    // 3. 校内浅色铺装
    const paveColor = '#cbc6bb'
    for (const p of PAVED) rect(p, paveColor)
    for (const f of FOOTPRINTS) rect([f[0] - 3, f[1] + 3, f[2] - 3, f[3] + 3], '#c3beb3')
    // 铺装分格线
    c.strokeStyle = 'rgba(120,112,100,0.25)'
    c.lineWidth = 1
    for (const p of PAVED) {
      for (let x = p[0]; x <= p[1]; x += 1.5) {
        c.beginPath()
        c.moveTo(X(x), Z(p[2]))
        c.lineTo(X(x), Z(p[3]))
        c.stroke()
      }
      for (let z = p[2]; z <= p[3]; z += 1.5) {
        c.beginPath()
        c.moveTo(X(p[0]), Z(z))
        c.lineTo(X(p[1]), Z(z))
        c.stroke()
      }
    }
    // 升旗广场：深色花岗岩分隔带与中轴
    c.fillStyle = '#a19b90'
    for (let x = -54; x <= 54; x += 12) c.fillRect(X(x) - 3, Z(-12), 6, 58 * PPM)
    for (let z = -6; z <= 46; z += 12) c.fillRect(X(-56), Z(z) - 3, 112 * PPM, 6)
    c.fillStyle = '#d9d3c6'
    c.fillRect(X(-4), Z(-12), 8 * PPM, 58 * PPM)
    c.fillStyle = '#b2382d'
    c.fillRect(X(-1.2), Z(-12), 2.4 * PPM, 58 * PPM)

    // 4. 校内环路
    for (const rd of ROADS) rect(rd, '#55585c')
    // 校外与校内之间的绿化带边缘深色
    c.strokeStyle = 'rgba(40,50,30,0.35)'
    c.lineWidth = 4
    c.strokeRect(X(CAMPUS[0]), Z(CAMPUS[2]), (CAMPUS[1] - CAMPUS[0]) * PPM, (CAMPUS[3] - CAMPUS[2]) * PPM)

    // 5. 圆形草坪、树池
    for (const l of ROUND_LAWNS) {
      c.fillStyle = '#e8e3d8'
      c.beginPath()
      c.arc(X(l.x), Z(l.z), (l.r + 1.2) * PPM, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#6f9547'
      c.beginPath()
      c.arc(X(l.x), Z(l.z), l.r * PPM, 0, Math.PI * 2)
      c.fill()
    }
    // 古榕广场：棋盘纹铺装 + 树池
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 18; j++) {
        if ((i + j) % 2) continue
        c.fillStyle = 'rgba(150,140,125,0.35)'
        c.fillRect(X(-17 + i * 3.2), Z(46 + j * 3), 3.2 * PPM, 3 * PPM)
      }
    for (const [tx, tz] of BANYANS) {
      c.fillStyle = '#d8d2c6'
      c.beginPath()
      c.arc(X(tx), Z(tz), 4.2 * PPM, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#5a4a38'
      c.beginPath()
      c.arc(X(tx), Z(tz), 3.4 * PPM, 0, Math.PI * 2)
      c.fill()
    }
    // 球场红色底
    rect([-66, -14, 98, 154], '#9c4a3e')

    const map = new THREE.CanvasTexture(cv)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 16
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.95 })
    const detail = detailNoise()
    m.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail }
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;')
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
            float dn = texture2D( detailMap, vMapUv * vec2(${(W / 6).toFixed(1)}, ${(D / 6).toFixed(1)}) ).r;
            float dn2 = texture2D( detailMap, vMapUv * vec2(${(W / 1.3).toFixed(1)}, ${(D / 1.3).toFixed(1)}) ).r;
            sampledDiffuseColor.rgb *= mix(0.84, 1.12, dn) * mix(0.92, 1.06, dn2);
            diffuseColor *= sampledDiffuseColor;
          #endif`,
        )
    }
    return m
  }, [W, D, x0, z0])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]} material={material} receiveShadow>
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* 远处地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[9000, 9000]} />
        <meshStandardMaterial color="#62774c" roughness={1} />
      </mesh>
    </group>
  )
}

/** 古榕位置（植被与地面共用） */
export const BANYANS: [number, number][] = [
  [-8, 56],
  [6, 68],
  [-10, 80],
  [7, 90],
  [-6, 98],
]
