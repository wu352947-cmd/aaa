import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Campus } from '../scene/Campus'
import { Atmosphere } from '../scene/Atmosphere'
import { IronGate } from '../game/Ghosts'
import { GroundFog } from '../game/Atmos'
import { Director } from './Director'
import { Titles } from './Titles'
import { FilmFX } from './FilmFX'
import { BattleMap, ClockHands, CloudCredit, CloudLayer, Crowd, EffigyCast, GhostCast, Heroine, LedCredit, LinXiao, RipperActor, WallCredit, Whitechapel } from './Actors'
import { Score } from './score'
import { film } from './clock'
import { DURATION, studio } from './script'
import { store, useStore } from '../lib/store'

function Ready() {
  const { gl } = useThree()
  useEffect(() => {
    let n = 0
    let id = 0
    const tick = () => {
      if (++n > 4) store.set({ ready: true })
      else id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [gl])
  return null
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function FilmApp() {
  const score = useMemo(() => new Score(), [])
  const ready = useStore((s) => s.ready)
  const [phase, setPhase] = useState<'poster' | 'playing' | 'paused' | 'ended'>('poster')
  const [time, setTime] = useState(0)
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef(0)
  const bar = useRef<HTMLDivElement>(null)

  // 进度条（每 200ms 刷新一次，避免频繁重渲染）
  useEffect(() => {
    const id = window.setInterval(() => setTime(film.t), 200)
    return () => clearInterval(id)
  }, [])

  const play = async (from = film.t >= DURATION - 0.2 ? 0 : film.t) => {
    film.t = from
    film.playing = true
    await score.play(from)
    setPhase('playing')
  }
  const pause = () => {
    score.pause()
    film.t = score.time()
    film.playing = false
    setPhase('paused')
  }
  const seek = (to: number) => {
    film.t = THREE.MathUtils.clamp(to, 0, DURATION - 0.1)
    if (film.playing) score.play(film.t)
    else setTime(film.t)
  }
  const fullscreen = () => {
    const el = document.documentElement
    try {
      if (document.fullscreenElement) document.exitFullscreen()
      else el.requestFullscreen?.()?.catch?.(() => undefined)
    } catch {
      /* 全屏不可用 */
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'poster') return
      if (e.code === 'Space') {
        e.preventDefault()
        if (film.playing) pause()
        else play()
      }
      if (e.code === 'ArrowRight') seek(film.t + 5)
      if (e.code === 'ArrowLeft') seek(film.t - 5)
      if (e.code === 'KeyF') fullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const poke = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2600)
  }

  const S = studio()

  return (
    <div className={`film${idle && phase === 'playing' ? ' is-idle' : ''}`} onMouseMove={poke} onTouchStart={poke}>
      <Canvas
        className="stage"
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 1.6]}
        camera={{ fov: 40, near: 0.08, far: 6000, position: [300, 600, 760] }}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance' }}
        onCreated={(s) => s.setEvents({ enabled: false })}
      >
        <Suspense fallback={null}>
          <Atmosphere />
          <Campus />
          <IronGate />
          <GroundFog />
          <Crowd />
          <LinXiao />
          <Heroine />
          <RipperActor />
          <EffigyCast />
          <GhostCast />
          <BattleMap />
          <ClockHands />
          <CloudLayer />
          <CloudCredit />
          <WallCredit />
          <LedCredit />
          <Whitechapel />
          <Director score={score} onEnd={() => {
            score.pause()
            film.playing = false
            film.t = DURATION
            setPhase('ended')
          }} />
          <Titles />
          <FilmFX />
          <Ready />
        </Suspense>
      </Canvas>

      {phase === 'poster' && (
        <div className="poster">
          <div className="poster-inner">
            <p className="poster-kicker">{S} 出品 · {S.toUpperCase()} PRESENTS</p>
            <h1 className="poster-title">午夜点名</h1>
            <p className="poster-en">ROLL CALL AT MIDNIGHT</p>
            <p className="poster-log">十三名学生。一条规则。天亮之前，别被点到名字。</p>
            <p className="poster-log en">Thirteen students. One rule. Don&apos;t let your name be called before dawn.</p>
            <button type="button" className="poster-play" disabled={!ready} onClick={() => play(0)}>
              <span className="tri" aria-hidden="true" />
              {ready ? '开始放映' : '片场布置中……'}
            </button>
            <ul className="poster-meta">
              <li>
                <b>{fmt(DURATION)}</b> 片长
              </li>
              <li>
                <b>2.39 : 1</b> 画幅
              </li>
              <li>
                <b>R18</b> 高恐
              </li>
            </ul>
            <p className="poster-tip">建议全屏、佩戴耳机。画面与声音全部在你的设备上实时生成。</p>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div className="ended">
          <button type="button" className="poster-play" onClick={() => play(0)}>
            <span className="tri" aria-hidden="true" />
            再看一遍
          </button>
        </div>
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <div className="controls">
          <button type="button" className="ctl" aria-label={phase === 'playing' ? '暂停' : '播放'} onClick={() => (phase === 'playing' ? pause() : play())}>
            {phase === 'playing' ? '❚❚' : '▶'}
          </button>
          <div
            className="track"
            ref={bar}
            role="slider"
            aria-label="进度"
            aria-valuemin={0}
            aria-valuemax={DURATION}
            aria-valuenow={Math.round(time)}
            tabIndex={0}
            onPointerDown={(e) => {
              const r = bar.current!.getBoundingClientRect()
              seek(((e.clientX - r.left) / r.width) * DURATION)
            }}
          >
            <span className="fill" style={{ transform: `scaleX(${time / DURATION})` }} />
          </div>
          <span className="tc">
            {fmt(time)} / {fmt(DURATION)}
          </span>
          <button type="button" className="ctl" aria-label="全屏" onClick={fullscreen}>
            ⛶
          </button>
        </div>
      )}
    </div>
  )
}
