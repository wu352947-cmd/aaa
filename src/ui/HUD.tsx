import { useEffect, useRef, useState } from 'react'
import { game, useGame, resetRun, PAGE_COUNT, G } from '../game/state'
import { INTRO } from '../game/story'
import { sfx } from '../game/audio'
import { input } from '../game/input'
import { resetHaunt } from '../game/Events'
import { store, useStore } from '../lib/store'

function start() {
  sfx.start()
  resetHaunt()
  resetRun()
  try {
    ;(document.querySelector('canvas') as HTMLCanvasElement | null)?.requestPointerLock()
  } catch {
    /* 指针锁定不可用时用拖动视角 */
  }
}

function Menu() {
  const ready = useStore((s) => s.ready)
  const quality = useStore((s) => s.quality)
  return (
    <div className="menu">
      <div className="menu-inner">
        <p className="menu-kicker">福建省连江第一中学 · 午夜 00:13</p>
        <h1 className="menu-title">
          雾夜<span>1888</span>
        </h1>
        <p className="menu-sub">逃离开膛手杰克</p>
        <div className="menu-story">
          {INTRO.map((l, i) => (
            <p key={i} style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
              {l}
            </p>
          ))}
        </div>
        <ul className="menu-keys">
          <li>
            <kbd>W A S D</kbd> 移动
          </li>
          <li>
            <kbd>鼠标</kbd> 环顾
          </li>
          <li>
            <kbd>Shift</kbd> 奔跑
          </li>
          <li>
            <kbd>F</kbd> 手电筒
          </li>
        </ul>
        <p className="menu-tip">靠近信件即可拾取。集齐 6 封，东门的锁才会打开。他听得见奔跑声，也看得见手电的光。</p>
        <div className="menu-actions">
          <button type="button" className="btn-blood" disabled={!ready} onClick={start}>
            {ready ? '走出教室' : '雾正在弥漫……'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => store.set({ quality: quality === 'high' ? 'low' : 'high' })}>
            画质：{quality === 'high' ? '高' : '流畅'}
          </button>
        </div>
        <p className="menu-warn">含突然的惊吓画面与高音量声音，请佩戴耳机。故事纯属虚构。</p>
      </div>
    </div>
  )
}

function Bars() {
  const stamina = useGame((s) => s.stamina)
  const battery = useGame((s) => s.battery)
  const on = useGame((s) => s.flashlight)
  return (
    <div className="bars">
      <div className="bar">
        <span className="bar-label">体力</span>
        <span className="bar-track">
          <span className="bar-fill stamina" style={{ transform: `scaleX(${stamina})` }} />
        </span>
      </div>
      <div className="bar">
        <span className="bar-label">电量{on ? '' : '（关）'}</span>
        <span className="bar-track">
          <span className={`bar-fill battery${battery < 0.2 ? ' low' : ''}`} style={{ transform: `scaleX(${battery})` }} />
        </span>
      </div>
    </div>
  )
}

function Pages() {
  const pages = useGame((s) => s.pages)
  return (
    <div className="pages" aria-label={`已找到 ${pages} 封信`}>
      <span className="pages-label">染血的信</span>
      <span className="pages-dots">
        {Array.from({ length: PAGE_COUNT }).map((_, i) => (
          <span key={i} className={`dot${i < pages ? ' on' : ''}`} />
        ))}
      </span>
      <span className="pages-count mono">
        {pages} / {PAGE_COUNT}
      </span>
    </div>
  )
}

function Letter() {
  const letter = useGame((s) => s.letter)
  if (!letter) return null
  return (
    <div className="letter" role="dialog" aria-label={letter.title} onClick={() => game.set({ letter: null })}>
      <div className="letter-paper">
        <h2>{letter.title}</h2>
        {letter.body.split('\n').map((l, i) => (
          <p key={i}>{l || ' '}</p>
        ))}
        <p className="letter-hint">点击或继续移动以收起</p>
      </div>
    </div>
  )
}

/** 恐惧红晕：随心跳脉动 */
function FearOverlay() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id = 0
    const loop = () => {
      const el = ref.current
      if (el) {
        const f = G.fear
        const beat = 0.75 + 0.25 * Math.pow(Math.max(0, Math.sin(performance.now() / (420 - f * 220))), 6)
        el.style.opacity = String(Math.min(1, f * 0.85 * beat + G.scare * 0.5))
      }
      id = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(id)
  }, [])
  return <div ref={ref} className="fear" aria-hidden="true" />
}

function TouchControls() {
  const knob = useRef<HTMLSpanElement>(null)
  const [touch, setTouch] = useState(false)
  useEffect(() => {
    const on = () => setTouch(true)
    window.addEventListener('touchstart', on, { once: true })
    return () => window.removeEventListener('touchstart', on)
  }, [])
  const tr = useRef({ sid: null as number | null, ox: 0, oy: 0, lid: null as number | null, lx: 0, ly: 0 }).current
  if (!touch) return null
  return (
    <>
      <div
        className="stick"
        onTouchStart={(e) => {
          const t = e.changedTouches[0]
          tr.sid = t.identifier
          tr.ox = t.clientX
          tr.oy = t.clientY
        }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (t.identifier !== tr.sid) continue
            const dx = Math.max(-50, Math.min(50, t.clientX - tr.ox))
            const dy = Math.max(-50, Math.min(50, t.clientY - tr.oy))
            input.stick.x = dx / 50
            input.stick.y = -dy / 50
            if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
          }
        }}
        onTouchEnd={() => {
          tr.sid = null
          input.stick.x = input.stick.y = 0
          if (knob.current) knob.current.style.transform = ''
        }}
      >
        <span ref={knob} className="stick-knob" />
      </div>
      <div
        className="lookpad"
        onTouchStart={(e) => {
          const t = e.changedTouches[0]
          tr.lid = t.identifier
          tr.lx = t.clientX
          tr.ly = t.clientY
        }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (t.identifier !== tr.lid) continue
            input.lookDX += (t.clientX - tr.lx) * 1.6
            input.lookDY += (t.clientY - tr.ly) * 1.6
            tr.lx = t.clientX
            tr.ly = t.clientY
          }
        }}
      />
      <div className="touch-btns">
        <button
          type="button"
          className="tbtn"
          onTouchStart={() => (input.sprintTouch = true)}
          onTouchEnd={() => (input.sprintTouch = false)}
        >
          跑
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={() => {
            G.flashlightOn = !G.flashlightOn
            sfx.click()
            game.set({ flashlight: G.flashlightOn })
          }}
        >
          灯
        </button>
      </div>
    </>
  )
}

function Caught() {
  const epitaph = useGame((s) => s.epitaph)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 1700)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={`caught${show ? ' show' : ''}`}>
      <div className="caught-flash" />
      {show && (
        <div className="end-inner">
          <h2 className="end-title">你死了</h2>
          <p className="end-text">{epitaph}</p>
          <p className="end-sub">找到的信：{G.pagesTaken.size} / {PAGE_COUNT}</p>
          <button type="button" className="btn-blood" onClick={start}>
            再来一次
          </button>
        </div>
      )}
    </div>
  )
}

function Escaped() {
  const time = useGame((s) => s.time)
  const m = Math.floor(time / 60)
  const s = Math.floor(time % 60)
  return (
    <div className="escaped">
      <div className="end-inner">
        <p className="menu-kicker">00:13 → 05:40</p>
        <h2 className="end-title pale">你逃出来了</h2>
        <p className="end-text">铁门在身后合上。天边泛起灰白，雾一点点散去。</p>
        <p className="end-text">回头望去，钟楼顶上站着一个戴高礼帽的身影，向你脱帽致意。</p>
        <p className="end-sub mono">
          用时 {m} 分 {String(s).padStart(2, '0')} 秒
        </p>
        <button type="button" className="btn-blood" onClick={start}>
          再进一次校园
        </button>
      </div>
    </div>
  )
}

export function HUD() {
  const phase = useGame((s) => s.phase)
  const subtitle = useGame((s) => s.subtitle)
  const location = useGame((s) => s.location)
  return (
    <div className={`hud phase-${phase}`}>
      <FearOverlay />
      {phase === 'menu' && <Menu />}
      {phase === 'playing' && (
        <>
          <Pages />
          {location && <p className="location">{location}</p>}
          <span className="crosshair" aria-hidden="true" />
          <Bars />
          {subtitle && <p className="subtitle">{subtitle}</p>}
          <Letter />
          <TouchControls />
        </>
      )}
      {phase === 'caught' && <Caught />}
      {phase === 'escaped' && <Escaped />}
    </div>
  )
}
