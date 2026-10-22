import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { OVERVIEW, TOUR, placeById } from '../data/places'
import { store, useStore } from '../lib/store'

const viewOf = (id: string) => (id === 'overview' ? OVERVIEW : placeById(id))

export function CameraRig() {
  const ref = useRef<CameraControls>(null)
  const flyTo = useStore((s) => s.flyTo)
  const touring = useStore((s) => s.touring)
  const { camera } = useThree()

  // 开场：从高空缓缓降到鸟瞰视角
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const [cx, cy, cz] = OVERVIEW.cam
    const [tx, ty, tz] = OVERVIEW.target
    c.setLookAt(cx * 1.6, cy * 2.2, cz * 1.6, tx, ty, tz, false)
    const t = setTimeout(() => c.setLookAt(cx, cy, cz, tx, ty, tz, true), 400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!flyTo || !ref.current) return
    const v = viewOf(flyTo)
    if (v) ref.current.setLookAt(...v.cam, ...v.target, true)
    store.set({ flyTo: null })
  }, [flyTo])

  // 自动导览：依次飞往各处
  useEffect(() => {
    if (!touring) return
    let i = 0
    const step = () => {
      const id = TOUR[i % TOUR.length]
      store.set({ flyTo: id, selected: id === 'overview' ? null : id })
      i++
    }
    step()
    const timer = setInterval(step, 7000)
    return () => clearInterval(timer)
  }, [touring])

  // 防止相机钻到地面以下
  useFrame(() => {
    const c = ref.current
    if (!c) return
    if (camera.position.y < 1.2) {
      const t = new THREE.Vector3()
      c.getTarget(t)
      c.setPosition(camera.position.x, 1.2, camera.position.z, false)
      if (t.y < 0) c.setTarget(t.x, 0, t.z, false)
    }
  })

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={4}
      maxDistance={1100}
      maxPolarAngle={Math.PI * 0.56}
      smoothTime={0.9}
      draggingSmoothTime={0.15}
      dollySpeed={0.6}
      onStart={() => store.get().touring && store.set({ touring: false })}
    />
  )
}
