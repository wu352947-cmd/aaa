import * as THREE from 'three'
import type { FacadeTextures } from './painter'

/** 所有带夜景发光贴图的材质，切换昼夜时统一调整亮度 */
const glowing = new Set<THREE.MeshStandardMaterial>()
const glowBase = new WeakMap<THREE.Material, number>()
let nightLevel = 0

export function registerGlow(m: THREE.MeshStandardMaterial, base = 1) {
  glowing.add(m)
  glowBase.set(m, base)
  m.emissiveIntensity = base * nightLevel
  return m
}

export function setNightLevel(v: number) {
  nightLevel = v
  glowing.forEach((m) => (m.emissiveIntensity = (glowBase.get(m) ?? 1) * v))
}

export function facadeMaterial(t: FacadeTextures, o: { glow?: number; envMapIntensity?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    roughnessMap: t.pbr,
    metalnessMap: t.pbr,
    roughness: 1,
    metalness: 1,
    emissiveMap: t.emit,
    emissive: new THREE.Color('#ffffff'),
    envMapIntensity: o.envMapIntensity ?? 1,
  })
  return registerGlow(m, o.glow ?? 1.6)
}

const solidCache = new Map<string, THREE.MeshStandardMaterial>()
export function solid(color: string, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`
  let m = solidCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
    solidCache.set(key, m)
  }
  return m
}

/** 夜间发光的灯具材质 */
const lampCache = new Map<string, THREE.MeshStandardMaterial>()
export function lampMaterial(color = '#ffe2b0', base = 6) {
  const key = `${color}|${base}`
  let m = lampCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: '#f4f1ea', emissive: color, roughness: 0.4 })
    registerGlow(m, base)
    lampCache.set(key, m)
  }
  return m
}

export const glassMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: '#6f9cc4',
    metalness: 0.2,
    roughness: 0.05,
    transmission: 0,
    reflectivity: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
  })
