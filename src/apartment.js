// 建筑：墙体、地面、吊顶、落地窗、门、露台、建筑外壳
import * as THREE from 'three';
import { Builder, boxGeo, scaleUV } from './builder.js';
import { rooms, walls, doors, facade, roomAt, H, GROUND, EXT_T } from './layout.js';
import { canvas, tex } from './textures.js';

export const INTERIOR_LAYER = 1;

function sideRoom(x, z) {
  const r = roomAt(x, z);
  return r;
}

// 将墙段 [a,b] 在 s 一侧按房间边界切分，返回 [起, 止, 房间]
function splitByRooms(w, a, b, s) {
  const isX = w.axis === 'x';
  const cuts = new Set([a, b]);
  for (const r of rooms) for (const v of isX ? [r.x1, r.x2] : [r.z1, r.z2]) if (v > a + 1e-3 && v < b - 1e-3) cuts.add(v);
  const pts = [...cuts].sort((p, q) => p - q);
  const out = [];
  const off = w.t / 2 + 0.06;
  for (let i = 0; i < pts.length - 1; i++) {
    const m = (pts[i] + pts[i + 1]) / 2;
    const r = sideRoom(isX ? m : w.c + s * off, isX ? w.c + s * off : m);
    const last = out[out.length - 1];
    if (last && last[2] === r) last[1] = pts[i + 1]; else out.push([pts[i], pts[i + 1], r]);
  }
  return out;
}

export function buildApartment(scene, M) {
  const group = new THREE.Group();
  group.name = 'apartment';
  scene.add(group);
  const B = new Builder(); // 室内（不进反射）
  const X = new Builder(); // 室外可见部分（进入水面反射）

  /* ---------- 地面、门槛石 ---------- */
  for (const r of rooms) {
    if (r.outdoor) continue;
    const g = new THREE.PlaneGeometry(r.x2 - r.x1, r.z2 - r.z1);
    // 世界坐标 UV，使相邻房间纹理连续
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + (r.x1 + r.x2) / 2, wz = -pos.getY(i) + (r.z1 + r.z2) / 2;
      uv.setXY(i, wx, -wz);
    }
    B.add(g, M[r.floor], (r.x1 + r.x2) / 2, 0.0, (r.z1 + r.z2) / 2, -Math.PI / 2, 0, 0);
  }
  // 结构楼板（防止穿帮）
  X.box(M.facade, 0, -0.42, 6, 24.6, 0.4, 12.6);

  /* ---------- 墙体 ---------- */
  const colliders = B.colliders;
  const wallPieces = [];
  walls.forEach((w, wi) => {
    const ops = [...w.openings].sort((a, b) => a[0] - b[0]);
    let cur = w.from;
    const segs = [];
    for (const o of ops) {
      if (o[0] > cur) segs.push([cur, o[0], 0, H]);
      if (o[2] > 0) segs.push([o[0], o[1], 0, o[2], 'sill']);
      if (o[3] < H) segs.push([o[0], o[1], o[3], H, 'head']);
      cur = o[1];
    }
    if (cur < w.to) segs.push([cur, w.to, 0, H]);
    for (const [a, b, y0, y1, kind] of segs) {
      const len = b - a, mid = (a + b) / 2;
      const isX = w.axis === 'x';
      const cx = isX ? mid : w.c, cz = isX ? w.c : mid;
      const sx = isX ? len : w.t, sz = isX ? w.t : len;
      B.box(M.wall, cx, y0, cz, sx, y1 - y0, sz);
      if (y0 === 0) colliders.push({ x1: cx - sx / 2, z1: cz - sz / 2, x2: cx + sx / 2, z2: cz + sz / 2, wall: true });
      wallPieces.push({ w, wi, a, b, y0, y1, kind });
      // 两侧饰面（按房间边界切分，避免一面长墙跨多个房间时饰面串色）
      for (const s of [-1, 1]) {
        for (const [sa, sb, r] of splitByRooms(w, a, b, s)) {
          const sl = sb - sa, sm = (sa + sb) / 2;
          const plateOff = w.t / 2 + 0.006;
          const fx = isX ? sm : w.c + s * plateOff, fz = isX ? w.c + s * plateOff : sm;
          const fw = isX ? sl : 0.012, fd = isX ? 0.012 : sl;
          if (!r) {
            if (w.ext) X.box(M.facade, fx, y0, fz, fw, y1 - y0, fd);
            continue;
          }
          const mat = M[r.wall];
          if (mat !== M.wall) B.box(mat, fx, y0, fz, fw, Math.min(y1, r.ceil ?? H) - y0, fd);
          // 踢脚线
          if (y0 === 0 && !r.noSkirt && !r.outdoor) {
            const so = w.t / 2 + 0.008;
            B.box(M.skirting, isX ? sm : w.c + s * so, 0, isX ? w.c + s * so : sm, isX ? sl : 0.016, 0.08, isX ? 0.016 : sl);
          }
        }
      }
    }
    // 门套 / 窗套
    for (const o of ops) {
      const [a, b, y0, y1, kind] = o;
      const isX = w.axis === 'x';
      const len = b - a, mid = (a + b) / 2;
      const T = w.t + 0.03;
      const jamb = kind === 'win' ? M.lacquerWhite : M.walnutDark;
      if (kind === 'door' || kind === 'entry') {
        // 两侧门套 + 顶部
        for (const e of [a, b]) {
          const ex = isX ? e + (e === a ? 0.025 : -0.025) : w.c, ez = isX ? w.c : e + (e === a ? 0.025 : -0.025);
          B.box(jamb, ex, 0, ez, isX ? 0.05 : T, y1, isX ? T : 0.05);
        }
        B.box(jamb, isX ? mid : w.c, y1 - 0.05, isX ? w.c : mid, isX ? len : T, 0.05, isX ? T : len);
        // 门槛石
        B.box(M.darkMarble, isX ? mid : w.c, 0, isX ? w.c : mid, isX ? len : w.t + 0.02, 0.012, isX ? w.t + 0.02 : len);
      } else if (kind === 'win') {
        const inner = w.c - w.t / 2; // 后墙内侧（z 更小一侧）
        // 窗台石
        B.box(M.counter, mid, y0 - 0.03, w.c - 0.03, len + 0.1, 0.03, w.t + 0.06);
        // 窗框
        const fz = w.c + 0.02;
        B.box(M.frame, mid, y0, fz, len, 0.05, 0.08);
        B.box(M.frame, mid, y1 - 0.05, fz, len, 0.05, 0.08);
        B.box(M.frame, a + 0.025, y0, fz, 0.05, y1 - y0, 0.08);
        B.box(M.frame, b - 0.025, y0, fz, 0.05, y1 - y0, 0.08);
        B.box(M.frame, mid, y0, fz, 0.04, y1 - y0, 0.07);
        B.add(new THREE.PlaneGeometry(len, y1 - y0), M.windowGlass, mid, (y0 + y1) / 2, fz, 0, 0, 0);
        void inner;
      }
    }
  });

  /* ---------- 墙角环境光遮蔽（AO）渐变带 ---------- */
  M.ao = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTexture(), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  M.ao.userData.renderOrder = 1; M.ao.userData.noShadow = true;
  for (const pc of wallPieces) {
    const { w, y0, y1 } = pc;
    const isX = w.axis === 'x';
    for (const s of [-1, 1]) for (const [a, b, r] of splitByRooms(w, pc.a, pc.b, s)) {
      if (!r || r.outdoor) continue;
      const f = w.t / 2 + 0.02;
      const P = (along, y, d) => (isX ? new THREE.Vector3(along, y, w.c + s * (f + d)) : new THREE.Vector3(w.c + s * (f + d), y, along));
      const [lo, hi] = s > 0 ? [a, b] : [b, a];
      const [p, q] = isX ? [lo, hi] : [hi, lo];
      if (y0 === 0) {
        B.add(quadPts(P(p, 0.002, 0), P(q, 0.002, 0), P(q, 0.34, 0), P(p, 0.34, 0)), M.ao);
        B.add(quadPts(P(q, 0.003, 0), P(p, 0.003, 0), P(p, 0.003, 0.42), P(q, 0.003, 0.42)), M.ao);
      }
      if (y1 === H && !r.cove) {
        const c = r.ceil;
        B.add(quadPts(P(q, c - 0.002, 0), P(p, c - 0.002, 0), P(p, c - 0.3, 0), P(q, c - 0.3, 0)), M.ao);
        B.add(quadPts(P(p, c - 0.003, 0), P(q, c - 0.003, 0), P(q, c - 0.003, 0.34), P(p, c - 0.003, 0.34)), M.ao);
      }
    }
  }

  /* ---------- 前立面：落地窗 ---------- */
  const glassZ = 0.08;
  for (const [x1, x2] of facade.piers) {
    B.box(M.wall, (x1 + x2) / 2, 0, 0.22, x2 - x1, H, 0.44);
    colliders.push({ x1, z1: 0, x2, z2: 0.44, wall: true });
    X.box(M.facade, (x1 + x2) / 2, -0.4, -0.02, x2 - x1 + 0.02, H + 0.8, 0.04);
  }
  const slideGap = [];
  for (const bay of facade.bays) {
    const w = (bay.x2 - bay.x1) / bay.n;
    // 上下框
    X.box(M.frame, (bay.x1 + bay.x2) / 2, 0, glassZ, bay.x2 - bay.x1, 0.06, 0.12);
    X.box(M.frame, (bay.x1 + bay.x2) / 2, H - 0.08, glassZ, bay.x2 - bay.x1, 0.08, 0.14);
    for (let i = 0; i <= bay.n; i++) {
      const x = bay.x1 + i * w;
      X.box(M.frame, x, 0, glassZ, 0.055, H, 0.13);
    }
    for (let i = 0; i < bay.n; i++) {
      const x1 = bay.x1 + i * w, x2 = x1 + w;
      if (bay.slide === i) {
        // 推拉门：玻璃扇滑到相邻扇后面
        const sx = x1 - w * 0.88;
        X.box(M.frame, sx + w / 2, 0.06, glassZ + 0.07, w, 0.05, 0.05);
        X.box(M.frame, sx + w / 2, H - 0.13, glassZ + 0.07, w, 0.05, 0.05);
        X.box(M.frame, sx + 0.02, 0.06, glassZ + 0.07, 0.04, H - 0.14, 0.05);
        X.box(M.frame, sx + w - 0.02, 0.06, glassZ + 0.07, 0.04, H - 0.14, 0.05);
        X.add(new THREE.PlaneGeometry(w - 0.04, H - 0.2), M.windowGlass, sx + w / 2, H / 2, glassZ + 0.07, 0, 0, 0);
        X.box(M.steel, sx + w - 0.06, 0.95, glassZ + 0.1, 0.02, 0.5, 0.03);
        slideGap.push([x1 + 0.04, x2 - 0.04]);
        // 推拉轨道
        X.box(M.steel, (x1 + x2) / 2, 0, glassZ, w, 0.015, 0.1);
        continue;
      }
      X.add(new THREE.PlaneGeometry(w - 0.05, H - 0.14), M.windowGlass, (x1 + x2) / 2, H / 2, glassZ, 0, 0, 0);
    }
    // 碰撞：玻璃面
    let start = bay.x1;
    for (const [g1, g2] of slideGap.filter(([g1]) => g1 >= bay.x1 && g1 <= bay.x2)) {
      colliders.push({ x1: start, z1: 0.0, x2: g1, z2: 0.16, wall: true, glass: true });
      start = g2;
    }
    colliders.push({ x1: start, z1: 0.0, x2: bay.x2, z2: 0.16, wall: true, glass: true });
  }
  // 窗帘盒 + 窗帘
  const curtainZ = 0.42;
  for (const bay of facade.bays) {
    const cx = (bay.x1 + bay.x2) / 2, wid = bay.x2 - bay.x1;
    const r = roomAt(cx, 1);
    const ceil = r ? r.ceil : H;
    B.box(M.ceiling, cx, ceil - 0.18, 0.62, wid, 0.18, 0.02);
    B.box(M.steel, cx, ceil - 0.03, curtainZ, wid, 0.02, 0.03);
    B.box(M.steel, cx, ceil - 0.03, curtainZ - 0.12, wid, 0.02, 0.03);
    // 遮光帘收于两侧，纱帘半开
    const hang = ceil - 0.05;
    addCurtain(B, M.curtain, bay.x1 + 0.05, bay.x1 + 0.75, curtainZ, hang, 0.065);
    addCurtain(B, M.curtain, bay.x2 - 0.75, bay.x2 - 0.05, curtainZ, hang, 0.065);
    addCurtain(B, M.sheer, bay.x1 + 0.1, bay.x1 + 0.1 + wid * 0.22, curtainZ - 0.12, hang, 0.05);
    addCurtain(B, M.sheer, bay.x2 - 0.1 - wid * 0.22, bay.x2 - 0.1, curtainZ - 0.12, hang, 0.05);
  }

  /* ---------- 吊顶 ---------- */
  const glowTex = coveGlowTexture();
  M.coveGlow = new THREE.MeshBasicMaterial({ color: 0xffc98a, alphaMap: glowTex, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  M.coveGlow.userData.renderOrder = 5; M.coveGlow.userData.noShadow = true;
  const downlights = [];
  for (const r of rooms) {
    if (r.outdoor) continue;
    const ceil = r.ceil;
    const w = r.x2 - r.x1, d = r.z2 - r.z1, cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    if (r.cove) {
      B.plane(M.ceiling, cx, ceil, cz, w, d, Math.PI / 2, 0, 0);
      const bw = 0.5, drop = 0.22, y = ceil - drop;
      const zf = r.z1 === 0 ? 0.62 : r.z1; // 前侧让出窗帘盒
      B.box(M.ceiling, cx, y, zf + bw / 2, w, drop, bw);
      B.box(M.ceiling, cx, y, r.z2 - bw / 2, w, drop, bw);
      B.box(M.ceiling, r.x1 + bw / 2, y, (zf + r.z2) / 2, bw, drop, r.z2 - zf);
      B.box(M.ceiling, r.x2 - bw / 2, y, (zf + r.z2) / 2, bw, drop, r.z2 - zf);
      // 灯槽光晕
      const iw = w - bw * 2, id = r.z2 - zf - bw * 2, icz = zf + bw + id / 2;
      const gw = 0.55;
      B.quad(M.coveGlow, cx, ceil - 0.005, zf + bw + gw / 2, iw, gw, Math.PI / 2, 0, 0);
      B.quad(M.coveGlow, cx, ceil - 0.005, r.z2 - bw - gw / 2, iw, gw, Math.PI / 2, 0, Math.PI);
      B.quad(M.coveGlow, r.x1 + bw + gw / 2, ceil - 0.005, icz, id, gw, Math.PI / 2, 0, -Math.PI / 2);
      B.quad(M.coveGlow, r.x2 - bw - gw / 2, ceil - 0.005, icz, id, gw, Math.PI / 2, 0, Math.PI / 2);
      // 灯带缝
      B.box(M.lightStrip, cx, y + 0.01, zf + bw - 0.01, iw, 0.01, 0.01);
      // 筒灯（嵌于边吊）
      for (let x = r.x1 + 0.8; x < r.x2 - 0.5; x += 1.3) {
        downlights.push([x, y, r.z2 - bw / 2]);
      }
      for (let z = zf + 1.1; z < r.z2 - 0.8; z += 1.4) {
        downlights.push([r.x1 + bw / 2, y, z]);
        downlights.push([r.x2 - bw / 2, y, z]);
      }
    } else {
      B.plane(M.ceiling, cx, ceil, cz, w, d, Math.PI / 2, 0, 0);
      for (let x = r.x1 + 0.9; x < r.x2 - 0.5; x += 1.4) for (let z = r.z1 + 0.9; z < r.z2 - 0.5; z += 1.6) downlights.push([x, ceil, z]);
    }
  }
  for (const [x, y, z] of downlights) {
    B.cyl(M.downlight, x, y - 0.004, z, 0.035, 0.035, 0.003, 16);
    B.add(new THREE.TorusGeometry(0.045, 0.008, 6, 20), M.gunmetal, x, y - 0.004, z, Math.PI / 2, 0, 0);
  }

  /* ---------- 室内门 ---------- */
  const doorObjs = [];
  for (const d of doors) {
    const w = walls[d.wall];
    const isX = w.axis === 'x';
    const len = d.to - d.from - 0.1;
    // 计算开向一侧
    const target = rooms.find((r) => r.id === d.swingTo);
    const mid = (d.from + d.to) / 2;
    let s = 1;
    if (isX) s = target && (target.z1 + target.z2) / 2 > w.c ? 1 : -1;
    else s = target && (target.x1 + target.x2) / 2 > w.c ? 1 : -1;
    const pivot = new THREE.Group();
    const hingeAlong = d.from + 0.05;
    if (isX) pivot.position.set(hingeAlong, 0, w.c + s * (w.t / 2 - 0.02));
    else pivot.position.set(w.c + s * (w.t / 2 - 0.02), 0, hingeAlong);
    const leafMat = d.glass ? M.tintGlass : M.walnut;
    const leaf = new THREE.Group();
    const thick = 0.045;
    const leafGeo = boxGeo(isX ? len : thick, 2.34, isX ? thick : len);
    const leafMesh = new THREE.Mesh(leafGeo, d.glass ? M.frame : M.walnut);
    leafMesh.position.set(isX ? len / 2 : 0, 1.17, isX ? 0 : len / 2);
    leafMesh.castShadow = true; leafMesh.receiveShadow = true;
    if (d.glass) {
      // 长虹玻璃门：细框 + 玻璃
      leafMesh.scale.set(isX ? 1 : 0.6, 1, isX ? 0.6 : 1);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.08, 2.24), M.frosted);
      gl.position.copy(leafMesh.position);
      if (!isX) gl.rotation.y = Math.PI / 2;
      gl.renderOrder = 3;
      leaf.add(gl);
      leafMesh.visible = true;
      // 框
      leafMesh.geometry = framedLeafGeo(isX, len);
      leafMesh.scale.set(1, 1, 1);
    }
    leaf.add(leafMesh);
    // 黄铜嵌条
    if (!d.glass) {
      for (const sd of [-1, 1]) {
        const strip = new THREE.Mesh(boxGeo(isX ? len - 0.2 : 0.003, 0.006, isX ? 0.003 : len - 0.2), M.brass);
        strip.position.set(isX ? len / 2 : sd * (thick / 2 + 0.001), 1.6, isX ? sd * (thick / 2 + 0.001) : len / 2);
        leaf.add(strip);
      }
    }
    // 拉手（长条黑色）
    for (const sd of [-1, 1]) {
      const h = new THREE.Mesh(boxGeo(isX ? 0.02 : 0.03, 0.32, isX ? 0.03 : 0.02), M.blackMetal);
      h.position.set(isX ? len - 0.08 : sd * (thick / 2 + 0.02), 1.0, isX ? sd * (thick / 2 + 0.02) : len - 0.08);
      h.castShadow = true;
      leaf.add(h);
    }
    pivot.add(leaf);
    pivot.traverse((o) => o.layers.set(INTERIOR_LAYER));
    group.add(pivot);
    // 开门方向：绕铰链旋转，使门扇进入目标房间
    const openSign = isX ? -s : s;
    doorObjs.push({ pivot, open: 0, target: 0, sign: openSign, x: isX ? mid : w.c, z: isX ? w.c : mid, id: d.id });
  }
  // 入户门（双开铜门，常闭，装饰）
  {
    const w = walls[0];
    const x1 = 2.65, x2 = 3.85, z = w.c - w.t / 2 + 0.04;
    B.box(M.brassDark, (x1 + x2) / 2 - 0.3, 0, z, 0.58, 2.38, 0.06);
    B.box(M.brassDark, (x1 + x2) / 2 + 0.3, 0, z, 0.58, 2.38, 0.06);
    for (let i = 0; i < 5; i++) {
      B.box(M.brass, (x1 + x2) / 2 - 0.3, 0.3 + i * 0.42, z - 0.035, 0.46, 0.012, 0.01);
      B.box(M.brass, (x1 + x2) / 2 + 0.3, 0.3 + i * 0.42, z - 0.035, 0.46, 0.012, 0.01);
    }
    B.box(M.brass, (x1 + x2) / 2 - 0.05, 0.7, z - 0.06, 0.025, 0.7, 0.03);
    B.box(M.brass, (x1 + x2) / 2 + 0.05, 0.7, z - 0.06, 0.025, 0.7, 0.03);
    // 智能门锁
    B.box(M.black, (x1 + x2) / 2 - 0.12, 1.0, z - 0.045, 0.07, 0.28, 0.02);
  }

  /* ---------- 开关面板、插座、温控、烟感 ---------- */
  const switches = [[-3.88, 1.25, 5.85, 'z'], [5.12, 1.25, 4.4, 'z'], [4.88, 1.25, 4.4, 'z'], [3.95, 1.25, 11.88, 'x'], [-4.12, 1.25, 4.4, 'z'], [-5.38, 1.25, 10.0, 'z'], [4.88, 1.25, 7.7, 'z']];
  for (const [x, y, z, ax] of switches) {
    B.box(M.gunmetal, x, y, z, ax === 'z' ? 0.01 : 0.086, 0.086, ax === 'z' ? 0.086 : 0.01);
  }
  const sockets = [[-3.0, 5.93], [2.0, 5.93], [-11.0, 5.93], [6.0, 0.6], [-11.9, 1.3], [11.9, 1.4]];
  for (const [x, z] of sockets) {
    const ax = Math.abs(Math.abs(x) - 11.9) < 0.05 ? 'z' : 'x';
    B.box(M.white, x, 0.3, z, ax === 'z' ? 0.01 : 0.086, 0.086, ax === 'z' ? 0.086 : 0.01);
  }
  for (const r of rooms) {
    if (r.outdoor) continue;
    B.cyl(M.white, (r.x1 + r.x2) / 2 + 0.6, r.ceil - 0.03, (r.z1 + r.z2) / 2 + 0.4, 0.05, 0.055, 0.03, 16);
    // 中央空调线型出风口
    if (r.cove) {
      B.box(M.gunmetal, (r.x1 + r.x2) / 2, r.ceil - 0.225, r.z2 - 0.52, Math.min(2.4, (r.x2 - r.x1) * 0.4), 0.004, 0.06);
    } else if ((r.x2 - r.x1) > 2.5) {
      B.box(M.gunmetal, (r.x1 + r.x2) / 2, r.ceil - 0.004, r.z1 + 0.5, 1.0, 0.004, 0.06);
    }
  }

  /* ---------- 露台 ---------- */
  const t = rooms.find((r) => r.id === 'terrace');
  X.box(M.deck, (t.x1 + t.x2) / 2, -0.08, (t.z1 + t.z2) / 2 - 0.15, t.x2 - t.x1, 0.06, t.z2 - t.z1 + 0.3);
  X.box(M.facade, (t.x1 + t.x2) / 2, -0.42, (t.z1 + t.z2) / 2, t.x2 - t.x1 + 0.4, 0.34, t.z2 - t.z1 + 0.2);
  // 玻璃栏板
  const railY = 1.1;
  const rz = t.z1 + 0.06;
  X.add(new THREE.PlaneGeometry(t.x2 - t.x1, railY), M.glass, (t.x1 + t.x2) / 2, railY / 2 - 0.02, rz, 0, 0, 0);
  X.add(new THREE.PlaneGeometry(t.z2 - t.z1, railY), M.glass, t.x1 + 0.06, railY / 2 - 0.02, (t.z1 + t.z2) / 2, 0, Math.PI / 2, 0);
  X.add(new THREE.PlaneGeometry(t.z2 - t.z1, railY), M.glass, t.x2 - 0.06, railY / 2 - 0.02, (t.z1 + t.z2) / 2, 0, Math.PI / 2, 0);
  X.box(M.steel, (t.x1 + t.x2) / 2, railY, rz, t.x2 - t.x1 + 0.08, 0.03, 0.045);
  X.box(M.steel, t.x1 + 0.06, railY, (t.z1 + t.z2) / 2, 0.045, 0.03, t.z2 - t.z1);
  X.box(M.steel, t.x2 - 0.06, railY, (t.z1 + t.z2) / 2, 0.045, 0.03, t.z2 - t.z1);
  X.box(M.steel, (t.x1 + t.x2) / 2, -0.04, rz, t.x2 - t.x1, 0.06, 0.08);
  colliders.push({ x1: t.x1 - 1, z1: t.z1 - 1, x2: t.x2 + 1, z2: t.z1 + 0.1, wall: true, glass: true });
  colliders.push({ x1: t.x1 - 1, z1: t.z1, x2: t.x1 + 0.1, z2: 0, wall: true, glass: true });
  colliders.push({ x1: t.x2 - 0.1, z1: t.z1, x2: t.x2 + 1, z2: 0, wall: true, glass: true });
  // 楼上露台的挑板（遮阳）
  X.box(M.facade, (t.x1 + t.x2) / 2, H, (t.z1 + t.z2) / 2 - 0.15, t.x2 - t.x1 + 0.4, 0.4, t.z2 - t.z1 + 0.3);
  X.box(M.white, (t.x1 + t.x2) / 2, H - 0.002, (t.z1 + t.z2) / 2 - 0.15, t.x2 - t.x1 + 0.38, 0.002, t.z2 - t.z1 + 0.28);
  for (let x = t.x1 + 1.0; x < t.x2 - 0.5; x += 2.0) X.cyl(M.downlight, x, H - 0.006, -1.3, 0.035, 0.035, 0.004, 16);

  /* ---------- 建筑外壳 ---------- */
  buildShell(X, M);

  const interior = B.flush(group, { layer: INTERIOR_LAYER });
  const exterior = X.flush(group);
  return { group, colliders, doors: doorObjs, interior, exterior };
}

function framedLeafGeo(isX, len) {
  const parts = [];
  const t = 0.04;
  const mk = (w, h, d, x, y, z) => { const g = boxGeo(w, h, d); g.translate(x, y, z); return g.toNonIndexed(); };
  if (isX) {
    parts.push(mk(0.04, 2.34, t, -len / 2 + 0.02, 0, 0), mk(0.04, 2.34, t, len / 2 - 0.02, 0, 0), mk(len, 0.05, t, 0, 1.145, 0), mk(len, 0.05, t, 0, -1.145, 0));
  } else {
    parts.push(mk(t, 2.34, 0.04, 0, 0, -len / 2 + 0.02), mk(t, 2.34, 0.04, 0, 0, len / 2 - 0.02), mk(t, 0.05, len, 0, 1.145, 0), mk(t, 0.05, len, 0, -1.145, 0));
  }
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [];
  for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); uv.push(...p.attributes.uv.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function addCurtain(B, mat, x1, x2, z, top, depth = 0.06, bottom = 0.02) {
  const w = x2 - x1, h = top - bottom;
  const seg = Math.max(8, Math.round(w / 0.03));
  const g = new THREE.PlaneGeometry(w, h, seg, 6);
  const pos = g.attributes.position;
  const folds = Math.max(2, Math.round(w / 0.14));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = (x + w / 2) / w;
    const yy = (y + h / 2) / h; // 0 底 1 顶
    const amp = depth * (0.7 + 0.3 * (1 - yy)) * (0.85 + 0.15 * Math.sin(t * 7.0));
    pos.setZ(i, Math.sin(t * folds * Math.PI * 2) * amp);
    pos.setX(i, x * (0.98 + 0.02 * (1 - yy)));
  }
  g.computeVertexNormals();
  scaleUV(g, w, h);
  B.add(g, mat, (x1 + x2) / 2, bottom + h / 2, z, 0, 0, 0);
}

function quadPts(p0, p1, p2, p3) {
  const g = new THREE.BufferGeometry();
  const pos = [p0, p1, p2, p0, p2, p3].flatMap((p) => [p.x, p.y, p.z]);
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function aoTexture() {
  const c = canvas(4, 64);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(4, 64);
  for (let y = 0; y < 64; y++) {
    const v = 1 - y / 63; // 画布底部 = uv v=0 = 最暗
    const a = Math.pow(1 - v, 2.2);
    for (let x = 0; x < 4; x++) { const i = (y * 4 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255; img.data[i + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false, wrap: false });
}

function coveGlowTexture() {
  const c = canvas(16, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 128);
  const t = tex(c, { srgb: false, wrap: false });
  t.flipY = false;
  return t;
}

function buildShell(X, M) {
  const W1 = -12.3, W2 = 12.3, D2 = 12.3;
  const floorH = 3.4;
  // 下方 5 层
  for (let f = 0; f < 5; f++) {
    const y0 = GROUND + f * floorH;
    // 楼板外沿
    X.box(M.facade, 0, y0 + floorH - 0.45, -0.1, W2 - W1, 0.45, 0.3);
    if (f === 0) {
      // 首层大堂：石材 + 玻璃
      X.box(M.stoneGrey, 0, y0, 0.6, W2 - W1, floorH - 0.45, 0.2);
      X.box(M.tintGlass, -3, y0 + 0.05, 0.45, 8, 2.9, 0.02);
      continue;
    }
    // 玻璃幕 + 室内暗面
    X.box(M.facadeDark, 0, y0, 0.5, W2 - W1 - 0.2, floorH - 0.45, 0.05);
    for (let x = W1 + 0.3; x <= W2 - 0.3; x += 1.45) X.box(M.frame, x, y0, 0.12, 0.06, floorH - 0.45, 0.12);
    X.add(new THREE.PlaneGeometry(W2 - W1 - 0.6, floorH - 0.45), M.tintGlass, 0, y0 + (floorH - 0.45) / 2, 0.1, 0, 0, 0);
    // 下层露台
    X.box(M.facade, 0.5, y0 - 0.34, -1.4, 8.6, 0.34, 2.6);
    X.add(new THREE.PlaneGeometry(8.6, 1.1), M.glass, 0.5, y0 + 0.55, -2.6, 0, 0, 0);
    X.box(M.steel, 0.5, y0 + 1.08, -2.6, 8.6, 0.05, 0.07);
  }
  // 两侧与背面
  X.box(M.facade, W1 - 0.05, GROUND, 6, 0.1, 17 + 7.6, D2 + 0.3);
  X.box(M.facade, W2 + 0.05, GROUND, 6, 0.1, 17 + 7.6, D2 + 0.3);
  X.box(M.facade, 0, GROUND, D2 + 0.05, W2 - W1, 17, 0.1);
  X.box(M.facade, 0, H, D2 + 0.05, W2 - W1, 4.6, 0.1);
  // 楼上（7F）+ 屋顶
  const y7 = H + 0.4;
  X.box(M.facadeDark, 0, y7, 0.6, W2 - W1 - 0.2, 3.0, 0.05);
  for (let x = W1 + 0.3; x <= W2 - 0.3; x += 1.45) X.box(M.frame, x, y7, 0.2, 0.06, 3.0, 0.12);
  X.add(new THREE.PlaneGeometry(W2 - W1 - 0.6, 3.0), M.tintGlass, 0, y7 + 1.5, 0.18, 0, 0, 0);
  X.box(M.facade, 0, y7 + 3.0, 5.5, W2 - W1 + 0.6, 0.5, 12.6);
  X.box(M.facade, 0, y7 + 3.5, -0.2, W2 - W1 + 0.6, 0.7, 0.3);
  // 7F 露台栏板
  X.add(new THREE.PlaneGeometry(8.6, 1.1), M.glass, 0.5, H + 0.95, -2.75, 0, 0, 0);
  // 侧面竖向线条
  for (const x of [W1, W2]) X.box(M.stoneGrey, x, GROUND, -0.15, 0.5, 17 + 7.6 + 0.5, 0.5);
  // 电梯核心筒
  X.box(M.facade, 3, GROUND, 14.5, 6, 17 + 8, 4.3);
}
