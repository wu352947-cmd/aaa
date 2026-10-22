// 1482 年的巴黎：西岱岛、右岸（城区）、左岸（大学区）
import * as THREE from 'three';
import { Builder, M, unitBox, archMolding, extrude } from '../geom.js';
import { mulberry32 } from '../util.js';
import { buildTerrain, terrainHeight, landSDF, WATER_Y } from './terrain.js';
import { addHouse, fillBlock } from './houses.js';
import { hotelDieu, bridge, placeDeGreve, palaisCite, petitChatelet, grandChatelet, smallChurch, roundTower, squareTower, crenelWall, millWheels } from './landmarks.js';
import { addBox, addPlatform, world } from '../world.js';
import { roofX, glassWindow } from '../cathedral/parts.js';

const CELL = 260;

// 按空间网格分块合并，使视锥剔除生效
class CellBuilders {
  constructor() { this.cells = new Map(); }
  at(x, z) {
    const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    if (!this.cells.has(k)) this.cells.set(k, new Builder());
    return this.cells.get(k);
  }
  build(mats, parent) {
    for (const [k, b] of this.cells) b.build(mats, parent, { name: 'city' + k });
  }
}

export function buildCity(scene, mats, quality = 'medium') {
  const rng = mulberry32(1482);
  const group = new THREE.Group();
  group.name = 'Paris1482';
  buildTerrain(scene, mats);
  const cb = new CellBuilders();
  const B = (x, z) => cb.at(x, z);

  /* ======================= 西岱岛 ======================= */
  // 圣母院前广场铺装（略小于今日）
  addPlatform(-58, -34, -6, 34, 0.02);
  // 广场北侧：圣约翰圆堂（卡西莫多被遗弃时所在的洗礼堂，紧贴北钟楼）
  smallChurch(B(7, -30), 0.5, -29, 0, 13.5, 8, 9, { spireH: 7, towerAt: 11 });
  // 弃婴木床（雨果：卡西莫多在“卡西莫多主日”被放在这里）
  B(-8, -18).box('wood', -9, 0, -19.2, -6, 0.5, -17.8);
  B(-8, -18).box('woodDark', -9, 0.5, -19.2, -8.8, 1.3, -17.8);
  addBox(-9, -19.2, -6, -17.8, -1, 0.6);
  // 广场北侧圣克里斯托夫教堂
  smallChurch(B(-40, -45), -54, -46, 0, 22, 9, 10, { spireH: 10, towerAt: 3 });
  // 主宫医院
  hotelDieu(B(-40, 48));
  // 广场周边与西侧街区
  const exclusions = [
    [-56, -52, -30, -40],     // 圣克里斯托夫
    [-135, -44, -100, -26],   // 圣玛德莱娜
    [-140, 8, -100, 30],      // 老圣日耳曼
    [-300, -44, -262, -26],   // 圣皮埃尔-德-阿西
    [-395, -44, -355, -24],   // 圣巴泰勒米
  ];
  const skip = (x, z) => exclusions.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
  // 广场北面的房屋（面朝广场）
  fillBlock(B(-35, -60), -76, -118, -4, -36, 'swn', rng, { skip, stories: [3, 5] });
  fillBlock(B(-67, -18), -76, -32, -60, -4, 'esw', rng, { stories: [3, 4], depth: [6, 8] });
  fillBlock(B(-67, 18), -76, 4, -60, 31, 'enw', rng, { stories: [3, 4], depth: [6, 8] });
  // 主宫医院西侧、靠近小桥
  fillBlock(B(-80, 45), -76, 37, -74, 58, 'w', rng, { stories: [3, 4], depth: [6, 7] });
  // 西侧网格街区
  const NS = [[-84, -156], [-164, -236], [-244, -316], [-324, -396], [-404, -464]];
  const EW = [[-118, -65], [-59, -4], [4, 31], [37, 58]];
  for (const [xe, xw] of NS) {
    for (const [zn, zs] of EW) {
      const sides = 'nsew';
      fillBlock(B((xe + xw) / 2, (zn + zs) / 2), xw, zn, xe, zs, sides, rng, { skip, stories: [3, 5] });
    }
  }
  // 岛内教堂
  smallChurch(B(-118, -35), -134, -35, 0, 26, 10, 11, { spireH: 12, towerAt: 2 });   // 圣玛德莱娜
  smallChurch(B(-120, 19), -138, 19, 0, 30, 11, 12, { spireH: 15, towerAt: 3 });     // 老圣日耳曼（雨果：1458 年后殿加长）
  smallChurch(B(-280, -35), -298, -35, 0, 26, 9, 10, { spireH: 11, towerAt: 2 });    // 圣皮埃尔-德-阿西
  smallChurch(B(-375, -34), -393, -34, 0, 30, 11, 12, { spireH: 14, towerAt: 3 });   // 圣巴泰勒米（王室教区）
  smallChurch(B(150, -12), 140, -12, 0, 18, 8, 9, { spireH: 8, towerAt: 2 });         // 圣德尼-杜帕（后殿东侧）
  // 圣母院修道院（议事司铎住宅），北侧
  fillBlock(B(60, -95), 0, -118, 130, -72, 'sn', rng, { stories: [2, 3], depth: [8, 12], gableRatio: 0.4 });
  fillBlock(B(60, -60), 20, -62, 120, -50, 's', rng, { stories: [2, 3], depth: [7, 9], gableRatio: 0.3 });
  crenelWall(B(-2, -80), -3, -118, -3, -42, 3.5, 0.8);
  // 主教宫（南侧，背靠河）
  const bp = B(70, 45);
  bp.box('stone', 40, -2, 36, 98, 12, 54);
  roofX(bp, 'slate', 39.5, 98.5, 45, 9.6, 12, 21, true);
  for (let i = 0; i < 8; i++) glassWindow(bp, 44 + i * 7, 4, 35.98, 0, 1, 1.8, 3.4, 1, i, ['darkVoid', 'glassOut']);
  addBox(40, 36, 98, 54, -10, 30);
  smallChurch(B(110, 44), 100, 44, 0, 16, 8, 11, { spireH: 6, towerAt: 2 });       // 主教礼拜堂
  roundTower(B(40, 36), 40, 36, 2.6, 18, { roofH: 7 });
  // 东端花园（“田地”）矮墙
  crenelWall(B(140, 40), 128, 58, 200, 40, 2.0, 0.6);

  /* ---------- 桥梁 ---------- */
  bridge(B(-80, 85), -80, 56, 112, 14, { houses: true, rng, street: 5 });          // 小桥 Petit-Pont
  bridge(B(-160, -180), -160, -238, -120, 20, { houses: true, rng, street: 8, uniform: true }); // 圣母桥（1413 年木桥，60 间房）
  bridge(B(-400, -180), -400, -242, -120, 18, { houses: true, rng, street: 7 });   // 钱币兑换桥 Pont au Change
  bridge(B(-428, -180), -430, -240, -122, 6, { wooden: true });                     // 磨坊桥 Pont aux Meuniers
  millWheels(scene, mats, -430, -232, -128);
  bridge(B(-400, 85), -400, 56, 112, 14, { houses: true, rng, street: 5 });        // 圣米歇尔桥
  // 桥头连接地面的平台
  for (const [x, w] of [[-80, 14], [-400, 14]]) addPlatform(x - w / 2, 50, x + w / 2, 58, 0.25);

  /* ---------- 西岱宫与圣礼拜堂 ---------- */
  palaisCite(B(-560, -40), rng);

  /* ======================= 右岸 ======================= */
  placeDeGreve(B(0, -280), mats, scene);
  grandChatelet(B(-400, -265), -400, -246);
  // 河滩广场周边房屋
  fillBlock(B(-80, -300), -110, -330, -52, -242, 'ens', rng, { stories: [4, 5] });
  fillBlock(B(10, -340), -48, -372, 56, -318, 'swne', rng, { stories: [4, 5] });
  fillBlock(B(100, -290), 76, -320, 150, -246, 'wns', rng, { stories: [4, 5] });
  // 河滩圣约翰教堂与圣热尔维教堂（尖塔可见）
  smallChurch(B(110, -350), 92, -345, 0, 30, 12, 14, { spireH: 22, towerAt: 4 });
  smallChurch(B(200, -320), 180, -318, 0, 36, 13, 15, { spireH: 18, towerAt: 4 });
  // 屠宰场圣雅各教堂（中世纪钟楼）
  smallChurch(B(-310, -340), -330, -338, 0, 34, 13, 15, { spireH: 16, towerAt: 3 });
  squareTower(B(-330, -330), -334, -330, 9, 36, { pyramid: 14 });
  // 右岸沿河第一排街区
  const rbBlocks = [];
  for (let x = -980; x < 760; ) {
    const w = 52 + rng() * 30;
    rbBlocks.push([x, x + w]);
    x += w + 7;
  }
  const rbSkip = (x0, x1) => (x1 > -118 && x0 < 160) || (x1 > -432 && x0 < -366);
  for (const [x0, x1] of splitGaps(rbBlocks, [[-172, -148]])) {
    if (rbSkip(x0, x1)) continue;
    const zq = Math.max(bankAt(x0), bankAt(x1)) - 7;
    const detailed = x1 > -620 && x0 < 420;
    if (detailed) fillBlock(B((x0 + x1) / 2, zq - 25), x0, zq - 48, x1, zq, 'nsew', rng, { stories: [3, 5] });
    else massBlock(B((x0 + x1) / 2, zq - 25), x0, zq - 48, x1, zq, rng);
  }
  // 更远的右岸城区（简化体块）
  for (let row = 0; row < (quality === 'low' ? 3 : 7); row++) {
    for (let x = -1250; x < 1250;) {
      const w = 50 + rng() * 40;
      const zq = -300 - row * 62 - (rng() * 6);
      const near = row === 0 && x + w > -620 && x < 420;
      const free = (x + w > -60 && x < 170 && row === 0) || (x + w > -440 && x < -280 && row === 0);
      if (!free && rng() > 0.06) {
        if (near) fillBlock(B(x + w / 2, zq - 24), x, zq - 50, x + w, zq, 'nsew', rng, { stories: [3, 5] });
        else massBlock(B(x + w / 2, zq - 24), x, zq - 50, x + w, zq, rng);
      }
      x += w + 8;
    }
  }

  /* ======================= 左岸 ======================= */
  petitChatelet(B(-80, 120), -80, 108);
  const lbBlocks = [];
  for (let x = -980; x < 700;) {
    const w = 50 + rng() * 30;
    lbBlocks.push([x, x + w]);
    x += w + 7;
  }
  for (const [x0, x1] of lbBlocks) {
    if (x1 > -100 && x0 < -60) continue;
    const zq = Math.min(bankSAt(x0), bankSAt(x1)) + 7;
    const detailed = x1 > -480 && x0 < 300;
    if (x1 > -410 && x0 < -390) { // 圣米歇尔桥头留出街道
      fillBlock(B(x0, zq + 25), x0, zq, -407, zq + 46, 'nsew', rng, { stories: [3, 5] });
      fillBlock(B(x1, zq + 25), -393, zq, x1, zq + 46, 'nsew', rng, { stories: [3, 5] });
      continue;
    }
    if (detailed) fillBlock(B((x0 + x1) / 2, zq + 25), x0, zq, x1, zq + 46, 'nsew', rng, { stories: [3, 5] });
    else massBlock(B((x0 + x1) / 2, zq + 25), x0, zq, x1, zq + 46, rng);
  }
  for (let row = 1; row < (quality === 'low' ? 4 : 8); row++) {
    for (let x = -1250; x < 1100;) {
      const w = 48 + rng() * 40;
      const z0 = 128 + row * 60 + rng() * 5;
      if (rng() > 0.08 && !(z0 > 420 && z0 < 470)) massBlock(B(x + w / 2, z0 + 24), x, z0, x + w, z0 + 48, rng);
      x += w + 8;
    }
  }
  // 圣朱利安穷人教堂、圣塞弗兰教堂
  smallChurch(B(-30, 150), -42, 152, 0, 22, 9, 10, { spireH: 6, towerAt: 2 });
  smallChurch(B(-180, 180), -200, 182, 0, 38, 14, 16, { spireH: 26, towerAt: 4 });
  // 腓力·奥古斯都城墙（左岸段）：内勒塔—图尔奈勒塔
  const wallPts = [[-1000, 118], [-960, 300], [-820, 460], [-560, 560], [-200, 600], [150, 580], [420, 450], [560, 260], [560, 125]];
  for (let i = 0; i < wallPts.length - 1; i++) {
    const [xa, za] = wallPts[i], [xb, zb] = wallPts[i + 1];
    const ha = terrainHeight(xa, za), hb = terrainHeight(xb, zb);
    crenelWall(B((xa + xb) / 2, (za + zb) / 2), xa, za, xb, zb, 9, 2.5, Math.min(ha, hb));
    roundTower(B(xb, zb), xb, zb, 4, 14, { roofH: 8, base: hb, collide: false });
  }
  roundTower(B(-1000, 118), -1000, 118, 6, 26, { roofH: 12, collide: false });    // 内勒塔
  squareTower(B(560, 125), 560, 125, 10, 22, { collide: false });                  // 图尔奈勒
  // 圣热纳维耶芙修道院钟楼（山顶）
  const hg = terrainHeight(-60, 560);
  smallChurch(B(-60, 560), -80, 560, 0, 50, 16, 18 + hg, { spireH: 4, towerAt: 6 });
  squareTower(B(-60, 548), -60, 548, 9, 48 + hg, { pyramid: 10, collide: false });
  // 圣日耳曼德佩修道院（西侧远景）
  smallChurch(B(-1150, 300), -1180, 300, 0, 60, 16, 18, { spireH: 30, towerAt: 4 });

  /* ======================= 远景地标 ======================= */
  // 卢浮宫（腓力·奥古斯都的城堡，中央为大塔）
  const lx = -1180, lz = -330;
  for (const [dx, dz] of [[-40, -40], [40, -40], [-40, 40], [40, 40], [0, -40], [0, 40], [-40, 0], [40, 0]]) roundTower(B(lx + dx, lz + dz), lx + dx, lz + dz, 5, 24, { roofH: 12, collide: false });
  for (const [a, c] of [[[-40, -40], [40, -40]], [[40, -40], [40, 40]], [[40, 40], [-40, 40]], [[-40, 40], [-40, -40]]]) crenelWall(B(lx, lz), lx + a[0], lz + a[1], lx + c[0], lz + c[1], 14, 3);
  roundTower(B(lx, lz), lx, lz, 8, 32, { roofH: 18, collide: false });
  // 巴士底狱（东）
  const bx = 1250, bz = -620;
  for (const [dx, dz] of [[-30, -18], [-10, -18], [10, -18], [30, -18], [-30, 18], [-10, 18], [10, 18], [30, 18]]) roundTower(B(bx + dx, bz + dz), bx + dx, bz + dz, 6, 28, { crenel: true, collide: false });
  B(bx, bz).box('stone', bx - 30, -2, bz - 18, bx + 30, 26, bz + 18);
  // 蒙福孔绞刑台（远处山丘）
  const mf = B(600, -900);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; mf.box('stone', 600 + Math.cos(a) * 12 - 0.8, 6, -900 + Math.sin(a) * 8 - 0.8, 600 + Math.cos(a) * 12 + 0.8, 18, -900 + Math.sin(a) * 8 + 0.8); }
  mf.box('stone', 586, 0, -910, 614, 6, -890);

  cb.build(mats, group);
  scene.add(group);

  /* ---------- 植被：花园、牛岛与圣母岛草地 ---------- */
  buildTrees(scene, rng, quality);
  buildBoats(scene, mats, rng);
  buildCows(scene, mats, rng);
  return group;
}

// 在桥头处把街区切开，留出通往桥面的街道
function splitGaps(blocks, gaps) {
  const out = [];
  for (const [x0, x1] of blocks) {
    let segs = [[x0, x1]];
    for (const [g0, g1] of gaps) {
      segs = segs.flatMap(([a, b]) => (b <= g0 || a >= g1) ? [[a, b]] : [[a, g0], [g1, b]].filter(([p, q]) => q - p > 14));
    }
    out.push(...segs);
  }
  return out;
}

const bankAt = (x) => -232 + 10 * Math.sin(x / 260 + 0.6) + 5 * Math.sin(x / 90);
const bankSAt = (x) => 104 + 8 * Math.sin(x / 230 + 2.0) + 4 * Math.sin(x / 70 + 1);

// 远景体块房屋：无立面细节的简化盒体 + 屋顶
function massBlock(b, x0, z0, x1, z1, rng) {
  const sides = [[x0, z0, x1, z0, Math.PI], [x0, z1, x1, z1, 0], [x0, z0, x0, z1, -Math.PI / 2], [x1, z0, x1, z1, Math.PI / 2]];
  for (const [ax, az, bx, bz, ang] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    let t = 0;
    while (t < len - 4) {
      const w = Math.min(len - t, 9 + rng() * 9);
      const d = 9 + rng() * 4;
      const h = 8 + rng() * 7;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const nx = Math.sin(ang), nz = Math.cos(ang);
      const cx = ax + ux * (t + w / 2) - nx * d / 2, cz = az + uz * (t + w / 2) - nz * d / 2;
      const base = terrainHeight(cx, cz);
      b.add('plaster', unitBox(), M(cx, base + h / 2 - 1, cz, 0, ang, 0, w, h + 2, d), { uvScale: 0.5 });
      const rh = w * 0.6;
      const g = new THREE.ConeGeometry(Math.max(w, d) * 0.72, rh, 4, 1);
      g.rotateY(Math.PI / 4);
      b.add(rng() < 0.6 ? 'slate' : 'tile', g, M(cx, base + h + rh / 2, cz, 0, ang, 0, w / Math.max(w, d), 1, d / Math.max(w, d)), { uvScale: 0.3 });
      t += w;
    }
  }
}

function buildTrees(scene, rng, quality) {
  const spots = [];
  const area = (x0, z0, x1, z1, n) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
      if (landSDF(x, z) < -3) spots.push([x, terrainHeight(x, z), z]);
    }
  };
  area(130, -110, 215, 50, 40);       // 田地（主教花园）
  area(310, -95, 515, 0, 60);         // 牛岛
  area(530, -90, 755, 10, 70);        // 圣母岛
  area(-750, -95, -705, 50, 30);      // 王宫花园
  area(60, -66, 130, -50, 10);        // 修道院庭院
  area(-860, -60, -820, -25, 6);
  if (quality !== 'low') {
    area(-1300, 450, 1300, 900, 200);   // 远郊
    area(-1300, -1000, 1300, -760, 150);
  }
  const trunk = new THREE.CylinderGeometry(0.2, 0.35, 4, 6); trunk.translate(0, 2, 0);
  const crown = new THREE.IcosahedronGeometry(2.8, 1); crown.translate(0, 5.6, 0);
  const tm = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const T = new THREE.InstancedMesh(trunk, tm, spots.length);
  const C = new THREE.InstancedMesh(crown, cm, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  spots.forEach(([x, y, z], i) => {
    const k = 0.7 + rng() * 0.7;
    q.setFromEuler(new THREE.Euler(0, rng() * 6, 0));
    m.compose(p.set(x, y, z), q, s.set(k, k * (0.9 + rng() * 0.4), k));
    T.setMatrixAt(i, m); C.setMatrixAt(i, m);
    col.setHSL(0.2 + rng() * 0.09, 0.4 + rng() * 0.2, 0.1 + rng() * 0.08);
    C.setColorAt(i, col);
  });
  T.castShadow = C.castShadow = true;
  T.receiveShadow = C.receiveShadow = true;
  scene.add(T, C);
}

function buildBoats(scene, mats, rng) {
  const boats = [];
  const hull = [new THREE.Vector2(-5, 0.9), new THREE.Vector2(-4, 0), new THREE.Vector2(4, 0), new THREE.Vector2(5.2, 1.1)];
  const hullG = new THREE.ExtrudeGeometry(new THREE.Shape(hull), { depth: 2.2, bevelEnabled: false });
  hullG.translate(0, 0, -1.1);
  const spots = [[-300, -180], [-40, -160], [60, -200], [-250, 80], [200, 90], [-600, -170], [300, -180], [-150, 82], [-10, -228], [20, -226], [40, -229], [-520, 84]];
  for (const [x, z] of spots) {
    const g = new THREE.Group();
    const h = new THREE.Mesh(hullG, mats.woodDark);
    h.castShadow = true;
    g.add(h);
    if (rng() < 0.5) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.8), mats.wood);
      c.position.set(-1.5, 1.4, 0); g.add(c);
      const r = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 2.2), mats.redCloth);
      r.position.set(-1.5, 1.95, 0); g.add(r);
    } else {
      for (let k = 0; k < 4; k++) { const sack = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), mats.whiteCloth); sack.position.set(-2 + k * 1.2, 0.9, (rng() - 0.5)); sack.scale.y = 0.7; g.add(sack); }
    }
    g.position.set(x, WATER_Y - 0.25, z);
    g.rotation.y = rng() < 0.5 ? 0 : Math.PI;
    scene.add(g);
    boats.push({ g, ph: rng() * 6 });
  }
  world.animated.push((t) => boats.forEach(b => { b.g.position.y = WATER_Y - 0.3 + Math.sin(t * 0.9 + b.ph) * 0.06; b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.02; }));
}

function buildCows(scene, mats, rng) {
  const body = new THREE.BoxGeometry(2.0, 1.0, 0.9);
  const cowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const isl = i < 7 ? [330, -80, 500, -10] : [560, -80, 740, 0];
    const x = isl[0] + rng() * (isl[2] - isl[0]), z = isl[1] + rng() * (isl[3] - isl[1]);
    const g = new THREE.Group();
    const b = new THREE.Mesh(body, cowMat); b.position.y = 1.15; g.add(b);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), cowMat); h.position.set(1.2, 1.25, 0); g.add(h);
    for (const [dx, dz] of [[-0.7, -0.3], [-0.7, 0.3], [0.7, -0.3], [0.7, 0.3]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), cowMat); l.position.set(dx, 0.35, dz); g.add(l); }
    g.position.set(x, terrainHeight(x, z), z);
    g.rotation.y = rng() * 6.28;
    g.traverse(o => { o.castShadow = true; });
    scene.add(g);
  }
}
void addHouse; void archMolding; void extrude;
