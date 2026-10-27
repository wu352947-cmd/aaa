/**
 * 像素画布：所有世界层画面都用代码一个像素一个像素画出来，再按整数倍放大显示。
 * 不读系统时钟，不用 Math.random——同一个 t 与同一份状态，永远画出同一帧。
 */

export type RGB = readonly [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, k: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

/** 4×4 有序抖动矩阵：像素画里的“渐变”只能靠它 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** 可复现的伪随机：给 (x, y, 种子) 一个 0–1 的数 */
export function noise(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Pix {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, c: RGB): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }

  get(x: number, y: number): RGB {
    const i = (Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  fill(c: RGB): void {
    this.rect(0, 0, this.w, this.h, c);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = Math.max(0, Math.round(y)); j < Math.min(this.h, Math.round(y + h)); j++)
      for (let i = Math.max(0, Math.round(x)); i < Math.min(this.w, Math.round(x + w)); i++) this.set(i, j, c);
  }

  /** 两色抖动填充：k 是 b 的占比 */
  dither(x: number, y: number, w: number, h: number, a: RGB, b: RGB, k: number): void {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.set(i, j, bayer(i, j) < k ? b : a);
  }

  /** 竖直渐变（抖动过渡） */
  vgrad(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
    for (let j = 0; j < h; j++) {
      const k = j / Math.max(1, h - 1);
      for (let i = 0; i < w; i++) this.set(x + i, y + j, bayer(x + i, y + j) < k ? bottom : top);
    }
  }

  hline(x0: number, x1: number, y: number, c: RGB): void {
    for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) this.set(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: RGB): void {
    for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) this.set(x, y, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 2000; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c);
  }

  /** 按字符画贴图：'.' 与空格透明，其余字符查调色表 */
  sprite(x: number, y: number, rows: readonly string[], pal: Record<string, RGB>, flip = false): void {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[flip ? r.length - 1 - i : i];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c) this.set(x + i, y + j, c);
      }
    }
  }

  /** 光晕：在半径内按距离抖动地提亮 */
  glow(cx: number, cy: number, r: number, c: RGB, strength = 0.5): void {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y) / r;
        if (d > 1) continue;
        const k = (1 - d) * strength;
        const px = cx + x;
        const py = cy + y;
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        if (bayer(px, py) < k) this.set(px, py, mix(this.get(px, py), c, 0.45));
      }
  }

  /** 整体压暗（夜晚、停市、褪色） */
  darken(k: number, tint: RGB = [0, 0, 0]): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = this.data[i] + (tint[0] - this.data[i]) * k;
      this.data[i + 1] = this.data[i + 1] + (tint[1] - this.data[i + 1]) * k;
      this.data[i + 2] = this.data[i + 2] + (tint[2] - this.data[i + 2]) * k;
    }
  }

  desaturate(k: number): void {
    for (let i = 0; i < this.data.length; i += 4) {
      const l = this.data[i] * 0.3 + this.data[i + 1] * 0.59 + this.data[i + 2] * 0.11;
      this.data[i] += (l - this.data[i]) * k;
      this.data[i + 1] += (l - this.data[i + 1]) * k;
      this.data[i + 2] += (l - this.data[i + 2]) * k;
    }
  }

  /**
   * 雕版线纹：设计文档里“钞票与股票凭证上的雕版线条”的像素版。
   * 暗部按亮度叠上斜向排线，越暗排线越密，让不同年代的画面属于同一本画册。
   */
  engrave(ink: RGB, strength = 0.35): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
        const dark = 1 - l;
        const on = ((x + y) % 4 === 0 && dark > 0.45) || ((x - y + 400) % 4 === 0 && dark > 0.72);
        if (on) this.set(x, y, mix(c, ink, strength));
      }
  }

  /** 胶片颗粒（1995 年的粗颗粒胶片） */
  grain(seed: number, k = 0.06): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const n = noise(x, y, seed) - 0.5;
        if (Math.abs(n) < 0.42) continue;
        const c = this.get(x, y);
        const d = n * 255 * k * 2;
        this.set(x, y, [c[0] + d, c[1] + d, c[2] + d]);
      }
  }

  toImageData(): ImageData {
    return new ImageData(this.data as Uint8ClampedArray<ArrayBuffer>, this.w, this.h);
  }
}
