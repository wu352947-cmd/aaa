// 世界注册表：碰撞体、可行走平台、地形高度、名胜点
export const world = {
  colliders: [],
  platforms: [],
  pois: [],
  interiorZones: [],
  terrainHeight: () => 0,
  lights: [],
  animated: [],
};

export function addBox(x0, z0, x1, z1, y0 = -50, y1 = 200) {
  world.colliders.push({ t: 'obb', cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2, c: 1, s: 0, y0, y1 });
}
// 旋转盒：中心、半长（沿 angle 方向）、半厚、角度（绕 Y，从 +x 向 -z 为正，与 three.js 一致）
export function addOBB(cx, cz, hl, ht, angle, y0 = -50, y1 = 200) {
  world.colliders.push({ t: 'obb', cx, cz, hx: hl, hz: ht, c: Math.cos(angle), s: Math.sin(angle), y0, y1 });
}
export function addCircle(x, z, r, y0 = -50, y1 = 200) {
  world.colliders.push({ t: 'circle', x, z, r, y0, y1 });
}
// 水平平台（矩形，可选旋转）
export function addPlatform(x0, z0, x1, z1, y, extra = {}) {
  world.platforms.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y, ...extra });
}
// 斜坡平台：沿 axis 方向从 ya 线性变化到 yb
export function addRamp(x0, z0, x1, z1, ya, yb, axis = 'x') {
  world.platforms.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y: Math.max(ya, yb), ramp: { ya, yb, axis, a0: axis === 'x' ? x0 : z0, a1: axis === 'x' ? x1 : z1 } });
}
export function addPOI(p) { world.pois.push(p); }

export function platformHeightAt(p, x, z) {
  if (!p.ramp) return p.y;
  const r = p.ramp;
  const a = r.axis === 'x' ? x : z;
  const t = (a - r.a0) / (r.a1 - r.a0);
  return r.ya + (r.yb - r.ya) * Math.max(0, Math.min(1, t));
}

// 计算 (x,z) 处、不高于 yMax 的最高地面
export function groundAt(x, z, yMax) {
  let best = world.terrainHeight(x, z);
  for (const p of world.platforms) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    const h = platformHeightAt(p, x, z);
    if (h <= yMax && h > best) best = h;
  }
  return best;
}

// 圆形角色与碰撞体的水平推离
export function resolveCollisions(pos, radius, feetY, height) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of collidersNear(pos.x, pos.z)) {
      if (feetY + height < c.y0 || feetY > c.y1 - 0.05) continue;
      if (c.t === 'circle') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + radius;
        if (d < m && d > 1e-6) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; }
      } else {
        const dx = pos.x - c.cx, dz = pos.z - c.cz;
        // 转到盒的局部坐标
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) > c.hx + radius || Math.abs(lz) > c.hz + radius) continue;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ex = lx - qx, ez = lz - qz;
        const d = Math.hypot(ex, ez);
        let nlx, nlz;
        if (d > 1e-6) {
          if (d >= radius) continue;
          nlx = qx + ex / d * radius; nlz = qz + ez / d * radius;
        } else {
          // 中心在盒内：沿最近边推出
          const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
          if (px < pz) { nlx = Math.sign(lx || 1) * (c.hx + radius); nlz = lz; }
          else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hz + radius); }
        }
        // 转回世界坐标
        pos.x = c.cx + nlx * c.c + nlz * c.s;
        pos.z = c.cz - nlx * c.s + nlz * c.c;
      }
    }
  }
}

// 碰撞体空间网格（加速查询）
const GRID = 24;
let grid = null;
export function buildColliderGrid() {
  grid = new Map();
  world.colliders.forEach((c, i) => {
    let r, cx, cz;
    if (c.t === "circle") { r = c.r + 1; cx = c.x; cz = c.z; } else { r = Math.hypot(c.hx, c.hz) + 1; cx = c.cx; cz = c.cz; }
    const i0 = Math.floor((cx - r) / GRID), i1 = Math.floor((cx + r) / GRID);
    const j0 = Math.floor((cz - r) / GRID), j1 = Math.floor((cz + r) / GRID);
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
      const k = a * 100000 + b;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c);
    }
  });
}
export function collidersNear(x, z) {
  if (!grid) return world.colliders;
  return grid.get(Math.floor(x / GRID) * 100000 + Math.floor(z / GRID)) || [];
}
// 点是否在某个碰撞体内（用于相机防穿墙）
export function pointBlocked(x, y, z, pad = 0.15) {
  for (const c of collidersNear(x, z)) {
    if (y < c.y0 || y > c.y1) continue;
    if (c.t === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true; }
    else {
      const dx = x - c.cx, dz = z - c.cz;
      const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad) return true;
    }
  }
  return false;
}
