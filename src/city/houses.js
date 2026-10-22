// 中世纪巴黎民居：木骨架灰泥立面、逐层外挑（jettying）、山墙朝街、陡坡石板/陶瓦屋顶
import * as THREE from 'three';
import { M, unitBox } from '../geom.js';
import { addOBB } from '../world.js';

const atlasCell = (i) => ({ u0: (i % 4) * 0.25, v0: 1 - (Math.floor(i / 4) + 1) * 0.5, du: 0.25, dv: 0.5 });

function quad(w, h, cell) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + uv.getX(i) * cell.du, cell.v0 + uv.getY(i) * cell.dv);
  return g;
}
function triangle(w, h, cell) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([cell.u0, cell.v0, cell.u0 + cell.du, cell.v0, cell.u0 + cell.du * 0.5, cell.v0 + cell.dv], 2));
  return g;
}

/**
 * 在 (x,z) 放置一座房屋。ang 为朝街方向（正面法线）绕 Y 的角度：法线 = (sin ang, 0, cos ang)
 * opts: w 面宽, d 进深, n 层数, rng, base 地面高, gableFront, roofKey, collide
 */
export function addHouse(b, x, z, ang, opts) {
  const { w, d, n, rng, base = 0 } = opts;
  const storyH = opts.storyH ?? 2.9;
  const jetty = opts.jetty ?? 0.32;
  const gableFront = opts.gableFront ?? true;
  const roofKey = opts.roofKey ?? (rng() < 0.65 ? 'slate' : 'tile');
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // 局部坐标：lx 沿街（右手），lz 指向街道（正面），原点在房屋后部中心
  const L = (lx, ly, lz) => [x + lx * ca + lz * sa, base + ly, z - lx * sa + lz * ca];
  let front = 0;
  for (let k = 0; k < n; k++) {
    const y0 = k * storyH;
    const ext = k === 0 ? 0 : jetty * k;
    front = d + ext;
    const depthK = front;
    const [cx, cy, cz] = L(0, y0 + storyH / 2, depthK / 2);
    b.add(k === 0 && opts.stoneBase ? 'stone' : 'plaster', unitBox(), M(cx, cy, cz, 0, ang, 0, w, storyH, depthK), { uvScale: 0.5 });
    // 立面贴图
    const cell = k === 0 ? atlasCell(4 + Math.floor(rng() * 3)) : atlasCell(Math.floor(rng() * 4));
    const [fx, fy, fz] = L(0, y0 + storyH / 2, depthK + 0.02);
    b.add('facade', quad(w, storyH, cell), M(fx, fy, fz, 0, ang, 0), { keepUV: true });
    if (k > 0) {
      // 外挑楼层下方的木梁
      const [bx, by, bz] = L(0, y0 + 0.08, depthK - jetty / 2);
      b.add('woodDark', unitBox(), M(bx, by, bz, 0, ang, 0, w, 0.16, jetty + 0.05), { uvScale: 1 });
    }
  }
  const top = n * storyH;
  const pitch = opts.pitch ?? (1.05 + rng() * 0.35);
  if (gableFront) {
    // 山墙朝街：屋脊沿进深方向
    const rh = (w / 2) * pitch;
    const slope = Math.hypot(w / 2 + 0.3, rh);
    const len = front + 0.5;
    const roofAng = Math.atan2(rh, w / 2 + 0.3);
    for (const s of [-1, 1]) {
      const [rx, ry, rz] = L(s * (w / 4 + 0.075), top + rh / 2, front / 2 + 0.1);
      const g = new THREE.PlaneGeometry(slope, len);
      g.rotateX(-Math.PI / 2);
      g.rotateZ(-s * roofAng);
      b.add(roofKey, g, M(rx, ry, rz, 0, ang, 0), { uvScale: 0.25 });
    }
    const [gx, gy, gz] = L(0, top, front + 0.01);
    b.add('facade', triangle(w, rh, atlasCell(7)), M(gx, gy, gz, 0, ang, 0), { keepUV: true });
    const [hx, hy, hz] = L(0, top, 0);
    b.add('plaster', triangle(w, rh, atlasCell(7)), M(hx, hy, hz, 0, ang + Math.PI, 0), { uvScale: 0.5 });
    // 屋脊
    const [kx, ky, kz] = L(0, top + rh, front / 2);
    b.add(roofKey, unitBox(), M(kx, ky, kz, 0, ang, 0, 0.25, 0.2, len), { uvScale: 0.5 });
  } else {
    // 檐口朝街：屋脊平行于街道
    const rh = (front / 2) * pitch * 0.8;
    const slope = Math.hypot(front / 2 + 0.3, rh);
    const roofAng = Math.atan2(rh, front / 2 + 0.3);
    for (const s of [-1, 1]) {
      const [rx, ry, rz] = L(0, top + rh / 2, front / 2 + s * (front / 4 + 0.075));
      const g = new THREE.PlaneGeometry(w + 0.4, slope);
      g.rotateX(-Math.PI / 2 + s * roofAng);
      b.add(roofKey, g, M(rx, ry, rz, 0, ang, 0), { uvScale: 0.25 });
    }
    for (const s of [-1, 1]) {
      const [tx, ty, tz] = L(s * w / 2, top, front / 2);
      b.add('plaster', triangle(front, rh, atlasCell(7)), M(tx, ty, tz, 0, ang + s * Math.PI / 2, 0), { uvScale: 0.5 });
    }
    // 老虎窗
    if (rng() < 0.6) {
      const dlx = (rng() - 0.5) * w * 0.4, dlz = front - front * 0.22;
      const [dx, dy, dz] = L(dlx, top + rh * 0.35, dlz);
      b.add('plaster', unitBox(), M(dx, dy, dz, 0, ang, 0, 1.2, 1.4, 1.2), { uvScale: 0.5 });
      const [qx, qy, qz] = L(dlx, top + rh * 0.35, dlz + 0.62);
      b.add('facade', quad(1.0, 1.2, atlasCell(7)), M(qx, qy, qz, 0, ang, 0), { keepUV: true });
    }
  }
  // 烟囱
  if (rng() < 0.55) {
    const [cx, cy, cz] = L((rng() - 0.5) * w * 0.5, top + (gableFront ? w / 2 * pitch : front / 2 * pitch * 0.8) * 0.6 + 1.0, front * (0.3 + rng() * 0.3));
    b.add('stone', unitBox(), M(cx, cy, cz, 0, ang, 0, 0.7, 2.6, 0.7), { uvScale: 0.5 });
  }
  if (opts.collide !== false) {
    const [ccx, , ccz] = L(0, 0, d / 2);
    addOBB(ccx, ccz, w / 2, d / 2, ang, -5, base + n * storyH);
  }
  return top;
}

/**
 * 街区：矩形 (x0,z0)-(x1,z1)，在指定的临街边（'n','s','w','e'）布置房屋
 */
export function fillBlock(b, x0, z0, x1, z1, sides, rng, opts = {}) {
  const depthR = opts.depth ?? [7, 11];
  const nR = opts.stories ?? [3, 5];
  const placeRow = (ax, az, bx, bz, ang, inset0, inset1) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    let t = inset0;
    while (t < len - inset1 - 2.5) {
      let w = 3.6 + rng() * 3.4;
      if (t + w > len - inset1) w = len - inset1 - t;
      if (w < 2.8) break;
      const d = depthR[0] + rng() * (depthR[1] - depthR[0]);
      const n = Math.floor(nR[0] + rng() * (nR[1] - nR[0] + 1));
      const cx = ax + ux * (t + w / 2), cz = az + uz * (t + w / 2);
      // 原点在房屋后部：从街面向内退进深 d
      const nx = Math.sin(ang), nz = Math.cos(ang);
      const back = opts.skip && opts.skip(cx, cz);
      if (!back) {
        addHouse(b, cx - nx * d, cz - nz * d, ang + (rng() - 0.5) * 0.03, {
          w: w - 0.04, d, n, rng, base: opts.base ?? 0, gableFront: rng() < (opts.gableRatio ?? 0.7),
          stoneBase: rng() < 0.4, collide: opts.collide,
        });
      }
      t += w;
    }
  };
  // 法线朝外：北侧 -z（ang=π），南侧 +z（ang=0），西侧 -x（ang=-π/2），东侧 +x（ang=π/2）
  const maxD = depthR[1];
  if (sides.includes('n')) placeRow(x1, z0, x0, z0, Math.PI, 0, 0);
  if (sides.includes('s')) placeRow(x0, z1, x1, z1, 0, 0, 0);
  if (sides.includes('w')) placeRow(x0, z0, x0, z1, -Math.PI / 2, sides.includes('n') ? maxD : 0, sides.includes('s') ? maxD : 0);
  if (sides.includes('e')) placeRow(x1, z1, x1, z0, Math.PI / 2, sides.includes('s') ? maxD : 0, sides.includes('n') ? maxD : 0);
}
