import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { Campus } from './scene/Campus'
import { Atmosphere } from './scene/Atmosphere'
import { Player } from './game/Player'
import { Killer } from './game/Killer'
import { Pages } from './game/Pages'
import { Ghosts, BloodWriting, IronGate } from './game/Ghosts'
import { Events } from './game/Events'
import { HorrorFX } from './game/HorrorFX'
import { HUD } from './ui/HUD'
import { store, useStore } from './lib/store'

/** 场景首帧渲染完成后才允许开始 */
function Ready() {
  const { gl } = useThree()
  useEffect(() => {
    let n = 0
    let id = 0
    const tick = () => {
      if (++n > 3) store.set({ ready: true })
      else id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [gl])
  return null
}

export default function App() {
  const quality = useStore((s) => s.quality)
  return (
    <div className="app">
      <Canvas
        className="stage"
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={quality === 'high' ? [1, 1.75] : [0.6, 1]}
        camera={{ fov: 72, near: 0.08, far: 900, position: [-110, 1.6, 120] }}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        // 第一人称不需要场景点击拾取，关闭事件系统以免每帧对上万片树叶做射线检测
        onCreated={(s) => s.setEvents({ enabled: false })}
      >
        <Suspense fallback={null}>
          <Atmosphere />
          <Campus />
          <Pages />
          <Killer />
          <Ghosts />
          <BloodWriting />
          <IronGate />
          <Events />
          <Player />
          <HorrorFX />
          <Ready />
        </Suspense>
        <AdaptiveDpr pixelated={false} />
      </Canvas>
      <HUD />
    </div>
  )
}
