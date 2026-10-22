// 几何构建工具：按材质合并几何体（大幅减少移动端 draw call），
// 并对石材类表面使用世界坐标盒式投影 UV，保证纹理尺度处处一致。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

function boxUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z * Math.sign(n.getX(i) || 1); v = y; }
    else { u = -x * Math.sign(n.getZ(i) || 1); v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Builder {
  constructor() { this.parts = new Map(); this.count = 0; }

  add(key, geo, matrix = null, opts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    if (!opts.keepUV) boxUV(g, opts.uvScale ?? 0.25);
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    this.count += g.attributes.position.count;
    return this;
  }

  // 以最小/最大角点定义的轴对齐盒体
  box(key, x0, y0, z0, x1, y1, z1, opts) {
    const g = unitBox();
    return this.add(key, g, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), opts);
  }

  // 中心、尺寸、绕 Y 旋转的盒体
  boxC(key, cx, cy, cz, sx, sy, sz, ry = 0, opts) {
    return this.add(key, unitBox(), M(cx, cy, cz, 0, ry, 0, sx, sy, sz), opts);
  }

  cyl(key, x, y0, z, r, h, seg = 12, rTop = null, opts) {
    const g = new THREE.CylinderGeometry(rTop ?? r, r, h, seg, 1);
    return this.add(key, g, M(x, y0 + h / 2, z), opts);
  }

  build(materials, parent, { cast = true, receive = true, name = '' } = {}) {
    const meshes = [];
    for (const [key, list] of this.parts) {
      const mat = materials[key];
      if (!mat) { console.warn('缺少材质', key); continue; }
      // 分批合并，避免单个缓冲区过大
      const CH = 60000;
      let batch = [], cnt = 0;
      const flush = () => {
        if (!batch.length) return;
        const merged = mergeGeometries(batch, false);
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast && !mat.userData.noShadow;
        mesh.receiveShadow = receive;
        mesh.name = name + ':' + key;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        meshes.push(mesh);
        batch = []; cnt = 0;
      };
      for (const g of list) {
        batch.push(g); cnt += g.attributes.position.count;
        if (cnt > CH * 3) flush();
      }
      flush();
      list.forEach(g => g.dispose());
    }
    this.parts.clear();
    return meshes;
  }
}

let _ub = null;
export function unitBox() { return _ub || (_ub = new THREE.BoxGeometry(1, 1, 1)); }

/* ---------- 哥特尖拱 ---------- */
// 返回尖拱轮廓点（从左下起，逆时针绕至右下）；k=1 等边尖拱，k=0.5 半圆拱
export function archPoints(w, spring, k = 1, seg = 10, base = 0) {
  const a = w / 2, r = Math.max(a, k * w);
  const pts = [new THREE.Vector2(-a, base)];
  if (spring > base) pts.push(new THREE.Vector2(-a, spring));
  for (let i = 1; i <= seg; i++) {
    const x = -a + a * i / seg;
    pts.push(new THREE.Vector2(x, spring + Math.sqrt(Math.max(0, r * r - (x - (r - a)) ** 2))));
  }
  for (let i = 1; i <= seg; i++) {
    const x = a * i / seg;
    pts.push(new THREE.Vector2(x, spring + Math.sqrt(Math.max(0, r * r - (x - (a - r)) ** 2))));
  }
  if (spring > base) pts.push(new THREE.Vector2(a, base));
  return pts;
}
export function archApex(w, k = 1) {
  const a = w / 2, r = Math.max(a, k * w);
  return Math.sqrt(r * r - (r - a) ** 2);
}

// 带洞口的墙（局部坐标：x 沿墙长 0..len，y 向上，z 为厚度居中）
// holes: [{x(中心), y(底), w, spring(相对底的起拱高度), k, type:'arch'|'circle', r}]
export function wallWithOpenings(len, height, thick, holes = [], outline = null) {
  const shape = new THREE.Shape(outline || [
    new THREE.Vector2(0, 0), new THREE.Vector2(len, 0), new THREE.Vector2(len, height), new THREE.Vector2(0, height),
  ]);
  for (const h of holes) {
    const path = new THREE.Path();
    if (h.type === 'circle') {
      path.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true);
    } else {
      const pts = archPoints(h.w, h.spring, h.k ?? 1, 8).map(p => new THREE.Vector2(p.x + h.x, p.y + h.y));
      path.setFromPoints(pts.reverse());
    }
    shape.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -thick / 2);
  return g;
}

export function extrude(points, depth, holes = []) {
  const shape = new THREE.Shape(points);
  holes.forEach(h => shape.holes.push(new THREE.Path(h)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// 沿尖拱的线脚（圆管），局部 xy 平面
export function archMolding(w, spring, k = 1, radius = 0.12, withJambs = true, base = 0, seg = 12) {
  const pts = archPoints(w, spring, k, seg, base);
  const list = withJambs ? pts : pts.slice(1, -1);
  const curve = new THREE.CatmullRomCurve3(list.map(p => new THREE.Vector3(p.x, p.y, 0)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(8, Math.round(list.length * 1.6)), radius, radius > 0.13 ? 5 : 4, false);
}

// 平面尖拱面（用于玻璃/门楣），UV 归一化到外接矩形，可映射到图集单元
export function archPlane(w, spring, k = 1, cell = null) {
  const pts = archPoints(w, spring, k, 12);
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const top = spring + archApex(w, k);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let u = (p.getX(i) + w / 2) / w, v = p.getY(i) / top;
    if (cell) { u = cell.u0 + u * cell.du; v = cell.v0 + v * cell.dv; }
    uv.setXY(i, u, v);
  }
  return g;
}

/* ---------- 雕像（车削长袍 + 头部 + 冠冕） ---------- */
const statueCache = {};
export function statueGeometry(kind = 'saint') {
  if (statueCache[kind]) return statueCache[kind];
  const parts = [];
  const prof = [
    [0.0, 0], [0.34, 0], [0.36, 0.08], [0.3, 0.5], [0.27, 1.0], [0.24, 1.3], [0.27, 1.45], [0.2, 1.55], [0.11, 1.6], [0.0, 1.62],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  if (kind === 'small') {
    // 拱券上的小型人像（低面数）
    parts.push(new THREE.LatheGeometry(prof, 6));
    const hd = new THREE.SphereGeometry(0.14, 6, 4); hd.translate(0, 1.74, 0); parts.push(hd);
    const g0 = mergeGeometries(parts.map(p => clean(p)));
    statueCache[kind] = g0;
    return g0;
  }
  const robe = new THREE.LatheGeometry(prof, 10);
  parts.push(robe);
  const head = new THREE.SphereGeometry(0.13, 10, 8); head.translate(0, 1.75, 0.01); parts.push(head);
  // 衣褶：几条竖向圆柱
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI - Math.PI / 2;
    const f = new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5); f.translate(Math.sin(a) * 0.29, 0.55, Math.cos(a) * 0.29); parts.push(f);
  }
  // 手臂与手持物
  const arm = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6); arm.rotateX(-1.1); arm.translate(0.12, 1.2, 0.22); parts.push(arm);
  if (kind === 'king') {
    const crown = new THREE.CylinderGeometry(0.15, 0.13, 0.12, 8, 1, true); crown.translate(0, 1.92, 0.01); parts.push(crown);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const p = new THREE.ConeGeometry(0.04, 0.1, 4); p.translate(Math.cos(a) * 0.14, 2.02, Math.sin(a) * 0.14); parts.push(p); }
    const sc = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4); sc.translate(-0.2, 1.3, 0.2); parts.push(sc);
    const orb = new THREE.SphereGeometry(0.07, 6, 5); orb.translate(0.14, 1.28, 0.42); parts.push(orb);
  } else if (kind === 'angel') {
    const w1 = new THREE.BoxGeometry(0.05, 0.9, 0.4); w1.rotateZ(0.3); w1.translate(-0.3, 1.25, -0.15); parts.push(w1);
    const w2 = new THREE.BoxGeometry(0.05, 0.9, 0.4); w2.rotateZ(-0.3); w2.translate(0.3, 1.25, -0.15); parts.push(w2);
  } else {
    const halo = new THREE.TorusGeometry(0.2, 0.025, 4, 14); halo.translate(0, 1.8, -0.1); parts.push(halo);
    const book = new THREE.BoxGeometry(0.2, 0.26, 0.06); book.translate(0.12, 1.15, 0.4); parts.push(book);
  }
  const plinth = new THREE.CylinderGeometry(0.38, 0.4, 0.15, 8); plinth.translate(0, 0.07, 0); parts.push(plinth);
  const g = mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)).map(p => { for (const n of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(n)) p.deleteAttribute(n); return p; }));
  statueCache[kind] = g;
  return g;
}

// 怪兽滴水嘴（中世纪的排水石兽）
let gargCache = null;
export function gargoyleGeometry() {
  if (gargCache) return gargCache;
  const parts = [];
  const body = new THREE.CylinderGeometry(0.22, 0.32, 2.0, 7); body.rotateX(Math.PI / 2); body.translate(0, 0, 1.0); parts.push(body);
  const head = new THREE.SphereGeometry(0.3, 8, 6); head.scale(1, 0.9, 1.3); head.translate(0, 0.08, 2.1); parts.push(head);
  const jaw = new THREE.ConeGeometry(0.2, 0.5, 6); jaw.rotateX(Math.PI / 2); jaw.translate(0, -0.08, 2.5); parts.push(jaw);
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.07, 0.3, 4); ear.translate(s * 0.15, 0.4, 2.0); parts.push(ear);
    const wing = new THREE.BoxGeometry(0.04, 0.5, 0.9); wing.rotateZ(s * 0.6); wing.translate(s * 0.35, 0.25, 0.9); parts.push(wing);
    const leg = new THREE.CylinderGeometry(0.06, 0.05, 0.5, 5); leg.translate(s * 0.18, -0.3, 1.6); parts.push(leg);
  }
  gargCache = mergeGeometries(parts.map(p => p.toNonIndexed()).map(p => { for (const n of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(n)) p.deleteAttribute(n); return p; }));
  return gargCache;
}

// 小尖塔（带卷叶饰的 pinnacle）
export function pinnacleGeometry(r = 0.5, h = 3) {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(r, r, h * 0.35, 4); shaft.rotateY(Math.PI / 4); shaft.translate(0, h * 0.175, 0); parts.push(shaft);
  const spire = new THREE.ConeGeometry(r * 1.0, h * 0.65, 4); spire.rotateY(Math.PI / 4); spire.translate(0, h * 0.35 + h * 0.325, 0); parts.push(spire);
  for (let i = 0; i < 3; i++) {
    const y = h * (0.45 + i * 0.15);
    const rr = r * (1 - (i + 0.5) * 0.28);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const c = new THREE.SphereGeometry(r * 0.14, 4, 3); c.translate(Math.cos(a) * rr, y, Math.sin(a) * rr); parts.push(c);
    }
  }
  const fin = new THREE.SphereGeometry(r * 0.25, 6, 4); fin.translate(0, h + r * 0.1, 0); parts.push(fin);
  return mergeGeometries(parts.map(p => p.toNonIndexed()).map(p => { for (const n of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(n)) p.deleteAttribute(n); return p; }));
}

// 将几何体转为仅含 position/normal/uv 的非索引几何
export function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
}
export { mergeGeometries };
export const tmp = { _m, _v, _s };
