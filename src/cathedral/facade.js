// 西立面与双塔（1482 年状态：门洞雕像、列王廊二十八王像尚在，饰有彩绘与镀金残迹）
import * as THREE from 'three';
import { M, archPoints, archApex, archPlane, archMolding, extrude, gargoyleGeometry, statueGeometry } from '../geom.js';
import { P } from './plan.js';
import { wallZ, wallX, ringGeometry, glassWindow, statue, balustrade, corbelTable, arcade } from './parts.js';
import { addBox, addPlatform, addOBB } from '../world.js';

export function buildFacade(b) {
  const { FL, ZF, BI0, BI1, BO0, BO1, XT } = P;

  /* ---------- 台阶（11 级）与基座 ---------- */
  const stepD = 0.32, stepH = FL / 11;
  for (let i = 0; i < 11; i++) {
    const x0 = -2.2 - (11 - i) * stepD;
    b.box('stone', x0, 0, -ZF - 1, -2.2 + 0.01, stepH * (i + 1), ZF + 1, { uvScale: 0.5 });
    addPlatform(x0, -ZF - 1, -2.2, ZF + 1, stepH * (i + 1));
  }
  b.box('stone', -2.2, 0, -ZF, XT, FL, ZF);
  addPlatform(-2.2, -ZF, XT, ZF, FL);

  /* ---------- 底层：三座门洞 ---------- */
  const portals = [
    { zc: -13.35, wOut: 9.6, wIn: 4.6, N: 5, tymp: 'virgin', trumeau: 'saint' },   // 北：圣母门
    { zc: 0, wOut: 10.6, wIn: 5.6, N: 6, tymp: 'judgment', trumeau: 'saint' },     // 中：最后审判门
    { zc: 13.35, wOut: 9.6, wIn: 4.6, N: 5, tymp: 'anne', trumeau: 'saint' },      // 南：圣安娜门
  ];
  const PD = 3.5;                 // 门洞进深
  const SPR = FL + 6.6;           // 起拱高度
  const L1 = P.KINGS_Y;           // 底层高度
  // 底层墙体轮廓：在底边挖出三个尖拱门洞
  const outline = [new THREE.Vector2(-ZF, 0)];
  for (const p of portals) {
    archPoints(p.wOut, SPR, 1, 14).forEach(v => outline.push(new THREE.Vector2(v.x + p.zc, v.y)));
  }
  outline.push(new THREE.Vector2(ZF, 0), new THREE.Vector2(ZF, L1), new THREE.Vector2(-ZF, L1));
  b.add('stone', extrude(outline, PD), M(PD / 2, 0, 0, 0, -Math.PI / 2, 0));

  for (const p of portals) {
    const d = PD / p.N;
    const ws = Array.from({ length: p.N + 1 }, (_, i) => p.wOut - (p.wOut - p.wIn) * i / p.N);
    for (let i = 0; i < p.N; i++) {
      const x = (i + 0.5) * d;
      // 层层退进的拱环
      b.add('carved', ringGeometry(ws[i], ws[i + 1], SPR, 1, d * 0.98), M(x, 0, p.zc, 0, -Math.PI / 2, 0), { uvScale: 0.6 });
      // 拱券线脚
      const mold = archMolding(ws[i + 1] + 0.05, SPR, 1, 0.14, false, 0, 14);
      b.add('carved', mold, M((i + 1) * d - 0.05, 0, p.zc, 0, -Math.PI / 2, 0));
      // 门侧小圆柱
      for (const s of [-1, 1]) {
        b.cyl('carved', (i + 1) * d - 0.1, FL, p.zc + s * (ws[i + 1] / 2 + 0.02), 0.17, SPR - FL, 8);
        b.cyl('carved', (i + 1) * d - 0.1, SPR - 0.5, p.zc + s * (ws[i + 1] / 2 + 0.02), 0.28, 0.5, 8, 0.2); // 柱头
      }
      // 拱券上的小人像（天使、先知、殉道者），沿拱环中线排列
      const arcPts = archPoints((ws[i] + ws[i + 1]) / 2, SPR, 1, 20).slice(1, -1);
      const nA = arcPts.length;
      for (let k = 1; k < nA - 1; k += 3) {
        if (Math.abs(k - (nA - 1) / 2) < 1) continue;
        const pt = arcPts[k];
        const left = k < (nA - 1) / 2;
        const a0 = arcPts[k - 1], a1 = arcPts[k + 1];
        let tz = a1.x - a0.x, ty = a1.y - a0.y;
        if (!left) { tz = -tz; ty = -ty; }
        const tl = Math.hypot(tz, ty) || 1;
        const gamma = Math.atan2(-tz / tl, ty / tl);
        b.add('statue', statueGeometry('small'), M(x - d * 0.3, pt.y - 0.3, p.zc + pt.x, 0, -Math.PI / 2, gamma, 0.4, 0.4, 0.4), { uvScale: 1.5 });
      }
      // 门侧大型人像（使徒、圣徒），1482 年仍完好（1793 年被毁）
      if (i < p.N - 1) {
        for (const s of [-1, 1]) {
          const zz = p.zc + s * (ws[i + 1] / 2 - 0.36);
          b.cyl('carved', x, FL, zz, 0.32, 1.35, 8);
          statue(b, 'statue', i % 3 === 0 ? 'king' : 'saint', x, FL + 1.35, zz, -0.8, -s * 0.6, 1.22);
        }
      }
    }
    // 门楣横梁 + 浮雕
    const xi = PD - 0.25;
    b.box('carved', xi - 0.4, SPR - 0.75, p.zc - p.wIn / 2, xi + 0.1, SPR, p.zc + p.wIn / 2);
    const tg = archPlane(p.wIn, 0, 1);
    b.add('tymp_' + p.tymp, tg, M(xi - 0.2, SPR, p.zc, 0, -Math.PI / 2, 0), { keepUV: true });
    // 门间柱 + 雕像（中门为“美丽的上帝”基督像）
    b.box('carved', xi - 0.6, FL, p.zc - 0.3, xi, SPR - 0.75, p.zc + 0.3);
    b.cyl('carved', xi - 0.75, FL + 1.2, p.zc, 0.35, 0.5, 8);
    statue(b, 'statue', 'saint', xi - 0.75, FL + 1.7, p.zc, -1, 0, 1.25);
    // 门扇（向内开启，可通行）
    const leafW = p.wIn / 2 - 0.3;
    const leaf = new THREE.PlaneGeometry(leafW, SPR - 0.75 - FL);
    for (const s of [-1, 1]) {
      const hz = p.zc + s * (p.wIn / 2);
      const th = 1.3;
      const dx = Math.sin(th), dz = -s * Math.cos(th);
      b.add('door', leaf, M(xi + 0.05 + dx * leafW / 2, FL + (SPR - 0.75 - FL) / 2, hz + dz * leafW / 2, 0, Math.atan2(-dz, dx), 0), { keepUV: true });
    }
    // 门洞两侧碰撞
    addBox(-0.1, p.zc - p.wOut / 2 - 0.5, PD, p.zc - p.wIn / 2 + 0.25, 0, SPR);
    addBox(-0.1, p.zc + p.wIn / 2 - 0.25, PD, p.zc + p.wOut / 2 + 0.5, 0, SPR);
    addBox(xi - 0.7, p.zc - 0.35, xi + 0.05, p.zc + 0.35, 0, SPR);
  }
  // 门洞之间实墙的碰撞
  addBox(0, -ZF, PD, -13.35 - 4.8 - 0.2, 0, 60);
  addBox(0, -13.35 + 4.8 + 0.2, PD, -5.3 - 0.2, 0, 60);
  addBox(0, 5.3 + 0.2, PD, 13.35 - 4.8 - 0.2, 0, 60);
  addBox(0, 13.35 + 4.8 + 0.2, PD, ZF, 0, 60);

  /* ---------- 四道扶壁（带壁龛雕像：圣斯德望、教会、会堂、圣德尼） ---------- */
  const buttresses = [[-BO1, -BO0], [-BI1, -BI0], [BI0, BI1], [BO0, BO1]];
  buttresses.forEach(([z0, z1], bi) => {
    b.box('stone', -2.2, 0, z0, 0.2, 20, z1);
    b.box('stone', -1.6, 20, z0, 0.2, 24.5, z1);
    b.box('stone', -1.0, 24.5, z0, 0.2, P.GAL_Y, z1);
    // 退台斜面
    b.add('stone', new THREE.CylinderGeometry(0.01, 0.9, 1.0, 4, 1).rotateY(Math.PI / 4), M(-1.7, 20.5, (z0 + z1) / 2, 0, 0, 0, 1, 1, (z1 - z0) / 1.27 ));
    addBox(-2.2, z0, 0.2, z1, 0, 40);
    // 壁龛（尖拱龛 + 雕像）
    const zc = (z0 + z1) / 2;
    b.add('carved', archMolding(1.6, 3.2, 1, 0.1, true, 0, 8), M(-2.25, FL + 6.5, zc, 0, -Math.PI / 2, 0));
    b.box('darkVoid', -2.23, FL + 6.5, zc - 0.75, -2.21, FL + 6.5 + 3.2 + archApex(1.6), zc + 0.75);
    statue(b, 'statue', bi === 1 || bi === 2 ? 'angel' : 'saint', -2.7, FL + 6.6, zc, -1, 0, 1.55);
    b.box('carved', -3.1, FL + 6.3, zc - 0.5, -2.2, FL + 6.6, zc + 0.5);
  });

  /* ---------- 列王廊：二十八位犹大与以色列诸王（中世纪民众视作法兰西列王） ---------- */
  const KY = P.KINGS_Y;
  b.box('carved', -1.1, KY - 0.4, -ZF, 0.4, KY + 0.15, ZF); // 下檐
  b.box('stone', 0.4, KY, -ZF, 3.5, KY + 5.0, ZF);
  const nk = 28, kw = (2 * ZF) / nk;
  const kingArch = archMolding(kw - 0.2, 0, 0.7, 0.07, false, 0, 6);
  for (let i = 0; i < nk; i++) {
    const z = -ZF + (i + 0.5) * kw;
    statue(b, 'paintKing', 'king', -0.2, KY + 0.15, z, -1, 0, 1.55);
    b.add('carved', kingArch, M(-0.65, KY + 3.55, z, 0, -Math.PI / 2, 0));
    b.cyl('carved', -0.65, KY + 0.15, -ZF + i * kw, 0.08, 3.4, 6);
    b.box('darkVoid', 0.38, KY + 0.15, z - kw / 2 + 0.1, 0.4, KY + 4.2, z + kw / 2 - 0.1);
  }
  b.box('carved', -1.0, KY + 4.4, -ZF, 0.4, KY + 5.0, ZF); // 上檐

  /* ---------- 玫瑰窗层（24.5–40 米） ---------- */
  const RY = 24.5, RH = P.GAL_Y - RY;
  wallZ(b, 'stone', -BO0, 2 * BO0, RY, RH, 1.25, 2.5, [
    { type: 'circle', x: BO0, y: P.ROSE_Y - RY, r: 4.85 },
    { x: BO0 - 13.35, y: 2, w: 6.2, spring: 6.5, k: 1 },
    { x: BO0 + 13.35, y: 2, w: 6.2, spring: 6.5, k: 1 },
  ]);
  // 西玫瑰窗（直径约 9.6 米）
  const roseG = new THREE.CircleGeometry(4.9, 64);
  b.add('roseWestOut', roseG, M(1.0, P.ROSE_Y, 0, 0, -Math.PI / 2, 0), { keepUV: true });
  b.add('roseWestIn', roseG, M(1.06, P.ROSE_Y, 0, 0, Math.PI / 2, 0), { keepUV: true });
  addRoseTracery(b, 0.85, P.ROSE_Y, 0, 4.85, 'x');
  b.add('carved', new THREE.TorusGeometry(5.15, 0.22, 6, 64), M(-0.05, P.ROSE_Y, 0, 0, Math.PI / 2, 0));
  b.add('carved', new THREE.TorusGeometry(5.55, 0.12, 6, 64), M(-0.1, P.ROSE_Y, 0, 0, Math.PI / 2, 0));
  // 两侧双尖窗 + 圆窗（钟楼内部）
  for (const s of [-1, 1]) {
    const zc = s * 13.35;
    glassWindow(b, 2.0, RY + 2, zc, 1, 0, 6.2, 6.5, 1, 1, ['darkVoid', 'glassOut']);
    b.add('carved', archMolding(6.6, 6.5, 1, 0.2, true, 0, 12), M(-0.05, RY + 2, zc, 0, -Math.PI / 2, 0));
    b.add('carved', archMolding(7.2, 6.5, 1, 0.12, true, 0, 12), M(-0.1, RY + 2, zc, 0, -Math.PI / 2, 0));
  }
  // 圣母廊：栏杆 + 圣母子、两位天使、亚当与夏娃
  b.box('carved', -1.3, RY - 0.1, -BO0, 0.2, RY + 0.25, BO0);
  balustrade(b, 'carved', -1.0, -BO0, -1.0, BO0, RY + 0.25, 1.0, 0.5);
  statue(b, 'statue', 'saint', -0.5, RY + 0.25, 0, -1, 0, 1.95);
  statue(b, 'statue', 'angel', -0.5, RY + 0.25, -3.6, -1, 0, 1.7);
  statue(b, 'statue', 'angel', -0.5, RY + 0.25, 3.6, -1, 0, 1.7);
  statue(b, 'statue', 'saint', -0.5, RY + 0.25, -13.35, -1, 0, 1.7);
  statue(b, 'statue', 'saint', -0.5, RY + 0.25, 13.35, -1, 0, 1.7);

  /* ---------- 大拱廊（40–46.6 米）：细长小柱支撑的三叶拱 ---------- */
  const GY = P.GAL_Y, CY = P.CHIM_Y;
  b.box('stone', -1.2, GY - 0.5, -ZF, 3.5, GY + 0.2, ZF);
  arcade(b, 'carved', -0.6, -ZF, -0.6, ZF, GY + 0.2, CY - GY - 1.0, 27, 0.11, 0.8, 0.08);
  arcade(b, 'carved', 0.1, -ZF, 0.1, ZF, GY + 0.2, CY - GY - 1.0, 27, 0.11, 0.8, 0.08);
  b.box('carved', -0.9, CY - 0.8, -ZF, 0.6, CY, ZF);
  // 双塔之间的人字山墙（中殿屋顶西端）
  const gable = [new THREE.Vector2(-7.4, 0), new THREE.Vector2(7.4, 0), new THREE.Vector2(0, P.RIDGE - P.WALL_TOP + 0.6)];
  b.add('stone', extrude(gable, 1.0), M(3.2, P.WALL_TOP, 0, 0, -Math.PI / 2, 0));
  b.box('stone', 2.7, GY - 0.5, -BI0, 3.7, P.WALL_TOP, BI0);
  // 上层长廊（游客可登临）
  b.box('stone', -1.0, CY - 0.4, -BI0, 3.4, CY, BI0);
  addPlatform(-1.0, -BI0, 2.7, BI0, CY);
  addPlatform(-1.0, -ZF, 0.6, ZF, CY);
  balustrade(b, 'carved', -0.9, -ZF, -0.9, ZF, CY, 1.1, 0.42);
  addBox(-1.6, -ZF, -0.75, ZF, CY - 1, CY + 3);
  addBox(2.7, -BI0, 4.0, BI0, CY - 1, CY + 8);
  addBox(-1.6, -ZF - 0.8, 1.0, -ZF, CY - 1, CY + 3);
  addBox(-1.6, ZF, 1.0, ZF + 0.8, CY - 1, CY + 3);
  // 角部滴水兽 / 怪兽石像
  const gg = gargoyleGeometry();
  for (const z of [-ZF + 0.3, -BI0 + 0.3, BI0 - 0.3, ZF - 0.3]) {
    b.add('carved', gg, M(-0.8, CY - 0.6, z, 0, -Math.PI / 2, 0, 0.9, 0.9, 0.9), { uvScale: 1 });
  }

  /* ---------- 钟楼主体（12–46.6 米为实体，地面层为门厅） ---------- */
  for (const s of [-1, 1]) {
    const zi = s * BI0, zo = s * ZF;
    const z0 = Math.min(zi, zo), z1 = Math.max(zi, zo);
    b.box('stone', 2.5, 12, z0, XT, CY, z1);
    // 门厅外侧墙与内侧墙
    b.box('stone', 3.5, 0, s > 0 ? ZF - 1.6 : -ZF, XT, 12, s > 0 ? ZF : -ZF + 1.6);
    wallX(b, 'stone', 2.5, XT - 2.5, 0, 12, s * (BI0 + 0.65), 1.3, [{ x: (XT - 2.5) / 2, y: FL, w: 6.5, spring: 5.2, k: 1 }]);
    addBox(3.5, s > 0 ? ZF - 1.6 : -ZF, XT, s > 0 ? ZF : -ZF + 1.6, 0, 12);
    addBox(2.5, s * BI0, 2.5 + (XT - 2.5) / 2 - 3.25, s * (BI0 + 1.3), 0, 12);
    addBox(2.5 + (XT - 2.5) / 2 + 3.25, s * BI0, XT, s * (BI0 + 1.3), 0, 12);
    // 侧面与背面的尖窗（暗色玻璃）及盲拱
    for (const xx of [5, 11]) {
      glassWindow(b, xx, 27, zo + s * 0.02, 0, -s, 2.4, 6, 1, 2, ['darkVoid', 'glassOut']);
      b.add('carved', archMolding(2.9, 6, 1, 0.14, true, 0, 10), M(xx, 27, zo + s * 0.12, 0, 0, 0));
    }
    for (const zz of [s * 9.5, s * 17]) {
      glassWindow(b, XT + 0.02, 27, zz, -1, 0, 2.4, 6, 1, 3, ['darkVoid', 'glassOut']);
    }
    corbelTable(b, 'carved', 0, zo + s * 0.1, XT, zo + s * 0.1, 39.4, 0.5, 0, s);
    arcade(b, 'carved', 0.5, zo + s * 0.15, XT - 0.5, zo + s * 0.15, 19.6, 4.6, 8, 0.1, 0.8);
    buildTowerStage(b, s);
  }
}

// 玫瑰窗石质窗棂（立体），axis='x' 表示窗面法线沿 x
export function addRoseTracery(b, x, y, z, R, axis = 'x', key = 'carved') {
  const ry = axis === 'x' ? Math.PI / 2 : 0;
  const place = (lx, ly) => axis === 'x' ? [x, y + ly, z + lx] : [x + lx, y + ly, z];
  for (const r of [R, R * 0.7, R * 0.46, R * 0.2]) {
    b.add(key, new THREE.TorusGeometry(r, r === R ? 0.2 : 0.1, 5, 48), M(...place(0, 0), 0, ry, 0));
  }
  const spoke = new THREE.CylinderGeometry(0.075, 0.075, 1, 5);
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2;
    const r0 = k % 2 === 0 ? R * 0.2 : R * 0.46, r1 = R * 0.97;
    const mid = (r0 + r1) / 2;
    const [px, py, pz] = place(Math.cos(a) * mid, Math.sin(a) * mid);
    // 圆柱默认沿 y，绕法线轴旋转到径向
    const m = axis === 'x' ? M(px, py, pz, -(a - Math.PI / 2), 0, 0, 1, r1 - r0, 1) : M(px, py, pz, 0, 0, a - Math.PI / 2, 1, r1 - r0, 1);
    b.add(key, spoke, m);
  }
  const small = new THREE.TorusGeometry(R * 0.075, 0.05, 4, 12);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 - Math.PI / 2;
    b.add(key, small, M(...place(Math.cos(a) * R * 0.33, Math.sin(a) * R * 0.33), 0, ry, 0));
  }
}

/* 钟楼上层（46.6–68.2 米）：每面两扇高大的尖拱百叶窗（雨果所说的“石板披檐”） */
function buildTowerStage(b, s) {
  const { BI0, ZF, XT, CHIM_Y: Y0, TOWER_TOP } = P;
  const zi = s * BI0, zo = s * ZF;
  const z0 = Math.min(zi, zo), z1 = Math.max(zi, zo);
  const H = TOWER_TOP - 0.6 - Y0;
  const T = 1.5;
  const wz = z1 - z0, wx = XT;
  const op = (len) => [
    { x: len * 0.27, y: 3.0, w: 2.7, spring: 12.4, k: 1 },
    { x: len * 0.73, y: 3.0, w: 2.7, spring: 12.4, k: 1 },
  ];
  // 四面墙（西/东墙沿 z，南/北墙沿 x）
  wallZ(b, 'stone', z0, wz, Y0, H, T / 2, T, op(wz));
  wallZ(b, 'stone', z0, wz, Y0, H, XT - T / 2, T, op(wz));
  wallX(b, 'stone', 0, wx, Y0, H, z0 + T / 2, T, op(wx));
  wallX(b, 'stone', 0, wx, Y0, H, z1 - T / 2, T, op(wx));
  // 碰撞（钟楼内部可行走）
  addBox(0, z0, T, z1, Y0, TOWER_TOP + 1.2);
  addBox(XT - T, z0, XT, z1, Y0, TOWER_TOP + 1.2);
  addBox(0, z0, XT, z0 + T, Y0, TOWER_TOP + 1.2);
  addBox(0, z1 - T, XT, z1, Y0, TOWER_TOP + 1.2);
  // 钟室地板
  b.box('wood', T, P.BELFRY_FLOOR - 0.3, z0 + T, XT - T, P.BELFRY_FLOOR, z1 - T);
  b.box('stone', T, Y0, z0 + T, XT - T, P.BELFRY_FLOOR - 0.3, z1 - T);
  addPlatform(T, z0 + T, XT - T, z1 - T, P.BELFRY_FLOOR);
  // 百叶（每个开口）
  const lou = new THREE.BoxGeometry(2.6, 0.05, 0.75);
  const openings = [];
  for (const o of op(wz)) { openings.push({ x: T / 2, z: z0 + o.x, ax: 'z' }); openings.push({ x: XT - T / 2, z: z0 + o.x, ax: 'z' }); }
  for (const o of op(wx)) { openings.push({ x: o.x, z: z0 + T / 2, ax: 'x' }); openings.push({ x: o.x, z: z1 - T / 2, ax: 'x' }); }
  for (const o of openings) {
    for (let y = Y0 + 3.4; y < Y0 + 3 + 12.4 + 1.2; y += 0.62) {
      const m = o.ax === 'z' ? M(o.x, y, o.z, 0, Math.PI / 2, 0.6) : M(o.x, y, o.z, 0.6, 0, 0);
      const mm = o.ax === 'z' ? M(o.x, y, o.z, 0.6, Math.PI / 2, 0) : M(o.x, y, o.z, 0.6, 0, 0);
      void m;
      b.add('lead', lou, mm, { uvScale: 0.6 });
    }
    // 外侧拱券线脚
    const out = o.ax === 'z' ? (o.x < XT / 2 ? -1 : 1) : (Math.abs(o.z - z0) < 1 ? -1 : 1) * 1;
    if (o.ax === 'z') {
      b.add('carved', archMolding(3.1, 12.4, 1, 0.16, true, 0, 10), M(o.x + out * 0.8, Y0 + 3, o.z, 0, Math.PI / 2, 0));
      b.add('carved', archMolding(3.6, 12.4, 1, 0.12, true, 0, 10), M(o.x + out * 0.85, Y0 + 3, o.z, 0, Math.PI / 2, 0));
    } else {
      const so = o.z < (z0 + z1) / 2 ? -1 : 1;
      b.add('carved', archMolding(3.1, 12.4, 1, 0.16, true, 0, 10), M(o.x, Y0 + 3, o.z + so * 0.8, 0, 0, 0));
      b.add('carved', archMolding(3.6, 12.4, 1, 0.12, true, 0, 10), M(o.x, Y0 + 3, o.z + so * 0.85, 0, 0, 0));
    }
  }
  // 四角扶壁（逐级收分）
  for (const cx of [0, XT]) for (const cz of [z0, z1]) {
    const dx = cx === 0 ? -1 : 1, dz = cz === z0 ? -1 : 1;
    b.box('stone', cx - 1.1 + dx * 0.4, Y0, cz - 1.1 + dz * 0.4, cx + 1.1 + dx * 0.4, Y0 + 12, cz + 1.1 + dz * 0.4);
    b.box('stone', cx - 0.9 + dx * 0.3, Y0 + 12, cz - 0.9 + dz * 0.3, cx + 0.9 + dx * 0.3, Y0 + 17.5, cz + 0.9 + dz * 0.3);
    b.add('stone', new THREE.ConeGeometry(1.27, 1.6, 4).rotateY(Math.PI / 4), M(cx + dx * 0.3, Y0 + 18.3, cz + dz * 0.3));
    // 塔顶角部滴水兽
    b.add('carved', gargoyleGeometry(), M(cx + dx * 0.4, TOWER_TOP - 1.2, cz + dz * 0.4, 0, Math.atan2(dx, dz), 0, 0.8, 0.8, 0.8), { uvScale: 1 });
  }
  // 檐口托檐 + 塔顶平台 + 栏杆
  const yT = TOWER_TOP - 0.6;
  corbelTable(b, 'carved', -0.2, z0 - 0.1, XT + 0.2, z0 - 0.1, yT - 0.4, 0.6, 0, -1);
  corbelTable(b, 'carved', -0.2, z1 + 0.1, XT + 0.2, z1 + 0.1, yT - 0.4, 0.6, 0, 1);
  corbelTable(b, 'carved', -0.1, z0, -0.1, z1, yT - 0.4, 0.6, -1, 0);
  corbelTable(b, 'carved', XT + 0.1, z0, XT + 0.1, z1, yT - 0.4, 0.6, 1, 0);
  b.box('lead', 0, yT, z0, XT, TOWER_TOP, z1);
  b.box('stone', -0.6, yT - 0.05, z0 - 0.6, XT + 0.6, yT + 0.35, z1 + 0.6);
  addPlatform(-0.5, z0 - 0.5, XT + 0.5, z1 + 0.5, TOWER_TOP);
  balustrade(b, 'carved', -0.4, z0 - 0.4, XT + 0.4, z0 - 0.4, TOWER_TOP, 1.15);
  balustrade(b, 'carved', -0.4, z1 + 0.4, XT + 0.4, z1 + 0.4, TOWER_TOP, 1.15);
  balustrade(b, 'carved', -0.4, z0 - 0.4, -0.4, z1 + 0.4, TOWER_TOP, 1.15);
  balustrade(b, 'carved', XT + 0.4, z0 - 0.4, XT + 0.4, z1 + 0.4, TOWER_TOP, 1.15);
  addBox(-1.2, z0 - 1.2, XT + 1.2, z0 - 0.3, TOWER_TOP - 0.5, TOWER_TOP + 3);
  addBox(-1.2, z1 + 0.3, XT + 1.2, z1 + 1.2, TOWER_TOP - 0.5, TOWER_TOP + 3);
  addBox(-1.2, z0 - 1.2, -0.3, z1 + 1.2, TOWER_TOP - 0.5, TOWER_TOP + 3);
  addBox(XT + 0.3, z0 - 1.2, XT + 1.2, z1 + 1.2, TOWER_TOP - 0.5, TOWER_TOP + 3);
  // 北塔：通向塔顶的八角楼梯塔
  if (s < 0) {
    b.cyl('stone', XT - 1.5, Y0 - 20, z0 - 0.6, 1.6, TOWER_TOP + 2 - (Y0 - 20), 8);
    b.add('slate', new THREE.ConeGeometry(1.9, 4.2, 8), M(XT - 1.5, TOWER_TOP + 4.1, z0 - 0.6), { uvScale: 0.5 });
  }
  void addOBB;
}
