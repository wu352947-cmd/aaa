// 声音：全部由 WebAudio 实时合成（钟声、风、河水、人声、教堂内的管风琴持续音）
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    // 混响（合成的冲激响应）
    this.reverb = c.createConvolver();
    const len = c.sampleRate * 4.5, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.reverb.buffer = ir;
    this.revGain = c.createGain(); this.revGain.gain.value = 0.5;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    // 噪声缓冲
    const nb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.5; }
    const mkNoise = (type, freq, q) => {
      const src = c.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { g, f };
    };
    this.wind = mkNoise('lowpass', 500, 0.5);
    this.river = mkNoise('bandpass', 900, 0.6);
    this.crowd = mkNoise('bandpass', 420, 2.5);
    // 教堂内：管风琴持续音（D 多利亚调式的五度和声）
    this.organ = c.createGain(); this.organ.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    this.organ.connect(lp); lp.connect(this.master); lp.connect(this.reverb);
    for (const [f, a] of [[73.42, 0.3], [110, 0.22], [146.83, 0.18], [220, 0.08], [293.66, 0.05]]) {
      for (const det of [-0.6, 0.6]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f + det;
        const g = c.createGain(); g.gain.value = a * 0.12;
        o.connect(g); g.connect(this.organ); o.start();
      }
    }
    this.nextBird = 0;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setMuted(m) { this.enabled = !m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }

  // 钟声：非谐和分音（hum、prime、tierce、quint、nominal）
  bell(fund = 220, gain = 0.5, distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const att = 1 / (1 + distance * distance / 900);
    const partials = [[0.5, 1.0, 9], [1.0, 0.8, 6], [1.19, 0.6, 4.5], [1.5, 0.35, 3.5], [2.0, 0.5, 3], [2.5, 0.2, 2], [3.0, 0.15, 1.6], [4.2, 0.08, 1]];
    const out = c.createGain(); out.gain.value = gain * att;
    out.connect(this.master); out.connect(this.reverb);
    for (const [r, a, d] of partials) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fund * r * (1 + (Math.random() - 0.5) * 0.002);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * 0.25, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d * (fund < 150 ? 2.2 : 1.4));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d * 2.4);
    }
  }

  chirp() {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    const f0 = 2600 + Math.random() * 1600;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), t + 0.12);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }

  // 每帧：根据玩家所处环境调整环境声
  update(dt, env) {
    if (!this.ctx) return;
    const k = Math.min(1, dt * 2);
    const lerp = (p, v) => { p.value += (v - p.value) * k; };
    lerp(this.wind.g.gain, (0.04 + env.height * 0.0025) * (1 - env.interior * 0.85));
    this.wind.f.frequency.value = 400 + env.height * 6;
    lerp(this.river.g.gain, env.river * 0.05 * (1 - env.interior));
    lerp(this.crowd.g.gain, env.crowd * 0.05 * (1 - env.interior * 0.7));
    lerp(this.organ.gain, env.interior * 0.35);
    this.revGain.gain.value = 0.25 + env.interior * 0.9;
    this.nextBird -= dt;
    if (this.nextBird < 0) { this.nextBird = 1.5 + Math.random() * 5; if (env.day > 0.5 && env.interior < 0.5) this.chirp(); }
  }
}
