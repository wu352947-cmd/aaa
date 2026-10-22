import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect } from 'postprocessing'
import { useStore } from '../lib/store'
import { live } from './Atmosphere'

/** 后期：环境光遮蔽 + 泛光 + AgX 色调映射 + 抗锯齿 + 暗角 */
export function Effects() {
  const quality = useStore((s) => s.quality)
  const bloom = useRef<BloomEffect>(null)
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = live.bloom
  })
  const high = quality === 'high'
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {high ? <N8AO aoRadius={4} distanceFalloff={1.2} intensity={2.2} quality="medium" halfRes /> : <></>}
      <Bloom ref={bloom as never} mipmapBlur intensity={0.35} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
      <Vignette darkness={0.32} offset={0.3} />
    </EffectComposer>
  )
}
