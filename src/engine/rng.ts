// 确定性随机数：模拟核心只允许使用这里的随机源，禁止 Math.random 与系统时钟。
// 每个子系统各用一条独立的流（fork），这样新增一个子系统不会打乱其他子系统的随机序列。

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    this.state = hashString(seed) || 0x9e3779b9;
  }

  /** mulberry32，返回 [0, 1) */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  fork(name: string): Rng {
    return new Rng(`${this.seed}/${name}`);
  }

  /** 导出 / 恢复内部状态，用于存档 */
  get raw(): number {
    return this.state;
  }
  set raw(v: number) {
    this.state = v >>> 0;
  }
}
