// 全部纹理均在运行时程序化生成（Canvas），无需外部图片资源
import * as THREE from 'three';
import { fbm, valueNoise, mulberry32, clamp } from './util.js';

const cache = {};
let MAX_ANISO = 4;
let TEXQ = 1; // 1 = 高清，0.5 = 移动端
export function setAnisotropy(a) { MAX_ANISO = a; }
export function setTextureQuality(q) { TEXQ = q; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// 由高度场生成法线贴图
function heightToNormal(H, w, h, strength = 2) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
      const u = H[((y - 1 + h) % h) * w + x], b = H[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - b) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv; ny *= inv; const nz = inv;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

function pixelLoop(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const H = new Float32Array(w * h);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255;
      H[y * w + x] = fn(x, y, out);
      const i = (y * w + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, H };
}

/* ---------------- 石材：方整石砌块（巴黎卢泰斯石灰岩） ---------------- */
export function stoneTextures(size = 1024 * TEXQ) {
  if (cache.stone) return cache.stone;
  const rng = mulberry32(7);
  const courses = 8; // 4 米内 8 皮砌块（每皮 0.5 米）
  const ch = size / courses;
  const mortar = Math.max(2, size / 400);
  // 每皮预生成竖缝
  const joints = [];
  const tints = [];
  for (let r = 0; r < courses; r++) {
    const row = [];
    let x = rng() * size * 0.3;
    while (x < size + size * 0.3) { row.push(x % size); x += size * (0.18 + rng() * 0.22); }
    row.sort((a, b) => a - b);
    joints.push(row);
    const rt = [];
    for (let i = 0; i < row.length + 1; i++) rt.push([rng(), rng()]);
    tints.push(rt);
  }
  const { c, H } = pixelLoop(size, size, (x, y, o) => {
    const r = Math.floor(y / ch);
    const yy = y - r * ch;
    const row = joints[r];
    let bi = 0, dx = 1e9;
    for (let i = 0; i < row.length; i++) {
      if (row[i] <= x) bi = i + 1;
      dx = Math.min(dx, Math.abs(x - row[i]), Math.abs(x - row[i] + size), Math.abs(x - row[i] - size));
    }
    const dy = Math.min(yy, ch - yy);
    const edge = Math.min(dx, dy);
    const [t1, t2] = tints[r][bi % tints[r].length];
    const n = fbm(x / size * 8, y / size * 8, 8, 3, 3);
    const fine = valueNoise(x * 512 / size, y * 512 / size, 512, 9);
    const stain = fbm(x / size * 3, y / size * 3, 3, 3, 11);
    // 基色：暖米色石灰岩，带块间色差
    let R = 190 + t1 * 24 - 10, G = 178 + t1 * 20 - 10, B = 150 + t2 * 18 - 12;
    const k = 0.78 + n * 0.32 + (fine - 0.5) * 0.1 - Math.max(0, stain - 0.5) * 0.6;
    R *= k; G *= k; B *= k * 0.98;
    // 雨水污迹（竖向条纹）
    const streak = valueNoise(x / 6, y / 90, size / 6, 21);
    const sk = 1 - Math.max(0, streak - 0.62) * 0.55;
    R *= sk; G *= sk; B *= sk;
    let h = 0.6 + n * 0.3 + fine * 0.08;
    if (edge < mortar) {
      R = 168 * k; G = 160 * k; B = 142 * k; h = 0.05;
    } else if (edge < mortar * 2.5) {
      const e = (edge - mortar) / (mortar * 1.5);
      h *= 0.4 + 0.6 * e;
      R *= 0.9 + 0.1 * e; G *= 0.9 + 0.1 * e; B *= 0.9 + 0.1 * e;
    }
    o[0] = clamp(R, 0, 255); o[1] = clamp(G, 0, 255); o[2] = clamp(B, 0, 255);
    return h;
  });
  cache.stone = { map: tex(c), normalMap: heightToNormal(H, size, size, 3) };
  return cache.stone;
}

/* 精细雕刻石材（雕像、线脚） */
export function carvedTextures() {
  if (cache.carved) return cache.carved;
  const s = 256;
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const n = fbm(x / s * 6, y / s * 6, 6, 4, 31);
    const f = valueNoise(x / 1.6, y / 1.6, s / 1.6, 5);
    const k = 0.78 + n * 0.32 + f * 0.06;
    o[0] = 196 * k; o[1] = 184 * k; o[2] = 160 * k;
    return n + f * 0.15;
  });
  cache.carved = { map: tex(c), normalMap: heightToNormal(H, s, s, 1.5) };
  return cache.carved;
}

/* 铅皮屋顶（大教堂）：立边接缝 + 白色氧化斑 */
export function leadTextures() {
  if (cache.lead) return cache.lead;
  const s = 512; // 代表 4 米
  const seam = s / 6.5;
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const sx = x % seam;
    const dseam = Math.min(sx, seam - sx);
    const n = fbm(x / s * 6, y / s * 6, 6, 4, 41);
    const ox = fbm(x / s * 10, y / s * 3, 10, 3, 43);
    const sheet = Math.floor(y / (s / 3));
    const lap = (y % (s / 3)) < 3 ? 0.75 : 1;
    let k = 0.75 + n * 0.35;
    let R = 104, G = 106, B = 110;
    if (ox > 0.6) { const w = (ox - 0.6) * 2; R += w * 70; G += w * 72; B += w * 70; }
    R += (sheet % 2) * 4;
    let h = 0.5 + n * 0.1;
    if (dseam < 3) { h = 1.0 - dseam * 0.1; k *= 1.15; }
    o[0] = clamp(R * k * lap, 0, 255); o[1] = clamp(G * k * lap, 0, 255); o[2] = clamp(B * k * lap, 0, 255);
    return h * lap;
  });
  cache.lead = { map: tex(c), normalMap: heightToNormal(H, s, s, 4) };
  return cache.lead;
}

/* 民居屋顶：石板瓦 / 陶瓦 */
export function roofTileTextures(kind = 'slate') {
  const key = 'roof_' + kind;
  if (cache[key]) return cache[key];
  const s = 512; // 代表 4 米
  const rng = mulberry32(kind === 'slate' ? 55 : 77);
  const rows = 22, rh = s / rows;
  const offs = [], tints = [];
  for (let i = 0; i < rows; i++) { offs.push(rng() * 30); tints.push(Array.from({ length: 40 }, () => rng())); }
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const r = Math.floor(y / rh);
    const tw = kind === 'slate' ? s / 18 : s / 22;
    const xx = x + offs[r] + (r % 2) * tw * 0.5;
    const ti = Math.floor(xx / tw) % 40;
    const lx = (xx % tw) / tw, ly = (y % rh) / rh;
    const n = fbm(x / s * 8, y / s * 8, 8, 3, 61);
    const moss = fbm(x / s * 4, y / s * 4, 4, 3, 63);
    const t = tints[r][ti];
    let R, G, B;
    if (kind === 'slate') { R = 70 + t * 22; G = 76 + t * 22; B = 88 + t * 24; }
    else { R = 150 + t * 40; G = 82 + t * 26; B = 56 + t * 16; }
    let k = 0.75 + n * 0.4;
    let h = ly; // 每片瓦下缘最厚
    if (lx < 0.06 || lx > 0.96) { k *= 0.55; h *= 0.6; }
    if (ly > 0.9) k *= 0.6;
    if (moss > 0.62) { const m = (moss - 0.62) * 2.5; R = R * (1 - m) + 88 * m; G = G * (1 - m) + 96 * m; B = B * (1 - m) + 52 * m; }
    o[0] = clamp(R * k, 0, 255); o[1] = clamp(G * k, 0, 255); o[2] = clamp(B * k, 0, 255);
    return h + n * 0.2;
  });
  cache[key] = { map: tex(c), normalMap: heightToNormal(H, s, s, 3) };
  return cache[key];
}

/* 砂岩路面（腓力·奥古斯都时代铺设的巴黎石板路） */
export function pavingTextures() {
  if (cache.paving) return cache.paving;
  const s = 512; // 代表 4 米
  const rng = mulberry32(91);
  const rows = 18, rh = s / rows;
  const offs = Array.from({ length: rows }, () => rng() * 40);
  const tints = Array.from({ length: rows * 30 }, () => rng());
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const r = Math.floor(y / rh);
    const bw = s / 14;
    const xx = x + offs[r];
    const bi = Math.floor(xx / bw);
    const lx = (xx % bw) / bw, ly = (y % rh) / rh;
    const ex = Math.min(lx, 1 - lx) * bw, ey = Math.min(ly, 1 - ly) * rh;
    const e = Math.min(ex, ey);
    const t = tints[(r * 30 + (bi % 30)) % tints.length];
    const n = fbm(x / s * 10, y / s * 10, 10, 3, 93);
    const mud = fbm(x / s * 3, y / s * 3, 3, 4, 97);
    let R = 132 + t * 36, G = 118 + t * 30, B = 96 + t * 24;
    let k = 0.72 + n * 0.36;
    let h = Math.min(1, e / 6) * (0.8 + n * 0.2);
    if (e < 3) { R = 88; G = 78; B = 62; k = 0.9 + n * 0.2; }
    if (mud > 0.58) { const m = Math.min(1, (mud - 0.58) * 3); R = R * (1 - m) + 92 * m; G = G * (1 - m) + 78 * m; B = B * (1 - m) + 58 * m; h *= 1 - m * 0.6; }
    o[0] = clamp(R * k, 0, 255); o[1] = clamp(G * k, 0, 255); o[2] = clamp(B * k, 0, 255);
    return h;
  });
  cache.paving = { map: tex(c), normalMap: heightToNormal(H, s, s, 2.5) };
  return cache.paving;
}

/* 土地/草地 */
export function groundTextures() {
  if (cache.ground) return cache.ground;
  const s = 512; // 代表 8 米
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const n = fbm(x / s * 6, y / s * 6, 6, 5, 101);
    const g = fbm(x / s * 3, y / s * 3, 3, 4, 103);
    const f = valueNoise(x / 1.5, y / 1.5, s / 1.5, 107);
    const blade = valueNoise(x / 1.2, y / 5, s / 1.2, 109);
    const grass = clamp((g - 0.42) * 4, 0, 1);
    let R = 112 * (1 - grass) + 82 * grass;
    let G = 96 * (1 - grass) + 104 * grass;
    let B = 72 * (1 - grass) + 50 * grass;
    const k = 0.72 + n * 0.4 + (f - 0.5) * 0.12 + grass * (blade - 0.5) * 0.3;
    o[0] = clamp(R * k, 0, 255); o[1] = clamp(G * k, 0, 255); o[2] = clamp(B * k, 0, 255);
    return n + f * 0.3;
  });
  cache.ground = { map: tex(c), normalMap: heightToNormal(H, s, s, 2) };
  return cache.ground;
}

/* 木材（橡木：钟架、门、唱诗班座椅） */
export function woodTextures() {
  if (cache.wood) return cache.wood;
  const s = 256;
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const n = fbm(x / s * 2, y / s * 16, 2, 4, 121);
    const ring = Math.sin((x / s * 40 + n * 10) * Math.PI);
    const k = 0.72 + ring * 0.04 + n * 0.25;
    o[0] = clamp(110 * k, 0, 255); o[1] = clamp(72 * k, 0, 255); o[2] = clamp(42 * k, 0, 255);
    return ring * 0.1 + n * 0.5;
  });
  cache.wood = { map: tex(c), normalMap: heightToNormal(H, s, s, 0.8) };
  return cache.wood;
}

/* 灰泥墙 */
export function plasterTextures() {
  if (cache.plaster) return cache.plaster;
  const s = 256;
  const { c, H } = pixelLoop(s, s, (x, y, o) => {
    const n = fbm(x / s * 6, y / s * 6, 6, 5, 131);
    const k = 0.8 + n * 0.3;
    o[0] = clamp(210 * k, 0, 255); o[1] = clamp(196 * k, 0, 255); o[2] = clamp(168 * k, 0, 255);
    return n;
  });
  cache.plaster = { map: tex(c), normalMap: heightToNormal(H, s, s, 2) };
  return cache.plaster;
}

/* 中世纪民居立面图集：4×2 楼层单元 + 山墙单元
   单元 0-3: 楼上（木骨架 / 灰泥），4-5: 底层店铺，6: 底层石砌，7: 山墙 */
export function facadeAtlas() {
  if (cache.facade) return cache.facade;
  const cw = 256, chh = 160;
  const W = cw * 4, Hh = chh * 2;
  const c = canvas(W, Hh);
  const ctx = c.getContext('2d');
  const ec = canvas(W, Hh);
  const ectx = ec.getContext('2d');
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, Hh);
  const rng = mulberry32(2024);
  const plasterCols = ['#d8c9a3', '#cdb893', '#e2d6b8', '#c9ad86', '#d6c4a0', '#bfae8e'];
  const timberCols = ['#4a2e1c', '#5b3a22', '#6a3b24', '#3e2a1d'];

  function noiseFill(x0, y0, w, h, base, amt = 18) {
    ctx.fillStyle = base; ctx.fillRect(x0, y0, w, h);
    for (let i = 0; i < w * h / 18; i++) {
      const a = rng();
      ctx.fillStyle = a > 0.5 ? `rgba(255,255,255,${0.03 + rng() * 0.04})` : `rgba(0,0,0,${0.03 + rng() * 0.05})`;
      ctx.fillRect(x0 + rng() * w, y0 + rng() * h, 1 + rng() * 3, 1 + rng() * 3);
    }
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(40,30,20,${amt / 100})`);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
  }
  function beam(x1, y1, x2, y2, wd, col) {
    ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1 + wd / 2, y1); ctx.lineTo(x2 + wd / 2, y2); ctx.stroke();
  }
  function window_(x, y, w, h, shutters) {
    // 夜间灯光（约一半窗户亮着烛光）
    if (rng() < 0.55) {
      const g = ectx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#ffb050'); g.addColorStop(1, '#c86a20');
      ectx.fillStyle = g; ectx.fillRect(x, y, w, h);
      ectx.fillStyle = '#000'; ectx.fillRect(x + w / 2 - 1.5, y, 3, h); ectx.fillRect(x, y + h / 2 - 1.5, w, 3);
    }
    ctx.fillStyle = '#3a2a1e'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    // 铅条菱形小窗格
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#2c3a40'); g.addColorStop(1, '#151b1f');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120,130,120,0.55)'; ctx.lineWidth = 1;
    for (let k = -h; k < w + h; k += 7) {
      ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + k + h, y); ctx.lineTo(x + k, y + h); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,220,230,0.12)'; ctx.fillRect(x + 2, y + 2, w * 0.4, h * 0.3);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(x + w / 2 - 1.5, y, 3, h); ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
    if (shutters) {
      ctx.fillStyle = shutters; ctx.fillRect(x - 3 - w * 0.45, y - 2, w * 0.45, h + 4); ctx.fillRect(x + w + 3, y - 2, w * 0.45, h + 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - 3 - w * 0.45, y + k * h / 3); ctx.lineTo(x - 3, y + k * h / 3); ctx.stroke(); }
    }
    ctx.fillStyle = '#6b5a48'; ctx.fillRect(x - 5, y + h + 3, w + 10, 4);
  }

  for (let cell = 0; cell < 8; cell++) {
    const x0 = (cell % 4) * cw, y0 = Math.floor(cell / 4) * chh;
    const plaster = plasterCols[cell % plasterCols.length];
    const timber = timberCols[cell % timberCols.length];
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, cw, chh); ctx.clip();
    if (cell < 4) {
      noiseFill(x0, y0, cw, chh, plaster);
      // 木骨架
      const posts = cell % 2 === 0 ? 5 : 4;
      const bw = 9;
      beam(x0, y0 + 5, x0 + cw, y0 + 5, 10, timber);
      beam(x0, y0 + chh - 6, x0 + cw, y0 + chh - 6, 12, timber);
      for (let p = 0; p <= posts; p++) {
        const px = x0 + 4 + p * (cw - 8) / posts;
        beam(px, y0, px, y0 + chh, bw, timber);
      }
      if (cell === 0 || cell === 2) {
        // 圣安德烈十字斜撑
        const px1 = x0 + 4, px2 = x0 + 4 + (cw - 8) / posts;
        beam(px1, y0 + 10, px2, y0 + chh - 10, 7, timber); beam(px2, y0 + 10, px1, y0 + chh - 10, 7, timber);
        const qx1 = x0 + 4 + (posts - 1) * (cw - 8) / posts, qx2 = x0 + cw - 4;
        beam(qx1, y0 + 10, qx2, y0 + chh - 10, 7, timber); beam(qx2, y0 + 10, qx1, y0 + chh - 10, 7, timber);
      }
      if (cell === 1 || cell === 3) {
        beam(x0, y0 + chh * 0.72, x0 + cw, y0 + chh * 0.72, 7, timber);
        for (let p = 0; p < posts; p++) {
          const px = x0 + 4 + p * (cw - 8) / posts;
          beam(px, y0 + chh * 0.72, px + (cw - 8) / posts / 2, y0 + chh - 10, 5, timber);
          beam(px + (cw - 8) / posts, y0 + chh * 0.72, px + (cw - 8) / posts / 2, y0 + chh - 10, 5, timber);
        }
      }
      // 窗户
      const nw = cell === 3 ? 3 : 2;
      for (let k = 0; k < nw; k++) {
        const wx = x0 + cw * (k + 0.5) / nw - 20;
        window_(wx, y0 + 34, 40, 62, rng() > 0.5 ? (rng() > 0.5 ? '#5a3a24' : '#3f4f3a') : null);
      }
    } else if (cell < 6) {
      // 底层店铺：石砌门洞 + 木质摊板 + 招牌
      noiseFill(x0, y0, cw, chh, '#a69a84', 25);
      ctx.strokeStyle = 'rgba(60,50,40,0.35)'; ctx.lineWidth = 1.5;
      for (let r = 0; r < 8; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + r * 20); ctx.lineTo(x0 + cw, y0 + r * 20); ctx.stroke(); }
      for (let r = 0; r < 8; r++) for (let k = 0; k < 6; k++) { const bx = x0 + k * 48 + (r % 2) * 24; ctx.beginPath(); ctx.moveTo(bx, y0 + r * 20); ctx.lineTo(bx, y0 + r * 20 + 20); ctx.stroke(); }
      // 拱形店门
      const ax = x0 + 30, aw = 120, ay = y0 + 40;
      ctx.fillStyle = '#1d1712';
      ctx.beginPath(); ctx.moveTo(ax, y0 + chh); ctx.lineTo(ax, ay + 30); ctx.quadraticCurveTo(ax + aw / 2, ay - 20, ax + aw, ay + 30); ctx.lineTo(ax + aw, y0 + chh); ctx.fill();
      // 摊板
      ctx.fillStyle = cell === 4 ? '#6a4a2a' : '#5a3d22'; ctx.fillRect(ax - 6, y0 + chh - 52, aw + 12, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(ax - 6, y0 + chh - 40, aw + 12, 4);
      // 货物（布匹/面包/陶罐）
      const goods = cell === 4 ? ['#8b2b22', '#2f4d7a', '#b88a2e', '#5d6b2c'] : ['#c49a5a', '#a87a3e', '#d2b07a'];
      for (let g = 0; g < 7; g++) { ctx.fillStyle = goods[g % goods.length]; ctx.fillRect(ax + 4 + g * 16, y0 + chh - 64, 12, 12); }
      // 门
      ctx.fillStyle = '#4b3020'; ctx.fillRect(x0 + 170, y0 + 60, 56, chh - 60);
      ctx.strokeStyle = '#2b1a10'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x0 + 170 + k * 14, y0 + 60); ctx.lineTo(x0 + 170 + k * 14, y0 + chh); ctx.stroke(); }
      ctx.fillStyle = '#222'; ctx.fillRect(x0 + 175, y0 + 80, 46, 3); ctx.fillRect(x0 + 175, y0 + 130, 46, 3);
      // 招牌
      ctx.fillStyle = '#2a2018'; ctx.fillRect(x0 + 150, y0 + 14, 3, 26);
      ctx.fillStyle = cell === 4 ? '#b8862b' : '#7a2620';
      ctx.beginPath(); ctx.arc(x0 + 151, y0 + 46, 11, 0, Math.PI * 2); ctx.fill();
    } else if (cell === 6) {
      noiseFill(x0, y0, cw, chh, '#b0a48c', 22);
      ctx.strokeStyle = 'rgba(60,50,40,0.4)'; ctx.lineWidth = 1.5;
      for (let r = 0; r < 8; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + r * 20); ctx.lineTo(x0 + cw, y0 + r * 20); ctx.stroke(); }
      for (let r = 0; r < 8; r++) for (let k = 0; k < 6; k++) { const bx = x0 + k * 48 + (r % 2) * 24; ctx.beginPath(); ctx.moveTo(bx, y0 + r * 20); ctx.lineTo(bx, y0 + r * 20 + 20); ctx.stroke(); }
      // 尖拱门
      ctx.fillStyle = '#4b3020';
      ctx.beginPath(); ctx.moveTo(x0 + 98, y0 + chh); ctx.lineTo(x0 + 98, y0 + 75); ctx.quadraticCurveTo(x0 + 128, y0 + 30, x0 + 158, y0 + 75); ctx.lineTo(x0 + 158, y0 + chh); ctx.fill();
      ctx.fillStyle = '#1b1410'; ctx.beginPath(); ctx.arc(x0 + 146, y0 + 118, 3, 0, 7); ctx.fill();
      window_(x0 + 26, y0 + 50, 34, 44, null);
      window_(x0 + 196, y0 + 50, 34, 44, null);
    } else {
      // 山墙：灰泥 + 木骨架三角
      noiseFill(x0, y0, cw, chh, plasterCols[2], 10);
      const tb = timberCols[1];
      beam(x0 + cw / 2, y0, x0 + cw / 2, y0 + chh, 9, tb);
      beam(x0, y0 + chh - 6, x0 + cw, y0 + chh - 6, 10, tb);
      beam(x0 + cw * 0.25, y0 + chh * 0.5, x0 + cw * 0.75, y0 + chh * 0.5, 8, tb);
      beam(x0 + cw * 0.25, y0 + chh * 0.5, x0 + cw * 0.5, y0 + chh - 10, 6, tb);
      beam(x0 + cw * 0.75, y0 + chh * 0.5, x0 + cw * 0.5, y0 + chh - 10, 6, tb);
      window_(x0 + cw / 2 - 16, y0 + 58, 32, 40, null);
    }
    ctx.restore();
  }
  const t = tex(c, { repeat: false });
  cache.facade = { map: t, emissiveMap: tex(ec, { repeat: false }), cw: 1 / 4, ch: 1 / 2 };
  return cache.facade;
}

/* 13 世纪彩绘玻璃（尖顶长窗，圆形故事章节），4 种变体横向排列 */
export function lancetGlass() {
  if (cache.lancet) return cache.lancet;
  const cw = 128, chh = 512;
  const c = canvas(cw * 4, chh);
  const ctx = c.getContext('2d');
  const rng = mulberry32(1250);
  const palettes = [
    ['#0d2c8c', '#b3121b', '#e3b234', '#2f7a3a', '#6b2a7a', '#d9d2b0'],
    ['#9a0f17', '#14318f', '#e4a51f', '#1c6a54', '#cfc8a8', '#5b2380'],
    ['#123e9e', '#8c1418', '#d79b2b', '#7d2a86', '#3a7a2e', '#e8e0c0'],
    ['#22207a', '#b02a14', '#e8c04a', '#256e6e', '#ad3a70', '#cfc6a2'],
  ];
  for (let v = 0; v < 4; v++) {
    const x0 = v * cw;
    const pal = palettes[v];
    // 背景：蓝/红小块马赛克
    const q = 8;
    for (let y = 0; y < chh; y += q) for (let x = 0; x < cw; x += q) {
      const r = rng();
      ctx.fillStyle = r < 0.55 ? pal[0] : r < 0.8 ? pal[1] : r < 0.88 ? pal[4] : pal[2];
      ctx.fillRect(x0 + x, y, q, q);
      ctx.fillStyle = `rgba(255,255,255,${rng() * 0.12})`; ctx.fillRect(x0 + x, y, q, q);
    }
    // 圆形章节（故事圆框）
    const n = 5;
    for (let k = 0; k < n; k++) {
      const cy = chh * (k + 0.5) / n, cx = x0 + cw / 2, R = cw * 0.4;
      ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, 7); ctx.fill();
      ctx.fillStyle = pal[(k + v) % 2 ? 1 : 0]; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      // 抽象人物
      for (let f = 0; f < 2; f++) {
        const fx = cx + (f ? 10 : -12), fy = cy + 4;
        ctx.fillStyle = pal[3 + ((k + f) % 3)];
        ctx.beginPath(); ctx.moveTo(fx - 9, fy + 22); ctx.lineTo(fx - 5, fy - 8); ctx.lineTo(fx + 5, fy - 8); ctx.lineTo(fx + 9, fy + 22); ctx.fill();
        ctx.fillStyle = '#e9d9b0'; ctx.beginPath(); ctx.arc(fx, fy - 13, 5, 0, 7); ctx.fill();
        ctx.strokeStyle = pal[2]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy - 13, 7, 0, 7); ctx.stroke();
      }
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, 7); ctx.stroke();
    }
    // 铅条网格
    ctx.strokeStyle = 'rgba(10,10,10,0.85)'; ctx.lineWidth = 1.5;
    for (let y = 0; y < chh; y += q * 2) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + cw, y); ctx.stroke(); }
    // 铁质横档
    ctx.lineWidth = 4; ctx.strokeStyle = '#0a0a0a';
    for (let y = chh / 10; y < chh; y += chh / 5) { ctx.beginPath(); ctx.moveTo(x0, y + chh / 10); ctx.lineTo(x0 + cw, y + chh / 10); ctx.stroke(); }
    // 边框
    ctx.fillStyle = pal[5]; ctx.fillRect(x0, 0, 6, chh); ctx.fillRect(x0 + cw - 6, 0, 6, chh);
    ctx.fillStyle = '#111'; ctx.fillRect(x0 + 6, 0, 2, chh); ctx.fillRect(x0 + cw - 8, 0, 2, chh);
  }
  cache.lancet = tex(c, { repeat: false });
  return cache.lancet;
}

/* 玫瑰花窗：kind = west（圣母） | north（旧约，以蓝紫为主） | south（新约，红金为主）
   返回 { glow: 室内发光贴图, outside: 室外暗色贴图（含石质窗棂）, alpha } */
export function roseWindow(kind = 'west') {
  const key = 'rose_' + kind;
  if (cache[key]) return cache[key];
  const S = 1024, C = S / 2;
  const glow = canvas(S, S), out = canvas(S, S);
  const g = glow.getContext('2d'), o = out.getContext('2d');
  const rng = mulberry32(kind.length * 991);
  const pal = kind === 'north'
    ? ['#16247e', '#3a1e7a', '#5a2a8c', '#0e4a8e', '#c79a2c', '#7a1420', '#2e6a6a']
    : kind === 'south'
      ? ['#a3121c', '#c4421a', '#d9a22a', '#1a2c8a', '#6a1a6a', '#e0c070', '#2a6a3a']
      : ['#1b3596', '#a8151c', '#d8a532', '#4a2a8a', '#2d7040', '#d8d0b0', '#8a1a50'];
  // 1) 彩色玻璃马赛克底
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - C, dy = y - C, r = Math.hypot(dx, dy) / C, a = Math.atan2(dy, dx);
    const cell = Math.floor(r * 22) * 97 + Math.floor((a + Math.PI) * 18 * (0.5 + r));
    const h = (Math.sin(cell * 12.9898) * 43758.5453) % 1;
    const hv = Math.abs(h);
    const col = pal[Math.floor(hv * 4) % pal.length];
    const i = (y * S + x) * 4;
    const n = parseInt(col.slice(1), 16);
    const sh = 0.75 + valueNoise(x / 3, y / 3, S / 3, 3) * 0.45;
    img.data[i] = ((n >> 16) & 255) * sh; img.data[i + 1] = ((n >> 8) & 255) * sh; img.data[i + 2] = (n & 255) * sh;
    img.data[i + 3] = r <= 1 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  // 2) 同心环上的圆形/四叶章节
  const rings = [
    { r: 0.0, n: 1, size: 0.17 },
    { r: 0.33, n: 12, size: 0.085 },
    { r: 0.58, n: 24, size: 0.06 },
    { r: 0.83, n: 24, size: 0.075 },
  ];
  rings.forEach((ring, ri) => {
    for (let k = 0; k < ring.n; k++) {
      const a = (k + (ri === 3 ? 0.5 : 0)) / ring.n * Math.PI * 2 - Math.PI / 2;
      const cx = C + Math.cos(a) * ring.r * C, cy = C + Math.sin(a) * ring.r * C, R = ring.size * C;
      g.fillStyle = pal[2]; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, 7); g.fill();
      g.fillStyle = pal[(k + ri) % 2 === 0 ? 0 : 1]; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      // 人物剪影
      g.fillStyle = pal[3 + (k % 3)];
      g.beginPath(); g.moveTo(cx - R * 0.45, cy + R * 0.7); g.lineTo(cx - R * 0.2, cy - R * 0.2); g.lineTo(cx + R * 0.2, cy - R * 0.2); g.lineTo(cx + R * 0.45, cy + R * 0.7); g.fill();
      g.fillStyle = '#efe0b8'; g.beginPath(); g.arc(cx, cy - R * 0.38, R * 0.2, 0, 7); g.fill();
      g.strokeStyle = '#f0c040'; g.lineWidth = R * 0.07; g.beginPath(); g.arc(cx, cy - R * 0.38, R * 0.3, 0, 7); g.stroke();
    }
  });
  // 中央：圣母子（西）/ 基督（南）/ 圣母与先知（北）
  g.fillStyle = kind === 'south' ? '#d9a22a' : '#1b3596';
  g.beginPath(); g.arc(C, C, C * 0.14, 0, 7); g.fill();
  g.fillStyle = kind === 'south' ? '#a3121c' : '#2f56c8';
  g.beginPath(); g.moveTo(C - C * 0.08, C + C * 0.12); g.lineTo(C - C * 0.035, C - C * 0.03); g.lineTo(C + C * 0.035, C - C * 0.03); g.lineTo(C + C * 0.08, C + C * 0.12); g.fill();
  g.fillStyle = '#f2e2bc'; g.beginPath(); g.arc(C, C - C * 0.06, C * 0.03, 0, 7); g.fill();
  g.strokeStyle = '#ffd24a'; g.lineWidth = 6; g.beginPath(); g.arc(C, C - C * 0.06, C * 0.05, 0, 7); g.stroke();

  // 3) 石质窗棂（同时画在两张图上：室内为黑色铅/石剪影，室外为石色）
  function tracery(ctx, col, lw) {
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.lineWidth = lw * 2.2; ctx.beginPath(); ctx.arc(C, C, C * 0.985, 0, 7); ctx.stroke();
    ctx.lineWidth = lw * 1.4;
    [0.2, 0.46, 0.7].forEach(r => { ctx.beginPath(); ctx.arc(C, C, C * r, 0, 7); ctx.stroke(); });
    // 辐条（小圆柱）
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const r0 = k % 2 === 0 ? 0.2 : 0.46;
      ctx.lineWidth = lw; ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * C * r0, C + Math.sin(a) * C * r0);
      ctx.lineTo(C + Math.cos(a) * C * 0.97, C + Math.sin(a) * C * 0.97); ctx.stroke();
    }
    // 外圈尖拱
    for (let k = 0; k < 24; k++) {
      const a0 = k / 24 * Math.PI * 2, a1 = (k + 1) / 24 * Math.PI * 2, am = (a0 + a1) / 2;
      ctx.lineWidth = lw * 0.8; ctx.beginPath();
      ctx.moveTo(C + Math.cos(a0) * C * 0.72, C + Math.sin(a0) * C * 0.72);
      ctx.quadraticCurveTo(C + Math.cos(am) * C * 0.78, C + Math.sin(am) * C * 0.78, C + Math.cos(am) * C * 0.92, C + Math.sin(am) * C * 0.92);
      ctx.quadraticCurveTo(C + Math.cos(am) * C * 0.78, C + Math.sin(am) * C * 0.78, C + Math.cos(a1) * C * 0.72, C + Math.sin(a1) * C * 0.72);
      ctx.stroke();
    }
    // 章节框
    rings.forEach((ring, ri) => {
      for (let k = 0; k < ring.n; k++) {
        const a = (k + (ri === 3 ? 0.5 : 0)) / ring.n * Math.PI * 2 - Math.PI / 2;
        const cx = C + Math.cos(a) * ring.r * C, cy = C + Math.sin(a) * ring.r * C, R = ring.size * C;
        ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 7); ctx.stroke();
      }
    });
  }
  // 铅条细网
  g.strokeStyle = 'rgba(8,8,8,0.8)'; g.lineWidth = 1.2;
  for (let r = 0.05; r < 1; r += 0.045) { g.beginPath(); g.arc(C, C, C * r, 0, 7); g.stroke(); }
  for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2; g.beginPath(); g.moveTo(C + Math.cos(a) * C * 0.2, C + Math.sin(a) * C * 0.2); g.lineTo(C + Math.cos(a) * C, C + Math.sin(a) * C); g.stroke(); }
  tracery(g, '#0b0907', 10);
  // 室外：深色玻璃 + 浅石窗棂
  o.drawImage(glow, 0, 0);
  o.globalCompositeOperation = 'source-atop';
  o.fillStyle = 'rgba(18,20,26,0.82)'; o.fillRect(0, 0, S, S);
  o.globalCompositeOperation = 'source-over';
  const sky = o.createLinearGradient(0, 0, S, S);
  sky.addColorStop(0, 'rgba(160,180,200,0.18)'); sky.addColorStop(0.5, 'rgba(0,0,0,0)'); sky.addColorStop(1, 'rgba(160,180,200,0.1)');
  o.globalCompositeOperation = 'source-atop'; o.fillStyle = sky; o.fillRect(0, 0, S, S);
  o.globalCompositeOperation = 'source-over';
  tracery(o, '#cbbd9c', 12);
  tracery(g, '#0b0907', 0.1);
  cache[key] = { glow: tex(glow, { repeat: false }), outside: tex(out, { repeat: false }) };
  return cache[key];
}

/* 门楣浮雕（彩绘残迹）：judgment | virgin | anne
   返回 map + normalMap */
export function tympanum(kind = 'judgment') {
  const key = 'tymp_' + kind;
  if (cache[key]) return cache[key];
  const W = 512, Hh = 384;
  const col = canvas(W, Hh), hc = canvas(W, Hh);
  // 注意：浮雕法线在 512 宽度下生成
  const c = col.getContext('2d'), h = hc.getContext('2d');
  const rng = mulberry32(kind.length * 313);
  // 背景：褪色蓝色彩绘与石面
  c.fillStyle = '#b8ab8c'; c.fillRect(0, 0, W, Hh);
  h.fillStyle = '#202020'; h.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${rng() > 0.5 ? 255 : 0},${rng() > 0.5 ? 240 : 0},${rng() > 0.5 ? 220 : 0},0.04)`; c.fillRect(rng() * W, rng() * Hh, 2, 2); }
  const bands = [Hh * 0.0, Hh * 0.42, Hh * 0.72, Hh];
  // 横带分隔
  [bands[1], bands[2]].forEach(y => {
    c.fillStyle = '#9d8f70'; c.fillRect(0, y - 6, W, 12);
    h.fillStyle = '#909090'; h.fillRect(0, y - 6, W, 12);
  });
  // 背景蓝（彩绘残迹）
  c.fillStyle = 'rgba(48,72,120,0.45)';
  c.fillRect(0, 0, W, bands[1] - 6); c.fillRect(0, bands[1] + 6, W, bands[2] - bands[1] - 12);
  c.fillStyle = 'rgba(120,40,40,0.3)'; c.fillRect(0, bands[2] + 6, W, Hh - bands[2] - 6);

  function fig(x, y, hh, robe, opts = {}) {
    const w = hh * 0.36;
    // 颜色层
    const gr = c.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, shade(robe, 1.15)); gr.addColorStop(0.6, robe); gr.addColorStop(1, shade(robe, 0.65));
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(x - w * 0.6, y); c.quadraticCurveTo(x - w * 0.55, y - hh * 0.5, x - w * 0.3, y - hh * 0.78);
    c.lineTo(x + w * 0.3, y - hh * 0.78); c.quadraticCurveTo(x + w * 0.55, y - hh * 0.5, x + w * 0.6, y); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * w * 0.18, y - hh * 0.7); c.lineTo(x + k * w * 0.24, y); c.stroke(); }
    c.fillStyle = '#d9c6a0'; c.beginPath(); c.arc(x, y - hh * 0.87, hh * 0.1, 0, 7); c.fill();
    if (opts.halo) { c.strokeStyle = '#c9a23a'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y - hh * 0.88, hh * 0.15, 0, 7); c.stroke(); }
    if (opts.crown) { c.fillStyle = '#c9a23a'; c.fillRect(x - hh * 0.09, y - hh * 1.0, hh * 0.18, hh * 0.05); }
    if (opts.wings) { c.fillStyle = 'rgba(220,210,190,0.9)'; c.beginPath(); c.ellipse(x - w * 0.7, y - hh * 0.55, w * 0.3, hh * 0.3, 0.4, 0, 7); c.ellipse(x + w * 0.7, y - hh * 0.55, w * 0.3, hh * 0.3, -0.4, 0, 7); c.fill(); }
    if (opts.demon) { c.fillStyle = '#4a4036'; c.beginPath(); c.moveTo(x - 4, y - hh * 0.95); c.lineTo(x - 8, y - hh * 1.1); c.lineTo(x, y - hh * 0.97); c.lineTo(x + 8, y - hh * 1.1); c.lineTo(x + 4, y - hh * 0.95); c.fill(); }
    // 高度层
    const hg = h.createRadialGradient(x, y - hh * 0.45, 2, x, y - hh * 0.45, hh * 0.55);
    hg.addColorStop(0, '#f0f0f0'); hg.addColorStop(1, '#707070');
    h.fillStyle = hg;
    h.beginPath(); h.moveTo(x - w * 0.6, y); h.quadraticCurveTo(x - w * 0.55, y - hh * 0.5, x - w * 0.3, y - hh * 0.78);
    h.lineTo(x + w * 0.3, y - hh * 0.78); h.quadraticCurveTo(x + w * 0.55, y - hh * 0.5, x + w * 0.6, y); h.fill();
    const hh2 = h.createRadialGradient(x - 1, y - hh * 0.89, 1, x, y - hh * 0.87, hh * 0.1);
    hh2.addColorStop(0, '#ffffff'); hh2.addColorStop(1, '#808080');
    h.fillStyle = hh2; h.beginPath(); h.arc(x, y - hh * 0.87, hh * 0.1, 0, 7); h.fill();
    if (opts.wings) { h.fillStyle = '#b0b0b0'; h.beginPath(); h.ellipse(x - w * 0.7, y - hh * 0.55, w * 0.3, hh * 0.3, 0.4, 0, 7); h.ellipse(x + w * 0.7, y - hh * 0.55, w * 0.3, hh * 0.3, -0.4, 0, 7); h.fill(); }
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  const robes = ['#b9ab88', '#a89a78', '#8e6a5a', '#7c8aa0', '#b09a6a', '#a07a62'];
  if (kind === 'judgment') {
    // 下层：死者复活（掀开棺盖）
    for (let i = 0; i < 14; i++) { const x = 20 + i * 35; c.fillStyle = '#8f8266'; c.fillRect(x - 14, Hh - 20, 28, 14); h.fillStyle = '#b0b0b0'; h.fillRect(x - 14, Hh - 20, 28, 14); fig(x, Hh - 18, 50, robes[i % 6]); }
    // 中层：圣米迦勒称量灵魂，左为蒙福者，右为被魔鬼牵走的罪人
    fig(W / 2, bands[2] - 8, 90, '#c8b890', { halo: true, wings: true });
    c.strokeStyle = '#7a6a40'; c.lineWidth = 3; c.beginPath(); c.moveTo(W / 2 - 40, bands[2] - 60); c.lineTo(W / 2 + 40, bands[2] - 52); c.stroke();
    for (let i = 0; i < 6; i++) fig(40 + i * 32, bands[2] - 8, 70, robes[(i + 1) % 6], { crown: i % 3 === 0 });
    for (let i = 0; i < 6; i++) fig(W / 2 + 70 + i * 32, bands[2] - 8, 70, '#6a5a4a', { demon: i % 2 === 0 });
    // 上层：基督审判，左右为圣母与圣约翰、持刑具天使
    fig(W / 2, bands[1] - 10, 140, '#b8a070', { halo: true });
    c.strokeStyle = '#c9a23a'; c.lineWidth = 3; c.beginPath(); c.ellipse(W / 2, bands[1] - 80, 46, 80, 0, 0, 7); c.stroke();
    fig(W / 2 - 80, bands[1] - 10, 100, '#3a5a9a', { halo: true });
    fig(W / 2 + 80, bands[1] - 10, 100, '#9a5a3a', { halo: true });
    fig(W / 2 - 145, bands[1] - 10, 90, '#c8b890', { wings: true });
    fig(W / 2 + 145, bands[1] - 10, 90, '#c8b890', { wings: true });
  } else if (kind === 'virgin') {
    // 下层：先知与列王（约柜），中层：圣母安息与升天，上层：圣母加冕
    for (let i = 0; i < 7; i++) fig(36 + i * 72, Hh - 8, 80, robes[i % 6], { crown: i % 2 === 0 });
    c.fillStyle = '#8f8266'; c.fillRect(W / 2 - 60, bands[2] - 30, 120, 22);
    for (let i = 0; i < 12; i++) fig(30 + i * 41, bands[2] - 8, 70, robes[(i + 2) % 6], { halo: i === 6 });
    fig(W / 2 - 50, bands[1] - 10, 130, '#3a5a9a', { halo: true, crown: true });
    fig(W / 2 + 50, bands[1] - 10, 140, '#b8a070', { halo: true });
    fig(W / 2 - 160, bands[1] - 10, 100, '#c8b890', { wings: true });
    fig(W / 2 + 160, bands[1] - 10, 100, '#c8b890', { wings: true });
  } else {
    // 圣安娜门：圣母子坐像居中，主教与国王跪于两侧
    for (let i = 0; i < 9; i++) fig(30 + i * 56, Hh - 8, 80, robes[i % 6], { halo: i === 4 });
    for (let i = 0; i < 10; i++) fig(30 + i * 50, bands[2] - 8, 72, robes[(i + 3) % 6]);
    fig(W / 2, bands[1] - 10, 150, '#3a5a9a', { halo: true, crown: true });
    fig(W / 2 - 110, bands[1] - 10, 100, '#c8b890', { wings: true });
    fig(W / 2 + 110, bands[1] - 10, 100, '#c8b890', { wings: true });
    fig(W / 2 - 180, bands[1] - 10, 85, '#7a3a3a', { crown: true });
    fig(W / 2 + 180, bands[1] - 10, 85, '#6a5a4a');
  }
  // 由高度画布生成法线
  const hd = h.getImageData(0, 0, W, Hh).data;
  const Hf = new Float32Array(W * Hh);
  for (let i = 0; i < W * Hh; i++) Hf[i] = hd[i * 4] / 255;
  const map = tex(col, { repeat: false });
  cache[key] = { map, normalMap: heightToNormal(Hf, W, Hh, 6) };
  return cache[key];
}

/* 室内地面：大石板 + 墓碑铭文板 */
export function floorTextures() {
  if (cache.floor) return cache.floor;
  const s = 512; // 代表 6 米
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  const rng = mulberry32(333);
  const n = 6, b = s / n;
  const H = new Float32Array(s * s).fill(0.7);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const t = rng();
    const base = [158 + t * 30, 146 + t * 26, 122 + t * 22];
    ctx.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
    ctx.fillRect(i * b, j * b, b, b);
    for (let k = 0; k < 900; k++) { ctx.fillStyle = `rgba(${rng() > 0.5 ? 255 : 40},${rng() > 0.5 ? 250 : 35},${rng() > 0.5 ? 240 : 30},0.05)`; ctx.fillRect(i * b + rng() * b, j * b + rng() * b, 2 + rng() * 5, 2 + rng() * 5); }
    if (rng() < 0.07) {
      // 墓碑：刻线人像 + 铭文边框
      ctx.fillStyle = 'rgba(40,36,30,0.65)';
      ctx.strokeStyle = 'rgba(40,36,30,0.7)'; ctx.lineWidth = 2;
      ctx.strokeRect(i * b + 14, j * b + 10, b - 28, b - 20);
      ctx.font = `${b * 0.06}px serif`;
      ctx.fillText('HIC IACET', i * b + 22, j * b + 26);
      const cx = i * b + b / 2, cy = j * b + b / 2;
      ctx.beginPath(); ctx.arc(cx, cy - b * 0.22, b * 0.06, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - b * 0.1, cy + b * 0.33); ctx.lineTo(cx - b * 0.06, cy - b * 0.14); ctx.lineTo(cx + b * 0.06, cy - b * 0.14); ctx.lineTo(cx + b * 0.1, cy + b * 0.33); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - b * 0.16, cy - b * 0.32); ctx.lineTo(cx - b * 0.16, cy + b * 0.38); ctx.moveTo(cx + b * 0.16, cy - b * 0.32); ctx.lineTo(cx + b * 0.16, cy + b * 0.38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - b * 0.16, cy - b * 0.32); ctx.quadraticCurveTo(cx, cy - b * 0.48, cx + b * 0.16, cy - b * 0.32); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60,54,44,0.9)'; ctx.lineWidth = 3; ctx.strokeRect(i * b, j * b, b, b);
  }
  const hd = ctx.getImageData(0, 0, s, s).data;
  for (let i = 0; i < s * s; i++) H[i] = hd[i * 4] / 255;
  // 磨损光泽
  const g = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.7);
  g.addColorStop(0, 'rgba(255,250,235,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  cache.floor = { map: tex(c), normalMap: heightToNormal(H, s, s, 1.2) };
  return cache.floor;
}

/* 唱诗班围屏彩绘浮雕（14 世纪基督生平） */
export function choirRelief() {
  if (cache.choirRelief) return cache.choirRelief;
  const W = 1024, Hh = 256;
  const c = canvas(W, Hh), ctx = c.getContext('2d');
  const rng = mulberry32(1350);
  ctx.fillStyle = '#26406e'; ctx.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 400; i++) { ctx.fillStyle = '#c9a23a'; ctx.beginPath(); ctx.arc(rng() * W, rng() * Hh * 0.5, 1.5, 0, 7); ctx.fill(); }
  const scenes = 8;
  for (let s = 0; s < scenes; s++) {
    const x0 = s * W / scenes;
    ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x0 + 6, Hh); ctx.lineTo(x0 + 6, 70); ctx.quadraticCurveTo(x0 + W / scenes / 2, 10, x0 + W / scenes - 6, 70); ctx.lineTo(x0 + W / scenes - 6, Hh); ctx.stroke();
    for (let f = 0; f < 3; f++) {
      const fx = x0 + 30 + f * 34, fy = Hh - 14;
      const cols = ['#b02a24', '#e0d0a8', '#2f5a3a', '#c9a23a', '#6a3a7a'];
      ctx.fillStyle = cols[(s + f) % cols.length];
      ctx.beginPath(); ctx.moveTo(fx - 14, fy); ctx.lineTo(fx - 8, fy - 90); ctx.lineTo(fx + 8, fy - 90); ctx.lineTo(fx + 14, fy); ctx.fill();
      ctx.fillStyle = '#e6cfa6'; ctx.beginPath(); ctx.arc(fx, fy - 102, 11, 0, 7); ctx.fill();
      if (f === 1) { ctx.strokeStyle = '#e8c048'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx, fy - 102, 15, 0, 7); ctx.stroke(); }
    }
  }
  cache.choirRelief = tex(c, { repeat: true });
  return cache.choirRelief;
}

/* 墙上刻字 ἈΝΆΓΚΗ（雨果序言中的“命运”） */
export function inscriptionTex() {
  if (cache.ins) return cache.ins;
  const c = canvas(512, 256), ctx = c.getContext('2d');
  const st = stoneTextures();
  ctx.fillStyle = '#c4b694'; ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; ctx.fillRect(Math.random() * 512, Math.random() * 256, 3, 3); }
  ctx.font = 'bold 96px "Times New Roman", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(70,52,34,0.85)';
  ctx.fillText('ἈΝΆΓΚΗ', 256, 128);
  ctx.fillStyle = 'rgba(255,255,240,0.25)'; ctx.fillText('ἈΝΆΓΚΗ', 254, 126);
  void st;
  cache.ins = tex(c, { repeat: false });
  return cache.ins;
}

/* 挂毯 / 旗帜（愚人节装饰） */
export function bannerTex(i) {
  const key = 'banner' + i;
  if (cache[key]) return cache[key];
  const c = canvas(128, 256), ctx = c.getContext('2d');
  const cols = [['#8a1a1a', '#e2b33a'], ['#1d3a7a', '#e2c060'], ['#2a5a2a', '#e8d8a0'], ['#6a1a5a', '#e8c048']][i % 4];
  ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = cols[1];
  if (i % 2 === 0) {
    // 法兰西鸢尾花
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
      const cx = 22 + x * 42 + (y % 2) * 20, cy = 24 + y * 48;
      ctx.beginPath(); ctx.ellipse(cx, cy - 6, 4, 10, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - 8, cy, 4, 8, -0.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 8, cy, 4, 8, 0.8, 0, 7); ctx.fill();
      ctx.fillRect(cx - 9, cy + 5, 18, 3);
    }
  } else {
    ctx.fillRect(0, 100, 128, 30); ctx.fillRect(49, 0, 30, 256);
  }
  ctx.beginPath(); ctx.moveTo(0, 230); ctx.lineTo(32, 256); ctx.lineTo(64, 230); ctx.lineTo(96, 256); ctx.lineTo(128, 230); ctx.lineTo(128, 256); ctx.lineTo(0, 256); ctx.fillStyle = 'rgba(0,0,0,0)';
  cache[key] = tex(c, { repeat: false });
  return cache[key];
}

/* 柔和光晕（烛火 / 灯笼 / 光束） */
export function glowTex() {
  if (cache.glow) return cache.glow;
  const c = canvas(64, 64), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.25, 'rgba(255,200,120,0.6)'); g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  cache.glow = tex(c, { repeat: false });
  return cache.glow;
}

export function beamTex() {
  if (cache.beam) return cache.beam;
  const c = canvas(64, 256), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,240,210,0.0)'); g.addColorStop(0.1, 'rgba(255,240,210,0.7)'); g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = h; ctx.fillRect(0, 0, 64, 256);
  cache.beam = tex(c, { repeat: false });
  return cache.beam;
}

/* 门扇：橡木板 + 比斯科内（Biscornet）铁艺涡卷铰链 */
export function doorTex() {
  if (cache.door) return cache.door;
  const W = 256, Hh = 512;
  const c = canvas(W, Hh), ctx = c.getContext('2d');
  const rng = mulberry32(1230);
  for (let i = 0; i < 6; i++) {
    const x = i * W / 6;
    const t = rng();
    ctx.fillStyle = `rgb(${88 + t * 20},${56 + t * 12},${34 + t * 8})`;
    ctx.fillRect(x, 0, W / 6, Hh);
    for (let k = 0; k < 60; k++) { ctx.strokeStyle = `rgba(30,18,10,${0.1 + rng() * 0.15})`; ctx.beginPath(); const xx = x + rng() * W / 6; ctx.moveTo(xx, 0); ctx.lineTo(xx + (rng() - 0.5) * 6, Hh); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, 0, 2, Hh);
  }
  ctx.strokeStyle = '#1b1a19'; ctx.lineCap = 'round';
  function scroll(x, y, r, dir, depth) {
    if (depth <= 0 || r < 4) return;
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath(); ctx.arc(x, y, r, dir > 0 ? Math.PI : 0, dir > 0 ? Math.PI * 2.4 : -Math.PI * 1.4, dir < 0); ctx.stroke();
    scroll(x + dir * r * 1.3, y - r * 0.6, r * 0.6, -dir, depth - 1);
    scroll(x + dir * r * 1.1, y + r * 0.9, r * 0.5, dir, depth - 1);
  }
  for (const y of [90, 256, 420]) {
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W * 0.9, y); ctx.stroke();
    for (let k = 0; k < 4; k++) { scroll(30 + k * 55, y - 26, 18, 1, 3); scroll(30 + k * 55, y + 26, 16, -1, 3); }
  }
  for (let k = 0; k < 40; k++) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(rng() * W, rng() * Hh, 2.5, 0, 7); ctx.fill(); }
  cache.door = tex(c, { repeat: false });
  return cache.door;
}
