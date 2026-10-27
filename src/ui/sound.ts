/**
 * 让市场“被听见”（设计文档 11.3）：
 * - 交易大厅环境声随成交量变化：成交越密，人声越嘈杂；冷清时只剩低语。
 * - 杠杆心跳：保证金占用越高，低频心跳越明显、越快。
 * - 收盘钟与关键时刻的钟声。
 * 全部用 WebAudio 现场合成，不依赖音频文件。浏览器要求用户先有一次交互才能出声。
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private heartTimer: number | null = null;
  private heartBpm = 0;

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** 必须在用户手势里调用 */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // 人声嘈杂：棕噪声经带通滤波，再用缓慢的颤音调制成“一片说话声”
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 500;
    this.crowdFilter.Q.value = 0.8;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 3.1;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 180;
    wobble.connect(wobbleGain).connect(this.crowdFilter.frequency);
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.master);
    src.start();
    wobble.start();
  }

  stop(): void {
    this.setHeart(0);
    void this.ctx?.close();
    this.ctx = null;
  }

  /** level 0–1：当分钟成交量相对平常的热度 */
  setCrowd(level: number): void {
    if (!this.ctx || !this.crowdGain || !this.crowdFilter) return;
    const t = this.ctx.currentTime;
    const l = Math.max(0, Math.min(1, level));
    this.crowdGain.gain.setTargetAtTime(0.015 + 0.22 * l, t, 0.6);
    this.crowdFilter.frequency.setTargetAtTime(380 + 520 * l, t, 0.8);
  }

  /** bpm 为 0 表示没有心跳 */
  setHeart(bpm: number): void {
    const b = Math.round(bpm / 10) * 10;
    if (b === this.heartBpm) return;
    this.heartBpm = b;
    if (this.heartTimer != null) window.clearInterval(this.heartTimer);
    this.heartTimer = null;
    if (!b || !this.ctx) return;
    const beat = () => {
      this.thump(0);
      this.thump(0.18, 0.6);
    };
    beat();
    this.heartTimer = window.setInterval(beat, 60000 / b);
  }

  private thump(delay: number, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** 钟声：收盘、消息传开、强平等时刻 */
  bell(strong = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const partials = strong ? [523, 1046, 1569, 2093] : [880, 1760];
    partials.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * (1 + i * 0.002);
      const peak = (strong ? 0.28 : 0.12) / (i + 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (strong ? 3.5 : 1.2));
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 4);
    });
    // 钟响时，人声骤停一瞬
    if (strong && this.crowdGain) {
      this.crowdGain.gain.cancelScheduledValues(t);
      this.crowdGain.gain.setValueAtTime(0.0001, t);
    }
  }
}

export const sound = new SoundEngine();
