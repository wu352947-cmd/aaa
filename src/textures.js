// 程序化纹理：所有材质贴图都在运行时用 Canvas 生成，无需外部资源。
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 周期性值噪声（可无缝平铺）
class PeriodicNoise {
  constructor(period, seed) {
    this.p = period;
    const r = rng(seed);
    this.v = new Float32Array(period * period);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r();
  }
  get(x, y) {
    const p = this.p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = this.v[y0 * p + x0], b = this.v[y0 * p + x1];
    const c = this.v[y1 * p + x0], d = this.v[y1 * p + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

// 返回 f(u,v)，u,v ∈ [0,1) 平铺，输出约 [0,1]
export function makeFBM(basePeriod = 4, octaves = 5, seed = 1, gain = 0.5) {
  const layers = [];
  for (let i = 0; i < octaves; i++) layers.push(new PeriodicNoise(basePeriod << i, seed * 31 + i * 7));
  let norm = 0;
  for (let i = 0, a = 1; i < octaves; i++, a *= gain) norm += a;
  return (u, v) => {
    let s = 0, a = 1;
    for (let i = 0; i < octaves; i++) {
      const p = basePeriod << i;
      s += layers[i].get(u * p, v * p) * a;
      a *= gain;
    }
    return s / norm;
  };
}

// 非周期 2D 噪声（用于地形等）
export function makeNoise2D(seed = 7) {
  const perm = new Uint8Array(512);
  const r = rng(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    const g = h & 7;
    const u = g < 4 ? x : y, v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v);
  };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10);
    const A = perm[X] + Y, B = perm[X + 1] + Y;
    const l1 = grad(perm[A], x, y) + u * (grad(perm[B], x - 1, y) - grad(perm[A], x, y));
    const l2 = grad(perm[A + 1], x, y - 1) + u * (grad(perm[B + 1], x - 1, y - 1) - grad(perm[A + 1], x, y - 1));
    return (l1 + v * (l2 - l1)) * 0.25; // ~[-1,1]
  };
}

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

export function tex(c, { srgb = true, repeat = 1, wrap = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (typeof repeat === 'number') t.repeat.set(repeat, repeat); else t.repeat.set(repeat[0], repeat[1]);
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function pixelLoop(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x / w, y / h, out, x, y);
      const i = (y * w + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* ---------------- 木地板：人字拼橡木 ---------------- */
function woodGrainStrip(seed, w = 1024, h = 128, tone = [168, 124, 82]) {
  const f = makeFBM(4, 5, seed);
  const f2 = makeFBM(2, 3, seed + 3);
  return pixelLoop(w, h, (u, v, o) => {
    const warp = f(u * 0.5, v) * 6.0;
    const rings = Math.sin((v * 9.0 + warp + f2(u, v) * 2.0) * Math.PI * 2);
    const fine = f(u * 4.0, v * 1.0);
    const pores = hash2(Math.floor(u * w * 0.5), Math.floor(v * h * 2.0), seed) > 0.93 ? -18 : 0;
    const k = 0.84 + rings * 0.07 + (fine - 0.5) * 0.22;
    o[0] = clamp255(tone[0] * k + pores);
    o[1] = clamp255(tone[1] * k + pores * 0.8);
    o[2] = clamp255(tone[2] * k + pores * 0.6);
    o[3] = 255;
  });
}

export function herringboneWood({ size = 1024, tone = [176, 132, 88], seed = 3 } = {}) {
  const L = 6; // 长宽比 6:1
  const period = 2 * L;
  const px = size / period;
  const c = canvas(size), b = canvas(size);
  const ctx = c.getContext('2d'), bx = b.getContext('2d');
  const strips = [woodGrainStrip(seed, 1024, 128, tone), woodGrainStrip(seed + 11, 1024, 128, tone.map((t) => t * 0.94))];
  ctx.fillStyle = '#5b4330'; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#000'; bx.fillRect(0, 0, size, size);
  const mod = (a, m) => ((a % m) + m) % m;
  const drawPlank = (x, y, w, h, vertical) => {
    const key = hash2(mod(Math.round(x), period), mod(Math.round(y), period), vertical ? 9 : 5);
    const strip = strips[key > 0.5 ? 1 : 0];
    const tint = 0.9 + hash2(mod(Math.round(x), period), mod(Math.round(y), period), 13) * 0.2;
    const sx = Math.floor(key * (strip.width - strip.width / 2.2));
    const sw = strip.width / 2.2;
    const gap = Math.max(1, px * 0.035);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const X = x * px + ox, Y = y * px + oy, W = w * px, H = h * px;
      if (X > size || Y > size || X + W < 0 || Y + H < 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(X + gap * 0.5, Y + gap * 0.5, W - gap, H - gap); ctx.clip();
      if (vertical) {
        ctx.translate(X + W, Y); ctx.rotate(Math.PI / 2);
        ctx.drawImage(strip, sx, 0, sw, strip.height, 0, 0, H, W);
      } else {
        ctx.drawImage(strip, sx, 0, sw, strip.height, X, Y, W, H);
      }
      ctx.restore();
      ctx.fillStyle = tint > 1 ? `rgba(255,236,210,${(tint - 1) * 0.6})` : `rgba(60,36,18,${(1 - tint) * 0.8})`;
      ctx.fillRect(X + gap * 0.5, Y + gap * 0.5, W - gap, H - gap);
      // 倒角高光
      ctx.fillStyle = 'rgba(255,240,220,0.08)';
      if (vertical) ctx.fillRect(X + gap * 0.5, Y + gap * 0.5, 2, H - gap); else ctx.fillRect(X + gap * 0.5, Y + gap * 0.5, W - gap, 2);
      bx.fillStyle = `rgb(${150 + tint * 30},${150 + tint * 30},${150 + tint * 30})`;
      bx.fillRect(X + gap * 0.5, Y + gap * 0.5, W - gap, H - gap);
    }
  };
  for (let c2 = -3; c2 <= 3; c2++) {
    for (let k = -period * 2; k <= period * 2; k++) {
      const ox = k + c2 * L, oy = k - c2 * L;
      drawPlank(ox, oy, L, 1, false);
      drawPlank(ox + L, oy + 1 - L, 1, L, true);
    }
  }
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

export function plankWood({ size = 1024, tone = [150, 104, 66], seed = 21, planks = 6 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const strip = woodGrainStrip(seed, 1024, 160, tone);
  const h = size / planks;
  for (let i = 0; i < planks; i++) {
    const off = hash2(i, 1, seed) * strip.width;
    ctx.drawImage(strip, off, 0, strip.width - off, strip.height, 0, i * h, (strip.width - off) * (size / strip.width), h);
    ctx.drawImage(strip, 0, 0, off, strip.height, (strip.width - off) * (size / strip.width), i * h, off * (size / strip.width), h);
    ctx.fillStyle = 'rgba(30,18,8,0.5)';
    ctx.fillRect(0, i * h, size, 1.5);
  }
  return tex(c);
}

/* ---------------- 木纹（家具胡桃木/橡木） ---------------- */
export function woodVeneer({ size = 512, tone = [92, 60, 38], seed = 5, rings = 14 } = {}) {
  const f = makeFBM(3, 5, seed);
  const f2 = makeFBM(8, 3, seed + 1);
  const c = pixelLoop(size, size, (u, v, o) => {
    const warp = f(u, v) * 3.0;
    const r = Math.sin((u * rings + warp) * Math.PI * 2);
    const streak = f2(u * 0.25, v * 4.0);
    const k = 0.82 + r * 0.08 + (streak - 0.5) * 0.35;
    o[0] = clamp255(tone[0] * k * 1.05);
    o[1] = clamp255(tone[1] * k);
    o[2] = clamp255(tone[2] * k * 0.95);
    o[3] = 255;
  });
  return tex(c);
}

/* ---------------- 大理石（爵士白 / 鱼肚白 / 雅士白） ---------------- */
export function marble({ size = 1024, base = [238, 235, 230], vein = [120, 118, 116], gold = 0.25, seed = 9, slabs = [2, 4], veinScale = 1.0, dark = false } = {}) {
  const f = makeFBM(3, 6, seed);
  const g = makeFBM(5, 4, seed + 5);
  const cloud = makeFBM(2, 4, seed + 9);
  const c = pixelLoop(size, size, (u, v, o) => {
    const t = f(u, v);
    const s1 = Math.sin((u * 1 + v * 2) * Math.PI * 2 * veinScale + t * 14.0);
    const s2 = Math.sin((u * 3 - v * 1) * Math.PI * 2 * veinScale + g(u, v) * 10.0 + 1.3);
    const v1 = Math.pow(1 - Math.abs(s1), 34) * 0.85;
    const v2 = Math.pow(1 - Math.abs(s2), 60) * 0.7;
    const v3 = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 5) * Math.PI * 2 + t * 22)), 140) * 0.45;
    const cl = cloud(u, v);
    const V = Math.min(1, v1 + v2 + v3);
    const shade = 0.965 + (cl - 0.5) * 0.08;
    let r = base[0] * shade, gg = base[1] * shade, b = base[2] * shade;
    const goldMix = gold * v1 * (0.5 + cl);
    r = r * (1 - V) + vein[0] * V + goldMix * 40;
    gg = gg * (1 - V) + vein[1] * V + goldMix * 22;
    b = b * (1 - V) + vein[2] * V - goldMix * 6;
    if (dark) { r = base[0] * shade * (1 - V) + 210 * V; gg = base[1] * shade * (1 - V) + 200 * V; b = base[2] * shade * (1 - V) + 190 * V; }
    o[0] = clamp255(r); o[1] = clamp255(gg); o[2] = clamp255(b); o[3] = 255;
  });
  if (slabs) {
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(120,112,100,0.55)';
    const [nx, ny] = slabs;
    for (let i = 0; i < nx; i++) ctx.fillRect((i * size) / nx, 0, 1.2, size);
    for (let j = 0; j < ny; j++) ctx.fillRect(0, (j * size) / ny, size, 1.2);
  }
  return tex(c);
}

export function marbleRoughness(size = 512, seed = 3) {
  const f = makeFBM(4, 4, seed);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const k = 40 + f(u, v) * 40;
    o[0] = o[1] = o[2] = k; o[3] = 255;
  }), { srgb: false });
}

/* ---------------- 墙面：艺术漆 / 乳胶漆 ---------------- */
export function plaster({ size = 512, tone = [236, 231, 222], seed = 4, amp = 0.035 } = {}) {
  const f = makeFBM(4, 6, seed);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const k = 1 + (f(u, v) - 0.5) * amp * 2;
    o[0] = clamp255(tone[0] * k); o[1] = clamp255(tone[1] * k); o[2] = clamp255(tone[2] * k); o[3] = 255;
  }));
}

export function bumpNoise(size = 256, seed = 2, period = 8) {
  const f = makeFBM(period, 4, seed);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const k = f(u, v) * 255; o[0] = o[1] = o[2] = k; o[3] = 255;
  }), { srgb: false });
}

// 墙布 / 硬包：细密织纹
export function wallCloth({ size = 512, tone = [214, 200, 180], seed = 8 } = {}) {
  const f = makeFBM(16, 3, seed);
  return tex(pixelLoop(size, size, (u, v, o, x, y) => {
    const warp = Math.sin(x * 1.6) * 0.5 + 0.5;
    const weft = Math.sin(y * 1.6 + 1) * 0.5 + 0.5;
    const n = f(u, v);
    const slub = makeSlub(y, seed);
    const k = 0.9 + warp * 0.05 + weft * 0.04 + (n - 0.5) * 0.12 + slub;
    o[0] = clamp255(tone[0] * k); o[1] = clamp255(tone[1] * k); o[2] = clamp255(tone[2] * k); o[3] = 255;
  }));
}
function makeSlub(y, seed) { return (hash2(Math.floor(y / 3), 0, seed) - 0.5) * 0.06; }

/* ---------------- 布艺：沙发面料 / 亚麻 ---------------- */
export function fabric({ size = 256, seed = 12, coarse = 2.2 } = {}) {
  const f = makeFBM(8, 4, seed);
  return tex(pixelLoop(size, size, (u, v, o, x, y) => {
    const a = Math.sin(x * coarse) * Math.sin(y * coarse * 0.5 + (Math.floor(x / 3) % 2) * 1.5);
    const n = f(u, v);
    const k = 200 + a * 18 + (n - 0.5) * 60 + (hash2(x, y, seed) - 0.5) * 20;
    o[0] = o[1] = o[2] = clamp255(k); o[3] = 255;
  }), { srgb: true });
}

export function leather({ size = 512, tone = [120, 72, 42], seed = 15 } = {}) {
  const f = makeFBM(32, 3, seed);
  const g = makeFBM(4, 4, seed + 2);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const cell = f(u, v);
    const k = 0.86 + Math.pow(cell, 3) * 0.25 + (g(u, v) - 0.5) * 0.12;
    o[0] = clamp255(tone[0] * k); o[1] = clamp255(tone[1] * k); o[2] = clamp255(tone[2] * k); o[3] = 255;
  }));
}

/* ---------------- 地毯：水墨山水纹 ---------------- */
export function inkRug({ w = 1024, h = 768, seed = 31 } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const f = makeFBM(16, 4, seed);
  // 底色：燕麦色羊毛
  const base = pixelLoop(w, h, (u, v, o, x, y) => {
    const n = f(u, v), pile = hash2(x, y, seed);
    const k = 0.94 + (n - 0.5) * 0.08 + (pile - 0.5) * 0.08;
    o[0] = clamp255(222 * k); o[1] = clamp255(212 * k); o[2] = clamp255(194 * k); o[3] = 255;
  });
  ctx.drawImage(base, 0, 0);
  const noise = makeNoise2D(seed);
  const layers = [
    { y: 0.62, amp: 0.16, col: 'rgba(120,128,130,0.55)', freq: 2.2 },
    { y: 0.70, amp: 0.12, col: 'rgba(84,96,102,0.65)', freq: 3.1 },
    { y: 0.80, amp: 0.08, col: 'rgba(52,62,70,0.75)', freq: 4.0 },
  ];
  for (const L of layers) {
    const grd = ctx.createLinearGradient(0, h * (L.y - L.amp), 0, h);
    grd.addColorStop(0, L.col); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const n = noise(x / w * L.freq + L.y * 10, L.y * 3) + 0.5 * noise(x / w * L.freq * 3, 7 + L.y);
      ctx.lineTo(x, h * (L.y - n * L.amp));
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  }
  // 金线
  ctx.strokeStyle = 'rgba(176,140,80,0.8)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) { const n = noise(x / w * 1.4, 42); ctx.lineTo(x, h * (0.45 + n * 0.12)); }
  ctx.stroke();
  // 边框
  ctx.strokeStyle = 'rgba(70,72,74,0.7)'; ctx.lineWidth = 10; ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.strokeStyle = 'rgba(176,140,80,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(38, 38, w - 76, h - 76);
  return tex(c, { wrap: false });
}

export function wovenRug({ w = 512, h = 512, tone = [190, 180, 165], seed = 41, stripes = true } = {}) {
  const f = makeFBM(8, 4, seed);
  return tex(pixelLoop(w, h, (u, v, o, x, y) => {
    const n = f(u, v);
    const s = stripes ? (Math.floor(v * 40) % 2 ? 0.96 : 1.02) : 1;
    const k = s * (0.95 + (n - 0.5) * 0.1 + (hash2(x, y, seed) - 0.5) * 0.1);
    const border = u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95 ? 0.75 : 1;
    o[0] = clamp255(tone[0] * k * border); o[1] = clamp255(tone[1] * k * border); o[2] = clamp255(tone[2] * k * border); o[3] = 255;
  }), { wrap: false });
}

/* ---------------- 水墨山水画 ---------------- */
export function inkPainting({ w = 1024, h = 512, seed = 51, title = '西湖烟雨', vertical = false } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const f = makeFBM(8, 5, seed);
  const paper = pixelLoop(w, h, (u, v, o) => {
    const n = f(u, v);
    const k = 0.95 + (n - 0.5) * 0.08;
    o[0] = clamp255(236 * k); o[1] = clamp255(228 * k); o[2] = clamp255(208 * k); o[3] = 255;
  });
  ctx.drawImage(paper, 0, 0);
  const noise = makeNoise2D(seed);
  const ridges = vertical
    ? [{ b: 0.42, a: 0.32, d: 0.2, f: 1.6 }, { b: 0.62, a: 0.22, d: 0.42, f: 2.4 }, { b: 0.86, a: 0.18, d: 0.75, f: 3.2 }]
    : [{ b: 0.50, a: 0.30, d: 0.18, f: 1.5 }, { b: 0.62, a: 0.24, d: 0.38, f: 2.3 }, { b: 0.74, a: 0.16, d: 0.62, f: 3.0 }, { b: 0.86, a: 0.10, d: 0.85, f: 4.2 }];
  for (const r of ridges) {
    const pts = [];
    for (let x = 0; x <= w; x += 2) {
      const t = x / w;
      const n = Math.abs(noise(t * r.f + r.b * 9, r.d * 5)) * 1.3 + noise(t * r.f * 4, r.d) * 0.25;
      pts.push([x, h * (r.b - n * r.a)]);
    }
    // 渲染：墨色自山脊向下晕开
    for (let i = 0; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const g = ctx.createLinearGradient(0, y, 0, y + h * 0.28);
      const ink = Math.round(30 + (1 - r.d) * 80);
      g.addColorStop(0, `rgba(${ink},${ink + 6},${ink + 10},${0.25 + r.d * 0.6})`);
      g.addColorStop(0.35, `rgba(${ink},${ink + 6},${ink + 10},${0.12 + r.d * 0.25})`);
      g.addColorStop(1, 'rgba(236,228,208,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 2.5, h * 0.3);
    }
    // 皴法笔触
    ctx.strokeStyle = `rgba(20,24,28,${0.25 + r.d * 0.5})`;
    ctx.lineWidth = 1 + r.d * 1.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const rr = rng(seed + r.b * 100);
    for (let i = 0; i < 90 * (1 + r.d); i++) {
      const p = pts[Math.floor(rr() * pts.length)];
      ctx.strokeStyle = `rgba(30,34,36,${0.08 + rr() * 0.2})`;
      ctx.lineWidth = 0.6 + rr() * 1.2;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] + rr() * 6);
      ctx.lineTo(p[0] + (rr() - 0.5) * 14, p[1] + 10 + rr() * 30); ctx.stroke();
    }
    // 松树点苔
    for (let i = 0; i < 40 * r.d; i++) {
      const p = pts[Math.floor(rr() * pts.length)];
      ctx.fillStyle = `rgba(24,30,28,${0.4 + rr() * 0.4})`;
      ctx.beginPath(); ctx.arc(p[0], p[1] - 1, 1 + rr() * 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 远塔
  if (!vertical) {
    ctx.fillStyle = 'rgba(40,44,48,0.55)';
    const px = w * 0.72, py = h * 0.42;
    for (let i = 0; i < 6; i++) ctx.fillRect(px - 5 + i * 0.6, py - i * 9, 10 - i * 1.2, 7);
    ctx.fillRect(px - 0.5, py - 62, 1, 12);
  }
  // 小舟
  ctx.fillStyle = 'rgba(28,30,32,0.8)';
  ctx.beginPath(); ctx.ellipse(w * 0.28, h * 0.9, 16, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(w * 0.28 - 1, h * 0.9 - 14, 1.2, 13);
  // 题字 + 印章
  ctx.fillStyle = 'rgba(28,26,24,0.85)';
  ctx.font = `${Math.round(h * 0.07)}px "STKaiti","KaiTi","Kaiti SC","Noto Serif SC","Songti SC",serif`;
  const tx = vertical ? w * 0.86 : w * 0.9, ty = h * 0.12;
  [...title].forEach((ch, i) => ctx.fillText(ch, tx, ty + i * h * 0.08));
  ctx.fillStyle = 'rgba(178,34,30,0.85)';
  ctx.fillRect(tx + 2, ty + title.length * h * 0.08 + 4, h * 0.05, h * 0.05);
  return tex(c, { wrap: false });
}

export function calligraphy({ w = 256, h = 1024, text = '水光潋滟晴方好', seed = 61 } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const f = makeFBM(6, 4, seed);
  ctx.drawImage(pixelLoop(w, h, (u, v, o) => {
    const k = 0.95 + (f(u, v) - 0.5) * 0.08;
    o[0] = clamp255(240 * k); o[1] = clamp255(234 * k); o[2] = clamp255(218 * k); o[3] = 255;
  }), 0, 0);
  ctx.fillStyle = 'rgba(16,14,12,0.92)';
  const fs = Math.min(w * 0.6, (h * 0.86) / text.length);
  ctx.font = `${Math.round(fs)}px "STXingkai","STKaiti","KaiTi","Kaiti SC","Noto Serif SC",serif`;
  ctx.textAlign = 'center';
  [...text].forEach((ch, i) => ctx.fillText(ch, w / 2, h * 0.08 + fs * (i + 0.85)));
  ctx.fillStyle = 'rgba(176,30,28,0.9)';
  ctx.fillRect(w * 0.62, h * 0.93, w * 0.16, w * 0.16);
  return tex(c, { wrap: false });
}

/* ---------------- 书脊 ---------------- */
export function bookSpines({ w = 512, h = 256, seed = 71 } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  const palette = ['#2f3e46', '#7a5c3a', '#c9b79c', '#8c2f2f', '#3b5249', '#e8e0d2', '#1f2a36', '#a68a64', '#5c4b51', '#d5c4a1', '#264653', '#b56b45'];
  ctx.fillStyle = '#1a1612'; ctx.fillRect(0, 0, w, h);
  let x = 0;
  while (x < w) {
    const bw = 8 + r() * 22;
    const bh = h * (0.7 + r() * 0.3);
    ctx.fillStyle = palette[Math.floor(r() * palette.length)];
    ctx.fillRect(x, h - bh, bw - 1, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 1, h - bh, 2, bh);
    ctx.fillStyle = 'rgba(214,180,110,0.8)';
    ctx.fillRect(x + 2, h - bh + 14 + r() * 10, bw - 5, 2);
    ctx.fillRect(x + 2, h - 24 - r() * 8, bw - 5, 1.5);
    x += bw;
    if (r() > 0.93) x += 12;
  }
  return tex(c, { wrap: false });
}

/* ---------------- 水面法线（可平铺） ---------------- */
export function waterNormals(size = 512, seed = 81) {
  const r = rng(seed);
  const waves = [];
  for (let i = 0; i < 48; i++) {
    const kx = Math.round((r() - 0.5) * 2 * (2 + i * 0.6));
    const ky = Math.round((r() - 0.5) * 2 * (2 + i * 0.6));
    if (kx === 0 && ky === 0) continue;
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.25), ph: r() * Math.PI * 2 });
  }
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0; const u = x / size, v = y / size;
    for (const w of waves) s += Math.sin((w.kx * u + w.ky * v) * Math.PI * 2 + w.ph) * w.a;
    H[y * size + x] = s;
  }
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = 2.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = H[y * size + ((x - 1 + size) % size)], xr = H[y * size + ((x + 1) % size)];
    const yu = H[((y - 1 + size) % size) * size + x], yd = H[((y + 1) % size) * size + x];
    let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

/* ---------------- 柳条（透明贴图） ---------------- */
export function willowStrands({ w = 256, h = 512, seed = 91 } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 46; i++) {
    const x0 = r() * w;
    const len = h * (0.5 + r() * 0.5);
    const sway = (r() - 0.5) * 18;
    const g = 90 + r() * 60;
    for (let y = 0; y < len; y += 3) {
      const t = y / len;
      const x = x0 + sway * t * t + Math.sin(y * 0.05 + i) * 2;
      ctx.fillStyle = `rgba(${Math.round(g * 0.55)},${Math.round(g)},${Math.round(g * 0.35)},${0.95 - t * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x + (r() - 0.5) * 3, y, 1.4 + r() * 1.2, 3.2 + r() * 2, (r() - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return tex(c, { wrap: false });
}

// 树冠叶片（透明，用于香樟、桂花等）
export function leafCluster({ size = 256, seed = 93, tone = [70, 110, 52] } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 700; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * size * 0.46;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const k = 0.6 + r() * 0.6;
    ctx.fillStyle = `rgba(${Math.round(tone[0] * k)},${Math.round(tone[1] * k)},${Math.round(tone[2] * k)},1)`;
    ctx.beginPath(); ctx.ellipse(x, y, 3 + r() * 4, 1.6 + r() * 2, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c, { wrap: false });
}

/* ---------------- 荷叶 ---------------- */
export function lotusLeaf({ size = 256, seed = 95 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const R = size * 0.48, cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, R);
  g.addColorStop(0, '#9fb85a'); g.addColorStop(0.5, '#5f8a36'); g.addColorStop(1, '#3f6a2a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, 0.12, Math.PI * 2 - 0.12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(200,220,140,0.45)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    const a = 0.2 + (i / 18) * (Math.PI * 2 - 0.4);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R * 0.96, cy + Math.sin(a) * R * 0.96); ctx.stroke();
  }
  ctx.fillStyle = '#c8d68a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  return tex(c, { wrap: false });
}

/* ---------------- 地形细节：林冠 ---------------- */
export function forestCanopy(size = 512, seed = 101) {
  const f = makeFBM(16, 5, seed);
  const g = makeFBM(64, 2, seed + 3);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const n = f(u, v), m = g(u, v);
    const blob = Math.pow(m, 1.6);
    const k = 0.55 + n * 0.5 + blob * 0.35;
    o[0] = clamp255(255 * k * 0.72); o[1] = clamp255(255 * k * 0.86); o[2] = clamp255(255 * k * 0.64); o[3] = 255;
  }), { srgb: true });
}

/* ---------------- 花岗岩铺装 ---------------- */
export function granitePavers({ size = 512, seed = 111, tone = [150, 148, 142], tiles = [4, 8] } = {}) {
  const f = makeFBM(32, 3, seed);
  const c = pixelLoop(size, size, (u, v, o, x, y) => {
    const n = f(u, v), sp = hash2(x, y, seed);
    const tx = Math.floor(u * tiles[0]), ty = Math.floor(v * tiles[1]);
    const tvar = 0.92 + hash2(tx, ty, seed + 1) * 0.14;
    const k = tvar * (0.9 + (n - 0.5) * 0.2 + (sp > 0.97 ? -0.25 : sp < 0.03 ? 0.2 : 0));
    o[0] = clamp255(tone[0] * k); o[1] = clamp255(tone[1] * k); o[2] = clamp255(tone[2] * k); o[3] = 255;
  });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(40,38,36,0.6)';
  for (let i = 0; i < tiles[0]; i++) ctx.fillRect((i * size) / tiles[0], 0, 2, size);
  for (let j = 0; j < tiles[1]; j++) ctx.fillRect(0, (j * size) / tiles[1], size, 2);
  return tex(c);
}

export function grass(size = 512, seed = 121) {
  const f = makeFBM(8, 5, seed);
  return tex(pixelLoop(size, size, (u, v, o, x, y) => {
    const n = f(u, v), b = hash2(x, y, seed);
    const k = 0.7 + n * 0.4 + (b - 0.5) * 0.3;
    o[0] = clamp255(96 * k); o[1] = clamp255(132 * k); o[2] = clamp255(62 * k); o[3] = 255;
  }));
}

/* ---------------- 小青瓦屋面 ---------------- */
export function roofTiles(size = 256) {
  const c = canvas(size); const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3c3e'; ctx.fillRect(0, 0, size, size);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * size;
    const g = ctx.createLinearGradient(x, 0, x + size / n, 0);
    g.addColorStop(0, '#2a2c2e'); g.addColorStop(0.5, '#56595b'); g.addColorStop(1, '#2a2c2e');
    ctx.fillStyle = g; ctx.fillRect(x, 0, size / n, size);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let j = 0; j < 8; j++) ctx.fillRect(0, (j / 8) * size, size, 2);
  return tex(c);
}

/* ---------------- 城市楼宇窗户（含夜间发光贴图） ---------------- */
export function buildingWindows({ size = 256, seed = 131 } = {}) {
  const c = canvas(size), e = canvas(size);
  const ctx = c.getContext('2d'), ex = e.getContext('2d');
  ctx.fillStyle = '#b9b6ae'; ctx.fillRect(0, 0, size, size);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, size, size);
  const cols = 8, rows = 8;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = (i / cols) * size + 4, y = (j / rows) * size + 6, w = size / cols - 8, h = size / rows - 12;
    ctx.fillStyle = `rgb(${60 + hash2(i, j, seed) * 30},${74 + hash2(i, j, seed) * 30},${86 + hash2(i, j, seed) * 30})`;
    ctx.fillRect(x, y, w, h);
    if (hash2(i, j, seed + 1) > 0.45) {
      const warm = hash2(i, j, seed + 2) > 0.3;
      ex.fillStyle = warm ? `rgba(255,${190 + hash2(i, j, 5) * 40},120,1)` : 'rgba(220,235,255,1)';
      ex.fillRect(x, y, w, h);
    }
  }
  return { map: tex(c), emissive: tex(e) };
}

/* ---------------- 古塔砖墙 ---------------- */
export function brick(size = 256, seed = 141, tone = [150, 128, 104]) {
  const f = makeFBM(8, 3, seed);
  const c = pixelLoop(size, size, (u, v, o, x, y) => {
    const row = Math.floor(v * 16);
    const off = row % 2 ? 0.5 : 0;
    const col = Math.floor(u * 8 + off);
    const k = 0.85 + hash2(col, row, seed) * 0.25 + (f(u, v) - 0.5) * 0.2;
    const mortar = (v * 16) % 1 < 0.08 || ((u * 8 + off) % 1) < 0.04;
    const m = mortar ? 0.7 : 1;
    o[0] = clamp255(tone[0] * k * m); o[1] = clamp255(tone[1] * k * m); o[2] = clamp255(tone[2] * k * m); o[3] = 255;
  });
  return tex(c);
}

/* ---------------- 木格栅 / 屏风 ---------------- */
export function latticeAlpha(size = 256) {
  const c = canvas(size); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.05;
  ctx.strokeRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.03;
  ctx.strokeRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5);
  return tex(c, { srgb: false });
}

// 柔和接触阴影贴片
export function blobShadow(size = 128) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return tex(c, { wrap: false, srgb: false });
}

export function boxShadow(size = 128) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = Math.min(x, size - 1 - x) / (size * 0.5), dy = Math.min(y, size - 1 - y) / (size * 0.5);
    const a = Math.pow(Math.min(1, Math.min(dx, dy) * 2.2), 1.5) * 0.6;
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { wrap: false, srgb: false });
}

// 天空云层（用于云片的 alpha）
export function cloudTexture(size = 512, seed = 151) {
  const f = makeFBM(4, 6, seed);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const n = f(u, v);
    const a = Math.max(0, Math.min(1, (n - 0.48) * 3.2));
    o[0] = o[1] = o[2] = 255; o[3] = a * 255;
  }), { srgb: false });
}

// 金属拉丝
export function brushedMetal(size = 256, seed = 161) {
  return tex(pixelLoop(size, size, (u, v, o, x, y) => {
    const k = 180 + (hash2(0, y, seed) - 0.5) * 50 + (hash2(x >> 3, y, seed) - 0.5) * 20;
    o[0] = o[1] = o[2] = clamp255(k); o[3] = 255;
  }), { srgb: false });
}

// 马赛克/小砖（卫生间、洗衣房）
export function tiles({ size = 512, tone = [226, 224, 220], n = 8, grout = [170, 166, 160], seed = 171 } = {}) {
  const f = makeFBM(8, 3, seed);
  return tex(pixelLoop(size, size, (u, v, o) => {
    const gu = (u * n) % 1, gv = (v * n) % 1;
    const isG = gu < 0.03 || gv < 0.03;
    const t = 0.96 + hash2(Math.floor(u * n), Math.floor(v * n), seed) * 0.06 + (f(u, v) - 0.5) * 0.05;
    const col = isG ? grout : tone;
    o[0] = clamp255(col[0] * (isG ? 1 : t)); o[1] = clamp255(col[1] * (isG ? 1 : t)); o[2] = clamp255(col[2] * (isG ? 1 : t)); o[3] = 255;
  }));
}
