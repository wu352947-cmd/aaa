import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Glitch, HueSaturation, BrightnessContrast, Noise, SMAA, ToneMapping, Vignette, N8AO } from '@react-three/postprocessing'
import { BlendFunction, GlitchMode, ToneMappingMode, type ChromaticAberrationEffect, type GlitchEffect } from 'postprocessing'
import { film } from './clock'

/** 惊吓节拍：画面撕裂、色差脉冲 */
const HITS = [32.05, 56.4, 57.6, 75.45, 101, 108, 111, 114, 129.5, 152, 160.6]

export function FilmFX() {
  const ca = useRef<ChromaticAberrationEffect>(null)
  const glitch = useRef<GlitchEffect>(null)
  useFrame(() => {
    const t = film.t
    let s = 0
    for (const h of HITS) if (t >= h && t < h + 0.7) s = Math.max(s, 1 - (t - h) / 0.7)
    const tension = t > 104 && t < 118 ? 0.5 : t > 156 && t < 161 ? 0.8 : 0.15
    if (ca.current) {
      const o = 0.0007 + tension * 0.002 + s * 0.012
      ca.current.offset.set(o * (Math.random() < 0.5 ? 1 : -1), o * 0.5)
    }
    if (glitch.current) glitch.current.mode = s > 0.45 ? GlitchMode.CONSTANT_WILD : GlitchMode.DISABLED
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={2.5} distanceFalloff={1} intensity={2.6} quality="medium" halfRes />
      <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.68} luminanceSmoothing={0.3} />
      <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0.0008, 0.0005)} radialModulation={false} modulationOffset={0} />
      <Glitch ref={glitch as never} delay={new THREE.Vector2(0.1, 0.3)} duration={new THREE.Vector2(0.05, 0.2)} strength={new THREE.Vector2(0.3, 0.8)} active />
      <HueSaturation saturation={-0.3} hue={-0.02} />
      <BrightnessContrast brightness={0.01} contrast={0.2} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.4} />
      <Vignette darkness={0.6} offset={0.25} />
      <SMAA />
    </EffectComposer>
  )
}
