import { PLACES, placeById } from '../data/places'
import { store, useStore, type TimeOfDay } from '../lib/store'

const TIMES: { id: TimeOfDay; label: string }[] = [
  { id: 'day', label: '晴日' },
  { id: 'dusk', label: '黄昏' },
  { id: 'night', label: '夜景' },
]

function Plaque() {
  return (
    <header className="plaque">
      <h1 className="plaque-name">福建省连江第一中学</h1>
      <p className="plaque-sub">
        <span>数字校园</span>
        <span className="dot" aria-hidden="true" />
        <span>创办于 1923</span>
        <span className="dot" aria-hidden="true" />
        <span className="mono">N 26°12′ · E 119°32′</span>
      </p>
    </header>
  )
}

function PlaceList() {
  const selected = useStore((s) => s.selected)
  return (
    <nav className="places" aria-label="校园建筑">
      <p className="eyebrow">校园建筑 · {PLACES.length} 处</p>
      <ul>
        {PLACES.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`place${selected === p.id ? ' is-active' : ''}`}
              onClick={() => store.set({ selected: p.id, flyTo: p.id, touring: false })}
            >
              <span className="place-name">{p.name}</span>
              <span className="place-tag">{p.tag}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function InfoCard() {
  const id = useStore((s) => s.selected)
  const p = id ? placeById(id) : null
  if (!p) return null
  return (
    <aside className="info" aria-live="polite">
      <div className="info-head">
        <p className="eyebrow">{p.tag}</p>
        <button type="button" className="close" aria-label="关闭介绍" onClick={() => store.set({ selected: null })}>
          ×
        </button>
      </div>
      <h2>{p.name}</h2>
      <p className="info-desc">{p.desc}</p>
    </aside>
  )
}

function Toolbar() {
  const time = useStore((s) => s.time)
  const touring = useStore((s) => s.touring)
  const labels = useStore((s) => s.labels)
  const quality = useStore((s) => s.quality)
  return (
    <div className="toolbar" role="toolbar" aria-label="视图控制">
      <button type="button" className="tool" onClick={() => store.set({ flyTo: 'overview', selected: null, touring: false })}>
        全景
      </button>
      <button type="button" className={`tool${touring ? ' is-on' : ''}`} aria-pressed={touring} onClick={() => store.set({ touring: !touring })}>
        {touring ? '停止导览' : '自动导览'}
      </button>
      <div className="seg" role="radiogroup" aria-label="时段">
        {TIMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={time === t.id} className={`seg-item${time === t.id ? ' is-on' : ''}`} onClick={() => store.set({ time: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <button type="button" className={`tool${labels ? ' is-on' : ''}`} aria-pressed={labels} onClick={() => store.set({ labels: !labels })}>
        楼名
      </button>
      <button type="button" className="tool" onClick={() => store.set({ quality: quality === 'high' ? 'low' : 'high' })}>
        {quality === 'high' ? '高画质' : '流畅'}
      </button>
    </div>
  )
}

function Loader() {
  const ready = useStore((s) => s.ready)
  return (
    <div className={`loader${ready ? ' is-done' : ''}`} aria-hidden={ready}>
      <div className="loader-plaque">
        <p className="loader-name">福建省连江第一中学</p>
        <p className="loader-sub">正在铺设校园：笃行楼、天文台、古榕广场……</p>
        <div className="loader-bar">
          <span />
        </div>
      </div>
    </div>
  )
}

export function Overlay() {
  return (
    <div className="overlay">
      <Plaque />
      <PlaceList />
      <InfoCard />
      <Toolbar />
      <p className="hint">拖动旋转 · 右键平移 · 滚轮缩放 · 点击建筑查看介绍</p>
      <Loader />
    </div>
  )
}
