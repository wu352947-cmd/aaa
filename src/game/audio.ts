/**
 * 全程序化恐怖音效：不依赖任何音频文件。
 * 环境低鸣、风声、心跳、脚步、低语、八音盒、钟声、广播杂音、惊吓音、尖叫。
 */
class HorrorAudio {
  ctx: AudioContext | null = null
  master!: GainNode
  private noiseBuf!: AudioBuffer
  heartTimer = 0
  private heartRate = 0
  private ambience: { drone: GainNode; wind: GainNode; windFilter: BiquadFilterNode; chase: GainNode } | null = null
  private boxTimer = 0

  start() {
    if (this.ctx) {
      this.ctx.resume()
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    const c = this.ctx
    this.master = c.createGain()
    this.master.gain.value = 0.9
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -14
    this.master.connect(comp).connect(c.destination)
    const len = c.sampleRate * 2
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.startAmbience()
    this.loopHeart()
  }

  private noise(loop = false) {
    const s = this.ctx!.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = loop
    return s
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec)
  }

  private startAmbience() {
    const c = this.ctx!
    // 低频嗡鸣：几组失谐正弦 + 缓慢颤动
    const drone = c.createGain()
    drone.gain.value = 0.11
    drone.connect(this.master)
    for (const f of [41.2, 43.65, 61.7, 82.4 * 1.007]) {
      const o = c.createOscillator()
      o.type = f > 60 ? 'triangle' : 'sine'
      o.frequency.value = f
      const lfo = c.createOscillator()
      lfo.frequency.value = 0.05 + Math.random() * 0.1
      const lg = c.createGain()
      lg.gain.value = 1.5
      lfo.connect(lg).connect(o.frequency)
      o.connect(drone)
      o.start()
      lfo.start()
    }
    // 风声：带通噪声，中心频率缓慢游移
    const wind = c.createGain()
    wind.gain.value = 0.07
    const wf = c.createBiquadFilter()
    wf.type = 'bandpass'
    wf.frequency.value = 400
    wf.Q.value = 0.8
    const wn = this.noise(true)
    wn.connect(wf).connect(wind).connect(this.master)
    wn.start()
    const wl = c.createOscillator()
    wl.frequency.value = 0.07
    const wlg = c.createGain()
    wlg.gain.value = 260
    wl.connect(wlg).connect(wf.frequency)
    wl.start()
    // 追逐时的不和谐弦乐（锯齿波 + 低通），平时静音
    const chase = c.createGain()
    chase.gain.value = 0
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    chase.connect(lp).connect(this.master)
    for (const f of [110, 116.5, 155.6, 233]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      const vib = c.createOscillator()
      vib.frequency.value = 5 + Math.random() * 2
      const vg = c.createGain()
      vg.gain.value = 3
      vib.connect(vg).connect(o.frequency)
      const g = c.createGain()
      g.gain.value = 0.05
      o.connect(g).connect(chase)
      o.start()
      vib.start()
    }
    this.ambience = { drone, wind, windFilter: wf, chase }
  }

  /** 每帧调用：恐惧值驱动心跳频率与追逐配乐 */
  update(fear: number, chasing: boolean) {
    if (!this.ctx || !this.ambience) return
    const t = this.ctx.currentTime
    this.heartRate = fear
    this.ambience.chase.gain.setTargetAtTime(chasing ? 0.55 : 0, t, chasing ? 0.4 : 1.5)
    this.ambience.drone.gain.setTargetAtTime(0.1 + fear * 0.12, t, 0.5)
  }

  private loopHeart() {
    const tick = () => {
      const f = this.heartRate
      if (this.ctx && f > 0.12) {
        this.thump(0, 0.35 + f * 0.5)
        this.thump(0.16, 0.25 + f * 0.4)
      }
      const bpm = 55 + f * 105
      this.heartTimer = window.setTimeout(tick, 60000 / bpm)
    }
    tick()
  }

  private thump(delay: number, vol: number) {
    const c = this.ctx!
    const t = c.currentTime + delay
    const o = c.createOscillator()
    o.frequency.setValueAtTime(70, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12)
    const g = c.createGain()
    this.env(g, t, 0.01, vol, 0.16)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.3)
  }

  footstep(sprint: boolean) {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const n = this.noise()
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 500 + Math.random() * 300
    const g = c.createGain()
    this.env(g, t, 0.005, sprint ? 0.32 : 0.18, 0.09)
    n.connect(f).connect(g).connect(this.master)
    n.start(t, Math.random())
    n.stop(t + 0.2)
  }

  /** 身后的脚步声（左右声像） */
  phantomSteps(count = 4, pan = 0) {
    if (!this.ctx) return
    const c = this.ctx
    for (let i = 0; i < count; i++) {
      const t = c.currentTime + i * 0.55
      const n = this.noise()
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 380
      const g = c.createGain()
      this.env(g, t, 0.005, 0.22 + i * 0.05, 0.12)
      const p = c.createStereoPanner()
      p.pan.value = pan
      n.connect(f).connect(g).connect(p).connect(this.master)
      n.start(t, Math.random())
      n.stop(t + 0.25)
    }
  }

  /** 低语：几路带通噪声做出的“嘶嘶说话声” */
  whisper(dur = 2.6, pan = (Math.random() - 0.5) * 1.6) {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const p = c.createStereoPanner()
    p.pan.value = pan
    p.connect(this.master)
    for (let k = 0; k < 3; k++) {
      const n = this.noise()
      const f = c.createBiquadFilter()
      f.type = 'bandpass'
      f.Q.value = 6
      f.frequency.value = 1400 + k * 900
      const g = c.createGain()
      g.gain.value = 0
      // 断续的音节
      for (let s = 0; s < dur * 6; s++) {
        const st = t + s / 6 + Math.random() * 0.05
        const v = Math.random() < 0.7 ? 0.09 + Math.random() * 0.08 : 0
        g.gain.setTargetAtTime(v, st, 0.02)
        f.frequency.setTargetAtTime(1000 + Math.random() * 2600, st, 0.03)
      }
      g.gain.setTargetAtTime(0, t + dur, 0.1)
      n.connect(f).connect(g).connect(p)
      n.start(t, Math.random())
      n.stop(t + dur + 0.5)
    }
  }

  /** 惊吓音：不协和音簇 + 金属刮擦 */
  stinger(power = 1) {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const g = c.createGain()
    this.env(g, t, 0.01, 0.5 * power, 2.2)
    g.connect(this.master)
    for (const f of [146.8, 155.6, 207.7, 220, 311, 329.6, 587]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f, t)
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 2)
      const og = c.createGain()
      og.gain.value = 0.12
      o.connect(og).connect(g)
      o.start(t)
      o.stop(t + 2.5)
    }
    const n = this.noise()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2500
    const ng = c.createGain()
    this.env(ng, t, 0.005, 0.35 * power, 0.6)
    n.connect(hp).connect(ng).connect(this.master)
    n.start(t)
    n.stop(t + 1)
  }

  /** 被抓时的尖叫 */
  scream() {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const g = c.createGain()
    this.env(g, t, 0.02, 0.9, 1.6)
    const dist = c.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1
      curve[i] = Math.tanh(x * 6)
    }
    dist.curve = curve
    g.connect(dist).connect(this.master)
    for (const base of [620, 880, 1240]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(base, t)
      o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.25)
      o.frequency.linearRampToValueAtTime(base * 0.6, t + 1.6)
      const vib = c.createOscillator()
      vib.frequency.value = 9
      const vg = c.createGain()
      vg.gain.value = 40
      vib.connect(vg).connect(o.frequency)
      o.connect(g)
      o.start(t)
      vib.start(t)
      o.stop(t + 1.8)
      vib.stop(t + 1.8)
    }
    const n = this.noise()
    const ng = c.createGain()
    this.env(ng, t, 0.01, 0.6, 1.2)
    n.connect(ng).connect(this.master)
    n.start(t)
    n.stop(t + 1.4)
  }

  /** 钟楼钟声：非谐波分音 */
  bell(times = 1, gap = 2.2) {
    if (!this.ctx) return
    const c = this.ctx
    for (let k = 0; k < times; k++) {
      const t = c.currentTime + k * gap
      for (const [ratio, v] of [[0.5, 0.25], [1, 0.3], [1.19, 0.18], [1.5, 0.12], [2, 0.1], [2.74, 0.07], [3.76, 0.04]] as const) {
        const o = c.createOscillator()
        o.frequency.value = 196 * ratio
        const g = c.createGain()
        this.env(g, t, 0.01, v, 4.5)
        o.connect(g).connect(this.master)
        o.start(t)
        o.stop(t + 5)
      }
    }
  }

  /** 广播杂音 */
  radio(dur = 2.5) {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const n = this.noise()
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 0.7
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    for (let i = 0; i < dur * 20; i++) g.gain.setValueAtTime(Math.random() < 0.6 ? 0.18 : 0.02, t + i / 20)
    g.gain.setValueAtTime(0, t + dur)
    n.connect(bp).connect(g).connect(this.master)
    n.start(t)
    n.stop(t + dur + 0.1)
  }

  /** 走调的八音盒：《伦敦桥要塌了》小调变奏 */
  musicBox(on: boolean) {
    clearInterval(this.boxTimer)
    if (!on || !this.ctx) return
    const notes = [67, 69, 67, 65, 64, 65, 67, 62, 64, 65, 64, 65, 67, 67, 69, 67, 65, 64, 65, 67, 62, 67, 64, 60].map((n) => n - 1)
    let i = 0
    this.boxTimer = window.setInterval(() => {
      if (!this.ctx) return
      const c = this.ctx
      const t = c.currentTime
      const f = 440 * Math.pow(2, (notes[i % notes.length] + 12 - 69) / 12) * (1 + (Math.random() - 0.5) * 0.012)
      for (const [r, v] of [[1, 0.09], [3.01, 0.02], [5.3, 0.01]] as const) {
        const o = c.createOscillator()
        o.frequency.value = f * r
        const g = c.createGain()
        this.env(g, t, 0.003, v, 1.4)
        o.connect(g).connect(this.master)
        o.start(t)
        o.stop(t + 1.6)
      }
      i++
    }, 420)
  }

  /** 拾取信件时的纸张声 + 低沉嗡鸣 */
  paper() {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const n = this.noise()
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const g = c.createGain()
    this.env(g, t, 0.01, 0.2, 0.35)
    n.connect(hp).connect(g).connect(this.master)
    n.start(t)
    n.stop(t + 0.5)
    const o = c.createOscillator()
    o.frequency.value = 55
    const og = c.createGain()
    this.env(og, t, 0.3, 0.3, 3)
    o.connect(og).connect(this.master)
    o.start(t)
    o.stop(t + 3.5)
  }

  click() {
    if (!this.ctx) return
    const c = this.ctx
    const t = c.currentTime
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = 1800
    const g = c.createGain()
    this.env(g, t, 0.001, 0.08, 0.03)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.05)
  }

  /** 低沉的男声念白（浏览器语音合成，不可用时静默） */
  speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.pitch = 0.1
      u.rate = 0.7
      u.volume = 0.8
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
    } catch {
      /* 语音合成不可用 */
    }
  }

  stopAll() {
    this.musicBox(false)
    try {
      speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  }
}

export const sfx = new HorrorAudio()
