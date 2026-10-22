// 小说中出现的巴黎地标（1482 年）
import * as THREE from 'three';
import { M, unitBox, archMolding, extrude, pinnacleGeometry, statueGeometry } from '../geom.js';
import { wallX, wallZ, wallAB, glassWindow, roofX, roofZ, balustrade, corbelTable } from '../cathedral/parts.js';
import { addBox, addOBB, addCircle, addPlatform, addRamp, world } from '../world.js';
import { addHouse } from './houses.js';
import { WATER_Y } from './terrain.js';

/* ---------- 通用构件 ---------- */

// 圆塔：塔身 + 托檐 + 尖锥屋顶（或雉堞）
export function roundTower(b, x, z, r, h, opts = {}) {
  const base = opts.base ?? 0;
  b.cyl('stone', x, base - 3, z, r, h + 3, 16, r * 0.96);
  b.cyl('stone', x, base + h - 0.2, z, r + 0.45, 1.0, 16);
  if (opts.crenel) {
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2;
      b.add('stone', unitBox(), M(x + Math.cos(a) * (r + 0.25), base + h + 1.2, z + Math.sin(a) * (r + 0.25), 0, -a, 0, 0.5, 1.0, 1.0));
    }
  } else {
    const rh = opts.roofH ?? r * 2.4;
    b.add(opts.roof ?? 'slate', new THREE.ConeGeometry(r + 0.7, rh, 16), M(x, base + h + 0.8 + rh / 2, z), { uvScale: 0.4 });
    b.add('lead', new THREE.CylinderGeometry(0.06, 0.06, 2.0, 4), M(x, base + h + 0.8 + rh + 0.9, z));
  }
  // 箭窗
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + 0.4;
    for (const yy of [h * 0.35, h * 0.7]) b.add('darkVoid', unitBox(), M(x + Math.cos(a) * (r - 0.05), base + yy, z + Math.sin(a) * (r - 0.05), 0, -a, 0, 0.12, 1.4, 0.4));
  }
  if (opts.collide !== false) addCircle(x, z, r + 0.2, -10, base + h);
}

// 方塔
export function squareTower(b, x, z, w, h, opts = {}) {
  const base = opts.base ?? 0;
  b.box('stone', x - w / 2, base - 3, z - w / 2, x + w / 2, base + h, z + w / 2);
  corbelTable(b, 'stone', x - w / 2 - 0.2, z - w / 2 - 0.1, x + w / 2 + 0.2, z - w / 2 - 0.1, base + h - 0.4, 0.5, 0, -1);
  corbelTable(b, 'stone', x - w / 2 - 0.2, z + w / 2 + 0.1, x + w / 2 + 0.2, z + w / 2 + 0.1, base + h - 0.4, 0.5, 0, 1);
  if (opts.pyramid) {
    b.add('slate', new THREE.ConeGeometry(w * 0.75, opts.pyramid, 4).rotateY(Math.PI / 4), M(x, base + h + opts.pyramid / 2, z), { uvScale: 0.4 });
  } else {
    for (let k = -2; k <= 2; k++) for (const s of [-1, 1]) {
      b.box('stone', x + k * w / 5 - 0.35, base + h, z + s * w / 2 - 0.3, x + k * w / 5 + 0.35, base + h + 1.1, z + s * w / 2 + 0.3);
      b.box('stone', x + s * w / 2 - 0.3, base + h, z + k * w / 5 - 0.35, x + s * w / 2 + 0.3, base + h + 1.1, z + k * w / 5 + 0.35);
    }
  }
  for (let k = 0; k < 3; k++) {
    for (const [dx, dz, ry] of [[0, w / 2, 0], [0, -w / 2, 0], [w / 2, 0, Math.PI / 2], [-w / 2, 0, Math.PI / 2]]) {
      b.add('darkVoid', unitBox(), M(x + dx * 1.01, base + h * (0.3 + k * 0.22), z + dz * 1.01, 0, ry, 0, 0.9, 1.8, 0.05));
    }
  }
  if (opts.collide !== false) addBox(x - w / 2, z - w / 2, x + w / 2, z + w / 2, -10, base + h);
}

// 雉堞墙
export function crenelWall(b, xa, za, xb, zb, h, t = 2.0, base = 0) {
  const len = Math.hypot(xb - xa, zb - za);
  const ang = Math.atan2(-(zb - za), xb - xa);
  b.add('stone', unitBox(), M((xa + xb) / 2, base + h / 2 - 1.5, (za + zb) / 2, 0, ang, 0, len, h + 3, t), { uvScale: 0.25 });
  const n = Math.floor(len / 1.6);
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.5) / n;
    b.add('stone', unitBox(), M(xa + (xb - xa) * t0, base + h + 0.55, za + (zb - za) * t0, 0, ang, 0, 0.8, 1.1, t * 0.6));
  }
  addOBB((xa + xb) / 2, (za + zb) / 2, len / 2, t / 2, ang, -10, base + h);
}

// 小教堂：中殿 + 后殿 + 钟楼/尖塔
export function smallChurch(b, x, z, ang, L, W, H, opts = {}) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (lx, lz) => [x + lx * ca + lz * sa, z - lx * sa + lz * ca];
  // 中殿（沿局部 x，西立面在 lx=0）
  const [cx, cz] = P(L / 2, 0);
  b.add('stone', unitBox(), M(cx, H / 2 - 1, cz, 0, ang, 0, L, H + 2, W), { uvScale: 0.25 });
  const rh = W * 0.75;
  const slope = Math.hypot(W / 2 + 0.4, rh), rAng = Math.atan2(rh, W / 2 + 0.4);
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(L + 0.6, slope);
    g.rotateX(-Math.PI / 2 + s * rAng);
    const [rx, rz] = P(L / 2, s * (W / 4 + 0.1));
    b.add('slate', g, M(rx, H + rh / 2, rz, 0, ang, 0), { uvScale: 0.25 });
  }
  // 山墙
  const tri = [new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rh)];
  for (const lx of [0.15, L - 0.15]) {
    const [gx, gz] = P(lx, 0);
    b.add('stone', extrude(tri, 0.3), M(gx, H, gz, 0, ang + Math.PI / 2, 0));
  }
  // 后殿半圆
  const [ax, az] = P(L, 0);
  b.add('stone', new THREE.CylinderGeometry(W / 2 - 0.3, W / 2 - 0.3, H + 1, 10, 1, false, 0, Math.PI), M(ax, H / 2 - 0.5, az, 0, ang, 0));
  b.add('slate', new THREE.ConeGeometry(W / 2, rh * 0.9, 10, 1, false, 0, Math.PI), M(ax, H + rh * 0.45, az, 0, ang, 0), { uvScale: 0.25 });
  // 西门与圆窗
  const [dx, dz] = P(-0.05, 0);
  b.add('carved', archMolding(2.0, 2.4, 1, 0.12, true, 0, 8), M(dx, 0, dz, 0, ang - Math.PI / 2, 0));
  b.add('door', new THREE.PlaneGeometry(1.8, 3.6), M(...[P(-0.03, 0)[0]], 1.8, P(-0.03, 0)[1], 0, ang - Math.PI / 2, 0), { keepUV: true });
  b.add('carved', new THREE.TorusGeometry(1.0, 0.15, 5, 16), M(dx, H * 0.72, dz, 0, ang + Math.PI / 2, 0));
  b.add('glassOut', new THREE.CircleGeometry(1.0, 16), M(...[P(-0.02, 0)[0]], H * 0.72, P(-0.02, 0)[1], 0, ang - Math.PI / 2, 0), { keepUV: true });
  // 侧窗
  for (let i = 1; i < Math.floor(L / 4); i++) for (const s of [-1, 1]) {
    const [wx, wz] = P(i * 4, s * (W / 2 + 0.02));
    glassWindow(b, wx, 2.5, wz, -s * sa, -s * ca, 1.4, 3.2, 1, i, ['darkVoid', 'glassOut']);
  }
  // 钟楼 / 尖塔
  if (opts.spire !== false) {
    const sh = opts.spireH ?? 14;
    const [tx, tz] = P(opts.towerAt ?? 1.5, 0);
    const tw = Math.min(W * 0.55, 4.5);
    b.add('stone', unitBox(), M(tx, H + rh * 0.5 + 2.5, tz, 0, ang, 0, tw, rh + 5, tw), { uvScale: 0.25 });
    for (const s of [-1, 1]) {
      const [ox, oz] = P(opts.towerAt ?? 1.5, s * tw / 2);
      b.add('darkVoid', unitBox(), M(ox, H + rh + 2.8, oz, 0, ang, 0, 0.9, 2.2, 0.06));
    }
    b.add('slate', new THREE.ConeGeometry(tw * 0.72, sh, 8), M(tx, H + rh + 5 + sh / 2, tz, 0, ang + Math.PI / 8, 0), { uvScale: 0.3 });
    b.add('gold', new THREE.BoxGeometry(0.1, 1.4, 0.1), M(tx, H + rh + 5 + sh + 0.6, tz));
  }
  const [ccx, ccz] = P(L / 2, 0);
  addOBB(ccx, ccz, L / 2 + W / 2, W / 2, ang, -10, H + 10);
}

/* ---------- 主宫医院 Hôtel-Dieu（广场南侧，背靠塞纳河） ---------- */
export function hotelDieu(b) {
  const x0 = -72, x1 = -6;
  for (const [z0, z1] of [[36, 47], [48.5, 59.5]]) {
    const W = z1 - z0, zc = (z0 + z1) / 2;
    const holes = [];
    for (let i = 0; i < 9; i++) holes.push({ x: 4 + i * 7.1, y: 3.0, w: 2.2, spring: 4.2, k: 1 });
    wallX(b, 'stone', x0, x1 - x0, -2, 13, z0 + 0.5, 1.0, holes);
    wallX(b, 'stone', x0, x1 - x0, -4, 15, z1 - 0.5, 1.0, holes.map(h => ({ ...h, y: 5.0 })));
    for (let i = 0; i < 9; i++) {
      glassWindow(b, x0 + 4 + i * 7.1, 1.0, z0 + 0.5, 0, 1, 2.2, 4.2, 1, i, ['darkVoid', 'glassOut']);
    }
    wallZ(b, 'stone', z0, W, -4, 11 + 4, x0 + 0.5, 1.0);
    wallZ(b, 'stone', z0, W, -4, 11 + 4, x1 - 0.5, 1.0);
    roofX(b, 'slate', x0 - 0.5, x1 + 0.5, zc, W / 2 + 0.6, 11, 11 + W * 0.85, true);
    // 山墙
    const tri = [new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, W * 0.85)];
    for (const x of [x0 + 0.3, x1 - 0.3]) b.add('stone', extrude(tri, 0.5), M(x, 11, zc, 0, Math.PI / 2, 0));
    // 屋顶老虎窗
    for (let i = 0; i < 6; i++) {
      const x = x0 + 7 + i * 10;
      b.box('plaster', x - 0.8, 12, z0 + 1.6, x + 0.8, 14.5, z0 + 3.2);
      b.add('slate', new THREE.ConeGeometry(1.3, 1.6, 4).rotateY(Math.PI / 4), M(x, 15.3, z0 + 2.4), { uvScale: 0.5 });
      b.box('darkVoid', x - 0.4, 12.6, z0 + 1.58, x + 0.4, 14, z0 + 1.6);
    }
    addBox(x0, z0, x1, z1, -10, 30);
  }
  // 面向广场的礼拜堂门廊
  const gx = -30;
  b.box('stone', gx - 4, 0, 32.5, gx + 4, 9, 36.2);
  b.add('carved', archMolding(3.2, 3.2, 1, 0.15, true, 0, 10), M(gx, 0, 32.4));
  b.add('door', new THREE.PlaneGeometry(2.8, 3.2), M(gx, 1.6, 32.42), { keepUV: true });
  const tri = [new THREE.Vector2(-4.2, 0), new THREE.Vector2(4.2, 0), new THREE.Vector2(0, 4.5)];
  b.add('stone', extrude(tri, 3.7), M(gx, 9, 34.35));
  b.add('statue', statueGeometry('saint'), M(gx, 5.6, 32.2, 0, Math.PI, 0, 0.9, 0.9, 0.9), { uvScale: 1.2 });
  addBox(gx - 4, 32.5, gx + 4, 36.2, -10, 20);
}

/* ---------- 桥梁 ---------- */
// 石拱桥（沿 z 方向跨河），可带两侧房屋
export function bridge(b, x, z0, z1, width, opts = {}) {
  const len = z1 - z0;
  const deck = 0.3;
  if (opts.wooden) {
    b.box('woodDark', x - width / 2, deck - 0.5, z0, x + width / 2, deck, z1, { uvScale: 0.5 });
    for (let zz = z0 + 4; zz < z1 - 2; zz += 7) {
      for (let xx = x - width / 2 + 0.6; xx <= x + width / 2 - 0.5; xx += 1.6) {
        b.cyl('woodDark', xx, -9, zz, 0.28, 9 + deck - 0.4, 6);
      }
      b.box('woodDark', x - width / 2, deck - 1.4, zz - 0.3, x + width / 2, deck - 0.5, zz + 0.3, { uvScale: 0.5 });
    }
  } else {
    const holes = [];
    const n = Math.max(2, Math.round(len / 10));
    const span = len / n;
    for (let i = 0; i < n; i++) holes.push({ x: (i + 0.5) * span, y: 1.0, w: span - 3.4, spring: 4.0, k: 0.5 });
    wallZ(b, 'stone', z0, len, -9, 9 + deck, x, width, holes);
    // 桥墩分水尖
    for (let i = 1; i < n; i++) {
      for (const s of [-1, 1]) {
        b.add('stone', new THREE.CylinderGeometry(0.01, 1.7, 3.0, 3).rotateX(Math.PI / 2).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2), M(x + s * (width / 2 + 0.9), -3.4, z0 + i * span, 0, 0, 0, 1, 5.0, 1));
      }
    }
  }
  addPlatform(x - width / 2, z0 - 1, x + width / 2, z1 + 1, deck);
  if (!opts.houses) {
    balustrade(b, opts.wooden ? 'wood' : 'stone', x - width / 2 + 0.2, z0, x - width / 2 + 0.2, z1, deck, 1.0, 1.2);
    balustrade(b, opts.wooden ? 'wood' : 'stone', x + width / 2 - 0.2, z0, x + width / 2 - 0.2, z1, deck, 1.0, 1.2);
    addBox(x - width / 2 - 0.5, z0, x - width / 2 + 0.3, z1, -10, 3);
    addBox(x + width / 2 - 0.3, z0, x + width / 2 + 0.5, z1, -10, 3);
    return;
  }
  // 桥上房屋（背面悬挑于河面之上）
  const street = opts.street ?? 6;
  const d = (width - street) / 2;
  let t = 1.0;
  const rng = opts.rng;
  while (t < len - 4) {
    const w = opts.uniform ? 4.6 : 3.6 + rng() * 2.4;
    if (t + w > len - 1) break;
    const zc = z0 + t + w / 2;
    const n = opts.uniform ? 4 : 3 + Math.floor(rng() * 2);
    addHouse(b, x - width / 2 - 0.6, zc, Math.PI / 2, { w: w - 0.05, d: d + 0.6, n, rng, base: deck, gableFront: true, jetty: 0.25, roofKey: opts.uniform ? 'slate' : undefined });
    addHouse(b, x + width / 2 + 0.6, zc, -Math.PI / 2, { w: w - 0.05, d: d + 0.6, n, rng, base: deck, gableFront: true, jetty: 0.25, roofKey: opts.uniform ? 'slate' : undefined });
    // 悬挑支撑
    for (const s of [-1, 1]) b.box('woodDark', x + s * (width / 2 + 0.3) - 0.15, deck - 2.2, zc - 0.15, x + s * (width / 2 + 0.3) + 0.15, deck, zc + 0.15);
    t += w;
  }
}

/* ---------- 河滩广场 Place de Grève ---------- */
export function placeDeGreve(b, mats, scene) {
  // 柱屋（市政厅前身）：底层为柱廊
  const mx0 = 58, mx1 = 70, mz0 = -306, mz1 = -270;
  for (let i = 0; i <= 6; i++) {
    const z = mz0 + 1 + i * (mz1 - mz0 - 2) / 6;
    b.cyl('stone', mx0 + 0.6, -1, z, 0.42, 5.2, 10);
    b.cyl('carved', mx0 + 0.6, 3.8, z, 0.42, 0.5, 8, 0.6);
  }
  b.box('stone', mx0 + 2.5, -1, mz0, mx1, 4.3, mz1);
  b.box('stone', mx0, 4.3, mz0, mx1, 15.5, mz1);
  b.box('carved', mx0 - 0.3, 4.2, mz0, mx0 + 0.3, 4.7, mz1);
  for (let k = 0; k < 2; k++) for (let i = 0; i < 7; i++) {
    const z = mz0 + 2.6 + i * 5;
    glassWindow(b, mx0 - 0.01, 6.2 + k * 4.5, z, 1, 0, 1.6, 2.4, 0.55, i, ['darkVoid', 'glassOut']);
    b.box('carved', mx0 - 0.15, 6.0 + k * 4.5, z - 0.2, mx0 + 0.05, 9.4 + k * 4.5, z + 0.2);
  }
  roofZ(b, 'slate', mz0 - 0.4, mz1 + 0.4, (mx0 + mx1) / 2, (mx1 - mx0) / 2 + 0.6, 15.5, 25);
  for (let i = 0; i < 4; i++) {
    b.box('plaster', mx0 + 1, 17, mz0 + 4 + i * 8.5 - 0.8, mx0 + 2.6, 19.5, mz0 + 4 + i * 8.5 + 0.8);
    b.add('slate', new THREE.ConeGeometry(1.3, 2, 4).rotateY(Math.PI / 4), M(mx0 + 1.8, 20.5, mz0 + 4 + i * 8.5), { uvScale: 0.5 });
  }
  b.add('redCloth', new THREE.PlaneGeometry(2, 3), M(mx0 - 0.4, 11, (mz0 + mz1) / 2, 0, -Math.PI / 2, 0));
  addBox(mx0 + 2.5, mz0, mx1, mz1, -10, 30);
  for (let i = 0; i <= 6; i++) addCircle(mx0 + 0.6, mz0 + 1 + i * (mz1 - mz0 - 2) / 6, 0.5, -10, 6);

  // 耻辱柱（雨果：一个约十尺高的空心方石台，顶上一个水平橡木转轮）
  const px = 0, pz = -282;
  b.box('stone', px - 1.8, -1, pz - 1.8, px + 1.8, 3.1, pz + 1.8);
  b.box('carved', px - 2.0, 3.0, pz - 2.0, px + 2.0, 3.3, pz + 2.0);
  for (let k = 0; k < 10; k++) b.box('stone', px - 2.0 - (10 - k) * 0.38, -1, pz - 0.6, px - 1.8, 0.31 * (k + 1), pz + 0.6);
  const wheel = new THREE.Group();
  const wTop = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 20), mats.wood);
  wheel.add(wTop);
  for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.12), mats.woodDark); sp.rotation.y = k * Math.PI / 8; sp.position.y = 0.17; wheel.add(sp); }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.0, 8), mats.woodDark);
  axle.position.y = -0.5; wheel.add(axle);
  wheel.position.set(px, 3.65, pz);
  wheel.traverse(o => { o.castShadow = true; });
  scene.add(wheel);
  world.animated.push((t) => { wheel.rotation.y = Math.sin(t * 0.15) * 0.4; });
  addBox(px - 2.0, pz - 2.0, px + 2.0, pz + 2.0, -10, 3.2);
  addPlatform(px - 1.9, pz - 1.9, px + 1.9, pz + 1.9, 3.3);
  addRamp(px - 5.8, pz - 0.6, px - 2.0, pz + 0.6, 0, 3.2, 'x');

  // 绞刑架
  const gx = 22, gz = -276;
  b.box('stone', gx - 2.5, -1, gz - 1.5, gx + 2.5, 1.2, gz + 1.5);
  for (const dx of [-1.8, 1.8]) b.box('woodDark', gx + dx - 0.18, 1.2, gz - 0.18, gx + dx + 0.18, 7.5, gz + 0.18, { uvScale: 1 });
  b.box('woodDark', gx - 2.3, 7.3, gz - 0.2, gx + 2.3, 7.7, gz + 0.2, { uvScale: 1 });
  for (const dx of [-1.8, 1.8]) {
    const g = new THREE.BoxGeometry(0.14, 1.8, 0.14);
    b.add('woodDark', g, M(gx + dx * 0.72, 6.6, gz, 0, 0, dx > 0 ? -0.75 : 0.75), { uvScale: 1 });
  }
  b.box('woodDark', gx - 0.5, 1.2, gz + 0.7, gx + 0.5, 6.8, gz + 0.85, { uvScale: 1 });
  addBox(gx - 2.5, gz - 1.5, gx + 2.5, gz + 1.5, -10, 8);

  // 河滩十字架
  const cx = 30, cz = -252;
  for (let k = 0; k < 3; k++) b.box('stone', cx - 1.5 + k * 0.4, -1, cz - 1.5 + k * 0.4, cx + 1.5 - k * 0.4, 0.3 + k * 0.3, cz + 1.5 - k * 0.4);
  b.box('stone', cx - 0.2, 1.2, cz - 0.2, cx + 0.2, 6.2, cz + 0.2);
  b.box('stone', cx - 1.0, 4.6, cz - 0.18, cx + 1.0, 5.0, cz + 0.18);
  addBox(cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5, -10, 6);

  // 罗兰塔与“老鼠洞”（隐修女居尔迪勒的囚室，窗上刻 TU, ORA）
  const rx = -46, rz = -248;
  b.box('stone', rx - 6, -2, rz - 9, rx + 6, 13, rz + 5);
  roofX(b, 'tile', rx - 6.5, rx + 6.5, rz - 2, 7.6, 13, 19, true);
  roundTower(b, rx + 6, rz - 9, 2.4, 18, { roofH: 7 });
  for (let k = 0; k < 3; k++) glassWindow(b, rx - 6.02, 5 + k * 3.5 - 2, rz - 6 + k * 3.5, -1, 0, 1.2, 1.6, 0.5, k, ['glassOut', 'darkVoid']);
  // 囚室窗：朝向广场，带十字铁栏
  const wx = rx + 6.02, wy = 0.9, wz = rz + 1;
  b.box('darkVoid', wx, wy, wz - 0.8, wx + 0.02, wy + 1.0, wz + 0.8);
  b.box('iron', wx + 0.03, wy + 0.45, wz - 0.8, wx + 0.08, wy + 0.55, wz + 0.8);
  b.box('iron', wx + 0.03, wy, wz - 0.05, wx + 0.08, wy + 1.0, wz + 0.05);
  b.box('carved', wx, wy - 0.25, wz - 1.0, wx + 0.25, wy, wz + 1.0);
  const lbl = document.createElement('canvas'); lbl.width = 256; lbl.height = 64;
  const lc = lbl.getContext('2d'); lc.fillStyle = '#b8aa8c'; lc.fillRect(0, 0, 256, 64);
  lc.font = 'bold 40px serif'; lc.fillStyle = '#4a3a28'; lc.textAlign = 'center'; lc.textBaseline = 'middle'; lc.fillText('TU, ORA.', 128, 34);
  const lt = new THREE.CanvasTexture(lbl); lt.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
  label.position.set(wx + 0.03, wy + 1.3, wz); label.rotation.y = Math.PI / 2;
  scene.add(label);
  b.box('lead', rx + 6.0, 4.0, rz - 3, rx + 7.2, 4.15, rz + 4); // 小檐篷
  addBox(rx - 6, rz - 9, rx + 6, rz + 5, -10, 20);
  // 墙上的祈祷书挂钩（雨果描写的公用祈祷书）
  b.box('wood', wx + 0.02, 1.6, wz + 1.3, wx + 0.35, 1.65, wz + 2.0);
}

/* ---------- 西岱宫（王宫）与圣礼拜堂 ---------- */
export function palaisCite(b, rng) {
  // 东侧围墙（沿巴里耶里街）与宫门
  crenelWall(b, -468, -116, -468, -8, 9);
  crenelWall(b, -468, 8, -468, 56, 9);
  squareTower(b, -468, -10, 6, 14, { pyramid: 6 });
  squareTower(b, -468, 10, 6, 14, { pyramid: 6 });
  b.box('stone', -471, 9, -7, -465, 12, 7);
  b.add('carved', archMolding(5.2, 4.0, 1, 0.2, true, 0, 10), M(-465.0, 0, 0, 0, Math.PI / 2, 0));
  // 南侧沿河的墙
  crenelWall(b, -740, 56, -468, 56, 7);
  // 大厅（双中殿，屋顶两道平行屋脊）
  const hx0 = -625, hx1 = -548, hz0 = -100, hz1 = -70;
  b.box('stone', hx0, -2, hz0, hx1, 16, hz1);
  roofX(b, 'slate', hx0 - 0.5, hx1 + 0.5, hz0 + 7.5, 8.0, 16, 26, true);
  roofX(b, 'slate', hx0 - 0.5, hx1 + 0.5, hz1 - 7.5, 8.0, 16, 26, true);
  for (let i = 0; i < 10; i++) {
    glassWindow(b, hx0 + 4 + i * 7.6, 6, hz1 + 0.02, 0, -1, 2.4, 5.5, 1, i, ['darkVoid', 'glassOut']);
    glassWindow(b, hx0 + 4 + i * 7.6, 6, hz0 - 0.02, 0, 1, 2.4, 5.5, 1, i, ['darkVoid', 'glassOut']);
  }
  addBox(hx0, hz0, hx1, hz1, -10, 30);
  // 沿北岸的塔楼：钟塔（1370 年安装巴黎第一座公共大钟）、恺撒塔、银塔、邦贝克塔
  squareTower(b, -478, -108, 10, 34, { pyramid: 12 });
  // 钟面
  const clk = document.createElement('canvas'); clk.width = clk.height = 256;
  const cc = clk.getContext('2d');
  cc.fillStyle = '#1d3170'; cc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) { cc.fillStyle = '#e2b84a'; cc.beginPath(); cc.arc(Math.random() * 256, Math.random() * 256, 2, 0, 7); cc.fill(); }
  cc.fillStyle = '#c9a23a'; cc.beginPath(); cc.arc(128, 128, 96, 0, 7); cc.fill();
  cc.fillStyle = '#e9dcc0'; cc.beginPath(); cc.arc(128, 128, 84, 0, 7); cc.fill();
  cc.fillStyle = '#222'; cc.font = 'bold 20px serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle';
  ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((r, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; cc.fillText(r, 128 + Math.cos(a) * 66, 128 + Math.sin(a) * 66); });
  const ct = new THREE.CanvasTexture(clk); ct.colorSpace = THREE.SRGBColorSpace;
  world.clockTex = ct;
  world.clockSpot = new THREE.Vector3(-472.9, 20, -108);
  roundTower(b, -540, -112, 6, 28, { roofH: 15 });
  roundTower(b, -560, -112, 6, 28, { roofH: 15 });
  roundTower(b, -610, -112, 5.5, 24, { crenel: true });
  crenelWall(b, -654, -114, -472, -114, 12, 3);
  // 王宫居所与蒙哥马利塔（主楼）
  b.box('stone', -680, -2, -40, -630, 18, -10);
  roofX(b, 'slate', -681, -629, -25, 16, 18, 30, true);
  for (let i = 0; i < 6; i++) b.box('darkVoid', -676 + i * 8, 7, -10.02, -674 + i * 8, 11, -10.0);
  addBox(-680, -40, -630, -10, -10, 30);
  roundTower(b, -690, -60, 8, 32, { roofH: 18 });
  // 圣礼拜堂（1248 年，路易九世为供奉荆棘冠而建）
  sainteChapelle(b, -560, -24);
  // 西端御花园的围墙
  crenelWall(b, -700, -100, -700, 50, 5, 1.2);
}

function sainteChapelle(b, x0, zc) {
  const L = 34, W = 11, H = 33;
  const x1 = x0 + L;
  // 下层（低矮的下层礼拜堂）+ 上层（高大彩窗）
  b.box('stone', x0, -2, zc - W / 2, x1, 9, zc + W / 2);
  b.box('stone', x0, 9, zc - W / 2 + 0.6, x1, H, zc + W / 2 - 0.6);
  // 扶壁 + 小尖塔
  const nb = 5;
  for (let i = 0; i <= nb; i++) {
    const x = x0 + i * L / nb;
    for (const s of [-1, 1]) {
      b.box('stone', x - 0.7, -2, zc + s * (W / 2) - (s < 0 ? 1.8 : 0), x + 0.7, H - 2, zc + s * (W / 2) + (s > 0 ? 1.8 : 0));
      b.add('stone', pinnacleGeometry(0.6, 6), M(x, H - 2, zc + s * (W / 2 + 0.9)));
    }
  }
  // 上层高窗（15 米高）
  for (let i = 0; i < nb; i++) {
    const x = x0 + (i + 0.5) * L / nb;
    for (const s of [-1, 1]) {
      glassWindow(b, x, 10.5, zc + s * (W / 2 - 0.58), 0, -s, 5.2, 15, 1, i, ['darkVoid', 'glassOut']);
      const gab = [new THREE.Vector2(-3.0, 0), new THREE.Vector2(3.0, 0), new THREE.Vector2(0, 3.4)];
      b.add('carved', extrude(gab, 0.3), M(x, H - 0.4, zc + s * (W / 2 - 0.4)));
      glassWindow(b, x, 3.5, zc + s * (W / 2 + 0.01), 0, -s, 2.0, 2.2, 0.6, i, ['darkVoid', 'glassOut']);
    }
  }
  corbelTable(b, 'carved', x0, zc - W / 2 + 0.5, x1, zc - W / 2 + 0.5, H - 0.3, 0.5, 0, -1);
  corbelTable(b, 'carved', x0, zc + W / 2 - 0.5, x1, zc + W / 2 - 0.5, H - 0.3, 0.5, 0, 1);
  balustrade(b, 'carved', x0, zc - W / 2 + 0.3, x1, zc - W / 2 + 0.3, H, 1.0, 0.5);
  balustrade(b, 'carved', x0, zc + W / 2 - 0.3, x1, zc + W / 2 - 0.3, H, 1.0, 0.5);
  // 陡峭屋顶 + 东端多边形后殿
  roofX(b, 'lead', x0 + 0.5, x1, zc, W / 2, H, H + 11.5);
  const apse = new THREE.CylinderGeometry(W / 2 - 0.6, W / 2 - 0.6, H + 2, 7, 1, false, 0, Math.PI);
  b.add('stone', apse, M(x1, H / 2 - 1, zc, 0, 0, 0));
  b.add('lead', new THREE.ConeGeometry(W / 2, 11.5, 7, 1, false, 0, Math.PI), M(x1, H + 5.75, zc), { uvScale: 0.3 });
  for (let k = 0; k < 4; k++) {
    const a = (k + 0.5) / 4 * Math.PI;
    glassWindow(b, x1 + Math.sin(a) * (W / 2 - 0.62), 10.5, zc + Math.cos(a) * (W / 2 - 0.62), -Math.sin(a), -Math.cos(a), 2.6, 15, 1, k, ['darkVoid', 'glassOut']);
  }
  // 西立面：门廊、玫瑰窗、两侧小塔
  b.box('stone', x0 - 4.5, -2, zc - W / 2, x0, 8, zc + W / 2);
  b.box('lead', x0 - 4.6, 8, zc - W / 2, x0, 8.4, zc + W / 2);
  for (const z of [zc - 3, zc + 3]) b.add('carved', archMolding(2.8, 3.2, 1, 0.15, true, 0, 10), M(x0 - 4.55, 0, z, 0, -Math.PI / 2, 0));
  b.add('glassOut', new THREE.CircleGeometry(4.2, 32), M(x0 - 0.62, 20, zc, 0, -Math.PI / 2, 0), { keepUV: true });
  b.add('carved', new THREE.TorusGeometry(4.3, 0.3, 6, 32), M(x0 - 0.65, 20, zc, 0, Math.PI / 2, 0));
  const tri = [new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, 11.5)];
  b.add('stone', extrude(tri, 0.6), M(x0 + 0.3, H, zc, 0, Math.PI / 2, 0));
  for (const s of [-1, 1]) {
    b.cyl('stone', x0 - 0.5, -2, zc + s * (W / 2 + 0.6), 1.3, H + 6, 8);
    b.add('lead', new THREE.ConeGeometry(1.4, 6, 8), M(x0 - 0.5, H + 7, zc + s * (W / 2 + 0.6)), { uvScale: 0.5 });
  }
  // 屋脊上的镂空尖塔（1460 年重建）
  const sx = x0 + L * 0.45;
  b.add('lead', new THREE.CylinderGeometry(1.6, 1.9, 6, 8), M(sx, H + 13, zc), { uvScale: 0.5 });
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    b.add('lead', pinnacleGeometry(0.2, 2.4), M(sx + Math.cos(a) * 1.7, H + 16, zc + Math.sin(a) * 1.7));
  }
  b.add('lead', new THREE.ConeGeometry(1.5, 22, 8), M(sx, H + 16 + 11, zc), { uvScale: 0.5 });
  b.add('gold', new THREE.BoxGeometry(0.12, 2.0, 0.12), M(sx, H + 38.5, zc));
  b.add('gold', new THREE.BoxGeometry(0.9, 0.12, 0.12), M(sx, H + 38.8, zc));
  addBox(x0 - 4.5, zc - W / 2 - 2, x1 + W / 2, zc + W / 2 + 2, -10, 60);
}

/* ---------- 大、小夏特莱堡 ---------- */
export function petitChatelet(b, x, z) {
  // 小夏特莱：横跨小桥南端的城堡式门楼
  b.box('stone', x - 14, -2, z, x - 4.5, 14, z + 16);
  b.box('stone', x + 4.5, -2, z, x + 14, 14, z + 16);
  b.box('stone', x - 4.5, 7, z, x + 4.5, 14, z + 16);
  b.add('stone', archMolding(9, 3.0, 0.55, 0.3, true, 0, 10), M(x, 0, z - 0.1));
  b.add('stone', archMolding(9, 3.0, 0.55, 0.3, true, 0, 10), M(x, 0, z + 16.1));
  for (const dx of [-14, 14]) roundTower(b, x + dx, z + 2, 4.2, 20, { roofH: 11 });
  for (const dx of [-14, 14]) roundTower(b, x + dx, z + 14, 3.8, 18, { roofH: 10 });
  roofX(b, 'slate', x - 14, x + 14, z + 8, 8.5, 14, 22, true);
  addBox(x - 14, z, x - 4.5, z + 16, -10, 30);
  addBox(x + 4.5, z, x + 14, z + 16, -10, 30);
}

export function grandChatelet(b, x, z) {
  // 大夏特莱：钱币兑换桥北端的巨大城堡，带中央门道
  b.box('stone', x - 22, -2, z - 30, x - 5, 18, z);
  b.box('stone', x + 5, -2, z - 30, x + 26, 18, z);
  b.box('stone', x - 5, 8, z - 30, x + 5, 18, z);
  b.add('stone', archMolding(10, 3.5, 0.55, 0.3, true, 0, 10), M(x, 0, z + 0.1));
  roundTower(b, x - 22, z, 6, 26, { roofH: 14 });
  roundTower(b, x + 26, z, 6.5, 28, { roofH: 15 });
  roundTower(b, x - 22, z - 30, 5.5, 24, { roofH: 13 });
  roundTower(b, x + 26, z - 30, 6, 30, { roofH: 16 });
  squareTower(b, x + 6, z - 18, 10, 30, { pyramid: 10 });
  roofX(b, 'slate', x - 22, x + 26, z - 15, 15.5, 18, 28, true);
  addBox(x - 22, z - 30, x - 5, z, -10, 30);
  addBox(x + 5, z - 30, x + 26, z, -10, 30);
  void rngDummy;
}
const rngDummy = 0;

/* ---------- 水磨坊（磨坊桥下转动的水车） ---------- */
export function millWheels(scene, mats, x, z0, z1) {
  const spinners = [];
  for (let z = z0 + 8; z < z1 - 6; z += 16) {
    const g = new THREE.Group();
    const sp = new THREE.Group();
    g.add(sp);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 5, 24), mats.woodDark);
    sp.add(rim);
    const rim2 = rim.clone(); rim2.position.z = 1.2; sp.add(rim2);
    for (let k = 0; k < 12; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 1.3), mats.wood);
      const a = k / 12 * Math.PI * 2;
      p.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.6);
      p.rotation.z = a;
      sp.add(p);
    }
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8).rotateX(Math.PI / 2), mats.woodDark);
    ax.position.z = 0.6; sp.add(ax);
    g.position.set(x + 4.5, WATER_Y + 1.6, z);
    g.rotation.y = Math.PI / 2;
    g.traverse(o => { o.castShadow = true; });
    scene.add(g);
    spinners.push(sp);
  }
  world.animated.push((t) => spinners.forEach(sp => { sp.rotation.z = -t * 0.6; }));
}
