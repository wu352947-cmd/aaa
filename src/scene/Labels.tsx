import { Html } from '@react-three/drei'
import { PLACES } from '../data/places'
import { store, useStore } from '../lib/store'

/** 建筑名牌：悬浮在楼顶上方，点击飞往 */
export function Labels() {
  const show = useStore((s) => s.labels)
  const selected = useStore((s) => s.selected)
  if (!show) return null
  return (
    <group>
      {PLACES.map((p) => (
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
