import { useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { PLACES } from '../data/places'
import { store, useStore } from '../lib/store'

/** 建筑名牌：高空俯瞰时全部显示；贴近地面时只保留选中的那一个，避免远处标签挤在一起 */
export function Labels() {
  const show = useStore((s) => s.labels)
  const selected = useStore((s) => s.selected)
  const [aerial, setAerial] = useState(true)
  useFrame(({ camera }) => {
    const a = camera.position.y > 70
    if (a !== aerial) setAerial(a)
  })
  if (!show) return null
  return (
    <group>
      {PLACES.filter((p) => aerial || p.id === selected).map((p) => (
        <Html key={p.id} position={p.label} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <button
            type="button"
            className={`pin${selected === p.id ? ' is-active' : ''}`}
            onClick={() => store.set({ selected: p.id, flyTo: p.id, touring: false })}
          >
            <span className="pin-name">{p.name}</span>
          </button>
        </Html>
      ))}
    </group>
  )
}
