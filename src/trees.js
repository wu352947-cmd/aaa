// 树木：以交叉叶片卡片构成树冠（球面法线 → 体积感光照），适合俯视近景；实例化渲染
import * as THREE from 'three';
import * as T from './textures.js';

const PI = Math.PI;

function merge(list) {
  const g = new THREE.BufferGeometry();
  let n = 0;
  const parts = list.map((l) => (l.index ? l.toNonIndexed() : l));
  for (const l of parts) n += l.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const l of parts) {
    pos.set(l.attributes.position.array, o * 3);
    nor.set(l.attributes.normal.array, o * 3);
    uv.set(l.attributes.uv.array, o * 2);
    o += l.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

function sphericalNormals(g, center, up = 0.35) {
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * 0.8 + up, p.getZ(i) - center.z).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

function card(w, h, sway = false) {
  const q = new THREE.PlaneGeometry(w, h, 1, sway ? 3 : 1);
  return q;
}

function trunkGeo(r, seed, height, lean, branches, branchLen, lite = false) {
  const out = [];
  const tg = new THREE.CylinderGeometry(r * 0.55, r, height, lite ? 5 : 7, lite ? 1 : 3);
  tg.translate(0, height / 2, 0);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) / height;
    tp.setX(i, tp.getX(i) + y * y * lean * height * 0.5 + Math.sin(y * 7 + seed) * r * 0.25);
    tp.setZ(i, tp.getZ(i) + Math.cos(y * 5 + seed) * r * 0.2);
  }
  tg.computeVertexNormals();
  out.push(tg);
  const r2 = T.rng(seed + 5);
  const top = new THREE.Vector3(lean * height * 0.5, height, 0);
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * PI * 2 + r2() * 0.8;
    const el = 0.5 + r2() * 0.5;
    const start = top.clone().multiplyScalar(0.7 + r2() * 0.3);
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().add(new THREE.Vector3(Math.cos(a) * branchLen * 0.5, branchLen * el * 0.6, Math.sin(a) * branchLen * 0.5)),
      start.clone().add(new THREE.Vector3(Math.cos(a) * branchLen, branchLen * el, Math.sin(a) * branchLen)),
    ]);
    out.push(new THREE.TubeGeometry(curve, lite ? 2 : 4, r * 0.32, lite ? 3 : 4, false));
  }
  return { geos: out, top };
}

// 阔叶树（香樟/桂花/榉树）
export function broadleafTree(seed, { height = 4, crownR = 3.2, crownH = 2.6, cards = 46, cardSize = 2.2, lite = false } = {}) {
  const r = T.rng(seed);
  const tr = trunkGeo(0.32, seed, height, (r() - 0.5) * 0.15, lite ? 2 : 4, crownR * 0.7, lite);
  const crown = [];
  const center = new THREE.Vector3(tr.top.x, height + crownH * 0.55, 0);
  for (let i = 0; i < cards; i++) {
    // 椭球内随机分布（偏向外壳）
    const u = r() * 2 - 1, th = r() * PI * 2, rad = Math.pow(r(), 0.35);
    const s = Math.sqrt(1 - u * u);
    const p = new THREE.Vector3(Math.cos(th) * s * crownR * rad, u * crownH * rad, Math.sin(th) * s * crownR * rad).add(center);
    const q = card(cardSize * (0.75 + r() * 0.5), cardSize * (0.75 + r() * 0.5));
    q.rotateX((r() - 0.5) * PI);
    q.rotateY(r() * PI * 2);
    q.rotateZ((r() - 0.5) * 0.8);
    q.translate(p.x, p.y, p.z);
    crown.push(q);
  }
  const cg = merge(crown);
  sphericalNormals(cg, center);
  const uv = cg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i)); // 不摆动标记在 uv2 中不需要
  return { trunk: merge(tr.geos), crown: cg, crownTop: center.y + crownH };
}

// 垂柳：穹顶状树冠，柳丝从冠面各处垂下，外圈更长
export function willowTree(seed, { height = 4.6, strands = 64, lite = false } = {}) {
  const r = T.rng(seed);
  const lean = 0.12 + r() * 0.22;
  const tr = trunkGeo(0.36, seed, height, lean, lite ? 2 : 4, 2.4, lite);
  const C = new THREE.Vector3(tr.top.x, height + 1.6, 0);
  const Rd = 3.0 + r() * 0.8, Rv = 1.8;
  const top = [];
  for (let i = 0; i < (lite ? 12 : 22); i++) {
    const th = r() * PI * 2, ph = Math.sqrt(r()) * 1.1;
    const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * Rd * 0.9, Math.cos(ph) * Rv, Math.sin(ph) * Math.sin(th) * Rd * 0.9).add(C);
    const q = card(1.8 + r() * 0.8, 1.4 + r() * 0.6);
    q.rotateX(-PI / 2 + (r() - 0.5) * 1.2);
    q.rotateY(r() * PI * 2);
    q.translate(p.x, p.y, p.z);
    top.push(q);
  }
  const tg = merge(top);
  sphericalNormals(tg, C, 0.5);
  const hang = [];
  for (let i = 0; i < strands; i++) {
    const th = r() * PI * 2, ph = 0.25 + Math.pow(r(), 0.6) * 1.15;
    const sp = Math.sin(ph);
    const p = new THREE.Vector3(sp * Math.cos(th) * Rd, Math.cos(ph) * Rv, sp * Math.sin(th) * Rd).add(C);
    const h = Math.min(p.y - 1.2, 2.0 + sp * 4.2 + r() * 1.6);
    const w = 0.7 + r() * 0.6;
    const q = card(w, h, true);
    const qp = q.attributes.position;
    for (let k = 0; k < qp.count; k++) {
      const yy = (qp.getY(k) + h / 2) / h;
      qp.setZ(k, (1 - yy) * (1 - yy) * 0.45);
    }
    q.translate(0, -h / 2, 0);
    // 朝向：大致切向，带随机扰动，使外表面不呈规则圆柱
    q.rotateY(-th + PI / 2 + (r() - 0.5) * 1.4);
    q.translate(p.x, p.y + 0.15, p.z);
    hang.push(q);
  }
  const hg = merge(hang);
  const p = hg.attributes.position, n = hg.attributes.normal;
  for (let k = 0; k < p.count; k++) {
    const v = new THREE.Vector3(p.getX(k) - C.x, 0, p.getZ(k) - C.z).normalize();
    v.y = 0.7; v.normalize();
    n.setXYZ(k, v.x, v.y, v.z);
  }
  return { trunk: merge(tr.geos), crown: tg, strands: hg };
}

export function leafTexture({ size = 256, seed = 7, tone = [74, 104, 50], spread = 0.46, count = 520, leafW = 5, leafH = 2.4 } = {}) {
  const c = T.canvas(size);
  const ctx = c.getContext('2d');
  const r = T.rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * PI * 2, d = Math.pow(r(), 0.7) * size * spread;
    const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d * 0.9;
    const k = 0.55 + r() * 0.7 - (d / (size * spread)) * 0.15;
    ctx.fillStyle = `rgb(${Math.round(tone[0] * k)},${Math.round(tone[1] * k)},${Math.round(tone[2] * k)})`;
    ctx.beginPath(); ctx.ellipse(x, y, leafW * (0.6 + r() * 0.7), leafH * (0.6 + r() * 0.7), r() * PI, 0, PI * 2); ctx.fill();
  }
  // 少量枝条
  ctx.strokeStyle = 'rgba(60,46,34,0.8)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(size / 2, size / 2);
    const a = r() * PI * 2; ctx.lineTo(size / 2 + Math.cos(a) * size * 0.3, size / 2 + Math.sin(a) * size * 0.3); ctx.stroke();
  }
  const t = T.tex(c, { wrap: false });
  return t;
}

export function strandTexture({ w = 128, h = 512, seed = 3 } = {}) {
  const c = T.canvas(w, h);
  const ctx = c.getContext('2d');
  const r = T.rng(seed);
  for (let i = 0; i < 15; i++) {
    const x0 = 6 + r() * (w - 12);
    const len = h * (0.45 + r() * 0.55);
    const sway = (r() - 0.5) * 12;
    const g = 0.8 + r() * 0.35;
    ctx.strokeStyle = `rgba(${Math.round(120 * g)},${Math.round(130 * g)},${Math.round(70 * g)},0.85)`;
    ctx.lineWidth = 0.9;
    const X = (y) => x0 + sway * (y / len) * (y / len) + Math.sin(y * 0.025 + i) * 1.6;
    ctx.beginPath();
    for (let y = 0; y < len; y += 4) { if (y === 0) ctx.moveTo(X(y), y); else ctx.lineTo(X(y), y); }
    ctx.stroke();
    for (let y = 3; y < len; y += 2.5 + r() * 2.5) {
      const k = 0.75 + r() * 0.45;
      ctx.fillStyle = `rgba(${Math.round(168 * k)},${Math.round(192 * k)},${Math.round(92 * k)},1)`;
      const side = r() > 0.5 ? 1 : -1;
      ctx.beginPath(); ctx.ellipse(X(y) + side * 1.8, y, 0.9, 3.2, side * 0.45, 0, PI * 2); ctx.fill();
    }
  }
  return T.tex(c, { wrap: false });
}
