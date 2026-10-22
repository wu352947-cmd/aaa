import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { Campus } from './scene/Campus'
import { Atmosphere } from './scene/Atmosphere'
import { Effects } from './scene/Effects'
import { CameraRig } from './scene/CameraRig'
import { Labels } from './scene/Labels'
import { Overlay } from './ui/Overlay'
import { store, useStore } from './lib/store'

/** 场景首帧渲染完成后撤掉加载页 */
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
        dpr={quality === 'high' ? [1, 2] : [0.75, 1.25]}
        camera={{ fov: 42, near: 0.5, far: 12000, position: [-150, 400, 520] }}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onPointerMissed={() => store.set({ selected: null })}
      >
        <Suspense fallback={null}>
          <Atmosphere />
          <Campus />
          <Labels />
          <CameraRig />
          <Effects />
          <Ready />
        </Suspense>
        <AdaptiveDpr pixelated={false} />
      </Canvas>
      <Overlay />
    </div>
  )
}
