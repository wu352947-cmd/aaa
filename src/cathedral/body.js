// 中殿、耳堂、唱诗班、双回廊后殿、飞扶壁、屋顶与拱顶
import * as THREE from 'three';
import { M, archPoints, archApex, archMolding, archPlane, extrude, pinnacleGeometry, gargoyleGeometry } from '../geom.js';
import { P, naveBayX, choirBayX } from './plan.js';
import { wallX, wallZ, wallAB, glassWindow, roofX, roofZ, leanTo, flyingButtress, balustrade, corbelTable, arcade, ringGeometry, statue } from './parts.js';
import { addRoseTracery } from './facade.js';
import { addBox, addCircle, addOBB, addPlatform, world } from '../world.js';

const S = [-1, 1];

export function buildBody(b) {
  const { FL, NH, AI, OW, WALL_TOP, RIDGE } = P;
  const naveLen = P.NAVE1 - P.NAVE0, choirLen = P.CHOIR1 - P.CHOIR0;
  const nb = naveLen / P.NAVE_BAYS, cb = choirLen / P.CHOIR_BAYS;

  /* ---------- 室内地坪 ---------- */
  b.box('floor', 2.5, 0, -OW, P.XA, FL, OW, { uvScale: 1 / 6 });
  const half = new THREE.CircleGeometry(OW, 24, -Math.PI / 2, Math.PI);
  half.rotateX(-Math.PI / 2);
  b.add('floor', half, M(P.XA, FL, 0), { uvScale: 1 / 6 });
  b.add('stone', new THREE.CylinderGeometry(OW, OW, FL, 24, 1, false, 0, Math.PI), M(P.XA, FL / 2, 0));
  addPlatform(2.5, -OW, P.XA + OW, OW, FL, { interiorFloor: true });

  /* ---------- 主拱廊墙（三层立面：大拱廊 / 楼廊 / 高侧窗） ---------- */
  const elevHoles = (bays, bay, arcW) => {
    const h = [];
    for (let i = 0; i < bays; i++) {
      const xc = (i + 0.5) * bay;
      h.push({ x: xc, y: FL, w: arcW, spring: P.ARC_SPRING - FL, k: 1 });
      h.push({ x: xc, y: P.TRIB_Y, w: arcW - 0.2, spring: 3.6, k: 0.75 });
      h.push({ x: xc, y: P.CLER_Y, w: 2.9, spring: 4.2, k: 1 });
    }
    return h;
  };
  for (const s of S) {
    wallX(b, 'stoneInt', P.NAVE0, naveLen, 0, WALL_TOP, s * NH, 1.4, elevHoles(P.NAVE_BAYS, nb, nb - 1.5));
    wallX(b, 'stoneInt', P.CHOIR0, choirLen, 0, WALL_TOP, s * NH, 1.4, elevHoles(P.CHOIR_BAYS, cb, cb - 1.5));
    // 高侧窗玻璃 + 楼廊三连拱小柱
    for (let i = 0; i < P.NAVE_BAYS + P.CHOIR_BAYS; i++) {
      const x = i < P.NAVE_BAYS ? P.NAVE0 + (i + 0.5) * nb : P.CHOIR0 + (i - P.NAVE_BAYS + 0.5) * cb;
      const w = (i < P.NAVE_BAYS ? nb : cb) - 1.5;
      glassWindow(b, x, P.CLER_Y, s * NH, 0, -s, 2.9, 4.2, 1, i);
      for (const o of [-1, 1]) b.cyl('carved', x + o * (w - 0.2) / 6, P.TRIB_Y, s * (NH - 0.1), 0.12, 3.6, 6);
      b.add('carved', archMolding(w - 0.2, 3.6, 0.75, 0.09, true, 0, 10), M(x, P.TRIB_Y, s * (NH - 0.72)));
      b.add('carved', archMolding(w, P.ARC_SPRING - FL, 1, 0.16, false, 0, 12), M(x, FL, s * (NH - 0.72)));
      b.add('carved', archMolding(3.3, 4.2, 1, 0.1, true, 0, 10), M(x, P.CLER_Y, s * (NH - 0.72)));
    }
    // 檐口托檐与女儿墙栏杆
    corbelTable(b, 'carved', P.XT - 12, s * (NH + 0.7), P.CHOIR1, s * (NH + 0.7), WALL_TOP - 0.3, 0.6, 0, s);
    balustrade(b, 'carved', P.XT, s * (NH + 1.1), P.CROSS0 - 0.5, s * (NH + 1.1), WALL_TOP, 0.9, 0.5);
    balustrade(b, 'carved', P.CROSS1 + 0.5, s * (NH + 1.1), P.CHOIR1, s * (NH + 1.1), WALL_TOP, 0.9, 0.5);
  }
  // 中殿与唱诗班柱子（雨果：罗曼式的粗重圆柱）
  const pierXs = [];
  for (let i = 1; i < P.NAVE_BAYS; i++) pierXs.push(naveBayX(i));
  for (let i = 1; i < P.CHOIR_BAYS; i++) pierXs.push(choirBayX(i));
  pierXs.push(P.CHOIR1);
  for (const x of pierXs) for (const s of S) {
    pier(b, x, s * NH, 0.85, P.ARC_SPRING - 0.6);
    addCircle(x, s * NH, 0.95, -5, 12);
    // 向上的附墙细柱，直达拱顶起拱点
    for (const o of [-0.3, 0, 0.3]) b.cyl('carved', x + o, P.ARC_SPRING + 0.2, s * (NH - 0.78), 0.12, P.VS - P.ARC_SPRING, 6);
    b.box('carved', x - 0.6, P.VS - 0.4, s * (NH - 0.9), x + 0.6, P.VS, s * (NH - 0.6));
    // 侧廊柱
    pier(b, x, s * AI, 0.6, 5.0);
    addCircle(x, s * AI, 0.7, -5, 12);
  }
  // 唱诗班墙在 x=CHOIR1 处与后殿衔接，无需额外碰撞

  /* ---------- 楼廊外墙（z=±12.5，11.4–22 米）与侧廊连拱 ---------- */
  for (const s of S) {
    for (const [x0, len, bays] of [[P.NAVE0, naveLen, P.NAVE_BAYS], [P.CHOIR0, choirLen, P.CHOIR_BAYS]]) {
      const bay = len / bays;
      const holes = [];
      for (let i = 0; i < bays; i++) holes.push({ x: (i + 0.5) * bay, y: 4.0, w: 2.6, spring: 2.8, k: 1 });
      wallX(b, 'stone', x0, len, P.AVC, 22 - P.AVC, s * AI, 0.9, holes);
      for (let i = 0; i < bays; i++) glassWindow(b, x0 + (i + 0.5) * bay, P.AVC + 4.0, s * AI, 0, -s, 2.6, 2.8, 1, i + 1);
      arcade(b, 'carved', x0, s * AI, x0 + len, s * AI, FL, P.AVC - FL - 0.3, bays, 0.01, 0.67, 0.14);
    }
  }

  /* ---------- 礼拜堂外墙（z=±24）与飞扶壁墩 ---------- */
  for (const s of S) {
    for (const [x0, len, bays, isChoir] of [[P.NAVE0, naveLen, P.NAVE_BAYS, false], [P.CHOIR0, choirLen, P.CHOIR_BAYS, true]]) {
      const bay = len / bays;
      const holes = [];
      for (let i = 0; i < bays; i++) {
        const porteRouge = isChoir && s < 0 && i === 2;
        if (porteRouge) holes.push({ x: (i + 0.5) * bay, y: FL, w: 2.2, spring: 3.2, k: 1 });
        else holes.push({ x: (i + 0.5) * bay, y: 4.0, w: 3.2, spring: 4.6, k: 1 });
      }
      wallX(b, 'stone', x0, len, 0, P.CHAPEL_TOP, s * (OW + 0.4), 0.8, holes);
      for (let i = 0; i < bays; i++) {
        const xc = x0 + (i + 0.5) * bay;
        const porteRouge = isChoir && s < 0 && i === 2;
        if (porteRouge) {
          // 红门：雨果称其体现了十五世纪哥特艺术的精巧
          b.add('door', new THREE.PlaneGeometry(2.2, 3.4), M(xc, FL + 1.7, s * (OW + 0.1)), { keepUV: true });
          b.add('carved', archMolding(2.7, 3.2, 1, 0.15, true, 0, 10), M(xc, FL, s * (OW + 0.85)));
          const gab = [new THREE.Vector2(-1.8, 0), new THREE.Vector2(1.8, 0), new THREE.Vector2(0, 3.2)];
          b.add('carved', extrude(gab, 0.3), M(xc, FL + 5.2, s * (OW + 0.9)));
          b.add('redCloth', new THREE.PlaneGeometry(2.0, 3.0), M(xc, FL + 1.6, s * (OW + 0.13), 0, s < 0 ? Math.PI : 0, 0));
          addBox(x0 + i * bay, s * OW, xc - 1.15, s * (OW + 0.8), -5, 20);
          addBox(xc + 1.15, s * OW, x0 + (i + 1) * bay, s * (OW + 0.8), -5, 20);
          for (let k = 0; k < 6; k++) { b.box('stone', xc - 1.6, 0, s * (OW + 0.8 + (5 - k) * 0.3), xc + 1.6, FL * (k + 1) / 6, s * (OW + 0.8 + (6 - k) * 0.3)); }
          addRamp(xc - 1.6, s * (OW + 0.8), xc + 1.6, s * (OW + 2.6), FL, 0);
        } else {
          glassWindow(b, xc, 4.0, s * (OW + 0.4), 0, -s, 3.2, 4.6, 1, i + 2);
          b.add('carved', archMolding(3.6, 4.6, 1, 0.12, true, 0, 10), M(xc, 4.0, s * (OW + 0.85)));
        }
      }
      for (let i = 0; i < bays; i++) {
        if (isChoir && s < 0 && i === 2) continue;
        addBox(x0 + i * bay, s * OW, x0 + (i + 1) * bay, s * (OW + 0.8), -5, 20);
      }
      // 礼拜堂隔墙
      for (let i = 1; i < bays; i++) {
        const x = x0 + i * bay;
        b.box('stoneInt', x - 0.35, 0, s * 18.5, x + 0.35, P.AVC, s * OW);
        addBox(x - 0.35, s * 18.5, x + 0.35, s * OW, -5, 14);
      }
      // 扶壁墩 + 飞扶壁 + 小尖塔 + 滴水兽
      for (let i = (isChoir ? 1 : 1); i <= bays; i++) {
        const x = x0 + i * bay;
        if (!isChoir && i === bays) continue;
        culee(b, x, s, 22.6, 26.8, 29.5);
        flyingButtress(b, 'stone', x, s * 22.6, 28.0, x, s * (NH + 0.75), 32.2, 0.8);
        // 中间支墩（穿出屋面）
        b.box('stone', x - 0.5, 17, s * 12.0, x + 0.5, 27.6, s * 13.0);
        b.add('stone', pinnacleGeometry(0.55, 3.5), M(x, 27.6, s * 12.5));
      }
    }
  }

  /* ---------- 侧廊、楼廊、礼拜堂屋顶 ---------- */
  for (const s of S) {
    for (const [x0, x1] of [[P.XT, P.CROSS0], [P.CROSS1, P.CHOIR1]]) {
      leanTo(b, 'lead', x0, s * (NH + 0.7), x1, s * (NH + 0.7), 24.2, x0, s * (AI + 0.45), x1, s * (AI + 0.45), 21.6);
      leanTo(b, 'lead', x0, s * (AI + 0.45), x1, s * (AI + 0.45), 15.3, x0, s * (OW + 0.9), x1, s * (OW + 0.9), P.CHAPEL_TOP);
    }
  }

  /* ---------- 主屋顶（铅皮覆面的橡木“森林”） ---------- */
  roofX(b, 'lead', 3.0, P.XA, 0, NH + 1.0, WALL_TOP, RIDGE);
  roofZ(b, 'lead', -OW - 0.9, OW + 0.9, (P.CROSS0 + P.CROSS1) / 2, (P.CROSS1 - P.CROSS0) / 2 + 0.3, WALL_TOP, RIDGE);
  // 后殿锥形屋顶
  apseRoof(b, P.XA, 0, NH + 1.0, WALL_TOP, RIDGE, 5);

  /* ---------- 耳堂 ---------- */
  buildTransept(b);

  /* ---------- 后殿与双回廊 ---------- */
  buildApse(b);

  /* ---------- 拱顶 ---------- */
  buildVaults(b, nb, cb);

  /* ---------- 中世纪尖塔（约 1250 年建，1786 年拆除） ---------- */
  buildSpire(b, (P.CROSS0 + P.CROSS1) / 2, 0);

  // 室内判定区域（用于切换室内照明）
  world.interiorZones.push((x, y, z) => {
    if (y > P.WALL_TOP || y < -1) return false;
    if (x > 3.4 && x < P.XA && Math.abs(z) < OW) return true;
    if (x >= P.XA && Math.hypot(x - P.XA, z) < OW) return true;
    return false;
  });
}

function addRamp(x0, z0, x1, z1, ya, yb) {
  world.platforms.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y: Math.max(ya, yb), ramp: { ya, yb, axis: 'z', a0: z0, a1: z1 } });
}

// 圆柱墩：柱身 + 卷叶柱头 + 方形柱顶板
function pier(b, x, z, r, h) {
  const { FL } = P;
  b.cyl('carved', x, FL, z, r + 0.15, 0.5, 12);
  b.cyl('stoneInt', x, FL + 0.5, z, r, h - 0.5, 16);
  b.cyl('carved', x, FL + h, z, r, 0.6, 12, r * 1.35);
  b.box('carved', x - r * 1.45, FL + h + 0.6, z - r * 1.45, x + r * 1.45, FL + h + 0.9, z + r * 1.45);
  // 卷叶饰
  const leaf = new THREE.SphereGeometry(0.18, 4, 3);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    b.add('carved', leaf, M(x + Math.cos(a) * r * 1.2, FL + h + 0.45, z + Math.sin(a) * r * 1.2));
  }
}

// 扶壁墩：外侧阶梯式墩体 + 小尖塔 + 滴水兽
function culee(b, x, s, zi, zo, h) {
  const z0 = Math.min(s * zi, s * zo), z1 = Math.max(s * zi, s * zo);
  b.box('stone', x - 0.9, 0, z0, x + 0.9, h * 0.45, z1);
  b.box('stone', x - 0.8, h * 0.45, s > 0 ? z0 : z0 + 0.6, x + 0.8, h, s > 0 ? z1 - 0.6 : z1);
  b.add('stone', pinnacleGeometry(0.75, 5.5), M(x, h, s * (zi + zo - 0.6) / 2));
  b.add('carved', gargoyleGeometry(), M(x, h - 2.5, s * (zo - 0.3), 0, s > 0 ? 0 : Math.PI, 0, 0.75, 0.75, 0.75), { uvScale: 1 });
  addBox(x - 0.9, z0, x + 0.9, z1, -5, h);
}

// 多边形半锥屋顶
function apseRoof(b, cx, cz, R, ye, yr, segs) {
  const pos = [];
  for (let k = 0; k < segs; k++) {
    const a0 = -Math.PI / 2 + k / segs * Math.PI, a1 = -Math.PI / 2 + (k + 1) / segs * Math.PI;
    pos.push(cx, yr, cz, cx + Math.cos(a1) * R, ye, cz + Math.sin(a1) * R, cx + Math.cos(a0) * R, ye, cz + Math.sin(a0) * R);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) { const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)]; p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ...t); }
    g.computeVertexNormals();
  }
  b.add('lead', g, null, { uvScale: 0.25 });
}

function buildTransept(b) {
  const { FL, NH, OW, WALL_TOP, RIDGE } = P;
  const X0 = P.CROSS0, X1 = P.CROSS1, W = X1 - X0, xc = (X0 + X1) / 2;
  // 十字交叉处四根巨柱
  for (const x of [X0, X1]) for (const s of S) {
    b.cyl('stoneInt', x, FL, s * NH, 1.35, P.VS - FL, 16);
    b.cyl('carved', x, P.VS - 0.8, s * NH, 1.35, 0.8, 12, 1.7);
    addCircle(x, s * NH, 1.45, -5, 30);
  }
  // 耳堂东西墙（朝侧廊开拱）
  for (const s of S) {
    for (const x of [X0, X1]) {
      const len = OW - NH;
      const holes = [];
      const bays = 3, bay = len / bays;
      for (let i = 0; i < bays; i++) {
        const u = s > 0 ? (i + 0.5) * bay : len - (i + 0.5) * bay;
        holes.push({ x: u, y: FL, w: bay - 1.4, spring: P.ARC_SPRING - FL - 1.2, k: 1 });
        holes.push({ x: u, y: P.CLER_Y, w: 2.9, spring: 4.2, k: 1 });
      }
      const z0 = s > 0 ? NH + 0.7 : -OW;
      wallZ(b, 'stoneInt', z0, len - 0.7, 0, WALL_TOP, x, 1.4, holes.map(h => ({ ...h, x: h.x - (s > 0 ? 0.7 : 0) })).filter(h => h.x > h.w / 2 + 0.3 && h.x < len - 0.7 - h.w / 2 - 0.3));
      for (let i = 0; i < bays; i++) {
        const z = s * (NH + (i + 0.5) * bay);
        glassWindow(b, x, P.CLER_Y, z, x === X0 ? 1 : -1, 0, 2.9, 4.2, 1, i);
        if (i > 0) { pier(b, x, s * (NH + i * bay), 0.75, P.ARC_SPRING - 1.8); addCircle(x, s * (NH + i * bay), 0.9, -5, 12); }
      }
    }
  }
  // 耳堂立面（北：修道院门 / 南：圣斯德望门），玫瑰窗直径约 13 米
  for (const s of S) {
    const z = s * (OW + 0.8);
    const gableH = RIDGE - WALL_TOP + 0.4;
    const outline = [new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, WALL_TOP), new THREE.Vector2(W / 2, WALL_TOP + gableH), new THREE.Vector2(0, WALL_TOP)];
    const holes = [
      { x: W / 2, y: FL, w: 4.6, spring: 6.4, k: 1 },
      { type: 'circle', x: W / 2, y: 25.0, r: 6.45 },
      { type: 'circle', x: W / 2, y: 41.0, r: 1.5 },
    ];
    for (let i = 0; i < 6; i++) holes.push({ x: 1.8 + i * (W - 3.6) / 5, y: 12.6, w: 1.35, spring: 3.0, k: 1 });
    wallX(b, 'stone', X0, W, 0, WALL_TOP, z, 1.6, holes, outline);
    for (let i = 0; i < 6; i++) glassWindow(b, X0 + 1.8 + i * (W - 3.6) / 5, 12.6, z, 0, -s, 1.35, 3.0, 1, i);
    const key = s < 0 ? 'North' : 'South';
    const rg = new THREE.CircleGeometry(6.5, 72);
    b.add('rose' + key + 'Out', rg, M(xc, 25.0, z + s * 0.1, 0, s > 0 ? 0 : Math.PI, 0), { keepUV: true });
    b.add('rose' + key + 'In', rg, M(xc, 25.0, z + s * 0.04, 0, s > 0 ? Math.PI : 0, 0), { keepUV: true });
    addRoseTracery(b, xc, 25.0, z + s * 0.25, 6.45, 'z');
    b.add('carved', new THREE.TorusGeometry(6.8, 0.25, 6, 72), M(xc, 25.0, z + s * 0.85));
    // 玫瑰窗外的方框与角部小圆窗
    b.add('carved', new THREE.TorusGeometry(1.5, 0.15, 6, 24), M(xc, 41.0, z + s * 0.85));
    b.add('darkVoid', new THREE.CircleGeometry(1.5, 24), M(xc, 41.0, z + s * 0.2, 0, s > 0 ? 0 : Math.PI, 0));
    // 门洞：三层拱券、门楣浮雕、圣母像（北门间柱上的圣母像为 13 世纪原物）
    const ws = [7.4, 6.5, 5.6, 4.6];
    for (let i = 0; i < 3; i++) {
      b.add('carved', ringGeometry(ws[i], ws[i + 1], FL + 6.4, 1, 0.75), M(xc, 0, z + s * (0.8 + 0.75 * (2 - i) + 0.4)), { uvScale: 0.6 });
    }
    const tg = archPlane(4.6, 0, 1);
    b.add(s < 0 ? 'tymp_virgin' : 'tymp_judgment', tg, M(xc, FL + 6.4, z, 0, s > 0 ? 0 : Math.PI, 0), { keepUV: true });
    b.box('carved', xc - 2.3, FL + 5.7, z - 0.5, xc + 2.3, FL + 6.4, z + 0.5);
    b.box('carved', xc - 0.3, FL, z - 0.5 + s * 0.5, xc + 0.3, FL + 5.7, z + 0.5 + s * 0.5);
    statue(b, 'statue', 'saint', xc, FL + 1.6, z + s * 1.2, 0, s, 1.3);
    // 门前台阶
    for (let k = 0; k < 6; k++) {
      const zz0 = s * (OW + 1.6 + (5 - k) * 0.35), zz1 = s * (OW + 1.6 + (6 - k) * 0.35);
      b.box('stone', xc - 3.7, 0, Math.min(zz0, zz1), xc + 3.7, FL * (k + 1) / 6, Math.max(zz0, zz1));
    }
    b.box('stone', xc - 3.7, 0, s > 0 ? OW + 1.55 : -OW - 1.6, xc + 3.7, FL, s > 0 ? OW + 1.6 : -OW - 1.55);
    addRamp(xc - 3.7, s * (OW + 1.6), xc + 3.7, s * (OW + 3.7), FL, 0);
    addPlatform(xc - 3.7, s * (OW - 0.1), xc + 3.7, s * (OW + 1.6), FL);
    // 碰撞：门洞两侧
    addBox(X0, s * OW, xc - 2.3, s * (OW + 1.6), -5, 50);
    addBox(xc + 2.3, s * OW, X1, s * (OW + 1.6), -5, 50);
    // 角部塔楼与山墙小尖塔
    for (const x of [X0, X1]) {
      b.box('stone', x - 1.1, 0, Math.min(s * OW, s * (OW + 3.0)), x + 1.1, 36, Math.max(s * OW, s * (OW + 3.0)));
      b.add('stone', pinnacleGeometry(1.0, 8), M(x, 36, s * (OW + 1.5)));
      addBox(x - 1.1, Math.min(s * OW, s * (OW + 3.0)), x + 1.1, Math.max(s * OW, s * (OW + 3.0)), -5, 36);
    }
    // 山墙顶端十字与卷叶饰
    b.add('carved', new THREE.BoxGeometry(0.25, 2.2, 0.25), M(xc, WALL_TOP + gableH + 1.0, z));
    b.add('carved', new THREE.BoxGeometry(1.2, 0.25, 0.25), M(xc, WALL_TOP + gableH + 1.4, z));
    for (let k = 1; k < 9; k++) {
      const t = k / 9;
      for (const d of [-1, 1]) b.add('carved', new THREE.SphereGeometry(0.28, 5, 4), M(xc + d * W / 2 * (1 - t), WALL_TOP + gableH * t + 0.25, z));
    }
    balustrade(b, 'carved', X0, s * (OW + 1.7), X1, s * (OW + 1.7), P.CHAPEL_TOP + 7, 1.0, 0.5);
  }
}

function buildApse(b) {
  const { FL, NH, AI, OW, WALL_TOP } = P;
  const cx = P.XA;
  const segs = 5;
  const pt = (r, a) => [cx + Math.cos(a) * r, Math.sin(a) * r];
  for (let k = 0; k < segs; k++) {
    const a0 = -Math.PI / 2 + k / segs * Math.PI, a1 = -Math.PI / 2 + (k + 1) / segs * Math.PI;
    const [xa, za] = pt(NH, a0), [xb, zb] = pt(NH, a1);
    const len = Math.hypot(xb - xa, zb - za);
    // 主后殿墙（三层）
    wallAB(b, 'stoneInt', xa, za, xb, zb, 0, WALL_TOP, 1.4, [
      { x: len / 2, y: FL, w: len - 1.3, spring: P.ARC_SPRING - FL, k: 1.1 },
      { x: len / 2, y: P.TRIB_Y, w: len - 1.5, spring: 3.6, k: 0.75 },
      { x: len / 2, y: P.CLER_Y, w: 2.1, spring: 4.6, k: 1 },
    ]);
    const am = (a0 + a1) / 2;
    const [mx, mz] = pt(NH * Math.cos(Math.PI / segs / 2), am);
    glassWindow(b, mx, P.CLER_Y, mz, -Math.cos(am), -Math.sin(am), 2.1, 4.6, 1, k + 1);
    // 楼廊外墙（半径 12.5）
    const [ta, tza] = pt(AI, a0), [tb, tzb] = pt(AI, a1);
    const tlen = Math.hypot(tb - ta, tzb - tza);
    wallAB(b, 'stone', ta, tza, tb, tzb, P.AVC, 22 - P.AVC, 0.9, [{ x: tlen / 2, y: 4.0, w: 3.0, spring: 2.8, k: 1 }]);
    const [tmx, tmz] = pt(AI * Math.cos(Math.PI / segs / 2), am);
    glassWindow(b, tmx, P.AVC + 4.0, tmz, -Math.cos(am), -Math.sin(am), 3.0, 2.8, 1, k);
    // 屋顶环段
    const [ea, eza] = pt(NH + 0.7, a0), [eb, ezb] = pt(NH + 0.7, a1);
    const [fa, fza] = pt(AI + 0.45, a0), [fb, fzb] = pt(AI + 0.45, a1);
    leanTo(b, 'lead', ea, eza, eb, ezb, 24.2, fa, fza, fb, fzb, 21.6);
    corbelTable(b, 'carved', ea, eza, eb, ezb, WALL_TOP - 0.3, 0.5, Math.cos(am), Math.sin(am));
    // 柱
    if (k > 0) {
      const [px, pz] = pt(NH, a0);
      pier(b, px, pz, 0.8, P.ARC_SPRING - 0.6);
      addCircle(px, pz, 0.95, -5, 12);
      const [qx, qz] = pt(AI, a0);
      pier(b, qx, qz, 0.55, 5.0);
      addCircle(qx, qz, 0.65, -5, 12);
      const [rx, rz] = pt(18.2, a0);
      pier(b, rx, rz, 0.45, 5.0);
      addCircle(rx, rz, 0.55, -5, 12);
    }
  }
  // 外层回廊与放射状礼拜堂外墙（9 段）
  const os = 9;
  for (let k = 0; k < os; k++) {
    const a0 = -Math.PI / 2 + k / os * Math.PI, a1 = -Math.PI / 2 + (k + 1) / os * Math.PI;
    const R = OW + 0.4;
    const [xa, za] = pt(R, a0), [xb, zb] = pt(R, a1);
    const len = Math.hypot(xb - xa, zb - za);
    wallAB(b, 'stone', xa, za, xb, zb, 0, P.CHAPEL_TOP, 0.8, [{ x: len / 2, y: 4.0, w: 3.2, spring: 4.6, k: 1 }]);
    const am = (a0 + a1) / 2;
    const [mx, mz] = pt(R * Math.cos(Math.PI / os / 2), am);
    glassWindow(b, mx, 4.0, mz, -Math.cos(am), -Math.sin(am), 3.2, 4.6, 1, k);
    addOBB((xa + xb) / 2, (za + zb) / 2, len / 2 + 0.2, 0.45, Math.atan2(-(zb - za), xb - xa), -5, 20);
    const [ra, rza] = pt(AI + 0.45, a0), [rb, rzb] = pt(AI + 0.45, a1);
    const [sa, sza] = pt(OW + 0.9, a0), [sb, szb] = pt(OW + 0.9, a1);
    void ra; void rza; void rb; void rzb; void sa; void sza; void sb; void szb;
    // 礼拜堂隔墙
    if (k > 0) {
      const [d0x, d0z] = pt(18.6, a0), [d1x, d1z] = pt(OW, a0);
      wallAB(b, 'stoneInt', d0x, d0z, d1x, d1z, 0, P.AVC, 0.6);
      addOBB((d0x + d1x) / 2, (d0z + d1z) / 2, Math.hypot(d1x - d0x, d1z - d0z) / 2, 0.3, Math.atan2(-(d1z - d0z), d1x - d0x), -5, 14);
    }
  }
  // 回廊屋顶（以多段坡顶近似）
  const rs = 9;
  for (let k = 0; k < rs; k++) {
    const a0 = -Math.PI / 2 + k / rs * Math.PI, a1 = -Math.PI / 2 + (k + 1) / rs * Math.PI;
    const [ra, rza] = pt(AI + 0.45, a0), [rb, rzb] = pt(AI + 0.45, a1);
    const [sa, sza] = pt(OW + 0.95, a0), [sb, szb] = pt(OW + 0.95, a1);
    leanTo(b, 'lead', ra, rza, rb, rzb, 15.3, sa, sza, sb, szb, P.CHAPEL_TOP);
  }
  // 放射状长飞扶壁（巴黎圣母院东端著名的 15 米跨度飞扶壁）
  for (let k = 0; k <= segs; k++) {
    const a = -Math.PI / 2 + k / segs * Math.PI;
    const [ox, oz] = pt(24.6, a), [ix, iz] = pt(NH + 0.75, a);
    const [cx2, cz2] = pt(26.2, a);
    const ang = Math.atan2(-Math.sin(a), Math.cos(a));
    b.add('stone', new THREE.BoxGeometry(4.0, 14, 1.8), M(cx2, 7, cz2, 0, ang, 0));
    b.add('stone', new THREE.BoxGeometry(3.2, 15.5, 1.6), M(cx2 - Math.cos(a) * 0.3, 21.75, cz2 - Math.sin(a) * 0.3, 0, ang, 0));
    b.add('stone', pinnacleGeometry(0.75, 5.5), M(cx2 - Math.cos(a) * 0.3, 29.5, cz2 - Math.sin(a) * 0.3));
    b.add('carved', gargoyleGeometry(), M(cx2 + Math.cos(a) * 1.4, 26.5, cz2 + Math.sin(a) * 1.4, 0, Math.atan2(Math.cos(a), Math.sin(a)), 0, 0.75, 0.75, 0.75), { uvScale: 1 });
    addOBB(cx2, cz2, 2.0, 0.9, ang, -5, 30);
    flyingButtress(b, 'stone', ox, oz, 28.0, ix, iz, 32.2, 0.8);
  }
  // 东端外侧礼拜堂墙的碰撞已在上方
  void archPoints; void archApex; void roofX;
}

/* 四分 / 六分肋拱顶：在 (u,v)∈[0,1]² 的参数网格上，以两条交叉尖筒拱的较高者作为拱面 */
function vaultPatch(b, mapper, across, along, spring, crown, ribs = true) {
  const N = 10;
  const a = across / 2, c = along / 2;
  const rise = crown - spring;
  const rT = (rise * rise + a * a) / (2 * a);
  const riseL = Math.max(c * 1.05, rise - 2.0);
  const springL = crown - 0.6 - riseL;
  const rL = (riseL * riseL + c * c) / (2 * c);
  const archH = (t, half, r, rs) => {
    const x = Math.abs(t);
    if (x >= half) return 0;
    return Math.sqrt(Math.max(0, r * r - (x + (r - half)) ** 2)) * (rs / Math.sqrt(Math.max(1e-6, r * r - (r - half) ** 2)));
  };
  const H = (u, v) => {
    const hT = spring + archH((u - 0.5) * across, a, rT, rise);
    const hL = springL + archH((v - 0.5) * along, c, rL, riseL);
    return Math.max(hT, Math.min(hL, crown - 0.3), spring);
  };
  const pos = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = i / N, v = j / N;
    const [x, z] = mapper(u, v);
    pos.push(x, H(u, v), z);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p0 = j * (N + 1) + i, p1 = p0 + 1, p2 = p0 + N + 1, p3 = p2 + 1;
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add('vault', g, null, { uvScale: 0.3 });
  if (!ribs) return;
  // 对角肋与横向肋
  const rib = (f) => {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const [u, v] = f(t);
      const [x, z] = mapper(u, v);
      pts.push(new THREE.Vector3(x, H(u, v) - 0.12, z));
    }
    b.add('carved', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.17, 4, false));
  };
  rib(t => [t, t]);
  rib(t => [t, 1 - t]);
  rib(t => [t, 0.001]);
  // 拱顶石（圆形浮雕）
  const [kx, kz] = mapper(0.5, 0.5);
  b.add('gilt', new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), M(kx, H(0.5, 0.5) - 0.2, kz));
}

function buildVaults(b, nb, cb) {
  const { NH, AI, OW, VS, VC, AVS, AVC } = P;
  const span = 2 * NH - 1.4;
  const rect = (x0, x1, z0, z1) => (u, v) => [x0 + (x1 - x0) * v, z0 + (z1 - z0) * u];
  // 中殿（包括双塔之间的西端开间）
  const naveBays = [[3.4, P.NAVE0]];
  for (let i = 0; i < P.NAVE_BAYS; i++) naveBays.push([naveBayX(i), naveBayX(i + 1)]);
  naveBays.push([P.CROSS0, P.CROSS1]);
  for (let i = 0; i < P.CHOIR_BAYS; i++) naveBays.push([choirBayX(i), choirBayX(i + 1)]);
  for (const [x0, x1] of naveBays) vaultPatch(b, rect(x0, x1, -NH + 0.7, NH - 0.7), span, x1 - x0, VS, VC);
  // 耳堂两翼
  for (const s of S) {
    const len = OW - NH;
    for (let i = 0; i < 3; i++) {
      const z0 = s * (NH + i * len / 3), z1 = s * (NH + (i + 1) * len / 3);
      vaultPatch(b, (u, v) => [P.CROSS0 + 0.7 + (P.CROSS1 - P.CROSS0 - 1.4) * u, z0 + (z1 - z0) * v], P.CROSS1 - P.CROSS0 - 1.4, len / 3, VS, VC);
    }
  }
  // 侧廊（内侧、外侧、礼拜堂）
  for (const s of S) {
    for (const [x0, len, bays] of [[P.NAVE0, P.NAVE1 - P.NAVE0, P.NAVE_BAYS], [P.CHOIR0, P.CHOIR1 - P.CHOIR0, P.CHOIR_BAYS]]) {
      const bay = len / bays;
      for (let i = 0; i < bays; i++) {
        const xa = x0 + i * bay, xb = xa + bay;
        for (const [za, zb] of [[NH + 0.7, AI], [AI, 18.5], [18.5, OW]]) {
          vaultPatch(b, rect(xa, xb, s * za, s * zb), zb - za, bay, AVS, AVC, true);
        }
      }
    }
    // 钟楼门厅
    vaultPatch(b, rect(3.5, P.XT, s * (P.BI0 + 1.3), s * (P.ZF - 1.6)), P.ZF - 1.6 - P.BI0 - 1.3, P.XT - 3.5, AVS, AVC + 0.3);
  }
  // 楼廊顶板与地板
  for (const s of S) {
    for (const [x0, x1] of [[P.NAVE0, P.NAVE1], [P.CHOIR0, P.CHOIR1]]) {
      b.box('stoneInt', x0, AVC + 0.4, Math.min(s * (NH + 0.7), s * AI), x1, AVC + 0.9, Math.max(s * (NH + 0.7), s * AI));
      b.box('stoneInt', x0, 21.8, Math.min(s * (NH + 0.7), s * (AI + 0.45)), x1, 22.2, Math.max(s * (NH + 0.7), s * (AI + 0.45)));
      b.box('stoneInt', x0, AVC + 0.4, Math.min(s * AI, s * (OW + 0.4)), x1, AVC + 0.9, Math.max(s * AI, s * (OW + 0.4)));
    }
  }
  // 后殿：半圆拱顶分段 + 回廊
  const cx = P.XA, segs = 5;
  for (let k = 0; k < segs; k++) {
    const a0 = -Math.PI / 2 + k / segs * Math.PI, a1 = -Math.PI / 2 + (k + 1) / segs * Math.PI;
    // 主后殿：扇形（从圆心到墙）
    const mapper = (u, v) => {
      const a = a0 + (a1 - a0) * v;
      const r = (NH - 0.7) * u;
      return [cx + Math.cos(a) * r, Math.sin(a) * r];
    };
    vaultFan(b, mapper, VS, VC);
    for (const [r0, r1] of [[NH + 0.7, AI], [AI, 18.2]]) {
      vaultPatch(b, (u, v) => { const a = a0 + (a1 - a0) * v; const r = r0 + (r1 - r0) * u; return [cx + Math.cos(a) * r, Math.sin(a) * r]; }, r1 - r0, (a1 - a0) * (r0 + r1) / 2, AVS, AVC);
    }
    b.add('stoneInt', ringSector(cx, AI, OW + 0.4, a0, a1, AVC + 0.65, 0.5));
    b.add('stoneInt', ringSector(cx, NH + 0.7, AI + 0.45, a0, a1, 22.0, 0.4));
  }
  const os = 9;
  for (let k = 0; k < os; k++) {
    const a0 = -Math.PI / 2 + k / os * Math.PI, a1 = -Math.PI / 2 + (k + 1) / os * Math.PI;
    vaultPatch(b, (u, v) => { const a = a0 + (a1 - a0) * v; const r = 18.2 + (OW - 18.2) * u; return [cx + Math.cos(a) * r, Math.sin(a) * r]; }, OW - 18.2, (a1 - a0) * 21, AVS, AVC);
  }
}

// 扇形后殿拱顶：径向肋汇聚于拱心
function vaultFan(b, mapper, spring, crown) {
  const N = 10;
  const pos = [], idx = [];
  const H = (u, v) => spring + (crown - spring) * Math.sqrt(Math.max(0, 1 - u * u)) * (0.86 + 0.14 * Math.sin(v * Math.PI));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = i / N, v = j / N;
    const [x, z] = mapper(u, v);
    pos.push(x, H(u, v), z);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const p0 = j * (N + 1) + i, p1 = p0 + 1, p2 = p0 + N + 1, p3 = p2 + 1;
    idx.push(p0, p1, p2, p1, p3, p2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add('vault', g, null, { uvScale: 0.3 });
  const pts = [];
  for (let k = 0; k <= 12; k++) { const u = k / 12; const [x, z] = mapper(u, 0); pts.push(new THREE.Vector3(x, H(u, 0) - 0.12, z)); }
  b.add('carved', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.17, 4, false));
}

function ringSector(cx, r0, r1, a0, a1, y, t) {
  const g = new THREE.RingGeometry(r0, r1, 6, 1, a0, a1 - a0);
  g.rotateX(Math.PI / 2);
  // RingGeometry 位于 xy 平面，旋转后角度方向与 z 一致
  g.translate(cx, y, 0);
  void t;
  return g;
}

/* 中世纪尖塔：八角形、镂空、铅皮覆面的橡木结构 */
function buildSpire(b, x, z) {
  const base = P.RIDGE - 1.5;
  const R0 = 3.3;
  // 八角基座
  b.add('lead', new THREE.CylinderGeometry(R0 + 0.3, R0 + 0.6, 3.2, 8), M(x, base + 1.6, z, 0, Math.PI / 8, 0), { uvScale: 0.5 });
  // 下层：八根角柱 + 开放尖拱 + 山花
  const y1 = base + 3.2, y2 = y1 + 9;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const px = x + Math.cos(a) * R0, pz = z + Math.sin(a) * R0;
    b.add('lead', new THREE.BoxGeometry(0.45, 9, 0.45), M(px, y1 + 4.5, pz, 0, -a, 0));
    b.add('lead', pinnacleGeometry(0.32, 3.4), M(px, y2, pz));
    const am = a + Math.PI / 8;
    const fx = x + Math.cos(am) * R0 * 0.93, fz = z + Math.sin(am) * R0 * 0.93;
    const w = 2 * R0 * Math.sin(Math.PI / 8) - 0.5;
    b.add('lead', archMolding(w, 5.8, 1, 0.09, true, 0, 8), M(fx, y1, fz, 0, -am + Math.PI / 2, 0));
    const gab = [new THREE.Vector2(-w / 2 - 0.2, 0), new THREE.Vector2(w / 2 + 0.2, 0), new THREE.Vector2(0, 2.6)];
    b.add('lead', extrude(gab, 0.15), M(fx, y2 - 0.3, fz, 0, -am + Math.PI / 2, 0));
  }
  b.add('lead', new THREE.CylinderGeometry(R0 * 0.7, R0 * 0.75, 9, 8), M(x, y1 + 4.5, z, 0, Math.PI / 8, 0), { uvScale: 0.5 });
  b.add('lead', new THREE.CylinderGeometry(R0 + 0.35, R0 + 0.35, 0.5, 8), M(x, y2 - 0.25, z, 0, Math.PI / 8, 0));
  // 主尖顶：8 条棱肋 + 水平环 + 卷叶
  const yTop = 80.5;
  const Rb = R0 * 0.8;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const p0 = new THREE.Vector3(x + Math.cos(a) * Rb, y2, z + Math.sin(a) * Rb);
    const p1 = new THREE.Vector3(x, yTop, z);
    const len = p0.distanceTo(p1);
    const g = new THREE.BoxGeometry(0.24, len, 0.24);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const dir = p1.clone().sub(p0).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    b.add('lead', g, m);
    for (let t = 0.08; t < 0.95; t += 0.07) {
      const cp = p0.clone().lerp(p1, t);
      b.add('lead', new THREE.SphereGeometry(0.14 * (1 - t * 0.7), 4, 3), M(cp.x + Math.cos(a) * 0.15, cp.y, cp.z + Math.sin(a) * 0.15));
    }
  }
  for (let t = 0; t < 0.92; t += 0.085) {
    const r = Rb * (1 - t);
    b.add('lead', new THREE.TorusGeometry(r, 0.07, 3, 8), M(x, y2 + (yTop - y2) * t, z, Math.PI / 2, 0, Math.PI / 8));
  }
  // 内部收分的实心芯（模拟镂空后方的木构）
  b.add('woodDark', new THREE.ConeGeometry(Rb * 0.45, yTop - y2, 8), M(x, (y2 + yTop) / 2, z));
  // 顶端：铜球、十字架与风向公鸡
  b.add('gold', new THREE.SphereGeometry(0.35, 10, 8), M(x, yTop + 0.3, z));
  b.add('gold', new THREE.BoxGeometry(0.14, 2.6, 0.14), M(x, yTop + 1.6, z));
  b.add('gold', new THREE.BoxGeometry(1.3, 0.14, 0.14), M(x, yTop + 2.2, z));
  const cock = new THREE.SphereGeometry(0.3, 8, 6); cock.scale(1.4, 1, 0.5);
  b.add('gold', cock, M(x, yTop + 3.2, z));
}
