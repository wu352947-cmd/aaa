import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { setNightLevel } from '../lib/materials'
import { useStore, type TimeOfDay } from '../lib/store'

interface Preset {
  elev: number // 太阳高度角（度）
  azim: number // 方位角（度，0 = 南，90 = 西）
  sunColor: string
  sunI: number
  hemiSky: string
  hemiGround: string
  hemiI: number
  zenith: string
  mid: string
  horizon: string
  ground: string
  glow: number
  clouds: number
  cloudColor: string
  stars: number
  fog: string
  fogD: number
  night: number
  env: number
  bloom: number
}

export const PRESETS: Record<TimeOfDay, Preset> = {
  day: {
    elev: 50,
    azim: -38,
    sunColor: '#fff3df',
    sunI: 3.4,
    hemiSky: '#cfe2ff',
    hemiGround: '#7a7560',
    hemiI: 0.85,
    zenith: '#2c69c0',
    mid: '#6da2df',
    horizon: '#d6e7f4',
    ground: '#a9b4b8',
    glow: 0.4,
    clouds: 0.55,
    cloudColor: '#ffffff',
    stars: 0,
    fog: '#c9d9e6',
    fogD: 0.00038,
    night: 0,
    env: 1,
    bloom: 0.35,
  },
  dusk: {
    elev: 6,
    azim: 62,
    sunColor: '#ffb27c',
    sunI: 2.6,
    hemiSky: '#c7a3d6',
    hemiGround: '#6e5650',
    hemiI: 0.75,
    zenith: '#3b4a92',
    mid: '#b48bc9',
    horizon: '#f6b0a0',
    ground: '#7d6b78',
    glow: 1.4,
    clouds: 0.5,
    cloudColor: '#ffc2b0',
    stars: 0.05,
    fog: '#d4a9b9',
    fogD: 0.00046,
    night: 0.55,
    env: 0.9,
    bloom: 0.6,
  },
  night: {
    elev: 38,
    azim: 140,
    sunColor: '#9db4ff',
    sunI: 0.38,
    hemiSky: '#33456e',
    hemiGround: '#1b1d22',
    hemiI: 0.35,
    zenith: '#040812',
    mid: '#0d1630',
    horizon: '#2a3557',
    ground: '#0d1018',
    glow: 0.12,
    clouds: 0.25,
    cloudColor: '#4a5878',
    stars: 1,
    fog: '#1a2236',
    fogD: 0.0005,
    night: 1,
    env: 0.35,
    bloom: 1.1,
  },
}

/** 运行时插值中的当前参数（Effects 读取 bloom） */
export const live = { bloom: PRESETS.day.bloom }

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`

const skyFrag = /* glsl */ `
uniform vec3 uZenith, uMid, uHorizon, uGround, uSunDir, uSunColor, uCloudColor;
uniform float uGlow, uClouds, uStars, uTime;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<6;i++){ s += a*noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, t));
  col = mix(col, uZenith, smoothstep(0.3, 1.0, t));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 1600.0) * 30.0 + pow(sd, 60.0) * 0.6 + pow(sd, 6.0) * 0.25 * uGlow);
  // 地平线附近的太阳余晖
  col += uSunColor * uGlow * 0.35 * pow(1.0 - abs(h), 8.0) * (0.4 + 0.6 * pow(sd, 2.0));
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 1.3);
    c = smoothstep(0.52 - uClouds * 0.25, 0.85, c) * smoothstep(0.0, 0.18, h);
    vec3 cc = mix(uCloudColor * 0.75, uCloudColor * 1.05 + uSunColor * 0.15 * uGlow, pow(sd, 3.0) * 0.6 + 0.4);
    col = mix(col, cc, c * 0.85);
    // 星空
    vec2 sp = d.xz / (h + 0.4) * 220.0;
    float st = step(0.9965, hash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sp) + 3.0) * 30.0));
    col += vec3(st) * uStars * (1.0 - c) * smoothstep(0.05, 0.3, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function makeSkyMaterial() {
  const p = PRESETS.day
  return new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(p.zenith) },
      uMid: { value: new THREE.Color(p.mid) },
      uHorizon: { value: new THREE.Color(p.horizon) },
      uGround: { value: new THREE.Color(p.ground) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(p.sunColor) },
      uCloudColor: { value: new THREE.Color(p.cloudColor) },
      uGlow: { value: p.glow },
      uClouds: { value: p.clouds },
      uStars: { value: p.stars },
      uTime: { value: 0 },
    },
  })
}

const sunDir = (elev: number, azim: number) => {
  const e = THREE.MathUtils.degToRad(elev)
  const a = THREE.MathUtils.degToRad(azim)
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize()
}

export function Atmosphere() {
  const time = useStore((s) => s.time)
  const quality = useStore((s) => s.quality)
  const { scene } = useThree()
  const sky = useMemo(makeSkyMaterial, [])
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const cur = useRef({ ...PRESETS.day, dir: sunDir(PRESETS.day.elev, PRESETS.day.azim) })
  const target = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    scene.fog = new THREE.FogExp2(PRESETS.day.fog, PRESETS.day.fogD)
    scene.add(target)
    target.position.set(10, 0, 10)
    return () => {
      scene.remove(target)
    }
  }, [scene, target])

  useFrame(({ clock }, dt) => {
    const P = PRESETS[time]
    const c = cur.current
    const k = 1 - Math.exp(-dt * 1.8)
    const lerpC = (key: keyof Preset, u: THREE.Color) => u.lerp(new THREE.Color(P[key] as string), k)
    c.dir.lerp(sunDir(P.elev, P.azim), k).normalize()
    for (const key of ['sunI', 'hemiI', 'glow', 'clouds', 'stars', 'fogD', 'night', 'env', 'bloom'] as const) c[key] += (P[key] - c[key]) * k

    const u = sky.uniforms
    lerpC('zenith', u.uZenith.value)
    lerpC('mid', u.uMid.value)
    lerpC('horizon', u.uHorizon.value)
    lerpC('ground', u.uGround.value)
    lerpC('sunColor', u.uSunColor.value)
    lerpC('cloudColor', u.uCloudColor.value)
    u.uSunDir.value.copy(c.dir)
    u.uGlow.value = c.glow
    u.uClouds.value = c.clouds
    u.uStars.value = c.stars
    u.uTime.value = clock.elapsedTime

    if (sun.current) {
      sun.current.position.copy(target.position).addScaledVector(c.dir, 600)
      sun.current.intensity = c.sunI
      sun.current.color.lerp(new THREE.Color(P.sunColor), k)
    }
    if (hemi.current) {
      hemi.current.intensity = c.hemiI
      hemi.current.color.lerp(new THREE.Color(P.hemiSky), k)
      hemi.current.groundColor.lerp(new THREE.Color(P.hemiGround), k)
    }
    const fog = scene.fog as THREE.FogExp2
    if (fog) {
      fog.color.lerp(new THREE.Color(P.fog), k)
      fog.density = c.fogD
    }
    scene.environmentIntensity = c.env
    setNightLevel(c.night)
    live.bloom = c.bloom
  })

  const mapSize = quality === 'high' ? 4096 : 2048
  return (
    <>
      <mesh material={sky} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[5000, 32, 16]} />
      </mesh>
      <Environment resolution={128} frames={Infinity}>
        <mesh material={sky}>
          <sphereGeometry args={[400, 32, 16]} />
        </mesh>
      </Environment>
      <hemisphereLight ref={hemi} args={['#cfe2ff', '#7a7560', 0.85]} />
      <directionalLight
        key={mapSize}
        ref={sun}
        target={target}
        castShadow
        intensity={3.4}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.15}
      >
        <orthographicCamera attach="shadow-camera" args={[-250, 250, 250, -250, 1, 1400]} />
      </directionalLight>
    </>
  )
}
