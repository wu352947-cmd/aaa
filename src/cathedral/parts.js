// 建筑部件辅助函数
import * as THREE from 'three';
import { M, wallWithOpenings, archPoints, archApex, archPlane, archMolding, statueGeometry, extrude } from '../geom.js';

// 沿 +x 方向的墙（位于 z=zc）
export function wallX(b, key, x0, len, y0, height, zc, thick, holes = [], outline = null, opts) {
  b.add(key, wallWithOpenings(len, height, thick, holes, outline), M(x0, y0, zc), opts);
}
// 沿 +z 方向的墙（位于 x=xc）
export function wallZ(b, key, z0, len, y0, height, xc, thick, holes = [], outline = null, opts) {
  b.add(key, wallWithOpenings(len, height, thick, holes, outline), M(xc, y0, z0, 0, -Math.PI / 2, 0), opts);
}
// 任意方向的墙：从 (xa,za) 到 (xb,zb)
export function wallAB(b, key, xa, za, xb, zb, y0, height, thick, holes = [], outline = null) {
  const len = Math.hypot(xb - xa, zb - za);
  const ang = Math.atan2(-(zb - za), xb - xa);
  b.add(key, wallWithOpenings(len, height, thick, holes, outline), M(xa, y0, za, 0, ang, 0));
  return { len, ang };
}

// U 形拱环（用于门洞层层退进的拱券）
export function ringGeometry(wOut, wIn, spring, k, depth, seg = 12) {
  const outer = archPoints(wOut, spring, k, seg);
  const inner = archPoints(wIn, spring, k, seg).reverse();
  return extrude([...outer, ...inner], depth);
}

// 彩绘玻璃窗：室内发光面 + 室外反光面；(nx,nz) 指向室内
export function glassWindow(b, cx, y, cz, nx, nz, w, spring, k = 1, variant = 0, keys = ['glassIn', 'glassOut']) {
  const cell = { u0: (variant % 4) * 0.25, du: 0.25, v0: 0, dv: 1 };
  const g = archPlane(w, spring, k, cell);
  const th = Math.atan2(nx, nz);
  b.add(keys[0], g, M(cx + nx * 0.03, y, cz + nz * 0.03, 0, th, 0), { keepUV: true });
  b.add(keys[1], g, M(cx - nx * 0.03, y, cz - nz * 0.03, 0, th + Math.PI, 0), { keepUV: true });
  // 中梃与窗棂
  if (w > 1.6) {
    const top = spring + archApex(w, k);
    const mull = new THREE.BoxGeometry(0.16, spring + archApex(w, k) * 0.35, 0.22);
    b.add('stone', mull, M(cx, y + (spring + archApex(w, k) * 0.35) / 2, cz, 0, th, 0));
    const ring = new THREE.TorusGeometry(w * 0.22, 0.08, 5, 16);
    b.add('stone', ring, M(cx, y + top - w * 0.36, cz, 0, th, 0));
    const sub = archMolding(w / 2 - 0.1, spring, k, 0.07, false, 0, 6);
    b.add('stone', sub, M(cx - Math.cos(th) * w / 4, y, cz + Math.sin(th) * w / 4, 0, th, 0));
    b.add('stone', sub, M(cx + Math.cos(th) * w / 4, y, cz - Math.sin(th) * w / 4, 0, th, 0));
  }
}

// 雕像：面向方向 (fx,fz)
export function statue(b, key, kind, x, y, z, fx, fz, scale = 1) {
  const g = statueGeometry(kind);
  b.add(key, g, M(x, y, z, 0, Math.atan2(fx, fz), 0, scale, scale, scale), { uvScale: 1.2 });
}

// 栏杆：从 a 到 b 的直线，高 h
export function balustrade(b, key, xa, za, xb, zb, y, h = 1.1, spacing = 0.45) {
  const len = Math.hypot(xb - xa, zb - za);
  const ang = Math.atan2(-(zb - za), xb - xa);
  const cx = (xa + xb) / 2, cz = (za + zb) / 2;
  b.add(key, new THREE.BoxGeometry(len, 0.18, 0.35), M(cx, y + h - 0.09, cz, 0, ang, 0));
  b.add(key, new THREE.BoxGeometry(len, 0.15, 0.4), M(cx, y + 0.075, cz, 0, ang, 0));
  const n = Math.max(1, Math.floor(len / spacing));
  const post = new THREE.CylinderGeometry(0.07, 0.09, h - 0.33, 5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(key, post, M(xa + (xb - xa) * t, y + 0.15 + (h - 0.33) / 2, za + (zb - za) * t));
  }
}

// 托檐（corbel table）：沿直线的一排小托架 + 檐板
export function corbelTable(b, key, xa, za, xb, zb, y, out = 0.6, nx = 0, nz = 0) {
  const len = Math.hypot(xb - xa, zb - za);
  const ang = Math.atan2(-(zb - za), xb - xa);
  b.add(key, new THREE.BoxGeometry(len, 0.35, out + 0.3), M((xa + xb) / 2 + nx * out / 2, y + 0.18, (za + zb) / 2 + nz * out / 2, 0, ang, 0));
  const n = Math.floor(len / 0.8);
  const cb = new THREE.BoxGeometry(0.25, 0.45, out);
  for (let i = 0; i <= n; i++) {
    const t = (i + 0.5) / (n + 1);
    b.add(key, cb, M(xa + (xb - xa) * t + nx * out / 2, y - 0.22, za + (zb - za) * t + nz * out / 2, 0, ang, 0));
  }
}

// 尖拱连拱（盲拱或开放拱廊）：沿 a->b，n 个拱
export function arcade(b, key, xa, za, xb, zb, y, h, n, colR = 0.1, k = 1, molding = 0.07) {
  const len = Math.hypot(xb - xa, zb - za);
  const ang = Math.atan2(-(zb - za), xb - xa);
  const w = len / n;
  const apex = archApex(w, k);
  const spring = h - apex;
  const col = new THREE.CylinderGeometry(colR, colR, spring, 6);
  const arc = archMolding(w - colR * 2, 0, k, molding, false, 0, 8);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(key, col, M(xa + (xb - xa) * t, y + spring / 2, za + (zb - za) * t));
    if (i < n) {
      const tc = (i + 0.5) / n;
      b.add(key, arc, M(xa + (xb - xa) * tc, y + spring, za + (zb - za) * tc, 0, ang, 0));
    }
  }
  return { spring, apex };
}

// 屋顶棱柱（沿 x 方向）：屋脊在 zc，半宽 hw，檐口高度 ye，脊高 yr
export function roofX(b, key, x0, x1, zc, hw, ye, yr, gableEnds = false) {
  const slope = Math.hypot(hw, yr - ye);
  const len = x1 - x0;
  const g = new THREE.PlaneGeometry(len, slope);
  const ang = Math.atan2(yr - ye, hw);
  b.add(key, g, M((x0 + x1) / 2, (ye + yr) / 2, zc - hw / 2, -(Math.PI / 2 - ang), 0, 0), { uvScale: 0.25 });
  b.add(key, g, M((x0 + x1) / 2, (ye + yr) / 2, zc + hw / 2, Math.PI / 2 - ang, Math.PI, 0), { uvScale: 0.25 });
  // 屋脊饰条
  b.add('lead', new THREE.BoxGeometry(len, 0.3, 0.3), M((x0 + x1) / 2, yr, zc));
  if (gableEnds) {
    const tri = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, yr - ye)]);
    const tg = new THREE.ShapeGeometry(tri);
    b.add(key, tg, M(x0, ye, zc, 0, -Math.PI / 2, 0));
    b.add(key, tg, M(x1, ye, zc, 0, Math.PI / 2, 0));
  }
}
// 屋顶棱柱（沿 z 方向）
export function roofZ(b, key, z0, z1, xc, hw, ye, yr) {
  const slope = Math.hypot(hw, yr - ye);
  const len = z1 - z0;
  const g = new THREE.PlaneGeometry(len, slope);
  const ang = Math.atan2(yr - ye, hw);
  b.add(key, g, M(xc - hw / 2, (ye + yr) / 2, (z0 + z1) / 2, -(Math.PI / 2 - ang), Math.PI / 2, 0), { uvScale: 0.25 });
  b.add(key, g, M(xc + hw / 2, (ye + yr) / 2, (z0 + z1) / 2, -(Math.PI / 2 - ang), -Math.PI / 2, 0), { uvScale: 0.25 });
  b.add('lead', new THREE.BoxGeometry(0.3, 0.3, len), M(xc, yr, (z0 + z1) / 2));
}

// 单坡屋顶：从高边 (y0, 位于 a 线) 到低边 (y1, 位于 b 线)；用两端点定义
export function leanTo(b, key, xa, za, xb, zb, yHigh, xa2, za2, xb2, zb2, yLow) {
  const pos = new Float32Array([
    xa, yHigh, za, xb, yHigh, zb, xb2, yLow, zb2,
    xa, yHigh, za, xb2, yLow, zb2, xa2, yLow, za2,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 确保法线朝上
  if (g.attributes.normal.getY(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
    g.computeVertexNormals();
  }
  b.add(key, g, null, { uvScale: 0.25 });
}

// 飞扶壁：从扶壁墩顶 (外侧) 到墙体，profile 在竖直平面内
export function flyingButtress(b, key, xo, zo, yo, xi, zi, yi, thick = 0.75) {
  const span = Math.hypot(xi - xo, zi - zo);
  const ang = Math.atan2(-(zi - zo), xi - xo);
  const drop = 2.6;
  const pts = [];
  pts.push(new THREE.Vector2(0, 0.9));
  pts.push(new THREE.Vector2(span, yi - yo + 0.9));
  pts.push(new THREE.Vector2(span, yi - yo - 1.4));
  // 下缘四分之一椭圆弧
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = (1 - t) * Math.PI / 2;
    const yTop = yi - yo - 1.4;
    const x = span - span * Math.cos(a);
    const y = -drop + (yTop + drop) * Math.sin(a);
    pts.push(new THREE.Vector2(x, y));
  }
  const g = extrude(pts, thick);
  b.add(key, g, M(xo, yo, zo, 0, ang, 0));
}
