import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Glitch, HueSaturation, BrightnessContrast, Noise, SMAA, ToneMapping, Vignette, N8AO } from '@react-three/postprocessing'
import { BlendFunction, GlitchMode, ToneMappingMode, type ChromaticAberrationEffect, type GlitchEffect, type VignetteEffect } from 'postprocessing'
import { G } from './state'
import { useStore } from '../lib/store'

/** 恐怖后期：胶片噪点、色差（随恐惧加剧）、惊吓时画面撕裂、去饱和、重暗角 */
export function HorrorFX() {
  const quality = useStore((s) => s.quality)
  const ca = useRef<ChromaticAberrationEffect>(null)
  const glitch = useRef<GlitchEffect>(null)
  const vig = useRef<VignetteEffect>(null)
  useFrame(() => {
    const f = G.fear
    const s = G.scare
    if (ca.current) {
      const o = 0.0006 + f * 0.0035 + s * 0.012 + (Math.random() < f * 0.05 ? 0.01 : 0)
      ca.current.offset.set(o * (Math.random() < 0.5 ? 1 : -1), o * 0.6)
    }
    if (glitch.current) glitch.current.mode = s > 0.35 ? GlitchMode.CONSTANT_WILD : f > 0.75 && Math.random() < 0.02 ? GlitchMode.CONSTANT_MILD : GlitchMode.DISABLED
    if (vig.current) vig.current.darkness = 0.72 + f * 0.25
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {quality === 'high' ? <N8AO aoRadius={2.5} distanceFalloff={1} intensity={3} quality="medium" halfRes /> : <></>}
      <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.7} luminanceSmoothing={0.3} />
      <ChromaticAberration ref={ca as never} offset={new THREE.Vector2(0.001, 0.0006)} radialModulation={false} modulationOffset={0} />
      <Glitch ref={glitch as never} delay={new THREE.Vector2(0.3, 1.2)} duration={new THREE.Vector2(0.1, 0.4)} strength={new THREE.Vector2(0.2, 0.6)} active />
      <HueSaturation saturation={-0.35} hue={-0.03} />
      <BrightnessContrast brightness={-0.02} contrast={0.18} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.35} />
      <Vignette ref={vig as never} darkness={0.75} offset={0.22} />
      <SMAA />
    </EffectComposer>
  )
}
