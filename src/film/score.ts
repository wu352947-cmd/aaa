/**
 * 《午夜点名》原声：全部由 Web Audio 实时合成。
 * 乐器：低频嗡鸣、合唱“啊”声、铜管、BRAAAM 冲击、太鼓、拨弦、钟、校园广播提示音、
 * 模糊人声、八音盒、钢琴、心跳、喘息、刀声、铁门、尖叫。整体送入程序生成的教堂混响。
 */
type When = number

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export class Score {
  ctx: AudioContext | null = null
  master!: GainNode
  out!: GainNode
  reverb!: ConvolverNode
  wet!: GainNode
  recordDest: MediaStreamAudioDestinationNode | null = null
  private bus: GainNode | null = null
  private wetBus: GainNode | null = null
  private noiseBuf!: AudioBuffer
  private anchorCtx = 0
  private anchorT = 0
  playing = false

  init() {
    if (this.ctx) return
    const c = new AudioContext({ latencyHint: 'playback' })
    this.ctx = c
    this.out = c.createGain()
    this.out.gain.value = 0.95
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 4
    comp.attack.value = 0.005
    this.out.connect(comp).connect(c.destination)
    this.recordDest = c.createMediaStreamDestination()
    comp.connect(this.recordDest)
    // 程序生成的混响脉冲：4.5 秒指数衰减的立体声噪声
    const len = c.sampleRate * 4.5
    const ir = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
    }
    this.reverb = c.createConvolver()
    this.reverb.buffer = ir
    this.wet = c.createGain()
    this.wet.gain.value = 0.55
    this.reverb.connect(this.wet).connect(this.out)
    const nl = c.sampleRate * 3
    this.noiseBuf = c.createBuffer(1, nl, c.sampleRate)
    const nd = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1
  }

  /** 当前影片时间（以音频时钟为准，保证音画同步） */
  time() {
    if (!this.ctx || !this.playing) return this.anchorT
    return this.anchorT + (this.ctx.currentTime - this.anchorCtx)
  }

  async play(from: number) {
    this.init()
    const c = this.ctx!
    await c.resume()
    this.stopBus()
    this.bus = c.createGain()
    this.bus.connect(this.out)
    this.wetBus = c.createGain()
    this.wetBus.connect(this.reverb)
    this.master = this.bus
    this.anchorCtx = c.currentTime + 0.12
    this.anchorT = from
    this.playing = true
    for (const cue of CUES) {
      const end = cue.t + (cue.d ?? 0.1)
      if (end < from) continue
      const when = this.anchorCtx + Math.max(0, cue.t - from)
      const offset = Math.max(0, from - cue.t)
      try {
        cue.fn(this, when, offset)
      } catch {
        /* 单个音效失败不影响整体 */
      }
    }
  }

  pause() {
    this.anchorT = this.time()
    this.playing = false
    this.stopBus()
  }

  private stopBus() {
    if (this.bus) {
      const b = this.bus
      b.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.03)
      setTimeout(() => b.disconnect(), 300)
      this.bus = null
    }
    if (this.wetBus) {
      const wb = this.wetBus
      wb.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05)
      setTimeout(() => wb.disconnect(), 400)
      this.wetBus = null
    }
  }

  /* ================= 基础构件 ================= */

  noise(loop = false) {
    const s = this.ctx!.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = loop
    return s
  }

  /** 带混响发送的输出口（干声与湿声都挂在当前总线上，暂停/跳转时一并切断） */
  send(dry = 1, wetAmt = 0.4) {
    const c = this.ctx!
    const g = c.createGain()
    const d = c.createGain()
    d.gain.value = dry
    const w = c.createGain()
    w.gain.value = wetAmt
    g.connect(d).connect(this.master)
    g.connect(w).connect(this.wetBus!)
    return g
  }

  env(g: AudioParam, t: When, a: number, peak: number, hold: number, rel: number) {
    g.setValueAtTime(0.0001, t)
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.003, a))
    g.setValueAtTime(Math.max(0.0002, peak), t + a + hold)
    g.exponentialRampToValueAtTime(0.0001, t + a + hold + rel)
  }

  osc(type: OscillatorType, f: number, t: When, dur: number) {
    const o = this.ctx!.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    o.start(t)
    o.stop(t + dur + 0.05)
    return o
  }

  /* ================= 乐器 ================= */

  drone(t: When, dur: number, notes: number[], vol = 0.12, cutoff = 400) {
    const c = this.ctx!
    const out = this.send(1, 0.3)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cutoff
    const g = c.createGain()
    this.env(g.gain, t, Math.min(4, dur * 0.3), vol, Math.max(0, dur - Math.min(4, dur * 0.3) - 2), 2)
    lp.connect(g).connect(out)
    for (const n of notes)
      for (const det of [-6, 0, 7]) {
        const o = this.osc('sawtooth', midi(n), t, dur)
        o.detune.value = det
        o.connect(lp)
      }
  }

  /** 合唱“啊”：锯齿波过三个共振峰 */
  choir(t: When, dur: number, notes: number[], vol = 0.08) {
    const c = this.ctx!
    const out = this.send(0.6, 0.9)
    const g = c.createGain()
    this.env(g.gain, t, Math.min(3, dur * 0.4), vol, Math.max(0, dur - Math.min(3, dur * 0.4) - 2.5), 2.5)
    for (const [f, q, a] of [
      [750, 8, 1],
      [1150, 9, 0.6],
      [2800, 12, 0.25],
    ]) {
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f
      bp.Q.value = q
      const ga = c.createGain()
      ga.gain.value = a
      bp.connect(ga).connect(g)
      for (const n of notes)
        for (let v = 0; v < 3; v++) {
          const o = this.osc('sawtooth', midi(n), t, dur)
          o.detune.value = (v - 1) * 9
          const vib = this.osc('sine', 4.6 + v * 0.4, t, dur)
          const vg = c.createGain()
          vg.gain.value = 3.5
          vib.connect(vg).connect(o.frequency)
          o.connect(bp)
        }
    }
    g.connect(out)
  }

  /** 预告片式 BRAAAM：失真的低音铜管簇 */
  braam(t: When, dur = 4, root = 38, vol = 0.32) {
    const c = this.ctx!
    const out = this.send(1, 0.6)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(180, t)
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.35)
    lp.frequency.exponentialRampToValueAtTime(300, t + dur)
    const ws = c.createWaveShaper()
    const curve = new Float32Array(2048)
    for (let i = 0; i < 2048; i++) curve[i] = Math.tanh(((i / 2047) * 2 - 1) * 3)
    ws.curve = curve
    const g = c.createGain()
    this.env(g.gain, t, 0.08, vol, dur * 0.4, dur * 0.6)
    lp.connect(ws).connect(g).connect(out)
    for (const n of [root, root + 7, root + 12, root + 13]) {
      for (const det of [-12, 0, 12]) {
        const o = this.osc('sawtooth', midi(n), t, dur)
        o.detune.value = det
        o.connect(lp)
      }
    }
    this.sub(t, 1.6, 0.6)
  }

  sub(t: When, dur = 1.2, vol = 0.7) {
    const c = this.ctx!
    const o = this.osc('sine', 58, t, dur)
    o.frequency.exponentialRampToValueAtTime(26, t + dur)
    const g = c.createGain()
    this.env(g.gain, t, 0.005, vol, 0.05, dur)
    o.connect(g).connect(this.master)
  }

  /** 太鼓 */
  taiko(t: When, vol = 0.8) {
    const c = this.ctx!
    const out = this.send(1, 0.35)
    const o = this.osc('sine', 110, t, 0.8)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.25)
    const g = c.createGain()
    this.env(g.gain, t, 0.002, vol, 0.02, 0.5)
    o.connect(g).connect(out)
    const n = this.noise()
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const ng = c.createGain()
    this.env(ng.gain, t, 0.001, vol * 0.5, 0.01, 0.12)
    n.connect(lp).connect(ng).connect(out)
    n.start(t)
    n.stop(t + 0.3)
  }

  drums(t: When, dur: number, bpm: number, pattern: number[], vol = 0.7, offset = 0) {
    const step = 60 / bpm / 2
    const n = Math.floor(dur / step)
    for (let i = 0; i < n; i++) {
      if (i * step < offset) continue
      const tt = t + i * step - offset
      const v = pattern[i % pattern.length]
      if (v) this.taiko(tt, vol * v)
    }
  }

  /** 时钟滴答 */
  tick(t: When, vol = 0.25) {
    const c = this.ctx!
    const n = this.noise()
    const hp = c.createBiquadFilter()
    hp.type = 'bandpass'
    hp.frequency.value = 3200
    hp.Q.value = 6
    const g = c.createGain()
    this.env(g.gain, t, 0.001, vol, 0.005, 0.03)
    n.connect(hp).connect(g).connect(this.send(1, 0.25))
    n.start(t, Math.random())
    n.stop(t + 0.06)
  }

  bell(t: When, vol = 0.5, base = 98) {
    const c = this.ctx!
    const out = this.send(0.8, 1.1)
    for (const [r, v, dec] of [
      [0.5, 0.5, 9],
      [1, 0.6, 7],
      [1.19, 0.35, 5],
      [1.5, 0.25, 4],
      [2, 0.2, 3.5],
      [2.74, 0.12, 2.5],
      [3.76, 0.08, 1.6],
      [5.4, 0.05, 1],
    ] as const) {
      const o = this.osc('sine', base * r * 2, t, dec)
      const g = c.createGain()
      this.env(g.gain, t, 0.004, v * vol, 0.02, dec)
      o.connect(g).connect(out)
    }
    this.sub(t, 2, vol * 0.8)
  }

  /** 校园广播提示音：叮—咚—叮—咚 */
  chime(t: When) {
    const c = this.ctx!
    const out = this.send(0.7, 0.8)
    const notes = [76, 72, 74, 67]
    notes.forEach((n, i) => {
      const tt = t + i * 0.42
      for (const [r, v] of [
        [1, 0.16],
        [2, 0.04],
        [3.01, 0.02],
      ] as const) {
        const o = this.osc('sine', midi(n) * r, tt, 2)
        const g = c.createGain()
        this.env(g.gain, tt, 0.004, v, 0.02, 1.8)
        o.connect(g).connect(out)
      }
    })
  }

  /** 广播里模糊、失真的人声 */
  babble(t: When, dur: number, vol = 0.22) {
    const c = this.ctx!
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1500
    bp.Q.value = 0.9
    const ws = c.createWaveShaper()
    const curve = new Float32Array(512)
    for (let i = 0; i < 512; i++) curve[i] = Math.tanh(((i / 511) * 2 - 1) * 5)
    ws.curve = curve
    const g = c.createGain()
    g.gain.value = 0
    const out = this.send(0.8, 0.5)
    bp.connect(ws).connect(g).connect(out)
    const o = this.osc('sawtooth', 120, t, dur)
    const f1 = c.createBiquadFilter()
    f1.type = 'bandpass'
    f1.Q.value = 5
    const f2 = c.createBiquadFilter()
    f2.type = 'bandpass'
    f2.Q.value = 7
    o.connect(f1).connect(bp)
    o.connect(f2).connect(bp)
    // 一个个“音节”
    const syl = Math.floor(dur * 4.2)
    for (let i = 0; i < syl; i++) {
      const st = t + i / 4.2 + Math.random() * 0.04
      const on = Math.random() < 0.82
      g.gain.setTargetAtTime(on ? vol : 0.005, st, 0.015)
      o.frequency.setTargetAtTime(95 + Math.random() * 50, st, 0.04)
      f1.frequency.setTargetAtTime(400 + Math.random() * 600, st, 0.03)
      f2.frequency.setTargetAtTime(1000 + Math.random() * 1500, st, 0.03)
    }
    g.gain.setTargetAtTime(0, t + dur, 0.05)
    // 电流杂音
    const n = this.noise()
    const nb = c.createBiquadFilter()
    nb.type = 'bandpass'
    nb.frequency.value = 2400
    const ng = c.createGain()
    this.env(ng.gain, t, 0.05, 0.05, dur, 0.2)
    n.connect(nb).connect(ng).connect(out)
    n.start(t)
    n.stop(t + dur + 0.3)
  }

  /** 拨弦固定音型 */
  pizz(t: When, dur: number, notes: number[], bpm: number, vol = 0.18, offset = 0) {
    const c = this.ctx!
    const out = this.send(0.8, 0.5)
    const step = 60 / bpm / 2
    const n = Math.floor(dur / step)
    for (let i = 0; i < n; i++) {
      if (i * step < offset) continue
      const tt = t + i * step - offset
      const o = this.osc('triangle', midi(notes[i % notes.length]), tt, 0.4)
      const g = c.createGain()
      this.env(g.gain, tt, 0.002, vol * (i % 4 === 0 ? 1 : 0.6), 0.01, 0.3)
      o.connect(g).connect(out)
    }
  }

  /** 弦乐长音（逐渐上行的紧张感） */
  strings(t: When, dur: number, notes: number[], vol = 0.06, rise = 0) {
    const c = this.ctx!
    const out = this.send(0.7, 0.8)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(900, t)
    lp.frequency.linearRampToValueAtTime(900 + rise * 3000, t + dur)
    const g = c.createGain()
    this.env(g.gain, t, Math.min(2, dur * 0.5), vol, Math.max(0, dur - Math.min(2, dur * 0.5) - 0.6), 0.6)
    lp.connect(g).connect(out)
    for (const n of notes)
      for (const det of [-8, 0, 8]) {
        const o = this.osc('sawtooth', midi(n), t, dur)
        o.detune.setValueAtTime(det, t)
        if (rise) o.detune.linearRampToValueAtTime(det + rise * 1200, t + dur)
        const vib = this.osc('sine', 5.5, t, dur)
        const vg = c.createGain()
        vg.gain.value = 4
        vib.connect(vg).connect(o.frequency)
        o.connect(lp)
      }
  }

  riser(t: When, dur: number, vol = 0.2) {
    const c = this.ctx!
    const n = this.noise()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2
    bp.frequency.setValueAtTime(200, t)
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + dur)
    g.gain.setValueAtTime(0.0001, t + dur + 0.01)
    n.connect(bp).connect(g).connect(this.send(1, 0.5))
    n.start(t)
    n.stop(t + dur + 0.05)
  }

  heartbeat(t: When, count: number, bpm: number, vol = 0.6) {
    for (let i = 0; i < count; i++) {
      const tt = t + (i * 60) / bpm
      for (const [d, v] of [
        [0, 1],
        [0.17, 0.7],
      ] as const) {
        const o = this.osc('sine', 72, tt + d, 0.3)
        o.frequency.exponentialRampToValueAtTime(36, tt + d + 0.14)
        const g = this.ctx!.createGain()
        this.env(g.gain, tt + d, 0.006, vol * v, 0.02, 0.16)
        o.connect(g).connect(this.master)
      }
    }
  }

  breath(t: When, dur: number, rate = 0.45, vol = 0.12) {
    const c = this.ctx!
    const n = this.noise(true)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 1.4
    const g = c.createGain()
    g.gain.value = 0
    const cycles = Math.floor(dur * rate)
    for (let i = 0; i < cycles; i++) {
      const st = t + i / rate
      g.gain.setTargetAtTime(vol, st, 0.25)
      g.gain.setTargetAtTime(vol * 0.15, st + 0.5 / rate, 0.18)
      g.gain.setTargetAtTime(vol * 0.7, st + 0.62 / rate, 0.2)
      g.gain.setTargetAtTime(0.001, st + 0.9 / rate, 0.1)
    }
    n.connect(bp).connect(g).connect(this.master)
    n.start(t)
    n.stop(t + dur + 0.2)
  }

  slash(t: When, vol = 0.6) {
    const c = this.ctx!
    const n = this.noise()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3
    bp.frequency.setValueAtTime(6000, t)
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.18)
    const g = c.createGain()
    this.env(g.gain, t, 0.004, vol, 0.04, 0.16)
    n.connect(bp).connect(g).connect(this.send(1, 0.6))
    n.start(t)
    n.stop(t + 0.3)
    // 金属余韵
    for (const f of [2860, 4110, 5390]) {
      const o = this.osc('sine', f, t, 1.6)
      const og = c.createGain()
      this.env(og.gain, t, 0.002, 0.04, 0.01, 1.4)
      o.connect(og).connect(this.send(0.6, 0.8))
    }
  }

  stinger(t: When, vol = 0.55) {
    const c = this.ctx!
    const out = this.send(1, 0.7)
    for (const n of [50, 51, 56, 57, 62, 63, 74]) {
      const o = this.osc('sawtooth', midi(n), t, 2.4)
      o.frequency.linearRampToValueAtTime(midi(n) * 0.93, t + 2.2)
      const g = c.createGain()
      this.env(g.gain, t, 0.008, vol * 0.13, 0.1, 2)
      o.connect(g).connect(out)
    }
    const n = this.noise()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2000
    const ng = c.createGain()
    this.env(ng.gain, t, 0.003, vol * 0.6, 0.05, 0.6)
    n.connect(hp).connect(ng).connect(out)
    n.start(t)
    n.stop(t + 1)
    this.sub(t, 1.5, vol)
  }

  scream(t: When, vol = 0.7) {
    const c = this.ctx!
    const out = this.send(1, 0.7)
    const g = c.createGain()
    this.env(g.gain, t, 0.02, vol, 0.4, 1.2)
    const ws = c.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 5)
    ws.curve = curve
    g.connect(ws).connect(out)
    for (const base of [640, 900, 1300]) {
      const o = this.osc('sawtooth', base, t, 1.8)
      o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.25)
      o.frequency.linearRampToValueAtTime(base * 0.6, t + 1.7)
      const vib = this.osc('sine', 8, t, 1.8)
      const vg = c.createGain()
      vg.gain.value = 40
      vib.connect(vg).connect(o.frequency)
      o.connect(g)
    }
  }

  /** 八音盒（走调的《伦敦桥》） */
  musicBox(t: When, dur: number, vol = 0.1, offset = 0) {
    const c = this.ctx!
    const out = this.send(0.7, 0.9)
    const notes = [67, 69, 67, 65, 64, 65, 67, 0, 62, 64, 65, 0, 64, 65, 67, 0, 67, 69, 67, 65, 64, 65, 67, 0, 62, 0, 67, 0, 64, 60, 0, 0].map((n) => (n ? n + 11 : 0))
    const step = 0.42
    const total = Math.floor(dur / step)
    for (let i = 0; i < total; i++) {
      if (i * step < offset) continue
      const n = notes[i % notes.length]
      if (!n) continue
      const tt = t + i * step - offset
      const f = midi(n) * (1 + (Math.random() - 0.5) * 0.015) * (1 - i * 0.0006)
      for (const [r, v] of [
        [1, 1],
        [3.01, 0.25],
        [5.3, 0.1],
      ] as const) {
        const o = this.osc('sine', f * r, tt, 1.6)
        const g = c.createGain()
        this.env(g.gain, tt, 0.002, vol * v, 0.01, 1.4)
        o.connect(g).connect(out)
      }
    }
  }

  /** 钢琴（片尾主题） */
  piano(t: When, notes: [number, number, number][], vol = 0.16) {
    const c = this.ctx!
    const out = this.send(0.8, 0.9)
    for (const [n, at, len] of notes) {
      const tt = t + at
      for (const [r, v] of [
        [1, 1],
        [2, 0.35],
        [3, 0.15],
        [4.02, 0.06],
      ] as const) {
        const o = this.osc('triangle', midi(n) * r, tt, len + 1)
        const g = c.createGain()
        this.env(g.gain, tt, 0.004, vol * v, 0.02, len + 0.8)
        o.connect(g).connect(out)
      }
    }
  }

  footsteps(t: When, dur: number, rate: number, vol = 0.2, pan = 0) {
    const c = this.ctx!
    const p = c.createStereoPanner()
    p.pan.value = pan
    p.connect(this.master)
    const n = Math.floor(dur * rate)
    for (let i = 0; i < n; i++) {
      const tt = t + i / rate + (Math.random() - 0.5) * 0.03
      const s = this.noise()
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 500 + Math.random() * 300
      const g = c.createGain()
      this.env(g.gain, tt, 0.003, vol * (0.7 + Math.random() * 0.3), 0.01, 0.1)
      s.connect(lp).connect(g).connect(p)
      s.start(tt, Math.random() * 2)
      s.stop(tt + 0.2)
    }
  }

  crowd(t: When, dur: number, vol = 0.12) {
    const c = this.ctx!
    const n = this.noise(true)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 0.6
    const g = c.createGain()
    this.env(g.gain, t, 0.5, vol, dur - 1, 0.8)
    const am = this.osc('sine', 3.3, t, dur)
    const ag = c.createGain()
    ag.gain.value = vol * 0.5
    am.connect(ag).connect(g.gain)
    n.connect(bp).connect(g).connect(this.send(0.8, 0.5))
    n.start(t)
    n.stop(t + dur)
  }

  creak(t: When, dur: number, vol = 0.18) {
    const c = this.ctx!
    const o = this.osc('sawtooth', 70, t, dur)
    for (let i = 0; i < dur * 12; i++) o.frequency.setValueAtTime(55 + Math.random() * 60, t + i / 12)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 6
    const g = c.createGain()
    this.env(g.gain, t, 0.2, vol, dur - 0.6, 0.4)
    o.connect(bp).connect(g).connect(this.send(0.8, 0.7))
  }

  wind(t: When, dur: number, vol = 0.08) {
    const c = this.ctx!
    const n = this.noise(true)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.8
    bp.frequency.value = 450
    const lfo = this.osc('sine', 0.08, t, dur)
    const lg = c.createGain()
    lg.gain.value = 250
    lfo.connect(lg).connect(bp.frequency)
    const g = c.createGain()
    this.env(g.gain, t, 2, vol, Math.max(0, dur - 4), 2)
    n.connect(bp).connect(g).connect(this.master)
    n.start(t)
    n.stop(t + dur)
  }

  /** 谢帕德音：无限上升的错觉 */
  shepard(t: When, dur: number, vol = 0.08) {
    const c = this.ctx!
    const out = this.send(0.8, 0.6)
    for (let k = 0; k < 6; k++) {
      const o = this.osc('sine', 55 * Math.pow(2, k), t, dur)
      o.frequency.exponentialRampToValueAtTime(55 * Math.pow(2, k + 1), t + dur)
      const g = c.createGain()
      const mid = k / 5
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(vol * Math.sin(Math.PI * Math.min(1, mid + 0.15)), t + dur * 0.5)
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.95)
      g.gain.linearRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(out)
    }
  }
}

interface Cue {
  t: number
  d?: number
  fn: (s: Score, when: number, offset: number) => void
}

/** 剩余时长（从中途开始播放时） */
const rest = (d: number, off: number) => Math.max(0.2, d - off)

export const CUES: Cue[] = [
  // ——— 片头：黑场与时钟 ———
  { t: 0, d: 33, fn: (s, w, o) => s.drone(w, rest(33, o), [26, 33], 0.1, 260) },
  ...Array.from({ length: 9 }, (_, i): Cue => ({ t: 0.6 + i, fn: (s, w) => s.tick(w, 0.22 + i * 0.02) })),
  { t: 7.2, d: 2, fn: (s, w) => s.riser(w, 1.8, 0.16) },
  // 航拍：合唱与铜管升起
  { t: 9, fn: (s, w) => s.braam(w, 5, 26, 0.3) },
  { t: 9.2, d: 15, fn: (s, w, o) => s.choir(w, rest(15, o), [50, 53, 57], 0.07) },
  { t: 13, d: 11, fn: (s, w, o) => s.strings(w, rest(11, o), [62, 65, 69], 0.035, 0.3) },
  { t: 17, fn: (s, w) => s.braam(w, 5, 29, 0.3) },
  { t: 9, d: 15, fn: (s, w, o) => s.wind(w, rest(15, o), 0.07) },
  // 钟楼：倒转的指针与上升音
  { t: 24, d: 8, fn: (s, w, o) => s.shepard(w, rest(8, o), 0.07) },
  ...Array.from({ length: 16 }, (_, i): Cue => ({ t: 24.2 + i * 0.48, fn: (s, w) => s.tick(w, 0.3) })),
  { t: 32, fn: (s, w) => s.bell(w, 0.8, 92) },
  // 片名
  { t: 33.6, fn: (s, w) => s.braam(w, 6, 26, 0.38) },
  { t: 34, d: 5, fn: (s, w, o) => s.choir(w, rest(5, o), [38, 45, 50], 0.05) },
  // ——— 第一幕：规则 ———
  { t: 39, d: 21, fn: (s, w, o) => s.drone(w, rest(21, o), [33, 40], 0.07, 300) },
  { t: 39, d: 11, fn: (s, w, o) => s.crowd(w, rest(11, o), 0.08) },
  { t: 40.2, fn: (s, w) => s.chime(w) },
  { t: 41.8, fn: (s, w) => s.babble(w, 3.2, 0.2) },
  { t: 45.6, fn: (s, w) => s.babble(w, 4, 0.2) },
  { t: 46, d: 4, fn: (s, w, o) => s.pizz(w, rest(4, o), [50, 50, 53, 50, 56, 50, 53, 49], 120, 0.14, o) },
  { t: 50, d: 6.4, fn: (s, w, o) => s.pizz(w, rest(6.4, o), [50, 50, 53, 50, 56, 50, 53, 49], 150, 0.16, o) },
  { t: 50, d: 6.4, fn: (s, w, o) => s.strings(w, rest(6.4, o), [62, 63], 0.05, 0.5) },
  { t: 53.2, fn: (s, w) => s.breath(w, 3, 0.6, 0.08) },
  { t: 56.4, fn: (s, w) => s.braam(w, 3.2, 31, 0.36) },
  { t: 56.4, fn: (s, w) => s.musicBox(w, 1.2, 0.1) },
  { t: 57.6, fn: (s, w) => s.stinger(w, 0.4) },
  // 恐慌：太鼓与人群奔跑
  { t: 60, d: 10, fn: (s, w, o) => s.drums(w, rest(10, o), 140, [1, 0, 0.6, 0, 1, 0.5, 0.6, 0], 0.7) },
  { t: 60, d: 10, fn: (s, w, o) => s.footsteps(w, rest(10, o), 9, 0.18) },
  { t: 60, d: 10, fn: (s, w, o) => s.crowd(w, rest(10, o), 0.16) },
  { t: 60, d: 10, fn: (s, w, o) => s.strings(w, rest(10, o), [50, 51, 56], 0.05, 0.4) },
  // 第一次点名
  { t: 70, d: 10, fn: (s, w, o) => s.drone(w, rest(10, o), [26], 0.07, 200) },
  { t: 70.4, d: 5, fn: (s, w, o) => s.breath(w, rest(5, o), 0.7, 0.07) },
  { t: 71.4, fn: (s, w) => s.chime(w) },
  { t: 73, fn: (s, w) => s.babble(w, 2.4, 0.22) },
  { t: 75.5, fn: (s, w) => s.slash(w, 0.7) },
  { t: 76, fn: (s, w) => s.musicBox(w, 4, 0.08) },
  // 上帝视角：每一个熄灭的光点都是一声钟
  { t: 80, d: 12, fn: (s, w, o) => s.choir(w, rest(12, o), [38, 41, 45], 0.05) },
  { t: 80, d: 12, fn: (s, w, o) => s.drone(w, rest(12, o), [26, 27], 0.08, 240) },
  ...[82, 83.6, 85.2, 86.6, 87.8, 88.9, 90, 91].map((t, i): Cue => ({ t, fn: (s, w) => s.bell(w, 0.22 + i * 0.03, 196 + i * 6) })),
  // 操场纸人：八音盒
  { t: 92, d: 9, fn: (s, w, o) => s.musicBox(w, rest(9, o), 0.11, o) },
  { t: 92, d: 12, fn: (s, w, o) => s.wind(w, rest(12, o), 0.06) },
  { t: 100.6, fn: (s, w) => s.riser(w, 0.4, 0.3) },
  { t: 101, fn: (s, w) => s.stinger(w, 0.55) },
  // 追逐
  { t: 104, d: 14, fn: (s, w, o) => s.drums(w, rest(14, o), 160, [1, 0, 0.5, 0.5, 1, 0, 0.7, 0.4], 0.8) },
  { t: 104, d: 14, fn: (s, w, o) => s.pizz(w, rest(14, o), [38, 38, 41, 38, 44, 38, 41, 37], 160, 0.2, o) },
  { t: 104, d: 14, fn: (s, w, o) => s.strings(w, rest(14, o), [50, 51], 0.05, 0.8) },
  { t: 104, d: 14, fn: (s, w, o) => s.footsteps(w, rest(14, o), 6.2, 0.22) },
  ...[108, 111, 114].map((t): Cue => ({ t, fn: (s, w) => s.braam(w, 1.6, 31, 0.28) })),
  // 躲藏：几乎寂静
  { t: 118, d: 12, fn: (s, w, o) => s.breath(w, rest(12, o), 0.55, 0.1) },
  { t: 118, d: 12, fn: (s, w, o) => s.heartbeat(w, Math.floor(rest(12, o) * 1.6), 96, 0.5) },
  { t: 118, d: 12, fn: (s, w, o) => s.drone(w, rest(12, o), [24], 0.05, 160) },
  { t: 124, d: 5.5, fn: (s, w, o) => s.strings(w, rest(5.5, o), [74, 75], 0.025, 0.6) },
  { t: 129.5, fn: (s, w) => s.stinger(w, 0.75) },
  { t: 129.6, fn: (s, w) => s.scream(w, 0.6) },
  { t: 130.2, fn: (s, w) => s.heartbeat(w, 2, 50, 0.7) },
  // 东门：虚假的希望
  { t: 132, d: 12, fn: (s, w, o) => s.footsteps(w, rest(11, o), 6, 0.2) },
  { t: 133, d: 4, fn: (s, w, o) => s.creak(w, rest(4, o), 0.16) },
  { t: 134, d: 10, fn: (s, w, o) => s.strings(w, rest(10, o), [62, 66, 69, 74], 0.04, 0) },
  { t: 136, fn: (s, w) => s.bell(w, 0.6, 92) },
  { t: 140, d: 4, fn: (s, w, o) => s.strings(w, rest(4, o), [62, 65, 68], 0.04, -0.1) },
  // 反打：第十三声
  { t: 144, d: 12, fn: (s, w, o) => s.drone(w, rest(12, o), [26, 27, 33], 0.08, 260) },
  { t: 146.4, fn: (s, w) => s.chime(w) },
  { t: 148, fn: (s, w) => s.babble(w, 3, 0.22) },
  { t: 150, d: 2, fn: (s, w) => s.riser(w, 2, 0.25) },
  { t: 152, fn: (s, w) => s.bell(w, 1, 82) },
  { t: 152, fn: (s, w) => s.braam(w, 6, 25, 0.4) },
  { t: 152.2, d: 4, fn: (s, w, o) => s.choir(w, rest(4, o), [37, 38, 44, 49], 0.07) },
  // 主观：手电熄灭
  { t: 156, d: 4.5, fn: (s, w, o) => s.heartbeat(w, Math.floor(rest(4.5, o) * 2.6), 156, 0.6) },
  { t: 156, d: 4.5, fn: (s, w, o) => s.breath(w, rest(4.5, o), 1.1, 0.12) },
  { t: 158, d: 2.5, fn: (s, w) => s.riser(w, 2.5, 0.3) },
  { t: 160.6, fn: (s, w) => s.stinger(w, 1) },
  { t: 160.6, fn: (s, w) => s.scream(w, 0.75) },
  { t: 160.9, fn: (s, w) => s.slash(w, 0.8) },
  // 结语与片尾
  { t: 163, d: 7, fn: (s, w, o) => s.drone(w, rest(7, o), [26], 0.05, 200) },
  { t: 166.5, fn: (s, w) => s.musicBox(w, 3, 0.06) },
  {
    t: 170,
    d: 17,
    fn: (s, w, o) => {
      if (o > 0) return
      const mel: [number, number, number][] = []
      const line = [62, 65, 69, 67, 65, 64, 62, 60, 62, 65, 69, 72, 70, 69, 67, 69]
      line.forEach((n, i) => mel.push([n, i * 0.9, 0.8]))
      ;[38, 43, 41, 45].forEach((n, i) => mel.push([n, i * 3.6, 3.4], [n + 7, i * 3.6, 3.4]))
      s.piano(w, mel, 0.14)
    },
  },
  { t: 170, d: 17, fn: (s, w, o) => s.choir(w, rest(16, o), [50, 57, 62], 0.035) },
  { t: 184.6, fn: (s, w) => s.bell(w, 0.7, 82) },
]
