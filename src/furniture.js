// 软装与家具：按房间布置。局部坐标约定：家具正面朝向 +Z，y=0 为地面。
import * as THREE from 'three';
import { Builder, roundedBox, scaleUV } from './builder.js';
import { addCurtain } from './apartment.js';
import { rng } from './textures.js';

const PI = Math.PI;
let R = rng(2024);
// 镜面位置（由 main.js 创建实时反射镜）
export const MIRRORS = [];

/* ======================= 基础几何 ======================= */
function leafShape(len = 0.3, wid = 0.18, tip = 0.5) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid * 0.6, len * 0.1, wid * 0.55, len * (0.4 + tip * 0.3), 0, len);
  s.bezierCurveTo(-wid * 0.55, len * (0.4 + tip * 0.3), -wid * 0.6, len * 0.1, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  // 叶面轻微弯曲
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -Math.abs(x) * 0.35 + Math.sin((y / len) * PI) * len * 0.08);
  }
  g.computeVertexNormals();
  return g;
}
const LEAF = { fig: null, long: null, small: null, bamboo: null };
function leaves() {
  if (!LEAF.fig) {
    LEAF.fig = leafShape(0.3, 0.22, 0.2);
    LEAF.long = leafShape(0.45, 0.09, 0.6);
    LEAF.small = leafShape(0.06, 0.035, 0.5);
    LEAF.bamboo = leafShape(0.16, 0.025, 0.7);
  }
  return LEAF;
}

function tube(B, mat, pts, r = 0.01, seg = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  B.add(new THREE.TubeGeometry(curve, seg, r, radial, false), mat);
}

function lathe(B, mat, profile, x, y, z, seg = 32) {
  B.add(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat, x, y, z);
}

function contactShadow(B, M, x, z, w, d, y = 0.003, round = false) {
  B.quad(round ? M.blob : M.boxShadow, x, y, z, w, d, -PI / 2, 0, 0);
}

/* ======================= 通用家具 ======================= */
export function sofa(B, M, len = 3.0, dep = 1.0, mat = M.sofaFabric) {
  const segs = Math.max(2, Math.round(len / 1.0));
  const armW = 0.22;
  const seatW = (len - armW * 2) / segs;
  contactShadow(B, M, 0, 0, len + 0.25, dep + 0.25);
  // 底座（内退，悬浮感）
  B.box(M.walnutDark, 0, 0.0, 0, len - 0.12, 0.1, dep - 0.12);
  B.rbox(mat, 0, 0.1, -0.02, len, 0.24, dep, 0.04);
  // 扶手
  for (const s of [-1, 1]) B.rbox(mat, s * (len / 2 - armW / 2), 0.1, -0.02, armW, 0.52, dep, 0.06);
  // 坐垫
  for (let i = 0; i < segs; i++) {
    const x = -len / 2 + armW + seatW * (i + 0.5);
    B.rbox(mat, x, 0.34, 0.06, seatW - 0.015, 0.16, dep - 0.28, 0.06);
    // 靠垫（略向后倾）
    B.add(roundedBox(seatW - 0.03, 0.46, 0.2, 0.08), mat, x, 0.66, -dep / 2 + 0.2, -0.16, 0, 0);
  }
  B.rbox(mat, 0, 0.34, -dep / 2 + 0.07, len, 0.5, 0.16, 0.05);
  // 抱枕
  const pm = [M.velvetGreen, M.fabricBeige, M.fabricRust, M.fabricBlue];
  B.add(roundedBox(0.5, 0.48, 0.14, 0.07), pm[0], -len / 2 + armW + 0.32, 0.66, -dep / 2 + 0.36, -0.3, 0.25, 0);
  B.add(roundedBox(0.45, 0.42, 0.13, 0.07), pm[1], -len / 2 + armW + 0.72, 0.64, -dep / 2 + 0.38, -0.25, -0.1, 0.05);
  B.add(roundedBox(0.5, 0.48, 0.14, 0.07), pm[1], len / 2 - armW - 0.32, 0.66, -dep / 2 + 0.36, -0.3, -0.25, 0);
  B.add(roundedBox(0.4, 0.4, 0.12, 0.06), pm[2], len / 2 - armW - 0.7, 0.62, -dep / 2 + 0.4, -0.25, 0.12, -0.05);
  // 搭毯
  const g = new THREE.PlaneGeometry(0.6, 1.1, 8, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const zz = y > 0.1 ? 0 : (0.1 - y) * 0.2;
    p.setZ(i, Math.sin(p.getX(i) * 18) * 0.012 + zz);
  }
  g.computeVertexNormals();
  scaleUV(g, 0.6, 1.1);
  B.add(g, M.bedThrow, len / 2 - armW - 0.35, 0.52, 0.0, -PI / 2 + 0.25, 0, 0);
  B.collideC(0, 0, len, dep);
}

export function loungeChair(B, M, mat = M.fabricBeige, frame = M.walnut) {
  contactShadow(B, M, 0, 0, 0.95, 0.95, 0.003, true);
  // 实木框架
  for (const s of [-1, 1]) {
    tube(B, frame, [[s * 0.36, 0, 0.36], [s * 0.37, 0.4, 0.3], [s * 0.37, 0.58, 0.05], [s * 0.36, 0.62, -0.25], [s * 0.34, 0, -0.36]], 0.022, 24, 8);
    B.box(frame, s * 0.36, 0.58, -0.02, 0.06, 0.03, 0.62);
  }
  B.box(frame, 0, 0.18, 0.33, 0.72, 0.04, 0.04);
  B.box(frame, 0, 0.18, -0.33, 0.72, 0.04, 0.04);
  B.rbox(mat, 0, 0.2, 0.03, 0.64, 0.16, 0.62, 0.06);
  B.add(roundedBox(0.64, 0.62, 0.14, 0.06), mat, 0, 0.62, -0.29, -0.28, 0, 0);
  B.add(roundedBox(0.36, 0.28, 0.1, 0.05), M.velvetGreen, 0.0, 0.48, -0.16, -0.3, 0, 0);
  B.collideC(0, 0, 0.8, 0.8);
}

export function armchairRound(B, M, mat = M.velvetGreen) {
  contactShadow(B, M, 0, 0, 0.9, 0.9, 0.003, true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    B.cyl(M.brass, Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28, 0.012, 0.016, 0.18, 10);
  }
  B.add(new THREE.CylinderGeometry(0.4, 0.38, 0.22, 40), mat, 0, 0.29, 0);
  const back = new THREE.CylinderGeometry(0.42, 0.42, 0.42, 40, 1, true, PI * 0.15, PI * 1.7);
  B.add(back, mat, 0, 0.6, 0, 0, PI / 2 - 0.2 + PI, 0);
  B.add(new THREE.TorusGeometry(0.42, 0.06, 10, 40, PI * 1.7), mat, 0, 0.82, 0, PI / 2, 0, PI * 0.5 + 0.47 - 0.2 + PI);
  B.rbox(mat, 0, 0.4, 0.04, 0.6, 0.1, 0.56, 0.05);
  B.collideC(0, 0, 0.8, 0.8);
}

export function roundCoffeeTable(B, M) {
  contactShadow(B, M, 0, 0, 1.6, 1.6, 0.004, true);
  // 大圆几：大理石面 + 黄铜脚
  B.cyl(M.tvMarble, 0, 0.36, 0, 0.55, 0.55, 0.035, 48);
  B.cyl(M.brass, 0, 0.36, 0, 0.552, 0.552, 0.008, 48);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    tube(B, M.brass, [[Math.cos(a) * 0.4, 0.36, Math.sin(a) * 0.4], [Math.cos(a) * 0.46, 0.15, Math.sin(a) * 0.46], [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42]], 0.012, 10, 8);
  }
  // 小圆几：胡桃木
  B.cyl(M.walnut, 0.62, 0.0, 0.42, 0.3, 0.3, 0.06, 40);
  B.cyl(M.walnut, 0.62, 0.06, 0.42, 0.08, 0.12, 0.18, 24);
  B.cyl(M.walnut, 0.62, 0.24, 0.42, 0.32, 0.32, 0.03, 40);
  // 摆件：书、茶盘、花器
  B.box(M.paper, -0.18, 0.395, 0.05, 0.28, 0.035, 0.22, 0.3);
  B.box(M.fabricBlue, -0.18, 0.43, 0.05, 0.26, 0.03, 0.2, 0.35);
  B.box(M.paper, -0.18, 0.46, 0.05, 0.24, 0.025, 0.18, 0.25);
  B.box(M.walnutDark, 0.18, 0.395, -0.15, 0.42, 0.02, 0.26, -0.2);
  teaSet(B, M, 0.18, 0.415, -0.15, 0.6);
  lathe(B, M.celadon, [[0, 0], [0.06, 0.005], [0.08, 0.06], [0.05, 0.14], [0.025, 0.2], [0.03, 0.22], [0, 0.22]], 0.62, 0.27, 0.42);
  // 枝条
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    tube(B, M.stem, [[0.62, 0.48, 0.42], [0.62 + Math.cos(a) * 0.05, 0.62, 0.42 + Math.sin(a) * 0.05], [0.62 + Math.cos(a) * 0.12, 0.8, 0.42 + Math.sin(a) * 0.1]], 0.004, 8, 4);
    for (let j = 0; j < 5; j++) {
      const t = 0.3 + j * 0.15;
      B.add(leaves().small.clone(), M.leafLight, 0.62 + Math.cos(a) * 0.12 * t, 0.62 + 0.18 * t, 0.42 + Math.sin(a) * 0.1 * t, -0.6, a + j, 0.5);
    }
  }
  B.collideC(0.1, 0.1, 1.3, 1.25);
}

export function teaSet(B, M, x, y, z, s = 1) {
  B.push(x, y, z, 0, s);
  lathe(B, M.celadon, [[0, 0], [0.05, 0.002], [0.065, 0.04], [0.06, 0.07], [0.03, 0.085], [0.012, 0.1], [0, 0.1]], 0, 0, 0);
  B.add(new THREE.TorusGeometry(0.03, 0.006, 6, 16, PI), M.celadon, 0.07, 0.05, 0, 0, 0, -PI / 2);
  tube(B, M.celadon, [[-0.06, 0.04, 0], [-0.1, 0.07, 0], [-0.115, 0.09, 0]], 0.007, 6, 6);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    lathe(B, M.celadon, [[0, 0], [0.018, 0], [0.03, 0.035], [0.028, 0.04], [0, 0.005]], Math.cos(a) * 0.14, 0, Math.sin(a) * 0.12, 16);
  }
  B.pop();
}

export function floorLampArc(B, M) {
  contactShadow(B, M, 0, 0, 0.6, 0.6, 0.003, true);
  B.cyl(M.darkMarble, 0, 0, 0, 0.16, 0.16, 0.05, 32);
  tube(B, M.brass, [[0, 0.05, 0], [0, 1.2, 0], [0.15, 1.85, 0], [0.6, 2.05, 0], [1.0, 1.85, 0]], 0.012, 40, 8);
  const shade = new THREE.SphereGeometry(0.2, 32, 12, 0, PI * 2, 0, PI / 2);
  B.add(shade, M.brass, 1.0, 1.66, 0, PI, 0, 0);
  B.cyl(M.lampShade, 1.0, 1.66, 0, 0.17, 0.17, 0.004, 24);
  B.collideC(0, 0, 0.35, 0.35);
}

export function tableLamp(B, M, x, y, z, s = 1) {
  B.push(x, y, z, 0, s);
  lathe(B, M.blackCeramic, [[0, 0], [0.07, 0], [0.1, 0.08], [0.09, 0.22], [0.04, 0.3], [0.02, 0.34], [0, 0.34]], 0, 0, 0, 32);
  B.cyl(M.brass, 0, 0.34, 0, 0.006, 0.006, 0.12, 8);
  B.cyl(M.lampShade, 0, 0.42, 0, 0.13, 0.18, 0.22, 32, 0, 0, true);
  B.pop();
}

export function sideTable(B, M, mat = M.walnut) {
  contactShadow(B, M, 0, 0, 0.6, 0.6, 0.003, true);
  B.cyl(mat, 0, 0, 0, 0.18, 0.2, 0.03, 32);
  B.cyl(M.brass, 0, 0.03, 0, 0.02, 0.02, 0.5, 12);
  B.cyl(mat, 0, 0.53, 0, 0.24, 0.24, 0.025, 32);
  B.collideC(0, 0, 0.45, 0.45);
}

export function plantFig(B, M, h = 2.0, s = 1) {
  const L = leaves();
  contactShadow(B, M, 0, 0, 0.8, 0.8, 0.003, true);
  lathe(B, M.terracotta, [[0, 0], [0.2, 0], [0.24, 0.05], [0.26, 0.42], [0.24, 0.44], [0, 0.44]], 0, 0, 0, 32);
  B.cyl(M.soil, 0, 0.42, 0, 0.23, 0.23, 0.01, 24);
  tube(B, M.stem, [[0, 0.4, 0], [0.02, 0.9, 0.01], [-0.03, 1.4, 0.02], [0.02, h * 0.9, 0]], 0.025 * s, 16, 8);
  const r = rng(Math.floor(h * 100));
  for (let i = 0; i < 70; i++) {
    const t = 0.35 + r() * 0.65;
    const y = 0.4 + (h - 0.4) * t;
    const a = r() * PI * 2;
    const rad = 0.08 + Math.sin(t * PI) * 0.35 * s;
    B.add(L.fig.clone(), r() > 0.5 ? M.leaf : M.leafDark, Math.cos(a) * rad, y, Math.sin(a) * rad, -0.6 - r() * 0.8, -a + PI / 2, (r() - 0.5) * 0.6, s, s, s);
  }
  B.collideC(0, 0, 0.5, 0.5);
}

export function plantMonstera(B, M, s = 1) {
  const L = leaves();
  contactShadow(B, M, 0, 0, 0.9, 0.9, 0.003, true);
  lathe(B, M.white, [[0, 0], [0.18, 0], [0.22, 0.1], [0.22, 0.36], [0, 0.36]], 0, 0, 0, 32);
  B.cyl(M.soil, 0, 0.35, 0, 0.21, 0.21, 0.01, 24);
  const r = rng(77);
  for (let i = 0; i < 16; i++) {
    const a = r() * PI * 2, el = 0.5 + r() * 0.6;
    const len = (0.4 + r() * 0.5) * s;
    const ex = Math.cos(a) * Math.cos(el) * len, ez = Math.sin(a) * Math.cos(el) * len, ey = 0.36 + Math.sin(el) * len;
    tube(B, M.leaf, [[0, 0.36, 0], [ex * 0.5, ey * 0.9, ez * 0.5], [ex, ey, ez]], 0.006, 8, 5);
    B.add(leafShape(0.32 * s, 0.3 * s, 0.1), M.leafDark, ex, ey, ez, -0.4 - r() * 0.6, -a + PI / 2, 0);
  }
  B.collideC(0, 0, 0.5, 0.5);
}

export function orchid(B, M, x, y, z) {
  B.push(x, y, z);
  lathe(B, M.white, [[0, 0], [0.06, 0], [0.07, 0.12], [0, 0.12]], 0, 0, 0, 24);
  B.cyl(M.moss, 0, 0.115, 0, 0.065, 0.065, 0.01, 16);
  for (let i = 0; i < 4; i++) B.add(leafShape(0.14, 0.05, 0.3), M.leafDark, 0, 0.12, 0, -1.3, i * 1.6, 0);
  for (const s of [-1, 1]) {
    const pts = [[0, 0.12, 0], [s * 0.01, 0.35, 0], [s * 0.06, 0.48, 0.02], [s * 0.16, 0.5, 0.04]];
    tube(B, M.stem, pts, 0.003, 12, 4);
    for (let j = 0; j < 5; j++) {
      const t = 0.5 + j * 0.11;
      const px = s * (0.02 + 0.16 * (t - 0.4)), py = 0.42 + 0.08 * Math.sin(t * PI);
      for (let k = 0; k < 5; k++) B.add(leafShape(0.03, 0.03, 0.1), M.orchid, px, py, 0.03, 0, 0, (k / 5) * PI * 2);
    }
  }
  B.pop();
}

export function bonsai(B, M, x, y, z, s = 1) {
  B.push(x, y, z, 0, s);
  B.box(M.blackCeramic, 0, 0, 0, 0.5, 0.08, 0.32);
  B.box(M.moss, 0, 0.08, 0, 0.46, 0.01, 0.28);
  tube(B, M.stem, [[-0.05, 0.08, 0], [0.02, 0.18, 0.02], [-0.06, 0.3, -0.01], [0.08, 0.42, 0.0], [0.2, 0.46, 0.02]], 0.022, 20, 8);
  tube(B, M.stem, [[-0.04, 0.27, 0], [-0.16, 0.34, 0.03], [-0.24, 0.32, 0.04]], 0.012, 10, 6);
  const pads = [[0.2, 0.48, 0.02, 0.14], [-0.24, 0.35, 0.04, 0.1], [0.04, 0.55, -0.02, 0.12], [-0.08, 0.42, 0.05, 0.09]];
  for (const [px, py, pz, r] of pads) {
    for (let i = 0; i < 6; i++) B.sphere(i % 2 ? M.leafDark : M.moss, px + (R() - 0.5) * r, py + R() * 0.03, pz + (R() - 0.5) * r * 0.7, r * 0.45, 1.3, 0.45, 1.1, 10);
  }
  B.pop();
}

export function bambooPlanter(B, M, len = 1.8) {
  contactShadow(B, M, 0, 0, len + 0.2, 0.6);
  B.box(M.stoneGrey, 0, 0, 0, len, 0.5, 0.45);
  B.box(M.pebble, 0, 0.5, 0, len - 0.06, 0.01, 0.39);
  const L = leaves();
  const r = rng(Math.floor(len * 1000));
  for (let i = 0; i < Math.round(len * 5); i++) {
    const x = -len / 2 + 0.1 + r() * (len - 0.2), z = (r() - 0.5) * 0.3;
    const h = 1.8 + r() * 1.0;
    const lean = (r() - 0.5) * 0.12;
    B.cyl(M.fruitGreen, x, 0.5, z, 0.012, 0.016, h, 8, 0, lean);
    for (let k = 0; k < 4; k++) B.cyl(M.stem, x - lean * (0.4 + k * 0.3) * h * 0.5, 0.5 + h * (0.25 + k * 0.2), z, 0.017, 0.017, 0.01, 8);
    for (let j = 0; j < 18; j++) {
      const t = 0.45 + r() * 0.55;
      B.add(L.bamboo.clone(), r() > 0.4 ? M.leafLight : M.leaf, x - lean * h * t * 0.5 + (r() - 0.5) * 0.1, 0.5 + h * t, z + (r() - 0.5) * 0.1, -0.9 - r() * 0.9, r() * PI * 2, 0);
    }
  }
  B.collideC(0, 0, len, 0.45);
}

export function painting(B, M, mat, w, h, frame = M.walnutDark) {
  // 挂在墙上：局部 z=0 为墙面，画朝 +z
  B.box(frame, 0, -h / 2 - 0.03, 0.02, w + 0.06, h + 0.06, 0.04);
  B.box(M.paper, 0, -h / 2 - 0.0, 0.041, w - 0.0, h, 0.001);
  B.quad(mat, 0, 0, 0.043, w - 0.12, h - 0.12);
}

export function scroll(B, M, mat, w = 0.5, h = 1.6) {
  B.box(M.fabricBeige, 0, -h / 2 - 0.08, 0.008, w + 0.08, h + 0.2, 0.004);
  B.quad(mat, 0, 0, 0.012, w, h);
  B.cyl(M.rosewood, 0, h / 2 + 0.12, 0.02, 0.012, 0.012, w + 0.16, 12, 0, PI / 2);
  B.cyl(M.rosewood, 0, -h / 2 - 0.1, 0.02, 0.016, 0.016, w + 0.2, 12, 0, PI / 2);
}

export function vase(B, M, x, y, z, mat = M.celadon, s = 1, tall = false) {
  const prof = tall
    ? [[0, 0], [0.06, 0], [0.1, 0.08], [0.11, 0.2], [0.06, 0.36], [0.035, 0.42], [0.045, 0.46], [0, 0.46]]
    : [[0, 0], [0.07, 0], [0.12, 0.08], [0.12, 0.14], [0.06, 0.22], [0.05, 0.25], [0, 0.25]];
  B.push(x, y, z, 0, s); lathe(B, mat, prof, 0, 0, 0, 32); B.pop();
}

export function books(B, M, x, y, z, w = 0.4, ry = 0) {
  B.push(x, y, z, ry);
  let cx = -w / 2;
  const mats = [M.paper, M.fabricBlue, M.leather, M.fabricBeige, M.fabricGreen, M.lacquerBlack];
  while (cx < w / 2 - 0.02) {
    const bw = 0.018 + R() * 0.03, bh = 0.18 + R() * 0.1, bd = 0.14 + R() * 0.06;
    B.box(mats[Math.floor(R() * mats.length)], cx + bw / 2, 0, 0, bw, bh, bd);
    cx += bw + 0.002;
  }
  B.pop();
}

/* ======================= 客厅 ======================= */
function livingRoom(B, M) {
  // 沙发靠主卧墙，面向电视墙
  B.push(-2.85, 0, 3.0, PI / 2); sofa(B, M, 3.3, 1.05); B.pop();
  // 地毯
  B.quad(M.rugInk, -0.5, 0.006, 3.0, 4.2, 3.2, -PI / 2, 0, 0);
  // 茶几
  B.push(-0.85, 0, 3.0); roundCoffeeTable(B, M); B.pop();
  // 单椅
  B.push(0.9, 0, 4.7, -PI / 2 - 0.6); armchairRound(B, M); B.pop();
  B.push(0.9, 0, 1.4, -PI / 2 + 0.6); armchairRound(B, M, M.fabricBeige); B.pop();
  // 边几 + 台灯
  B.push(-2.85, 0, 0.95); sideTable(B, M); B.pop();
  tableLamp(B, M, -2.85, 0.555, 0.95, 0.9);
  B.push(-2.85, 0, 5.1); sideTable(B, M, M.tvMarble); B.pop();
  orchid(B, M, -2.85, 0.555, 5.1);
  // 落地灯
  B.push(-3.55, 0, 5.55, 0.9); floorLampArc(B, M); B.pop();
  // 沙发背景墙：山水画
  B.push(-3.94, 1.85, 3.0, PI / 2); painting(B, M, M.painting, 2.2, 1.1); B.pop();
  // 电视墙
  tvWall(B, M);
  // 窗边：两把休闲椅 + 茶几（看湖）
  B.push(1.7, 0, 1.15, PI + 0.35); loungeChair(B, M); B.pop();
  B.push(3.6, 0, 1.15, PI - 0.35); loungeChair(B, M, M.sofaFabric); B.pop();
  B.push(2.65, 0, 0.95); sideTable(B, M, M.walnutDark); B.pop();
  teaSet(B, M, 2.65, 0.555, 0.95, 0.55);
  // 角落植物
  B.push(4.35, 0, 0.85); plantFig(B, M, 2.2); B.pop();
  B.push(-3.45, 0, 0.85); plantMonstera(B, M, 0.9); B.pop();
  // 圆环吊灯
  B.add(new THREE.TorusGeometry(0.7, 0.018, 10, 80), M.brass, -0.85, 2.35, 3.0, PI / 2, 0, 0);
  B.add(new THREE.TorusGeometry(0.69, 0.01, 6, 80), M.lightStrip, -0.85, 2.338, 3.0, PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    B.cyl(M.steel, -0.85 + Math.cos(a) * 0.7, 2.35, 3.0 + Math.sin(a) * 0.7, 0.0015, 0.0015, 0.65, 4);
  }
}

function tvWall(B, M) {
  const x = 4.94;
  // 大理石背景墙（通铺岩板）
  B.box(M.tvMarble, x - 0.015, 0, 2.6, 0.03, 3.0, 3.9);
  // 两侧胡桃木格栅
  for (let z = 0.55; z < 0.66; z += 0.05) B.box(M.walnutDark, x - 0.03, 0, z, 0.04, 3.0, 0.03);
  for (let z = 4.56; z < 4.62; z += 0.05) B.box(M.walnutDark, x - 0.03, 0, z, 0.04, 3.0, 0.03);
  // 悬浮电视柜
  contactShadow(B, M, x - 0.25, 2.6, 0.7, 3.4);
  B.box(M.walnut, x - 0.24, 0.18, 2.6, 0.45, 0.36, 3.2);
  B.box(M.lightStrip, x - 0.3, 0.17, 2.6, 0.3, 0.008, 3.1);
  B.box(M.brass, x - 0.465, 0.42, 2.6, 0.004, 0.012, 3.18);
  for (const z of [1.6, 2.6, 3.6]) B.box(M.walnutDark, x - 0.466, 0.2, z, 0.002, 0.32, 0.004);
  B.collide(x - 0.5, 1.0, x, 4.2);
  // 85 寸电视
  B.box(M.blackMetal, x - 0.06, 1.0, 2.6, 0.04, 1.08, 1.9);
  B.box(M.screen, x - 0.082, 1.02, 2.6, 0.002, 1.04, 1.86);
  // 柜上摆件
  vase(B, M, x - 0.24, 0.54, 1.5, M.blueWhite, 1.1, true);
  books(B, M, x - 0.24, 0.54, 3.7, 0.3, PI / 2);
  B.box(M.darkMarble, x - 0.24, 0.54, 3.25, 0.18, 0.1, 0.18);
  // 落地音箱
  for (const z of [0.9, 4.3]) {
    B.box(M.walnutDark, x - 0.3, 0, z, 0.32, 1.1, 0.24);
    B.box(M.fabricGrey, x - 0.461, 0.08, z, 0.002, 0.95, 0.2);
    B.collideC(x - 0.3, z, 0.32, 0.24);
  }
}

/* ======================= 餐厅 ======================= */
function diningRoom(B, M) {
  const cx = -2.0, cz = 8.9;
  contactShadow(B, M, cx, cz, 3.2, 1.6);
  // 岩板餐桌 + 胡桃木基座
  B.box(M.tvMarble, cx, 0.72, cz, 2.6, 0.03, 1.1);
  B.box(M.walnutDark, cx, 0.7, cz, 2.5, 0.02, 1.0);
  for (const s of [-1, 1]) {
    B.box(M.walnut, cx + s * 0.85, 0, cz, 0.12, 0.7, 0.7);
    B.box(M.walnut, cx + s * 0.85, 0, cz, 0.5, 0.04, 0.8);
  }
  B.box(M.walnut, cx, 0.55, cz, 1.6, 0.06, 0.1);
  B.collideC(cx, cz, 2.6, 1.1);
  // 餐椅
  const chairPos = [];
  for (const sx of [-0.85, 0, 0.85]) { chairPos.push([cx + sx, cz - 0.82, 0]); chairPos.push([cx + sx, cz + 0.82, PI]); }
  chairPos.push([cx - 1.55, cz, PI / 2]); chairPos.push([cx + 1.55, cz, -PI / 2]);
  for (const [x, z, ry] of chairPos) { B.push(x, 0, z, ry); diningChair(B, M); B.pop(); }
  // 餐桌摆设：花器、餐具
  vase(B, M, cx, 0.75, cz, M.celadon, 1.3);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2;
    tube(B, M.stem, [[cx, 0.95, cz], [cx + Math.cos(a) * 0.12, 1.15, cz + Math.sin(a) * 0.08], [cx + Math.cos(a) * 0.3, 1.25, cz + Math.sin(a) * 0.15]], 0.005, 10, 4);
    for (let j = 0; j < 7; j++) B.sphere(M.orchid, cx + Math.cos(a) * 0.3 * (j / 7), 1.12 + 0.13 * (j / 7), cz + Math.sin(a) * 0.15 * (j / 7), 0.012, 1, 1, 1, 6);
  }
  for (const [x, z, ry] of chairPos) {
    const px = x + Math.sin(ry) * 0.45, pz = z + Math.cos(ry) * 0.45;
    if (Math.abs(px - cx) > 1.2) continue;
    B.cyl(M.ceramic, px, 0.751, pz, 0.14, 0.14, 0.012, 32);
    B.cyl(M.ceramic, px, 0.763, pz, 0.1, 0.09, 0.012, 32);
    B.box(M.steel, px + 0.18, 0.751, pz, 0.015, 0.004, 0.18);
    B.box(M.steel, px - 0.18, 0.751, pz, 0.015, 0.004, 0.18);
    lathe(B, M.glass, [[0, 0], [0.035, 0], [0.004, 0.01], [0.004, 0.09], [0.03, 0.11], [0.04, 0.17], [0.037, 0.2]], px + 0.12, 0.751, pz - 0.15 * Math.cos(ry), 16);
  }
  // 线性吊灯
  B.box(M.brass, cx, 2.1, cz, 2.0, 0.035, 0.06);
  B.box(M.lightStrip, cx, 2.095, cz, 1.96, 0.006, 0.03);
  for (const s of [-1, 1]) B.cyl(M.steel, cx + s * 0.85, 2.13, cz, 0.0015, 0.0015, 0.87, 4);
  // 背墙：通顶展示柜
  const bz = 11.94;
  B.box(M.walnut, -2.0, 0, bz - 0.25, 6.6, 0.85, 0.5);
  B.box(M.counter, -2.0, 0.85, bz - 0.25, 6.6, 0.03, 0.52);
  B.box(M.walnutDark, -2.0, 0.88, bz - 0.04, 6.6, 1.95, 0.08);
  for (let i = 0; i < 4; i++) {
    const x = -4.4 + i * 1.6;
    // 玻璃展示格
    B.box(M.walnut, x - 0.82, 0.88, bz - 0.2, 0.04, 1.95, 0.4);
    B.box(M.walnut, x + 0.82, 0.88, bz - 0.2, 0.04, 1.95, 0.4);
    for (const y of [1.5, 2.1]) {
      B.box(M.glass, x, y, bz - 0.2, 1.6, 0.012, 0.38);
      B.box(M.lightStrip, x, y - 0.006, bz - 0.38, 1.6, 0.004, 0.01);
    }
    B.box(M.lightStrip, x, 2.8, bz - 0.38, 1.6, 0.004, 0.01);
    B.box(M.walnut, x, 2.82, bz - 0.2, 1.68, 0.05, 0.4);
  }
  B.box(M.walnut, -2.0, 2.83, bz - 0.2, 6.6, 0.17, 0.4);
  // 展品：青瓷、青花、茶叶罐
  const items = [[-5.0, 0.88, 'v'], [-4.4, 0.88, 'b'], [-3.2, 0.88, 'j'], [-2.6, 0.88, 'v'], [-1.4, 0.88, 'b'], [-0.8, 0.88, 'j'], [0.4, 0.88, 'v'], [0.95, 0.88, 'bk']];
  for (const [x, y, k] of items) {
    for (const yy of [y, 1.512, 2.112]) {
      if (k === 'v') vase(B, M, x, yy, bz - 0.2, M.celadon, 0.9 + R() * 0.3, R() > 0.5);
      else if (k === 'b') vase(B, M, x, yy, bz - 0.2, M.blueWhite, 0.8 + R() * 0.3, true);
      else if (k === 'j') { B.cyl(M.blackCeramic, x, yy, bz - 0.2, 0.06, 0.06, 0.14, 24); B.cyl(M.brass, x, yy + 0.14, bz - 0.2, 0.045, 0.06, 0.03, 24); }
      else books(B, M, x, yy, bz - 0.2, 0.4);
    }
  }
  // 柜面：咖啡机、果盘
  B.box(M.steel, -4.6, 0.88, bz - 0.3, 0.3, 0.38, 0.38);
  B.box(M.black, -4.6, 1.0, bz - 0.49, 0.2, 0.12, 0.002);
  lathe(B, M.walnutDark, [[0, 0], [0.16, 0.01], [0.2, 0.07], [0, 0.04]], 0.4, 0.88, bz - 0.25);
  for (let i = 0; i < 6; i++) B.sphere(i % 2 ? M.fruitOrange : M.fruitGreen, 0.4 + Math.cos(i) * 0.08, 0.96, bz - 0.25 + Math.sin(i) * 0.08, 0.04, 1, 1, 1, 12);
  B.collide(-5.4, bz - 0.55, 1.4, bz);
  // 侧墙书法对联
  B.push(-5.44, 1.6, 7.2, PI / 2); scroll(B, M, M.calligraphy, 0.42, 1.5); B.pop();
  B.push(-5.44, 1.6, 8.0, PI / 2); scroll(B, M, M.calligraphy2, 0.42, 1.5); B.pop();
  B.push(-5.0, 0, 6.6); plantMonstera(B, M, 0.8); B.pop();
  // 餐厅与玄关间的木格栅
  for (let z = 9.45; z < 11.9; z += 0.11) B.box(M.walnutDark, 1.5, 0, z, 0.05, 2.85, 0.04);
  B.box(M.walnutDark, 1.5, 2.8, 10.67, 0.12, 0.05, 2.5);
  B.collide(1.44, 9.4, 1.56, 12);
}

function diningChair(B, M) {
  contactShadow(B, M, 0, 0, 0.6, 0.6, 0.004, true);
  for (const [x, z] of [[-0.22, 0.2], [0.22, 0.2], [-0.22, -0.2], [0.22, -0.2]]) B.cyl(M.walnut, x, 0, z, 0.016, 0.02, 0.45, 10);
  B.rbox(M.fabricBeige, 0, 0.44, 0.02, 0.5, 0.07, 0.48, 0.03);
  B.box(M.walnut, 0, 0.42, 0, 0.48, 0.03, 0.46);
  // 弧形靠背
  const g = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 24, 1, true, -0.8, 1.6);
  B.add(g, M.walnut, 0, 0.82, 0.08, 0, PI, 0);
  B.add(new THREE.CylinderGeometry(0.265, 0.265, 0.2, 24, 1, true, -0.78, 1.56), M.fabricBeige, 0, 0.82, 0.08, 0, PI, 0);
  for (const s of [-1, 1]) B.cyl(M.walnut, s * 0.2, 0.45, -0.19, 0.014, 0.014, 0.3, 8);
  B.collideC(0, 0, 0.42, 0.42);
}

/* ======================= 玄关 ======================= */
function foyer(B, M) {
  // 地面水刀拼花
  B.box(M.darkMarble, 3.25, 0.0, 10.4, 2.2, 0.004, 2.4);
  B.box(M.floorMarble, 3.25, 0.0, 10.4, 2.1, 0.0045, 2.3);
  B.box(M.brass, 3.25, 0.0, 10.4, 1.4, 0.005, 0.01);
  B.box(M.brass, 3.25, 0.0, 10.4, 0.01, 0.005, 1.6);
  // 入户地垫
  B.box(M.fabricGrey, 3.25, 0.0, 11.55, 1.2, 0.012, 0.6);
  // 通顶鞋柜（右侧）
  const x = 4.94;
  B.box(M.lacquerGreige, x - 0.21, 0, 10.0, 0.42, 0.9, 3.6);
  B.box(M.lacquerGreige, x - 0.21, 1.3, 10.0, 0.42, 1.55, 3.6);
  B.box(M.walnut, x - 0.2, 0.9, 10.0, 0.38, 0.4, 3.6);
  B.box(M.lightStrip, x - 0.3, 1.29, 10.0, 0.2, 0.004, 3.5);
  for (let z = 8.5; z < 11.8; z += 0.6) {
    B.box(M.lacquerGreige, x - 0.425, 0.05, z, 0.004, 0.82, 0.003);
    B.box(M.lacquerGreige, x - 0.425, 1.32, z, 0.004, 1.5, 0.003);
  }
  B.box(M.lightStrip, x - 0.3, 0.0, 10.0, 0.25, 0.004, 3.5);
  B.collide(x - 0.45, 8.2, x, 11.8);
  vase(B, M, x - 0.2, 0.9, 9.0, M.blackCeramic, 0.9, true);
  B.box(M.walnutDark, x - 0.2, 0.9, 10.4, 0.24, 0.02, 0.34);
  B.cyl(M.brass, x - 0.2, 0.92, 10.4, 0.05, 0.05, 0.004, 16);
  B.cyl(M.steel, x - 0.2, 0.92, 10.75, 0.012, 0.012, 0.0, 8);
  orchid(B, M, x - 0.2, 0.9, 11.2);
  // 换鞋凳（左侧）
  B.box(M.walnut, 1.85, 0.0, 10.7, 0.4, 0.06, 1.1);
  B.box(M.walnut, 1.85, 0.06, 10.25, 0.38, 0.38, 0.04);
  B.box(M.walnut, 1.85, 0.06, 11.15, 0.38, 0.38, 0.04);
  B.rbox(M.leather, 1.85, 0.44, 10.7, 0.4, 0.06, 1.1, 0.02);
  B.collide(1.6, 10.1, 2.1, 11.3);
  // 屏风 + 玄关柜
  const sz = 8.05;
  B.box(M.walnutDark, 3.25, 0, sz, 2.3, 0.08, 0.3);
  for (const s of [-1, 1]) B.box(M.walnutDark, 3.25 + s * 1.12, 0.08, sz, 0.06, 2.2, 0.06);
  B.box(M.walnutDark, 3.25, 2.25, sz, 2.3, 0.06, 0.06);
  B.box(M.fabricBeige, 3.25, 0.4, sz, 2.18, 1.82, 0.02);
  B.quad(M.painting3, 3.25, 1.35, sz + 0.012, 1.9, 0.95);
  B.quad(M.painting3, 3.25, 1.35, sz - 0.012, 1.9, 0.95, 0, PI, 0);
  B.collide(2.1, sz - 0.18, 4.4, sz + 0.18);
  // 屏风前玄关台（面向入户门）
  B.box(M.walnut, 3.25, 0.0, sz + 0.35, 1.6, 0.04, 0.36);
  B.box(M.walnut, 2.55, 0.04, sz + 0.35, 0.04, 0.78, 0.34);
  B.box(M.walnut, 3.95, 0.04, sz + 0.35, 0.04, 0.78, 0.34);
  B.box(M.tvMarble, 3.25, 0.82, sz + 0.35, 1.62, 0.03, 0.38);
  vase(B, M, 2.75, 0.85, sz + 0.35, M.celadon, 1.4, true);
  tube(B, M.stem, [[2.75, 1.4, sz + 0.35], [2.6, 1.8, sz + 0.4], [2.35, 2.0, sz + 0.42]], 0.008, 12, 5);
  tube(B, M.stem, [[2.75, 1.4, sz + 0.35], [2.95, 1.75, sz + 0.38], [3.15, 1.85, sz + 0.4]], 0.006, 12, 5);
  for (let i = 0; i < 26; i++) {
    const t = R();
    const a = R() > 0.5;
    const p = a ? [2.75 - 0.4 * t, 1.4 + 0.6 * t, sz + 0.35] : [2.75 + 0.4 * t, 1.4 + 0.45 * t, sz + 0.38];
    B.sphere(M.fruitRed, p[0] + (R() - 0.5) * 0.03, p[1], p[2] + (R() - 0.5) * 0.04, 0.012, 1, 1, 1, 6);
  }
  B.box(M.brass, 3.6, 0.85, sz + 0.35, 0.22, 0.02, 0.14);
  B.box(M.leatherBlack, 3.6, 0.87, sz + 0.35, 0.08, 0.01, 0.05);
  B.collide(2.4, sz + 0.15, 4.1, sz + 0.55);
  // 入户门两侧壁灯
  for (const xx of [2.3, 4.2]) {
    B.box(M.brass, xx, 1.7, 11.93, 0.08, 0.35, 0.02);
    B.cyl(M.paperLantern, xx, 1.72, 11.86, 0.05, 0.05, 0.3, 16);
  }
  // 全身镜
  B.box(M.brass, 1.58, 0.1, 8.7, 0.02, 1.9, 0.62);
  MIRRORS.push({ x: 1.596, y: 1.05, z: 8.7, w: 0.56, h: 1.84, ry: PI / 2 });
}

/* ======================= 厨房 ======================= */
function kitchen(B, M) {
  // 高柜墙（冰箱 + 蒸烤箱）
  const tz = 6.36;
  B.box(M.lacquerWhite, 7.5, 0, tz, 2.8, 2.6, 0.6);
  B.box(M.lacquerWhite, 7.5, 2.6, tz, 2.8, 0.1, 0.6);
  for (let x = 6.1; x <= 8.9; x += 0.7) B.box(M.ceramic, x, 0.05, tz + 0.301, 0.004, 2.5, 0.003);
  B.box(M.steel, 6.45, 0, tz + 0.01, 0.7, 2.0, 0.58);
  B.box(M.steel, 6.45, 2.0, tz, 0.7, 0.6, 0.6);
  B.box(M.black, 6.79, 0.9, tz + 0.31, 0.012, 0.9, 0.02);
  B.box(M.steel, 6.12, 0.4, tz + 0.32, 0.02, 1.0, 0.03);
  B.box(M.black, 7.85, 0.8, tz + 0.301, 0.6, 0.45, 0.002);
  B.box(M.black, 7.85, 1.3, tz + 0.301, 0.6, 0.45, 0.002);
  B.box(M.steel, 7.85, 1.18, tz + 0.31, 0.5, 0.012, 0.02);
  B.box(M.steel, 7.85, 1.68, tz + 0.31, 0.5, 0.012, 0.02);
  B.collide(6.1, 6.06, 8.94, 6.66);
  // 操作台（沿 x=9 墙）
  const cx = 8.64;
  B.box(M.lacquerGreige, cx, 0.1, 8.5, 0.6, 0.78, 3.4);
  B.box(M.black, cx + 0.02, 0, 8.5, 0.56, 0.1, 3.4);
  B.box(M.counter, cx - 0.01, 0.88, 8.5, 0.64, 0.03, 3.42);
  for (let z = 7.0; z < 10.2; z += 0.6) B.box(M.ceramic, cx - 0.302, 0.12, z, 0.003, 0.74, 0.003);
  B.box(M.steel, cx - 0.31, 0.83, 8.5, 0.02, 0.012, 3.3);
  // 灶台 + 烟机
  B.box(M.black, cx, 0.91, 8.0, 0.5, 0.006, 0.8);
  for (const [dz, r] of [[-0.2, 0.1], [0.2, 0.12]]) B.add(new THREE.TorusGeometry(r, 0.003, 4, 32), M.gunmetal, cx, 0.917, 8.0 + dz, PI / 2, 0, 0);
  B.box(M.steel, cx + 0.05, 2.0, 8.0, 0.5, 0.12, 0.9);
  B.box(M.steel, cx + 0.22, 2.12, 8.0, 0.16, 0.55, 0.3);
  B.box(M.lightStrip, cx - 0.12, 1.995, 8.0, 0.1, 0.004, 0.6);
  // 锅具
  lathe(B, M.steel, [[0, 0], [0.11, 0], [0.12, 0.1], [0.125, 0.11], [0, 0.11]], cx - 0.02, 0.915, 8.2, 24);
  B.cyl(M.blackMetal, cx - 0.16, 0.97, 8.2, 0.01, 0.01, 0.18, 8, 0, PI / 2);
  // 吊柜
  B.box(M.lacquerWhite, cx + 0.12, 1.55, 9.45, 0.35, 0.9, 1.3);
  B.box(M.lacquerWhite, cx + 0.12, 1.55, 7.15, 0.35, 0.9, 0.9);
  B.box(M.lightStrip, cx, 1.545, 9.45, 0.08, 0.004, 1.25);
  // 台面电器摆件
  B.box(M.steel, cx, 0.91, 9.3, 0.3, 0.3, 0.25);
  B.cyl(M.steel, cx, 0.91, 9.8, 0.07, 0.08, 0.2, 20);
  B.box(M.walnut, cx - 0.05, 0.91, 7.2, 0.3, 0.02, 0.45);
  B.box(M.walnutDark, cx + 0.15, 0.91, 7.5, 0.1, 0.22, 0.12);
  for (let i = 0; i < 4; i++) B.box(M.black, cx + 0.15, 1.12, 7.46 + i * 0.025, 0.02, 0.06, 0.01);
  B.collide(cx - 0.32, 6.8, 8.94, 10.2);
  // 窗下水槽台（沿 z=12 墙）
  const sz = 11.64;
  B.box(M.lacquerGreige, 7.0, 0.1, sz, 3.88, 0.78, 0.6);
  B.box(M.black, 7.0, 0, sz + 0.02, 3.88, 0.1, 0.56);
  B.box(M.counter, 7.0, 0.88, sz - 0.01, 3.9, 0.03, 0.64);
  for (let x = 5.4; x < 8.9; x += 0.6) B.box(M.ceramic, x, 0.12, sz - 0.302, 0.003, 0.74, 0.003);
  B.box(M.steel, 7.0, 0.83, sz - 0.31, 3.8, 0.012, 0.02);
  // 水槽
  B.box(M.steel, 7.0, 0.7, sz, 0.8, 0.18, 0.45);
  B.box(M.gunmetal, 7.0, 0.72, sz, 0.76, 0.002, 0.41);
  tube(B, M.steel, [[7.0, 0.91, sz + 0.25], [7.0, 1.25, sz + 0.25], [7.0, 1.33, sz + 0.15], [7.0, 1.25, sz + 0.03]], 0.012, 16, 8);
  B.cyl(M.steel, 7.12, 0.91, sz + 0.25, 0.015, 0.015, 0.1, 10);
  // 碗碟沥水 + 绿植
  for (let i = 0; i < 5; i++) B.cyl(M.ceramic, 7.75 + i * 0.03, 1.03, sz, 0.11, 0.11, 0.01, 24, 0, PI / 2 - 0.15);
  B.push(6.0, 0.91, sz + 0.05, 0, 0.5); plantMonstera(B, M, 0.5); B.pop();
  B.collide(5.06, sz - 0.32, 8.94, 11.94);
  // 中岛
  const ix = 6.75, iz = 9.05;
  contactShadow(B, M, ix, iz, 1.1, 2.3);
  B.box(M.walnut, ix, 0.06, iz, 0.8, 0.84, 2.0);
  B.box(M.black, ix, 0, iz, 0.74, 0.06, 1.94);
  B.box(M.counter, ix, 0.9, iz, 1.0, 0.04, 2.2);
  B.collideC(ix, iz, 1.0, 2.2);
  lathe(B, M.ceramic, [[0, 0], [0.14, 0.01], [0.18, 0.07], [0, 0.03]], ix, 0.94, iz - 0.4, 32);
  for (let i = 0; i < 7; i++) B.sphere([M.fruitOrange, M.fruitRed, M.fruitGreen][i % 3], ix + Math.cos(i * 1.3) * 0.08, 1.0 + (i > 4 ? 0.05 : 0), iz - 0.4 + Math.sin(i * 1.3) * 0.08, 0.042, 1, 1, 1, 12);
  B.box(M.paper, ix + 0.1, 0.94, iz + 0.5, 0.22, 0.015, 0.3, 0.2);
  // 中岛吊灯
  for (const dz of [-0.55, 0.55]) {
    B.cyl(M.steel, ix, 1.9, iz + dz, 0.0015, 0.0015, 0.8, 4);
    lathe(B, M.blackMetal, [[0.0, 0.25], [0.04, 0.25], [0.16, 0.06], [0.17, 0], [0.165, 0], [0.155, 0.06], [0.035, 0.24]], ix, 1.65, iz + dz, 32);
    B.cyl(M.lampShade, ix, 1.655, iz + dz, 0.15, 0.15, 0.004, 24);
  }
}

/* ======================= 主卧 ======================= */
function master(B, M) {
  const wx = -11.88;
  // 背景墙：硬包 + 黄铜收边
  B.box(M.wallCloth, wx + 0.02, 0, 3.0, 0.04, 2.78, 4.4);
  B.box(M.brass, wx + 0.045, 0, 0.78, 0.01, 2.78, 0.012);
  B.box(M.brass, wx + 0.045, 0, 5.22, 0.01, 2.78, 0.012);
  for (let z = 1.0; z <= 5.0; z += 0.6) B.box(M.wallCloth, wx + 0.05, 1.1, z, 0.015, 1.68, 0.003);
  // 床
  B.push(wx + 0.08, 0, 3.0, PI / 2); bed(B, M, 2.0, 2.15, M.fabricGrey); B.pop();
  B.quad(M.rugWool, -9.9, 0.006, 3.0, 3.0, 3.4, -PI / 2, 0, 0);
  // 床头柜 + 吊灯
  for (const z of [1.55, 4.45]) {
    B.push(wx + 0.05, 0, z, PI / 2); nightstand(B, M); B.pop();
    B.cyl(M.steel, wx + 0.27, 1.5, z, 0.001, 0.001, 1.5, 4);
    B.sphere(M.paperLantern, wx + 0.27, 1.4, z, 0.11, 1, 1.1, 1, 24);
    B.cyl(M.brass, wx + 0.27, 1.51, z, 0.02, 0.02, 0.03, 12);
  }
  books(B, M, wx + 0.27, 0.555, 1.45, 0.16, 0.3);
  B.box(M.brass, wx + 0.27, 0.555, 4.55, 0.2, 0.01, 0.12);
  orchid(B, M, wx + 0.27, 0.555, 4.35);
  // 床尾凳
  B.box(M.walnutDark, -9.25, 0, 3.0, 0.42, 0.04, 1.5);
  for (const z of [2.35, 3.65]) B.box(M.walnutDark, -9.25, 0.04, z, 0.4, 0.36, 0.04);
  B.rbox(M.leather, -9.25, 0.4, 3.0, 0.44, 0.08, 1.5, 0.03);
  B.collide(-9.5, 2.25, -9.0, 3.75);
  // 斗柜 + 画
  const dx = -4.06;
  B.box(M.walnut, dx - 0.25, 0.1, 2.6, 0.5, 0.72, 2.4);
  B.box(M.black, dx - 0.22, 0, 2.6, 0.42, 0.1, 2.3);
  B.box(M.tvMarble, dx - 0.25, 0.82, 2.6, 0.52, 0.02, 2.42);
  for (const z of [1.8, 2.6, 3.4]) B.box(M.brass, dx - 0.502, 0.45, z, 0.004, 0.16, 0.015);
  B.collide(dx - 0.52, 1.4, dx, 3.8);
  B.push(dx - 0.02, 1.75, 2.6, -PI / 2); painting(B, M, M.painting2, 0.8, 1.2, M.brass); B.pop();
  vase(B, M, dx - 0.25, 0.84, 1.75, M.blackCeramic, 1.0);
  tableLamp(B, M, dx - 0.25, 0.84, 3.5, 1.0);
  books(B, M, dx - 0.25, 0.84, 2.9, 0.3, PI / 2);
  // 窗边阅读角
  B.push(-6.4, 0, 1.1, PI + 0.4); loungeChair(B, M, M.fabricGrey, M.walnutDark); B.pop();
  B.push(-7.35, 0, 0.85); sideTable(B, M, M.walnutDark); B.pop();
  teaSet(B, M, -7.35, 0.555, 0.85, 0.5);
  B.push(-5.3, 0, 0.9, 0.5); floorLampArc(B, M); B.pop();
  B.push(-11.4, 0, 0.75); plantFig(B, M, 1.7, 0.8); B.pop();
}

function bed(B, M, w = 1.8, l = 2.1, head = M.fabricGrey) {
  // 局部：床头在 z=0（靠墙），床尾朝 +z
  contactShadow(B, M, 0, l / 2 + 0.1, w + 0.3, l + 0.3);
  B.rbox(head, 0, 0.0, 0.08, w + 0.5, 1.25, 0.14, 0.05);
  for (let i = 0; i < 6; i++) B.rbox(head, -w / 2 - 0.25 + (w + 0.5) * (i + 0.5) / 6, 0.32, 0.17, (w + 0.5) / 6 - 0.01, 0.86, 0.06, 0.03);
  B.box(M.walnutDark, 0, 0, l / 2 + 0.1, w - 0.1, 0.12, l - 0.2);
  B.rbox(head, 0, 0.12, l / 2 + 0.12, w + 0.06, 0.24, l, 0.04);
  B.rbox(M.bedLinen, 0, 0.36, l / 2 + 0.12, w, 0.24, l - 0.04, 0.08);
  // 被子（垂边）
  const g = new THREE.PlaneGeometry(w + 0.16, l * 0.72, 24, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const edge = Math.max(0, Math.abs(x) - w / 2 + 0.06) / 0.14;
    p.setZ(i, -Math.min(1, edge) * 0.32 + Math.sin(p.getY(i) * 9 + x * 3) * 0.008 + (1 - Math.min(1, edge)) * 0.03);
    p.setX(i, x - Math.sign(x) * Math.min(1, edge) * 0.02);
  }
  g.computeVertexNormals();
  scaleUV(g, w, l);
  B.add(g, M.bedLinen, 0, 0.6, l * 0.62, -PI / 2, 0, 0);
  // 床尾搭巾
  B.rbox(M.bedThrow, 0, 0.6, l - 0.28, w + 0.2, 0.03, 0.48, 0.015);
  // 枕头
  for (const s of [-1, 1]) {
    B.add(roundedBox(w * 0.42, 0.18, 0.5, 0.08), M.bedLinen, s * w * 0.23, 0.68, 0.38, -1.2, 0, 0);
    B.add(roundedBox(w * 0.38, 0.14, 0.42, 0.07), M.bedLinen, s * w * 0.22, 0.66, 0.6, -0.9, 0, 0);
  }
  B.add(roundedBox(0.5, 0.3, 0.12, 0.05), M.velvetGreen, 0, 0.75, 0.7, -0.4, 0, 0);
  B.collide(-w / 2 - 0.25, 0, w / 2 + 0.25, l + 0.15);
}

function nightstand(B, M) {
  contactShadow(B, M, 0, 0.22, 0.6, 0.55);
  B.box(M.walnut, 0, 0.12, 0.22, 0.5, 0.42, 0.42);
  B.box(M.tvMarble, 0, 0.54, 0.22, 0.52, 0.015, 0.44);
  B.box(M.brass, 0, 0.32, 0.431, 0.16, 0.012, 0.004);
  for (const s of [-1, 1]) B.cyl(M.brass, s * 0.2, 0, 0.22, 0.012, 0.012, 0.12, 8);
  B.collide(-0.26, 0, 0.26, 0.45);
}

/* ======================= 主卫 ======================= */
function masterBath(B, M) {
  // 双台盆（沿 x=-8.5 墙）
  const vx = -8.56;
  B.box(M.walnut, vx - 0.28, 0.25, 9.1, 0.55, 0.55, 2.4);
  B.box(M.bathMarble, vx - 0.29, 0.8, 9.1, 0.58, 0.04, 2.42);
  B.box(M.lightStrip, vx - 0.3, 0.245, 9.1, 0.3, 0.004, 2.3);
  for (const z of [8.5, 9.7]) {
    lathe(B, M.ceramic, [[0, 0], [0.12, 0.0], [0.2, 0.05], [0.21, 0.13], [0.195, 0.13], [0.18, 0.06], [0, 0.02]], vx - 0.3, 0.84, z, 40);
    tube(B, M.brass, [[vx - 0.03, 1.2, z], [vx - 0.15, 1.2, z], [vx - 0.17, 1.17, z]], 0.012, 8, 8);
    B.box(M.brass, vx - 0.02, 1.12, z + 0.1, 0.03, 0.05, 0.05);
    // 背光圆镜
    B.add(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 48), M.lightStrip, vx - 0.005, 1.75, z, 0, 0, PI / 2);
    MIRRORS.push({ x: vx - 0.036, y: 1.75, z, r: 0.36, ry: -PI / 2 });
  }
  B.collide(vx - 0.6, 7.9, vx, 10.3);
  vase(B, M, vx - 0.3, 0.84, 9.1, M.blackCeramic, 0.5);
  B.box(M.towel, vx - 0.3, 0.84, 8.95, 0.25, 0.06, 0.2);
  B.cyl(M.candle, vx - 0.3, 0.84, 9.25, 0.04, 0.04, 0.08, 16);
  // 独立浴缸（窗下）
  const tx = -10.3, tz = 11.2;
  contactShadow(B, M, tx, tz, 1.9, 1.0, 0.004, true);
  const tubG = new THREE.LatheGeometry([[0, 0], [0.3, 0], [0.38, 0.1], [0.42, 0.45], [0.44, 0.58], [0.4, 0.58], [0.36, 0.2], [0.28, 0.08], [0, 0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
  B.add(tubG, M.ceramic, tx, 0, tz, 0, 0, 0, 2.0, 1, 1.0);
  B.add(new THREE.CircleGeometry(0.39, 40), M.water, tx, 0.45, tz, -PI / 2, 0, 0, 2.0, 1.0, 1);
  B.collideC(tx, tz, 1.75, 0.9);
  // 落地龙头
  tube(B, M.brass, [[tx + 1.05, 0, tz], [tx + 1.05, 0.95, tz], [tx + 0.95, 1.02, tz], [tx + 0.85, 0.95, tz]], 0.016, 16, 8);
  B.add(new THREE.CircleGeometry(0.4, 32), M.towel, tx - 1.0, 0.004, tz - 0.3, -PI / 2, 0, 0);
  // 淋浴间（角落玻璃）
  const sx1 = -11.94, sx2 = -10.5, sz1 = 6.06, sz2 = 8.0;
  B.box(M.bathMarble, (sx1 + sx2) / 2, 0, (sz1 + sz2) / 2, sx2 - sx1, 0.03, sz2 - sz1);
  B.add(new THREE.PlaneGeometry(sz2 - sz1 - 0.6, 2.1), M.glass, sx2, 1.05, (sz1 + sz2) / 2 + 0.3, 0, PI / 2, 0);
  B.box(M.brass, sx2, 2.1, (sz1 + sz2) / 2 + 0.3, 0.02, 0.02, sz2 - sz1 - 0.6);
  B.box(M.brass, sx2, 0, sz2 - 0.01, 0.02, 2.12, 0.02);
  B.add(new THREE.PlaneGeometry(sx2 - sx1, 2.1), M.glass, (sx1 + sx2) / 2, 1.05, sz2, 0, 0, 0);
  B.box(M.brass, (sx1 + sx2) / 2, 2.1, sz2, sx2 - sx1, 0.02, 0.02);
  B.collide(sx1, sz2 - 0.03, sx2 + 0.02, sz2 + 0.03);
  B.collide(sx2 - 0.03, sz1 + 0.6, sx2 + 0.03, sz2);
  // 顶喷 + 手持
  B.cyl(M.brass, -11.2, 2.2, 7.0, 0.012, 0.012, 0.5, 8);
  B.cyl(M.brass, -11.2, 2.18, 7.0, 0.15, 0.15, 0.02, 32);
  B.box(M.brass, -11.92, 1.0, 7.0, 0.04, 0.2, 0.1);
  B.box(M.bathMarble, -11.86, 1.1, 7.6, 0.06, 0.3, 0.6);
  // 壁挂马桶（隐藏水箱）
  B.box(M.bathMarble, -11.8, 0, 9.4, 0.28, 1.1, 1.0);
  B.box(M.brass, -11.655, 0.95, 9.4, 0.005, 0.12, 0.2);
  lathe(B, M.ceramic, [[0, 0], [0.18, 0], [0.2, 0.15], [0.19, 0.18], [0, 0.18]], -11.38, 0.24, 9.4, 32);
  B.add(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 32), M.ceramic, -11.4, 0.43, 9.4, 0, 0, 0, 1.3, 1, 1);
  B.collideC(-11.45, 9.4, 0.55, 0.45);
  // 毛巾加热架
  for (let y = 0.6; y < 1.6; y += 0.15) B.cyl(M.brass, -10.8, y, 6.07, 0.01, 0.01, 0.6, 8, 0, PI / 2);
  B.cyl(M.brass, -11.1, 0.55, 6.08, 0.012, 0.012, 1.1, 8);
  B.cyl(M.brass, -10.5, 0.55, 6.08, 0.012, 0.012, 1.1, 8);
  B.rbox(M.towel, -10.8, 1.0, 6.1, 0.5, 0.5, 0.04, 0.02);
  // 浴缸边小凳
  B.cyl(M.walnut, -11.55, 0, 10.4, 0.18, 0.18, 0.42, 24);
  B.cyl(M.candle, -11.55, 0.42, 10.4, 0.04, 0.04, 0.1, 16);
}

/* ======================= 衣帽间 ======================= */
function closet(B, M) {
  for (const [x, s] of [[-8.44, 1], [-5.56, -1]]) {
    const cx = x + s * 0.3;
    B.box(M.walnutDark, cx, 0, 7.6, 0.6, 2.75, 2.8);
    B.box(M.walnut, cx + s * 0.01, 0.05, 7.6, 0.56, 2.65, 2.7);
    for (let z = 6.3; z < 8.95; z += 0.9) {
      // 玻璃柜门 + 灯带
      B.add(new THREE.PlaneGeometry(0.88, 2.6), M.tintGlass, cx + s * 0.305, 1.37, z + 0.45, 0, s > 0 ? PI / 2 : -PI / 2, 0);
      B.box(M.brassDark, cx + s * 0.31, 0.06, z, 0.02, 2.6, 0.02);
      B.box(M.lightStrip, cx + s * 0.25, 2.6, z + 0.45, 0.02, 0.004, 0.86);
    }
    // 挂衣：上下两层
    for (const y of [1.9, 0.95]) {
      B.cyl(M.chrome, cx, y, 7.6, 0.01, 0.01, 2.6, 8, PI / 2);
      for (let z = 6.35; z < 8.85; z += 0.05 + R() * 0.03) {
        const c = [M.bedLinen, M.fabricBlue, M.fabricBeige, M.leatherBlack, M.fabricGrey, M.fabricGreen, M.white][Math.floor(R() * 7)];
        const len = y > 1.5 ? 0.6 + R() * 0.4 : 0.55;
        B.box(c, cx, y - len - 0.02, z, 0.46, len, 0.02);
      }
    }
    // 鞋架
    for (let z = 6.4; z < 8.9; z += 0.22) B.box([M.leather, M.leatherBlack, M.white][Math.floor(R() * 3)], cx, 0.08, z, 0.26, 0.08, 0.09);
    B.collide(Math.min(x, cx + s * 0.32), 6.2, Math.max(x, cx + s * 0.32), 9.0);
  }
  // 梳妆台（靠 z=9 墙）
  B.box(M.walnut, -7.0, 0.6, 8.75, 1.0, 0.18, 0.4);
  B.box(M.tvMarble, -7.0, 0.78, 8.75, 1.02, 0.02, 0.42);
  B.box(M.brass, -7.0, 1.0, 8.93, 0.82, 1.2, 0.02);
  MIRRORS.push({ x: -7.0, y: 1.6, z: 8.912, w: 0.78, h: 1.14, ry: PI });
  B.rbox(M.velvetGreen, -7.0, 0, 8.3, 0.46, 0.46, 0.36, 0.08);
  vase(B, M, -7.35, 0.8, 8.8, M.ceramic, 0.4);
  B.box(M.leather, -6.7, 0.8, 8.8, 0.2, 0.06, 0.14);
  B.collide(-7.5, 8.1, -6.5, 8.95);
}

/* ======================= 书房 · 茶室 ======================= */
function study(B, M) {
  // 书架（通顶）
  const bx = -8.44;
  B.box(M.rosewood, bx + 0.18, 0, 10.5, 0.36, 2.78, 2.9);
  for (let y = 0.35; y < 2.6; y += 0.42) B.box(M.rosewood, bx + 0.2, y, 10.5, 0.33, 0.025, 2.86);
  for (let z = 9.1; z <= 11.95; z += 0.95) B.box(M.rosewood, bx + 0.2, 0, z, 0.33, 2.78, 0.025);
  for (let y = 0.38; y < 2.4; y += 0.42) for (let z = 9.2; z < 11.8; z += 0.95) {
    if (R() > 0.75) { vase(B, M, bx + 0.2, y, z + 0.45, R() > 0.5 ? M.celadon : M.blueWhite, 0.6); continue; }
    B.push(bx + 0.2, y, z + 0.44, PI / 2);
    B.quad(R() > 0.5 ? M.books : M.books2, 0, 0.14, 0.13, 0.85, 0.3);
    B.box(M.paper, 0, 0, 0, 0.85, 0.27, 0.22);
    B.pop();
  }
  B.collide(bx, 9.06, bx + 0.38, 11.94);
  // 茶台（花梨木）
  const tx = -7.2, tz = 10.62;
  contactShadow(B, M, tx, tz, 1.4, 0.8);
  B.box(M.rosewood, tx, 0.7, tz, 1.2, 0.05, 0.6);
  for (const [dx, dz] of [[-0.54, -0.24], [0.54, -0.24], [-0.54, 0.24], [0.54, 0.24]]) B.box(M.rosewood, tx + dx, 0, tz + dz, 0.05, 0.7, 0.05);
  B.box(M.rosewood, tx, 0.6, tz - 0.26, 1.05, 0.06, 0.02);
  B.box(M.rosewood, tx, 0.6, tz + 0.26, 1.05, 0.06, 0.02);
  B.collideC(tx, tz, 1.2, 0.6);
  // 茶盘 + 茶具 + 茶叶罐
  B.box(M.darkMarble, tx, 0.75, tz, 0.6, 0.03, 0.36);
  teaSet(B, M, tx, 0.78, tz, 0.8);
  B.cyl(M.brassDark, tx + 0.45, 0.75, tz - 0.12, 0.05, 0.05, 0.12, 20);
  B.cyl(M.blueWhite, tx + 0.45, 0.75, tz + 0.12, 0.045, 0.05, 0.1, 20);
  B.cyl(M.tea, tx + 0.45, 0.85, tz + 0.12, 0.04, 0.04, 0.003, 16);
  // 香炉
  lathe(B, M.brassDark, [[0, 0], [0.04, 0], [0.06, 0.03], [0.06, 0.06], [0.05, 0.07], [0, 0.07]], tx - 0.45, 0.75, tz + 0.12, 20);
  // 圈椅 ×2
  B.push(tx, 0, tz - 0.62, 0); quanChair(B, M); B.pop();
  B.push(tx + 0.05, 0, tz + 0.64, PI); quanChair(B, M); B.pop();
  // 古琴
  B.box(M.rosewood, -7.0, 0, 9.35, 1.3, 0.68, 0.36);
  B.box(M.lacquerBlack, -7.0, 0.68, 9.35, 1.22, 0.05, 0.2);
  for (let i = 0; i < 7; i++) B.box(M.white, -7.0, 0.731, 9.28 + i * 0.022, 1.15, 0.001, 0.002);
  B.collide(-7.65, 9.06, -6.35, 9.55);
  B.push(-7.0, 1.75, 9.06, 0); scroll(B, M, M.painting2, 0.5, 1.0); B.pop();
  // 窗台盆景
  bonsai(B, M, -7.0, 0.8, 11.88 - 0.12, 0.8);
  // 纸灯笼落地灯
  B.cyl(M.rosewood, -5.95, 0, 11.6, 0.12, 0.12, 0.03, 16);
  B.cyl(M.rosewood, -5.95, 0.03, 11.6, 0.012, 0.012, 1.1, 8);
  B.cyl(M.paperLantern, -5.95, 1.1, 11.6, 0.18, 0.18, 0.45, 20);
  B.collideC(-5.95, 11.6, 0.3, 0.3);
  B.quad(M.rugBlue, tx, 0.006, tz, 2.2, 1.6, -PI / 2, 0, 0);
}

function quanChair(B, M) {
  // 明式圈椅
  contactShadow(B, M, 0, 0, 0.7, 0.65, 0.004, true);
  for (const [x, z] of [[-0.26, 0.22], [0.26, 0.22], [-0.26, -0.2], [0.26, -0.2]]) B.cyl(M.rosewood, x, 0, z, 0.018, 0.02, 0.48, 10);
  B.box(M.rosewood, 0, 0.46, 0.01, 0.58, 0.04, 0.48);
  B.box(M.fabricBeige, 0, 0.5, 0.01, 0.5, 0.02, 0.42);
  B.box(M.rosewood, 0, 0.1, 0.22, 0.52, 0.025, 0.025);
  const arc = [];
  for (let i = 0; i <= 16; i++) {
    const a = -PI * 0.1 + (i / 16) * PI * 1.2;
    arc.push([Math.cos(a) * 0.3 * (i === 0 || i === 16 ? 1.1 : 1), 0.78 - (i === 0 || i === 16 ? 0.06 : 0), -Math.sin(a) * 0.26 + 0.04]);
  }
  tube(B, M.rosewood, arc, 0.017, 40, 8);
  B.box(M.rosewood, 0, 0.5, -0.22, 0.14, 0.3, 0.02);
  B.box(M.rosewood, 0, 0.5, -0.22, 0.02, 0.3, 0.02);
  tube(B, M.rosewood, [[0, 0.5, -0.21], [0, 0.65, -0.24], [0, 0.78, -0.22]], 0.06, 8, 6);
  for (const s of [-1, 1]) tube(B, M.rosewood, [[s * 0.27, 0.48, 0.2], [s * 0.3, 0.63, 0.12], [s * 0.33, 0.73, 0.05]], 0.012, 8, 6);
  B.collideC(0, 0, 0.55, 0.5);
}

/* ======================= 次卧 ======================= */
function bed2(B, M) {
  const wx = 11.88;
  B.box(M.wallClothBlue, wx - 0.02, 0, 2.8, 0.04, 2.68, 3.6);
  B.box(M.oak, wx - 0.045, 2.68, 2.8, 0.01, 0.02, 3.6);
  B.push(wx - 0.08, 0, 2.8, -PI / 2); bed(B, M, 1.8, 2.1, M.fabricBeige); B.pop();
  for (const z of [1.45, 4.15]) {
    B.push(wx - 0.05, 0, z, -PI / 2); nightstand(B, M); B.pop();
    tableLamp(B, M, wx - 0.27, 0.555, z, 0.8);
  }
  B.quad(M.rugBlue, 10.0, 0.006, 2.8, 2.6, 3.0, -PI / 2, 0, PI / 2);
  // 书桌（窗前）
  const dx = 6.6, dz = 0.95;
  B.box(M.oak, dx, 0.72, dz, 1.5, 0.03, 0.65);
  for (const s of [-1, 1]) B.box(M.blackMetal, dx + s * 0.7, 0, dz, 0.03, 0.72, 0.6);
  B.box(M.blackMetal, dx, 0.6, dz + 0.28, 1.4, 0.03, 0.02);
  B.collideC(dx, dz, 1.5, 0.65);
  B.box(M.gunmetal, dx - 0.2, 0.75, dz + 0.05, 0.34, 0.012, 0.24, 0.1);
  B.box(M.gunmetal, dx - 0.2, 0.762, dz - 0.07, 0.34, 0.22, 0.008, 0.1);
  B.box(M.screen, dx - 0.2, 0.765, dz - 0.066, 0.31, 0.19, 0.002, 0.1);
  books(B, M, dx + 0.45, 0.75, dz - 0.15, 0.25);
  B.box(M.paper, dx + 0.15, 0.751, dz + 0.1, 0.21, 0.004, 0.3, -0.2);
  B.cyl(M.blackMetal, dx + 0.6, 0.75, dz + 0.1, 0.06, 0.06, 0.015, 16);
  tube(B, M.blackMetal, [[dx + 0.6, 0.76, dz + 0.1], [dx + 0.55, 1.15, dz + 0.0], [dx + 0.4, 1.2, dz + 0.05]], 0.008, 10, 6);
  // 椅子
  B.push(dx, 0, dz + 0.65, PI); diningChair(B, M); B.pop();
  // 衣柜（沿 z=6 墙）
  const wz = 5.64;
  B.box(M.lacquerWhite, 7.8, 0, wz, 3.8, 2.8, 0.6);
  for (let x = 5.9; x <= 9.7; x += 0.95) B.box(M.ceramic, x, 0.03, wz - 0.301, 0.003, 2.74, 0.003);
  for (let x = 6.375; x < 9.7; x += 0.95) B.box(M.oak, x + 0.4, 0.9, wz - 0.31, 0.02, 0.9, 0.02);
  B.collide(5.9, wz - 0.3, 9.7, wz + 0.3);
  // 单人沙发 + 植物
  B.push(9.0, 0, 0.95, PI - 0.4); armchairRound(B, M, M.fabricBlue); B.pop();
  B.push(11.4, 0, 0.75); plantFig(B, M, 1.8, 0.85); B.pop();
  B.push(11.88, 1.9, 5.2, -PI / 2); painting(B, M, M.painting3, 0.7, 0.5, M.oak); B.pop();
}

/* ======================= 次卫 / 洗衣房 ======================= */
function bath2(B, M) {
  const vx = 9.06;
  B.box(M.oak, vx + 0.25, 0.35, 7.6, 0.5, 0.45, 1.2);
  B.box(M.counter, vx + 0.26, 0.8, 7.6, 0.52, 0.03, 1.22);
  lathe(B, M.ceramic, [[0, 0], [0.14, 0], [0.18, 0.12], [0.17, 0.12], [0.13, 0.02], [0, 0.02]], vx + 0.27, 0.83, 7.6, 32);
  tube(B, M.chrome, [[vx + 0.02, 1.15, 7.6], [vx + 0.14, 1.15, 7.6], [vx + 0.16, 1.12, 7.6]], 0.01, 8, 8);
  B.box(M.chrome, vx + 0.005, 1.25, 7.6, 0.02, 0.9, 1.0);
  MIRRORS.push({ x: vx + 0.019, y: 1.7, z: 7.6, w: 0.96, h: 0.86, ry: PI / 2 });
  B.collide(vx, 7.0, vx + 0.52, 8.2);
  // 淋浴
  B.add(new THREE.PlaneGeometry(1.0, 2.0), M.glass, 11.4, 1.0, 7.5, 0, 0, 0);
  B.box(M.chrome, 11.4, 2.0, 7.5, 1.0, 0.02, 0.02);
  B.cyl(M.chrome, 11.4, 2.05, 8.3, 0.12, 0.12, 0.015, 24);
  B.cyl(M.chrome, 11.4, 2.06, 8.3, 0.01, 0.01, 0.5, 8);
  B.collide(10.9, 7.47, 11.94, 7.53);
  // 马桶
  B.box(M.tileWall, 11.84, 0, 6.6, 0.2, 1.0, 0.7);
  lathe(B, M.ceramic, [[0, 0], [0.17, 0], [0.19, 0.4], [0, 0.4]], 11.5, 0, 6.6, 32);
  B.collideC(11.55, 6.6, 0.55, 0.42);
  B.rbox(M.towel, 9.12, 1.1, 8.6, 0.04, 0.5, 0.4, 0.02);
}

function laundry(B, M) {
  // 洗烘塔
  const x = 11.6, z = 9.38;
  for (const y of [0, 0.85]) {
    B.rbox(M.appliance, x, y + 0.02, z, 0.6, 0.82, 0.6, 0.03);
    B.add(new THREE.TorusGeometry(0.2, 0.03, 10, 32), M.steel, x - 0.31, y + 0.42, z, 0, PI / 2, 0);
    B.add(new THREE.CircleGeometry(0.19, 32), M.tintGlass, x - 0.315, y + 0.42, z, 0, -PI / 2, 0);
    B.box(M.black, x - 0.305, y + 0.74, z - 0.1, 0.002, 0.05, 0.25);
  }
  B.collide(x - 0.32, z - 0.32, 11.94, z + 0.32);
  // 洗手池台面
  B.box(M.lacquerWhite, 10.4, 0.1, 11.64, 1.9, 0.8, 0.6);
  B.box(M.counter, 10.4, 0.9, 11.64, 1.92, 0.03, 0.62);
  B.box(M.steel, 10.0, 0.75, 11.64, 0.5, 0.16, 0.4);
  tube(B, M.chrome, [[10.0, 0.93, 11.88], [10.0, 1.2, 11.88], [10.0, 1.24, 11.75]], 0.01, 8, 8);
  B.collide(9.45, 11.34, 11.36, 11.94);
  B.box(M.paper, 10.8, 0.93, 11.7, 0.25, 0.3, 0.12);
  // 晾衣杆 + 衣物
  B.cyl(M.chrome, 10.5, 2.3, 10.4, 0.012, 0.012, 2.6, 8, 0, PI / 2);
  for (let xx = 9.6; xx < 11.4; xx += 0.22) B.box([M.towel, M.fabricBlue, M.white][Math.floor(R() * 3)], xx, 1.55, 10.4, 0.02, 0.7, 0.4);
  // 扫地机器人底座
  B.box(M.white, 9.3, 0, 9.3, 0.25, 0.1, 0.1);
  B.cyl(M.white, 9.3, 0, 9.55, 0.17, 0.17, 0.09, 32);
}

/* ======================= 露台 ======================= */
function terrace(B, M) {
  // 户外躺椅 ×2
  for (const x of [-2.75, -1.55]) {
    B.push(x, -0.02, -1.25, PI);
    contactShadow(B, M, 0, 0, 0.8, 1.9);
    B.box(M.walnutDark, 0, 0, 0, 0.7, 0.28, 1.8);
    B.rbox(M.sofaFabric, 0, 0.28, 0.2, 0.68, 0.1, 1.3, 0.04);
    B.add(roundedBox(0.68, 0.1, 0.6, 0.04), M.sofaFabric, 0, 0.55, -0.55, 0.8, 0, 0);
    B.add(roundedBox(0.4, 0.1, 0.25, 0.04), M.velvetGreen, 0, 0.66, -0.4, 0.8, 0, 0);
    B.collideC(0, 0, 0.7, 1.8);
    B.pop();
  }
  B.push(-2.15, -0.02, -0.6); sideTable(B, M, M.walnutDark); B.pop();
  teaSet(B, M, -2.15, 0.535, -0.6, 0.5);
  // 小圆桌 + 两椅
  const tx = 3.3, tz = -1.3;
  contactShadow(B, M, tx, tz, 1.2, 1.2, -0.015, true);
  B.cyl(M.blackMetal, tx, -0.02, tz, 0.25, 0.25, 0.02, 32);
  B.cyl(M.blackMetal, tx, 0, tz, 0.03, 0.03, 0.72, 12);
  B.cyl(M.darkMarble, tx, 0.72, tz, 0.4, 0.4, 0.02, 40);
  B.collideC(tx, tz, 0.8, 0.8);
  for (const s of [-1, 1]) { B.push(tx + s * 0.7, -0.02, tz, s > 0 ? -PI / 2 : PI / 2); diningChair(B, M); B.pop(); }
  vase(B, M, tx, 0.74, tz, M.ceramic, 0.6);
  // 竹子花箱
  B.push(-3.45, -0.02, -1.4, PI / 2); bambooPlanter(B, M, 1.8); B.pop();
  B.push(4.45, -0.02, -1.5, PI / 2); bambooPlanter(B, M, 1.6); B.pop();
  // 灯笼
  B.cyl(M.paperLantern, 1.6, -0.02, -0.5, 0.15, 0.15, 0.4, 20);
}

/* ======================= 入口 ======================= */
export function buildFurniture(scene, M, layer) {
  R = rng(2024);
  MIRRORS.length = 0;
  const B = new Builder();
  livingRoom(B, M);
  diningRoom(B, M);
  foyer(B, M);
  kitchen(B, M);
  master(B, M);
  masterBath(B, M);
  closet(B, M);
  study(B, M);
  bed2(B, M);
  bath2(B, M);
  laundry(B, M);
  const T = new Builder();
  terrace(T, M);
  const group = new THREE.Group();
  group.name = 'furniture';
  scene.add(group);
  B.flush(group, { layer });
  T.flush(group);
  return { group, colliders: [...B.colliders, ...T.colliders] };
}
void addCurtain;
