// 西湖：湖盆地形、群山、苏堤白堤、孤山、三潭印月、湖心亭、雷峰塔、保俶塔、断桥、
// 湖滨步道（垂柳、桃树、路灯）、荷叶、游船、城市天际线
import * as THREE from 'three';
import { Builder, boxGeo, scaleUV } from './builder.js';
import { GROUND, WATER } from './layout.js';
import * as T from './textures.js';
import { LakeWater } from './water.js';
import { broadleafTree, willowTree, leafTexture, strandTexture } from './trees.js';

const PI = Math.PI;
// 细节层：主相机可见，但不进入水面反射（节省一次绘制）
export const DETAIL_LAYER = 2;
const detail = (o) => { o.traverse((c) => c.layers.set(DETAIL_LAYER)); return o; };

// 湖岸线（场景坐标：x 北，z 东；我们在东岸 z≈-30 处）
export const LAKE = [[1250, -30], [1330, -110], [1400, -380], [1430, -800], [1470, -1200], [1560, -1650], [1620, -2050], [1450, -2380], [1150, -2650], [500, -2800], [-200, -2850], [-900, -2820], [-1500, -2680], [-1900, -2420], [-2080, -2000], [-2150, -1550], [-2100, -1050], [-2040, -560], [-2000, -30]];
export const LANDMARKS = {
  leifeng: { name: '雷峰塔', x: -2230, z: -1260 },
  baochu: { name: '保俶塔', x: 1640, z: -880 },
  duanqiao: { name: '断桥残雪', x: 1205, z: -95 },
  baidi: { name: '白堤', x: 1240, z: -600 },
  gushan: { name: '孤山', x: 1330, z: -1450 },
  sudi: { name: '苏堤春晓', x: -300, z: -2110 },
  santan: { name: '三潭印月', x: -950, z: -1300 },
  huxinting: { name: '湖心亭', x: -150, z: -1050 },
  nanping: { name: '南屏山', x: -2650, z: -800 },
  beigaofeng: { name: '北高峰', x: 900, z: -4300 },
};
const SU_CAUSEWAY = [[1600, -2160], [1150, -2130], [600, -2095], [0, -2085], [-600, -2110], [-1150, -2165], [-1600, -2240], [-2010, -2310]];
const BAI_CAUSEWAY = [[1215, -125], [1250, -420], [1275, -760], [1300, -1080]];
const HILLS = [
  // x, z, 高度(相对地坪), 半径x, 半径z, 是否岛屿
  [1650, -860, 70, 230, 380], [1820, -1450, 110, 300, 360], [1980, -2150, 125, 360, 450], [2600, -3200, 230, 900, 900],
  [900, -4300, 300, 900, 900], [0, -3450, 120, 1500, 450], [-900, -3350, 150, 800, 520], [700, -3250, 105, 700, 380],
  [-1500, -3950, 250, 850, 850], [-2650, -3000, 210, 800, 700], [-3150, -1500, 235, 700, 800], [-2650, -750, 105, 480, 420],
  [-2250, -1260, 30, 150, 170], [-2600, 500, 50, 400, 300],
  [3200, -7200, 520, 3000, 1600], [-3200, -7600, 560, 3200, 1600], [-6200, -3000, 420, 1600, 3000], [5600, -3200, 380, 1500, 2600],
  [1330, -1450, 36, 105, 330, true], [-2300, 400, 20, 150, 150],
];

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function lakeSDF(x, z) {
  let d = Infinity;
  for (let i = 0, j = LAKE.length - 1; i < LAKE.length; j = i++) d = Math.min(d, distSeg(x, z, LAKE[j][0], LAKE[j][1], LAKE[i][0], LAKE[i][1]));
  return pointInPoly(x, z, LAKE) ? -d : d;
}

const noise = T.makeNoise2D(1337);
const noise2 = T.makeNoise2D(4242);
function ridged(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { s += (1 - Math.abs(noise(x * f, z * f))) * a; a *= 0.5; f *= 2.03; }
  return s;
}
function fbm(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += noise2(x * f, z * f) * a; a *= 0.5; f *= 2.1; }
  return s;
}

export function heightAt(x, z) {
  if (z > -30 && x > -2000 && x < 1250) return GROUND - 2.5;
  const sd = lakeSDF(x, z);
  let hills = 0, island = 0;
  for (const [hx, hz, h, rx, rz, isl] of HILLS) {
    const dx = (x - hx) / rx, dz = (z - hz) / rz;
    const d2 = dx * dx + dz * dz;
    if (d2 > 6) continue;
    const g = Math.exp(-d2 * 1.6);
    const v = h * g * (0.5 + 0.55 * ridged(x / 900 + hx * 0.001, z / 900) + 0.25 * ridged(x / 260, z / 260));
    if (isl) island = Math.max(island, v);
    else hills += v;
  }
  if (sd < 0) {
    const bottom = WATER - Math.min(3, 0.6 - sd * 0.02);
    return Math.max(bottom, island > 3 ? WATER - 1.5 + island : bottom);
  }
  const shore = Math.min(1, sd / 70);
  const land = GROUND + 0.4 + fbm(x / 300, z / 300) * 2 + hills * Math.min(1, sd / 160 + 0.15);
  return WATER - 0.6 + (land - WATER + 0.6) * (shore * shore * (3 - 2 * shore));
}

/* ======================= 地形网格（湖区加密） ======================= */
function axisSamples(ranges) {
  const out = [];
  for (const [a, b, step] of ranges) for (let v = a; v < b; v += step) out.push(v);
  out.push(ranges[ranges.length - 1][1]);
  return out;
}

function buildTerrain(M) {
  const xs = axisSamples([[-9000, -2500, 220], [-2500, 2000, 15], [2000, 9000, 220]]);
  const zs = axisSamples([[-10000, -3200, 220], [-3200, 0, 15], [0, 2500, 120]]);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    H[k] = heightAt(xs[i], zs[j]);
  }
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], z = zs[j], h = H[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 40; uv[k * 2 + 1] = z / 40;
    // 坡度
    const hx = H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)];
    const hz = H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i];
    const dxs = xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)], dzs = zs[Math.min(nz - 1, j + 1)] - zs[Math.max(0, j - 1)];
    const slope = Math.hypot(hx / dxs, hz / dzs);
    const above = h - WATER;
    const n = fbm(x / 180, z / 180), n2 = noise(x / 60, z / 60);
    if (above < 0.3) c.setRGB(0.16, 0.17, 0.12);
    else if (above < 1.4) c.setRGB(0.32, 0.36, 0.22);
    else {
      // 林地：深绿、墨绿与茶园黄绿
      const tea = Math.max(0, noise2(x / 420 + 7, z / 420) - 0.25) * (slope < 0.35 ? 1 : 0) * (z < -2900 ? 1 : 0);
      c.setRGB(0.14 + n * 0.05, 0.24 + n * 0.06, 0.12 + n * 0.03);
      c.lerp(new THREE.Color(0.36, 0.46, 0.2), Math.min(1, tea * 3));
      c.multiplyScalar(0.85 + n2 * 0.25);
      if (slope > 0.7) c.lerp(new THREE.Color(0.32, 0.3, 0.26), Math.min(1, (slope - 0.7) * 2));
      if (above < 4 && Math.abs(lakeSDF(x, z)) < 200) c.lerp(new THREE.Color(0.3, 0.38, 0.2), 0.4);
    }
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    // 全部在水下的格子不需要
    if (H[a] < WATER - 0.5 && H[b] < WATER - 0.5 && H[d] < WATER - 0.5 && H[e] < WATER - 0.5) continue;
    if (H[a] < GROUND - 2 && H[b] < GROUND - 2 && H[d] < GROUND - 2 && H[e] < GROUND - 2 && zs[j] > -40) continue;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const canopy = T.forestCanopy(512);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: canopy, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  mesh.name = 'terrain';
  return { mesh, xs, zs, H };
}

// 风吹柳摆：在顶点着色器中按 uv.y 摆动
export const windUniforms = { uTime: { value: 0 } };
function addWind(mat, amp = 0.35) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = (1.0 - uv.y);
        sway *= sway;
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = uTime * 1.3 + ip.x * 0.11 + ip.z * 0.07;
        transformed.x += sin(ph) * ${amp.toFixed(2)} * sway + sin(ph * 2.7 + position.y) * 0.08 * sway;
        transformed.z += cos(ph * 0.8) * ${(amp * 0.6).toFixed(2)} * sway;`);
  };
}

function instanced(geo, mat, transforms, { cast = false, colors = null } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  transforms.forEach((t, i) => {
    p.set(t.x, t.y, t.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.ry || 0);
    if (t.tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.tilt));
    s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    if (colors) im.setColorAt(i, colors[i]);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast;
  im.computeBoundingSphere();
  return im;
}

/* ======================= 古塔 ======================= */
function leifengPagoda(B, M) {
  // 雷峰塔（2002 年重建）：八面五层，铜瓦重檐，通高约 71 米
  const base = 0;
  B.add(new THREE.CylinderGeometry(22, 24, 6, 8), M.stone, 0, base + 3, 0, 0, PI / 8, 0);
  B.add(new THREE.CylinderGeometry(20, 21, 1.2, 8), M.stoneLight, 0, base + 6.6, 0, 0, PI / 8, 0);
  let y = base + 7.2;
  const stories = 5;
  for (let i = 0; i < stories; i++) {
    const r = 11.5 - i * 1.1, h = i === 0 ? 9.5 : 7.4;
    // 平座 + 栏杆
    B.add(new THREE.CylinderGeometry(r + 2.4, r + 2.4, 0.8, 8), M.pagodaRed, 0, y + 0.4, 0, 0, PI / 8, 0);
    B.add(new THREE.CylinderGeometry(r + 2.3, r + 2.3, 1.1, 8, 1, true), M.pagodaGold, 0, y + 1.35, 0, 0, PI / 8, 0);
    // 塔身（朱红柱 + 铜色墙）
    B.add(new THREE.CylinderGeometry(r, r, h, 8), M.pagodaWall, 0, y + 0.8 + h / 2, 0, 0, PI / 8, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2;
      B.add(new THREE.CylinderGeometry(0.45, 0.45, h, 8), M.pagodaRed, Math.cos(a) * (r + 0.2), y + 0.8 + h / 2, Math.sin(a) * (r + 0.2));
      // 门窗
      const am = a + PI / 8;
      B.add(boxGeo(r * 0.55, h * 0.55, 0.3), M.pagodaDark, Math.cos(am) * (r * 0.93), y + 0.8 + h * 0.42, Math.sin(am) * (r * 0.93), 0, -am + PI / 2, 0);
      // 夜间灯带
      B.add(boxGeo(r * 0.72, 0.18, 0.2), M.pagodaGlow, Math.cos(am) * (r + 2.1), y + h + 0.6, Math.sin(am) * (r + 2.1), 0, -am + PI / 2, 0);
    }
    // 斗拱
    B.add(new THREE.CylinderGeometry(r + 1.2, r + 0.2, 1.4, 8), M.pagodaGold, 0, y + 0.8 + h + 0.7, 0, 0, PI / 8, 0);
    // 屋檐：上翘铜瓦
    const eave = new THREE.LatheGeometry([
      new THREE.Vector2(r + 5.4, -0.2), new THREE.Vector2(r + 5.2, 0.4), new THREE.Vector2(r + 3.8, 0.55), new THREE.Vector2(r + 1.8, 1.4), new THREE.Vector2(r - 0.5, 2.6), new THREE.Vector2(r - 1.2, 2.8),
    ], 8);
    B.add(eave, M.pagodaRoof, 0, y + 0.8 + h + 1.2, 0, 0, PI / 8, 0);
    // 翘角
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2 + PI / 8 + PI / 8;
      B.add(new THREE.ConeGeometry(0.35, 2.2, 5), M.pagodaGold, Math.cos(a) * (r + 6.1), y + 0.8 + h + 1.6, Math.sin(a) * (r + 6.1), Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    }
    y += 0.8 + h + 3.6;
  }
  // 塔刹
  B.add(new THREE.CylinderGeometry(3, 4, 1.6, 8), M.pagodaRoof, 0, y + 0.8, 0, 0, PI / 8, 0);
  B.add(new THREE.SphereGeometry(2.0, 16, 10), M.pagodaGold, 0, y + 2.8, 0);
  for (let i = 0; i < 7; i++) B.add(new THREE.TorusGeometry(1.2 - i * 0.1, 0.25, 6, 16), M.pagodaGold, 0, y + 5 + i * 1.1, 0, PI / 2, 0, 0);
  B.add(new THREE.ConeGeometry(0.6, 4.5, 8), M.pagodaGold, 0, y + 15, 0);
  return y + 17;
}

function baochuPagoda(B, M) {
  // 保俶塔：八面七级实心砖塔，通高 45.3 米，塔身 35 米，铁铸塔刹 10 米，极为纤秀
  B.add(new THREE.CylinderGeometry(5.6, 6.2, 2.4, 8), M.stone, 0, 1.2, 0, 0, PI / 8, 0);
  let y = 2.4;
  for (let i = 0; i < 7; i++) {
    const r = 4.1 - i * 0.36, h = 4.3 - i * 0.18;
    B.add(new THREE.CylinderGeometry(r - 0.05, r, h, 8), M.pagodaBrick, 0, y + h / 2, 0, 0, PI / 8, 0);
    // 叠涩檐
    B.add(new THREE.CylinderGeometry(r + 0.7, r + 0.1, 0.55, 8), M.pagodaBrick, 0, y + h + 0.27, 0, 0, PI / 8, 0);
    B.add(new THREE.CylinderGeometry(r - 0.1, r + 0.75, 0.4, 8), M.stone, 0, y + h + 0.75, 0, 0, PI / 8, 0);
    y += h + 0.95;
  }
  // 铁塔刹
  B.add(new THREE.CylinderGeometry(0.15, 0.25, 10.3, 8), M.iron, 0, y + 5.1, 0);
  for (let i = 0; i < 6; i++) B.add(new THREE.TorusGeometry(0.7 - i * 0.06, 0.12, 5, 12), M.iron, 0, y + 1.5 + i * 1.1, 0, PI / 2, 0, 0);
  B.add(new THREE.SphereGeometry(0.6, 10, 8), M.iron, 0, y + 9.2, 0);
  return y + 10.3;
}

/* ======================= 江南建筑（粉墙黛瓦） ======================= */
function jiangnanHouse(B, M, w, d, h, roof = 'hip') {
  B.box(M.whiteWall, 0, 0, 0, w, h, d);
  B.box(M.darkWood, 0, 0, d / 2 + 0.01, w * 0.6, h * 0.7, 0.05);
  const rg = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1);
  rg.rotateY(PI / 4);
  B.add(rg, M.roofTile, 0, h + d * 0.28, 0, 0, 0, 0, w * 0.78, d * 0.56, d * 0.78);
  if (roof === 'hip') B.box(M.roofTile, 0, h + d * 0.53, 0, w * 0.55, 0.3, 0.3);
}

function pavilion(B, M, r = 3, h = 3.2) {
  // 六角亭
  B.add(new THREE.CylinderGeometry(r + 0.5, r + 0.6, 0.6, 6), M.stone, 0, 0.3, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2;
    B.add(new THREE.CylinderGeometry(0.15, 0.15, h, 8), M.pagodaRed, Math.cos(a) * r, 0.6 + h / 2, Math.sin(a) * r);
  }
  const roof = new THREE.LatheGeometry([new THREE.Vector2(r + 1.8, 0), new THREE.Vector2(r + 1.4, 0.35), new THREE.Vector2(r * 0.6, 1.6), new THREE.Vector2(0.2, 2.8), new THREE.Vector2(0, 3.0)], 6);
  B.add(roof, M.roofTile, 0, 0.6 + h, 0);
  B.add(new THREE.SphereGeometry(0.35, 8, 6), M.pagodaGold, 0, 0.6 + h + 3.1, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2;
    B.add(new THREE.ConeGeometry(0.12, 1.0, 4), M.roofTile, Math.cos(a) * (r + 1.9), 0.6 + h + 0.3, Math.sin(a) * (r + 1.9), Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
  }
}

function archBridge(B, M, span = 8, width = 6, rise = 3.5) {
  // 石拱桥（桥面沿 x）
  const s = new THREE.Shape();
  s.moveTo(-span / 2 - 6, -2); s.lineTo(-span / 2 - 6, 0.8);
  s.quadraticCurveTo(0, rise * 2 + 0.6, span / 2 + 6, 0.8);
  s.lineTo(span / 2 + 6, -2); s.lineTo(span / 2, -2);
  s.absarc(0, -2, span / 2, 0, PI, false);
  s.lineTo(-span / 2 - 6, -2);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -width / 2);
  scaleUV(g, 0.25, 0.25);
  B.add(g, M.stone, 0, 0, 0);
  // 栏杆
  for (const sz of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, x = -span / 2 - 6 + t * (span + 12);
      const yy = 0.8 + (rise * 2 - 0.2) * (1 - Math.pow((x / (span / 2 + 6)), 2)) * 0.5;
      pts.push(new THREE.Vector3(x, yy + 0.9, sz * (width / 2 - 0.15)));
    }
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 4), M.stoneLight);
  }
}

/* ======================= 船 ======================= */
function makeRowBoat(M, canopyMat) {
  const B = new Builder();
  const hull = new THREE.Shape();
  hull.moveTo(-3.2, 0); hull.quadraticCurveTo(-2.6, 0.85, 0, 0.85); hull.quadraticCurveTo(2.6, 0.85, 3.2, 0);
  hull.quadraticCurveTo(2.6, -0.85, 0, -0.85); hull.quadraticCurveTo(-2.6, -0.85, -3.2, 0);
  const g = new THREE.ExtrudeGeometry(hull, { depth: 0.55, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 12 });
  g.rotateX(-PI / 2);
  B.add(g, M.boatWood, 0, -0.25, 0);
  B.box(M.darkWood, 0, 0.32, 0, 5.2, 0.04, 1.3);
  // 乌篷/篷顶
  const c = new THREE.CylinderGeometry(0.8, 0.8, 2.4, 14, 1, true, 0, PI);
  c.rotateZ(PI / 2); c.rotateY(PI / 2);
  B.add(c, canopyMat, 0, 1.3, 0, 0, PI / 2, 0);
  for (const x of [-1.1, 1.1]) for (const z of [-0.7, 0.7]) B.cyl(M.darkWood, x, 0.3, z, 0.04, 0.04, 1.0, 6);
  B.box(M.boatSeat, 0, 0.36, 0, 1.6, 0.25, 1.1);
  // 船夫
  B.cyl(M.navy, 2.4, 0.35, 0, 0.18, 0.22, 0.75, 8);
  B.sphere(M.skin, 2.4, 1.25, 0, 0.13);
  B.add(new THREE.ConeGeometry(0.32, 0.18, 12), M.straw, 2.4, 1.4, 0);
  B.cyl(M.darkWood, 2.9, 0.2, 0.3, 0.025, 0.025, 2.4, 6, 0, -0.9);
  const grp = new THREE.Group();
  B.flush(grp, { cast: false, receive: false });
  return grp;
}

function makeHuafang(M) {
  // 画舫：双层楼阁游船
  const B = new Builder();
  const hull = new THREE.Shape();
  hull.moveTo(-10, 0); hull.quadraticCurveTo(-8, 2.6, 0, 2.6); hull.quadraticCurveTo(8, 2.6, 10.5, 0);
  hull.quadraticCurveTo(8, -2.6, 0, -2.6); hull.quadraticCurveTo(-8, -2.6, -10, 0);
  const g = new THREE.ExtrudeGeometry(hull, { depth: 1.4, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(-PI / 2);
  B.add(g, M.boatWood, 0, -0.6, 0);
  B.box(M.darkWood, 0, 0.8, 0, 14, 0.15, 4.6);
  B.box(M.pagodaRed, -0.5, 0.95, 0, 11, 2.6, 4.2);
  for (let x = -5.5; x <= 4.5; x += 1.4) { B.box(M.windowWarm, x + 0.7, 1.5, 2.11, 1.0, 1.4, 0.04); B.box(M.windowWarm, x + 0.7, 1.5, -2.11, 1.0, 1.4, 0.04); }
  const roof = new THREE.CylinderGeometry(0.2, 1, 1, 4, 1); roof.rotateY(PI / 4);
  B.add(roof, M.roofTile, -0.5, 4.25, 0, 0, 0, 0, 9.6, 1.6, 4.2);
  B.box(M.pagodaRed, -2.5, 4.9, 0, 4.5, 1.8, 3.2);
  B.add(roof.clone(), M.roofTile, -2.5, 7.3, 0, 0, 0, 0, 4.6, 1.2, 3.2);
  for (const x of [-6, -2.5, 1, 4.5]) B.sphere(M.lantern, x, 3.4, 2.4, 0.3, 1, 1.3, 1, 10);
  const grp = new THREE.Group();
  B.flush(grp, { cast: false, receive: false });
  return grp;
}

function makeCruiser(M) {
  const B = new Builder();
  const hull = new THREE.Shape();
  hull.moveTo(-7, 0); hull.quadraticCurveTo(-6, 2, 0, 2); hull.quadraticCurveTo(6, 2, 7.5, 0); hull.quadraticCurveTo(6, -2, 0, -2); hull.quadraticCurveTo(-6, -2, -7, 0);
  const g = new THREE.ExtrudeGeometry(hull, { depth: 1.1, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-PI / 2);
  B.add(g, M.white, 0, -0.5, 0);
  B.box(M.tintGlass, -0.5, 0.6, 0, 9, 1.6, 3.4);
  B.box(M.white, -0.5, 2.2, 0, 9.6, 0.2, 3.8);
  B.box(M.navy, 0, 0.0, 0, 15, 0.25, 4.05);
  const grp = new THREE.Group();
  B.flush(grp, { cast: false, receive: false });
  return grp;
}

/* ======================= 行人 ======================= */
function makeWalker(M, shirt, pants) {
  const B = new Builder();
  B.cyl(pants, -0.09, 0, 0, 0.065, 0.06, 0.85, 8);
  B.cyl(pants, 0.09, 0, 0, 0.065, 0.06, 0.85, 8);
  B.add(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), shirt, 0, 1.15, 0, 0, 0, 0, 1, 1, 0.75);
  B.sphere(M.skin, 0, 1.62, 0, 0.11, 0.9, 1, 1, 12);
  B.sphere(M.hair, 0, 1.66, -0.01, 0.115, 0.95, 0.9, 1, 12);
  const grp = new THREE.Group();
  B.flush(grp, { cast: false, receive: false });
  return grp;
}

/* ======================= 主函数 ======================= */
export function buildWestLake(scene, quality) {
  const M = exteriorMaterials();
  const group = new THREE.Group();
  group.name = 'westlake';
  scene.add(group);
  const dynamic = [];

  // ---- 地形 ----
  const terrain = buildTerrain(M);
  group.add(terrain.mesh);

  // ---- 水面 ----
  const waterGeo = new THREE.PlaneGeometry(5200, 3400, 1, 1);
  const normals = T.waterNormals(512);
  const water = new LakeWater(waterGeo, { normals, size: quality === 'high' ? 1024 : 512 });
  water.rotation.x = -PI / 2;
  water.position.set(-250, WATER, -1500);
  water.renderOrder = -1;
  group.add(water);

  // ---- 城市地面（东岸） ----
  const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(14000, 6000), M.cityGround);
  cityGround.rotation.x = -PI / 2;
  cityGround.position.set(-250, GROUND - 0.05, 2970);
  scene.add(cityGround);

  // ---- 近岸：湖滨步道与花园 ----
  const S = new Builder();
  const shoreX1 = -2000, shoreX2 = 1250;
  // 步道铺装（近处细节）
  S.add(planeXZ(600, 9), M.pavers, 0, GROUND + 0.02, -25.5);
  S.add(planeXZ(shoreX2 - shoreX1, 9), M.paversFar, (shoreX1 + shoreX2) / 2, GROUND + 0.01, -25.5);
  // 草坪、花园
  S.add(planeXZ(shoreX2 - shoreX1, 21), M.lawn, (shoreX1 + shoreX2) / 2, GROUND + 0.015, -10.5);
  // 驳岸：花岗岩压顶 + 石砌岸墙
  S.box(M.coping, (shoreX1 + shoreX2) / 2, GROUND - 0.25, -30.2, shoreX2 - shoreX1, 0.3, 0.6);
  S.box(M.stone, (shoreX1 + shoreX2) / 2, WATER - 1.5, -30.4, shoreX2 - shoreX1, GROUND - WATER + 1.25, 0.5);
  // 自然置石（近处）
  const rr = T.rng(77);
  for (let x = -260; x < 260; x += 1.6 + rr() * 2.5) {
    const s = 0.5 + rr() * 0.9;
    const g = new THREE.DodecahedronGeometry(s, 0);
    S.add(g, M.rock, x, WATER + 0.1 + rr() * 0.3, -30.9 - rr() * 0.6, rr(), rr() * 3, rr(), 1.3, 0.55 + rr() * 0.3, 1);
  }
  // 绿篱 + 花园边界
  S.box(M.hedge, 0, GROUND, -20.4, 1200, 0.9, 0.9);
  for (let x = -600; x < 600; x += 12) S.box(M.coping, x, GROUND, -20.4, 0.4, 1.0, 0.4);
  // 本楼花园：汀步、景石（太湖石）、石灯笼、罗汉松
  for (let i = 0; i < 9; i++) S.add(new THREE.CylinderGeometry(0.4, 0.42, 0.06, 10), M.coping, -2 + Math.sin(i * 0.6) * 1.5, GROUND + 0.02, -3 - i * 1.8, 0, i, 0, 1.4, 1, 1);
  for (const [x, z, s] of [[-8, -12, 1.6], [6, -10, 1.2], [9, -15, 0.8], [-12, -6, 1.0]]) taihuStone(S, M, x, GROUND, z, s);
  stoneLantern(S, M, -4, GROUND, -14);
  stoneLantern(S, M, 4.5, GROUND, -6);
  // 碎石园路 + 花境
  for (let i = 0; i < 40; i++) {
    const t = i / 39, x = -40 + t * 80, z = -12 + Math.sin(t * PI * 3) * 3.5;
    S.add(new THREE.CircleGeometry(1.1, 12), M.gravel, x, GROUND + 0.025, z, -PI / 2, 0, 0, 1.3, 1, 1);
  }
  for (let i = 0; i < 6; i++) S.add(new THREE.CircleGeometry(2.2 + i * 0.2, 16), M.mulch, -34 + i * 13.5, GROUND + 0.02, -16.5 + (i % 2) * 9, -PI / 2, 0, 0, 1.6, 1, 1);
  // 景观水池
  S.add(new THREE.CircleGeometry(4.5, 32), M.pond, 12, GROUND + 0.04, -8, -PI / 2, 0, 0, 1.4, 0.8, 1);
  S.add(new THREE.TorusGeometry(4.5, 0.25, 4, 40), M.coping, 12, GROUND + 0.05, -8, PI / 2, 0, 0, 1.4, 0.8, 1);
  // 路灯 + 长椅（近处）
  const lamps = [];
  for (let x = -280; x <= 280; x += 24) {
    S.cyl(M.iron, x, GROUND, -21.6, 0.06, 0.08, 3.6, 8);
    S.box(M.iron, x, GROUND + 3.55, -21.6, 0.36, 0.08, 0.36);
    S.add(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6), M.lampGlass, x, GROUND + 3.4, -21.6);
    S.add(new THREE.ConeGeometry(0.3, 0.3, 6), M.iron, x, GROUND + 3.8, -21.6);
    lamps.push([x, -21.6]);
    if (Math.abs(x) > 10) {
      S.box(M.darkWood, x + 8, GROUND + 0.42, -22.3, 1.8, 0.06, 0.45);
      S.box(M.darkWood, x + 8, GROUND + 0.5, -22.08, 1.8, 0.4, 0.05);
      S.box(M.iron, x + 7.3, GROUND, -22.3, 0.06, 0.45, 0.45);
      S.box(M.iron, x + 8.7, GROUND, -22.3, 0.06, 0.45, 0.45);
    }
  }
  // 游船码头（左前方）
  S.box(M.darkWood, -60, GROUND - 0.1, -38, 6, 0.15, 16);
  for (let z = -31; z > -46; z -= 3) for (const x of [-62.8, -57.2]) S.cyl(M.darkWood, x, WATER - 1, z, 0.12, 0.12, 1.6 + GROUND - WATER, 6);
  S.box(M.coping, -60, GROUND - 0.1, -30.6, 8, 0.2, 1.2);
  // 湖滨亭
  S.push(110, GROUND, -27); pavilion(S, M, 2.6, 3.0); S.pop();
  S.flush(group, { cast: false, receive: true });

  // ---- 柳树、桃树（沿岸） ----
  const strandMat = new THREE.MeshStandardMaterial({ map: strandTexture({}), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, color: 0xffffff });
  addWind(strandMat, 0.4);
  const willowTopMat = new THREE.MeshStandardMaterial({ map: leafTexture({ seed: 31, tone: [126, 150, 70], leafW: 4, leafH: 1.4, count: 700 }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  addWind(willowTopMat, 0.05);
  const trunkMat = M.bark;
  const wills = [willowTree(11), willowTree(23), willowTree(37, { height: 5.2, strands: 50 }), willowTree(51, { strands: 26, lite: true }), willowTree(63, { strands: 22, lite: true, height: 5 })];
  const willowTs = [[], [], [], [], []];
  const pickW = (x, z) => (Math.abs(x) < 450 && z > -80 ? Math.floor(wr() * 3) : 3 + Math.floor(wr() * 2));
  const wr = T.rng(99);
  // 东岸
  for (let x = shoreX1 + 5; x < shoreX2 - 5; x += 8 + wr() * 5) {
    if (Math.abs(x - 110) < 6 || Math.abs(x + 60) < 6) continue;
    willowTs[pickW(x, -27)].push({ x: x + (wr() - 0.5) * 2, y: GROUND, z: -27.6 + wr() * 0.8, ry: wr() * PI * 2, s: 0.85 + wr() * 0.4 });
  }
  // 白堤 & 苏堤两侧
  for (const path of [BAI_CAUSEWAY, SU_CAUSEWAY]) {
    walkPolyline(path, 11, (x, z, dx, dz) => {
      for (const side of [-1, 1]) {
        if (wr() < 0.35) continue;
        const nx = -dz * side * (13 + wr() * 3), nz = dx * side * (13 + wr() * 3);
        willowTs[3 + Math.floor(wr() * 2)].push({ x: x + nx, y: WATER + 1.2, z: z + nz, ry: wr() * PI * 2, s: 1.0 + wr() * 0.5 });
      }
    });
  }
  // 北岸、南岸沿湖
  for (let i = 0; i < LAKE.length - 1; i++) {
    const [ax, az] = LAKE[i], [bx, bz] = LAKE[i + 1];
    if (az > -40 && bz > -40) continue;
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < len; t += 18 + wr() * 14) {
      const k = t / len;
      const x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      // 向陆地方向偏移
      const cx = x * 1.012 + 3, cz = z * 1.012 - 5;
      const h = heightAt(cx, cz);
      if (h < WATER + 0.3) continue;
      willowTs[3 + Math.floor(wr() * 2)].push({ x: cx, y: h - 0.3, z: cz, ry: wr() * PI * 2, s: 0.9 + wr() * 0.4 });
    }
  }
  wills.forEach((w, i) => {
    const colors = willowTs[i].map(() => new THREE.Color().setHSL(0.18 + wr() * 0.05, 0.25 + wr() * 0.2, 0.72 + wr() * 0.12));
    group.add(instanced(w.trunk, trunkMat, willowTs[i]), instanced(w.crown, willowTopMat, willowTs[i], { colors }), instanced(w.strands, strandMat, willowTs[i], { colors }));
  });

  // ---- 阔叶树（香樟、桂花、桃树）：花园与岸边 ----
  const broadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, alphaTest: 0.45, side: THREE.DoubleSide, map: leafTexture({ seed: 9, tone: [70, 100, 48] }) });
  addWind(broadMat, 0.05);
  const peachMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, alphaTest: 0.45, side: THREE.DoubleSide, map: leafTexture({ seed: 19, tone: [240, 190, 200], leafW: 3.5, leafH: 3, count: 600 }) });
  const broad = [broadleafTree(5), broadleafTree(17, { height: 5, crownR: 3.8, crownH: 3.2, cards: 56, cardSize: 2.5 }), broadleafTree(29, { height: 2.6, crownR: 2.2, crownH: 1.8, cards: 34, cardSize: 1.7 })];
  const broadTs = [[], [], []];
  for (let x = -400; x < 400; x += 6 + wr() * 9) {
    if (Math.abs(x) < 14) continue;
    broadTs[Math.floor(wr() * 3)].push({ x, y: GROUND, z: -6 - wr() * 12, ry: wr() * PI * 2, s: 0.7 + wr() * 0.5 });
  }
  for (const [x, z] of [[-18, -8], [18, -12], [-22, -16], [24, -5]]) broadTs[0].push({ x, y: GROUND, z, ry: wr() * 6, s: 1.1 });
  // 楼栋两侧高大香樟，遮挡邻楼
  for (const side of [-1, 1]) for (let i = 0; i < 22; i++) {
    broadTs[1].push({ x: side * (17 + wr() * 55), y: GROUND, z: -3 + wr() * 40, ry: wr() * 6, s: 1.1 + wr() * 0.5 });
  }
  // 樱花/桃花（粉色）
  const peachTs = [];
  for (let x = shoreX1 + 9; x < shoreX2; x += 17 + wr() * 10) peachTs.push({ x, y: GROUND, z: -23.8 + wr(), ry: wr() * 6, s: 0.9 + wr() * 0.3 });
  walkPolyline(SU_CAUSEWAY, 15, (x, z, dx, dz) => { peachTs.push({ x: x - dz * 9, y: WATER + 1.2, z: z + dx * 9, ry: wr() * 6, s: 1.0 }); });
  walkPolyline(BAI_CAUSEWAY, 13, (x, z, dx, dz) => { peachTs.push({ x: x + dz * 9, y: WATER + 1.2, z: z - dx * 9, ry: wr() * 6, s: 1.0 }); });
  broad.forEach((b, i) => {
    const colors = broadTs[i].map(() => new THREE.Color().setHSL(0.2 + wr() * 0.08, 0.3 + wr() * 0.25, 0.55 + wr() * 0.25));
    group.add(instanced(b.trunk, trunkMat, broadTs[i]), instanced(b.crown, broadMat, broadTs[i], { colors }));
  });
  // 灌木（黄杨球、杜鹃）
  {
    const shrub = broadleafTree(41, { height: 0.15, crownR: 0.9, crownH: 0.6, cards: 16, cardSize: 1.0 });
    const ts = [], cols = [], fl = [];
    for (let i = 0; i < 420; i++) {
      const x = -90 + wr() * 180, z = -19 + wr() * 15.5;
      if (Math.abs(x) < 3 && z > -16) continue;
      const t = { x, y: GROUND - 0.1, z, ry: wr() * 6, s: 0.6 + wr() * 0.8 };
      if (wr() > 0.72) fl.push(t); else { ts.push(t); cols.push(new THREE.Color().setHSL(0.22 + wr() * 0.06, 0.35, 0.45 + wr() * 0.25)); }
    }
    for (let x = -1200; x < 1200; x += 3 + wr() * 4) ts.push({ x, y: GROUND - 0.1, z: -19.6 + wr() * 0.6, ry: wr() * 6, s: 0.7 + wr() * 0.3 }), cols.push(new THREE.Color().setHSL(0.24, 0.3, 0.5 + wr() * 0.2));
    group.add(detail(instanced(shrub.crown, broadMat, ts, { colors: cols })));
    group.add(detail(instanced(shrub.crown, peachMat, fl, { colors: fl.map(() => new THREE.Color().setHSL(0.93 + wr() * 0.05, 0.6, 0.7)) })));
  }
  {
    const peachColors = peachTs.map(() => new THREE.Color().setHSL(0.0, 0.0, 0.85 + wr() * 0.15));
    group.add(instanced(broad[2].trunk, trunkMat, peachTs), instanced(broad[2].crown, peachMat, peachTs, { colors: peachColors }));
  }

  // ---- 山林（远景树冠） ----
  {
    const blob = new THREE.IcosahedronGeometry(1, 0);
    const bp = blob.attributes.position;
    for (let i = 0; i < bp.count; i++) { const y = bp.getY(i); bp.setY(i, y < 0 ? y * 0.3 : y * 1.1); }
    blob.computeVertexNormals();
    const forestMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: false });
    const ts = [], cols = [];
    const fr = T.rng(555);
    const count = quality === 'high' ? 11000 : quality === 'low' ? 4000 : 6500;
    let tries = 0;
    while (ts.length < count && tries < count * 10) {
      tries++;
      const xx = -5200 + fr() * 10400, zz = -40 - Math.pow(fr(), 1.3) * 6460;
      const h = heightAt(xx, zz);
      if (h < WATER + 1.5) continue;
      if (zz > -60 && xx > -2000 && xx < 1250) continue;
      // 平地少种（城市），山上密
      if (h < GROUND + 6 && fr() > 0.25) continue;
      if (Math.hypot(xx, zz) > 5500 && fr() > 0.4) continue;
      const s = 8 + fr() * 9;
      ts.push({ x: xx, y: h - 2, z: zz, ry: fr() * 6, sx: s, sy: s * (0.8 + fr() * 0.5), sz: s });
      cols.push(new THREE.Color().setHSL(0.25 + fr() * 0.07, 0.3 + fr() * 0.2, 0.08 + fr() * 0.07));
    }
    group.add(instanced(blob, forestMat, ts, { colors: cols }));
  }

  // ---- 苏堤 / 白堤（带状陆地） ----
  group.add(causewayMesh(SU_CAUSEWAY, 34, M, [[0.12, 0.16], [0.28, 0.32], [0.45, 0.49], [0.6, 0.64], [0.76, 0.8], [0.9, 0.94]]));
  group.add(causewayMesh(BAI_CAUSEWAY, 30, M, [[0.45, 0.5]]));
  // 苏堤六桥 + 断桥 + 锦带桥
  const L = new Builder();
  const placeOnPath = (path, t) => {
    const total = pathLength(path);
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (acc + l >= t * total) { const k = (t * total - acc) / l; return [ax + (bx - ax) * k, az + (bz - az) * k, Math.atan2(bz - az, bx - ax)]; }
      acc += l;
    }
    return [...path[path.length - 1], 0];
  };
  for (const t of [0.14, 0.3, 0.47, 0.62, 0.78, 0.92]) {
    const [x, z, a] = placeOnPath(SU_CAUSEWAY, t);
    L.push(x, WATER + 0.2, z, -a); archBridge(L, M, 9, 7, 3.6); L.pop();
  }
  {
    const [x, z, a] = placeOnPath(BAI_CAUSEWAY, 0.475);
    L.push(x, WATER + 0.2, z, -a); archBridge(L, M, 8, 6, 3.2); L.pop();
    // 断桥
    L.push(1205, WATER + 0.2, -85, -Math.atan2(-125 + 50, 1215 - 1195)); archBridge(L, M, 6.1, 8.6, 2.6); L.pop();
  }

  // ---- 孤山建筑（西泠印社、楼外楼、浙博） ----
  for (let i = 0; i < 26; i++) {
    const z = -1150 - i * 26 - wr() * 10;
    const x = 1240 + wr() * 30;
    const h = heightAt(x, z);
    if (h < WATER + 1) continue;
    L.push(x, h - 0.5, z, wr() * 0.3); jiangnanHouse(L, M, 10 + wr() * 8, 7 + wr() * 4, 4 + wr() * 3); L.pop();
  }
  L.push(1300, heightAt(1300, -1520) - 0.5, -1520); pavilion(L, M, 2.5, 3); L.pop();
  // 北山路、南山路沿线建筑
  for (let i = 0; i < LAKE.length - 1; i++) {
    const [ax, az] = LAKE[i], [bx, bz] = LAKE[i + 1];
    if (az > -40 && bz > -40) continue;
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 10; t < len; t += 30 + wr() * 40) {
      const k = t / len;
      const off = 1.05 + wr() * 0.05;
      const x = (ax + (bx - ax) * k) * off, z = (az + (bz - az) * k) * off;
      const h = heightAt(x, z);
      if (h < WATER + 1 || h > GROUND + 12) continue;
      L.push(x, h - 0.5, z, wr() * PI); jiangnanHouse(L, M, 9 + wr() * 10, 7 + wr() * 6, 5 + wr() * 5); L.pop();
    }
  }
  // 雷峰塔、保俶塔
  {
    const lf = LANDMARKS.leifeng, bc = LANDMARKS.baochu;
    const hL = heightAt(lf.x, lf.z), hB = heightAt(bc.x, bc.z);
    L.push(lf.x, hL - 1, lf.z, 0.3); const topL = leifengPagoda(L, M); L.pop();
    L.push(bc.x, hB - 0.5, bc.z, 0.2); const topB = baochuPagoda(L, M); L.pop();
    lf.y = hL + topL * 0.6; bc.y = hB + topB * 0.7;
  }
  // 湖心亭、三潭印月、阮公墩
  {
    const hx = LANDMARKS.huxinting;
    island(L, M, hx.x, hx.z, 34, 22);
    L.push(hx.x, WATER + 1.4, hx.z); pavilion(L, M, 3.6, 3.6); L.pop();
    L.push(hx.x + 12, WATER + 1.4, hx.z + 6); jiangnanHouse(L, M, 10, 6, 4); L.pop();
    const st = LANDMARKS.santan;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * PI * 2;
      island(L, M, st.x + Math.cos(a) * 110, st.z + Math.sin(a) * 140, 60, 26, a);
    }
    L.push(st.x, WATER + 1.3, st.z + 140); pavilion(L, M, 2.6, 3); L.pop();
    L.push(st.x + 100, WATER + 1.3, st.z); jiangnanHouse(L, M, 14, 7, 4); L.pop();
    // 三座石塔（高约 2 米的球形塔身）
    for (const [dx, dz] of [[-60, -230], [-10, -250], [40, -235]]) {
      const x = st.x + dx, z = st.z + dz;
      L.add(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 8), M.stoneLight, x, WATER + 0.4, z);
      L.add(new THREE.SphereGeometry(0.75, 12, 10), M.stoneLight, x, WATER + 1.4, z, 0, 0, 0, 1, 0.9, 1);
      L.add(new THREE.CylinderGeometry(0.9, 0.5, 0.25, 8), M.stoneLight, x, WATER + 2.1, z);
      L.add(new THREE.ConeGeometry(0.3, 0.9, 8), M.stoneLight, x, WATER + 2.65, z);
    }
    island(L, M, -470, -1820, 40, 24);
  }
  // 城市楼群（东岸与远景）
  const cityGroup = new THREE.Group();
  cityGroup.name = 'city';
  scene.add(cityGroup);
  cityBlocks(M, wr).forEach((m) => cityGroup.add(m));
  L.flush(group, { cast: false, receive: false });

  // 岛上树木
  {
    const ts = [], cols = [];
    const isl = [[LANDMARKS.huxinting.x, LANDMARKS.huxinting.z, 28], [-470, -1820, 34]];
    const st = LANDMARKS.santan;
    for (let k = 0; k < 4; k++) { const a = (k / 4) * PI * 2; isl.push([st.x + Math.cos(a) * 110, st.z + Math.sin(a) * 140, 45]); }
    for (const [x0, z0, r] of isl) for (let i = 0; i < r / 2.5; i++) {
      const a = wr() * PI * 2, d = Math.sqrt(wr()) * r * 0.8;
      ts.push({ x: x0 + Math.cos(a) * d, y: WATER + 1.2, z: z0 + Math.sin(a) * d, ry: wr() * 6, s: 0.8 + wr() * 0.4 });
      cols.push(new THREE.Color().setHSL(0.22, 0.3, 0.55 + wr() * 0.2));
    }
    group.add(instanced(broad[0].trunk, trunkMat, ts), instanced(broad[0].crown, broadMat, ts, { colors: cols }));
  }

  // ---- 夜景：环湖灯串（夜间点亮，倒映水中） ----
  {
    const pts = [];
    for (let i = 0; i < LAKE.length; i++) {
      const [ax, az] = LAKE[i], [bx, bz] = LAKE[(i + 1) % LAKE.length];
      if (az > -40 && bz > -40) continue; // 东岸近处已有真实路灯
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = wr() * 20; t < len; t += 14 + wr() * 26) {
        const k = t / len, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
        const ox = x * (1.008 + wr() * 0.01), oz = z * (1.008 + wr() * 0.01);
        pts.push(ox, Math.max(GROUND, heightAt(ox, oz)) + 2.5 + wr() * 3, oz);
        if (wr() > 0.6) pts.push(ox * 1.02, Math.max(GROUND, heightAt(ox * 1.02, oz * 1.02)) + 6 + wr() * 8, oz * 1.02);
      }
    }
    for (const path of [SU_CAUSEWAY, BAI_CAUSEWAY]) walkPolyline(path, 26, (x, z, dx, dz) => { if (wr() > 0.3) pts.push(x + dz * 8, WATER + 4.2, z - dx * 8); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    M.shoreLights = new THREE.PointsMaterial({ color: 0xffc77a, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
    const P = new THREE.Points(g, M.shoreLights);
    P.frustumCulled = false;
    group.add(P);
  }

  // ---- 荷叶 ----
  {
    const leafGeo = new THREE.CircleGeometry(0.5, 10);
    leafGeo.rotateX(-PI / 2);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) { const r = Math.hypot(lp.getX(i), lp.getZ(i)); lp.setY(i, r * r * 0.25); }
    leafGeo.computeVertexNormals();
    const lotusMat = new THREE.MeshStandardMaterial({ map: T.lotusLeaf({}), roughness: 0.55, side: THREE.DoubleSide, transparent: false, alphaTest: 0.5 });
    lotusMat.map.colorSpace = THREE.SRGBColorSpace;
    const ts = [], fl = [];
    const patches = [[-35, -45, 16, 9], [40, -50, 22, 12], [-140, -42, 14, 8], [180, -46, 18, 10], [1420, -1900, 120, 60], [1500, -2000, 80, 80], [-80, -40, 10, 6]];
    for (const [cx, cz, rx, rz] of patches) {
      const n = Math.round(rx * rz * (rx > 60 ? 0.25 : 1.6));
      for (let i = 0; i < n; i++) {
        const a = wr() * PI * 2, d = Math.sqrt(wr());
        const x = cx + Math.cos(a) * rx * d, z = cz + Math.sin(a) * rz * d;
        if (z > -31.5) continue;
        const raised = wr() > 0.8;
        ts.push({ x, y: WATER + (raised ? 0.4 + wr() * 0.8 : 0.03), z, ry: wr() * 6, s: 0.6 + wr() * 0.9, tilt: raised ? (wr() - 0.5) * 0.6 : 0 });
        if (wr() > 0.93) fl.push({ x: x + 0.3, y: WATER + 0.9 + wr() * 0.5, z, ry: wr() * 6, s: 0.8 + wr() * 0.4 });
      }
    }
    group.add(detail(instanced(leafGeo, lotusMat, ts)));
    // 荷花
    const petal = new THREE.SphereGeometry(0.16, 8, 6, 0, PI * 2, 0, PI * 0.6);
    petal.scale(1, 1.4, 1);
    group.add(detail(instanced(petal, M.lotusFlower, fl)));
  }

  // ---- 船 ----
  const boatsGroup = new THREE.Group();
  group.add(boatsGroup);
  const canopies = [M.canopyBlue, M.canopyWhite, M.canopyRed];
  const routes = [];
  for (let i = 0; i < 14; i++) {
    const b = makeRowBoat(M, canopies[i % 3]);
    boatsGroup.add(b);
    const cx = -800 + wr() * 1600, cz = -250 - wr() * 1500;
    const r = 60 + wr() * 220;
    routes.push({ obj: b, cx, cz, rx: r, rz: r * (0.5 + wr() * 0.6), speed: (0.6 + wr() * 0.5) / r, ph: wr() * PI * 2, dir: wr() > 0.5 ? 1 : -1, bob: wr() * 6 });
  }
  // 近处两条小船（停泊在码头）
  for (let i = 0; i < 3; i++) {
    const b = makeRowBoat(M, canopies[i]);
    b.position.set(-64.8 + i * 9.6 * 0, WATER + 0.05, -34 - i * 4.5);
    b.rotation.y = PI / 2 + 0.05 * i;
    if (i === 2) b.position.x = -55;
    boatsGroup.add(b);
    routes.push({ obj: b, moored: true, bob: i * 2, baseY: WATER + 0.05 });
  }
  for (let i = 0; i < 3; i++) {
    const b = makeHuafang(M);
    boatsGroup.add(b);
    routes.push({ obj: b, cx: -500 + i * 400, cz: -1200 + i * 150, rx: 500 + i * 120, rz: 380, speed: 2.4 / 500, ph: i * 2, dir: i % 2 ? 1 : -1, bob: i });
  }
  for (let i = 0; i < 4; i++) {
    const b = makeCruiser(M);
    boatsGroup.add(b);
    routes.push({ obj: b, cx: -300 + i * 200, cz: -900 - i * 220, rx: 800 - i * 90, rz: 500 - i * 60, speed: 4 / 800, ph: i * 1.7, dir: i % 2 ? -1 : 1, bob: i * 3 });
  }
  dynamic.push((t) => {
    for (const r of routes) {
      if (r.moored) { r.obj.position.y = r.baseY + Math.sin(t * 1.1 + r.bob) * 0.04; r.obj.rotation.z = Math.sin(t * 0.9 + r.bob) * 0.02; continue; }
      const a = r.ph + t * r.speed * r.dir;
      const x = r.cx + Math.cos(a) * r.rx, z = r.cz + Math.sin(a) * r.rz;
      const nx = r.cx + Math.cos(a + 0.01 * r.dir) * r.rx, nz = r.cz + Math.sin(a + 0.01 * r.dir) * r.rz;
      r.obj.position.set(x, WATER + 0.05 + Math.sin(t * 1.3 + r.bob) * 0.05, z);
      r.obj.rotation.y = -Math.atan2(nz - z, nx - x);
      r.obj.rotation.z = Math.sin(t * 0.8 + r.bob) * 0.015;
    }
  });

  // ---- 行人（湖滨步道） ----
  const people = [];
  const shirts = [M.canopyWhite, M.canopyBlue, M.canopyRed, M.navy, M.straw, M.whiteWall];
  for (let i = 0; i < 26; i++) {
    const w = makeWalker(M, shirts[i % shirts.length], i % 3 ? M.navy : M.darkWood);
    group.add(detail(w));
    people.push({ obj: w, x: -250 + wr() * 500, z: -23.2 - wr() * 5, v: (0.9 + wr() * 0.5) * (wr() > 0.5 ? 1 : -1), ph: wr() * 6 });
  }
  dynamic.push((t, dt) => {
    for (const p of people) {
      p.x += p.v * dt;
      if (p.x > 260) p.x = -260; if (p.x < -260) p.x = 260;
      p.obj.position.set(p.x, GROUND + Math.abs(Math.sin(t * 5 + p.ph)) * 0.03, p.z);
      p.obj.rotation.y = p.v > 0 ? PI / 2 : -PI / 2;
    }
  });

  // ---- 白鹭 ----
  const birds = [];
  {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -0.9, 0.1, -0.1, 0, 0, -0.3, 0, 0, 0.3, 0.9, 0.1, -0.1, 0, 0, -0.3], 3));
    bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide, roughness: 0.8 });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(bg.clone(), bm);
      group.add(detail(m));
      birds.push({ m, cx: -100 + wr() * 300, cz: -120 - wr() * 300, r: 40 + wr() * 80, h: WATER + 8 + wr() * 20, sp: 0.15 + wr() * 0.1, ph: wr() * 6 });
    }
  }
  dynamic.push((t) => {
    for (const b of birds) {
      const a = b.ph + t * b.sp;
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.ph) * 2, b.cz + Math.sin(a) * b.r);
      b.m.rotation.y = -a;
      const flap = Math.sin(t * 6 + b.ph) * 0.5;
      const p = b.m.geometry.attributes.position;
      p.setY(1, 0.1 + flap); p.setY(4, 0.1 + flap); p.needsUpdate = true;
      b.m.scale.setScalar(1.2);
    }
  });

  for (const l of Object.values(LANDMARKS)) if (l.y === undefined) l.y = Math.max(WATER, heightAt(l.x, l.z)) + (l.x === 900 ? 260 : 18);
  return { group, cityGroup, water, dynamic, M, lamps, terrain };
}

function taihuStone(B, M, x, y, z, s) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const d = 1 + noise(v.x * 2.3 + x, v.y * 2.3 + z) * 0.45 + noise(v.z * 5, v.y * 5) * 0.12;
    p.setXYZ(i, v.x * d * 0.7, (v.y * d + 1) * 1.3, v.z * d * 0.6);
  }
  g.computeVertexNormals();
  B.add(g, M.taihu, x, y, z, 0, x, 0, s, s, s);
}

function stoneLantern(B, M, x, y, z) {
  B.add(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 6), M.stoneLight, x, y + 0.1, z);
  B.add(new THREE.CylinderGeometry(0.12, 0.15, 0.8, 8), M.stoneLight, x, y + 0.6, z);
  B.add(new THREE.CylinderGeometry(0.3, 0.25, 0.15, 6), M.stoneLight, x, y + 1.05, z);
  B.add(boxGeo(0.35, 0.35, 0.35), M.lampGlass, x, y + 1.3, z);
  B.add(new THREE.ConeGeometry(0.5, 0.35, 6), M.stoneLight, x, y + 1.65, z);
  B.add(new THREE.SphereGeometry(0.08, 8, 6), M.stoneLight, x, y + 1.88, z);
}

function planeXZ(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-PI / 2);
  scaleUV(g, w, d);
  return g;
}

function pathLength(path) {
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) s += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return s;
}

function walkPolyline(path, step, fn) {
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let t = 0; t < len; t += step) fn(ax + dx * t, az + dz * t, dx, dz);
  }
}

function causewayMesh(path, width, M, gaps = []) {
  // 横截面：岸坡 + 堤面（草地）+ 中间道路
  const total = pathLength(path);
  const pts = [];
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const n = Math.ceil(total / 6);
  for (let i = 0; i <= n; i++) pts.push(curve.getPointAt(i / n));
  const prof = [[-width / 2 - 5, -2.5, 0], [-width / 2, 1.0, 1], [-width / 2 + 3, 1.2, 1], [-3.5, 1.25, 2], [3.5, 1.25, 2], [width / 2 - 3, 1.2, 1], [width / 2, 1.0, 1], [width / 2 + 5, -2.5, 0]];
  const cols = [new THREE.Color(0.22, 0.24, 0.18), new THREE.Color(0.3, 0.4, 0.2), new THREE.Color(0.55, 0.53, 0.48)];
  const pos = [], col = [], idx = [];
  const np = prof.length;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = pts[i];
    const tan = curve.getTangentAt(t);
    const nx = -tan.z, nz = tan.x;
    let inGap = false;
    for (const [a, b] of gaps) if (t > a && t < b) inGap = true;
    for (let k = 0; k < np; k++) {
      const [o, h, c] = prof[k];
      pos.push(p.x + nx * o, WATER + (inGap ? -3 : h), p.z + nz * o);
      const cc = cols[c];
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < np - 1; k++) {
    const a = i * np + k, b = a + 1, c = a + np, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  return m;
}

function island(B, M, x, z, rx, rz, rot = 0) {
  const g = new THREE.CylinderGeometry(1, 1.25, 1, 28, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const d = 1 + noise(Math.cos(a) * 2 + x, Math.sin(a) * 2 + z) * 0.2;
    p.setX(i, p.getX(i) * d); p.setZ(i, p.getZ(i) * d);
  }
  g.computeVertexNormals();
  B.add(g, M.islandGrass, x, WATER + 0.2, z, 0, rot, 0, rx, 3.6, rz);
}

function cityBlocks(M, r) {
  const T2 = T.buildingWindows({ size: 256 });
  T2.map.repeat.set(1, 1); T2.emissive.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: T2.map, emissiveMap: T2.emissive, emissive: 0x000000, roughness: 0.6, metalness: 0.1 });
  M.cityWindows = mat;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  // UV 按楼层平铺
  const ts = [];
  // 近邻低层住宅（湖滨限高）
  for (let x = -460; x < 460; x += 30 + r() * 20) {
    if (Math.abs(x) < 75) continue;
    ts.push({ x, y: GROUND, z: 10 + r() * 16, ry: (r() - 0.5) * 0.1, sx: 18 + r() * 10, sy: 9 + r() * 10, sz: 14 + r() * 8 });
  }
  // 湖滨街区
  for (let i = 0; i < 260; i++) {
    const x = -2200 + r() * 3600, z = 70 + Math.pow(r(), 0.8) * 1800;
    ts.push({ x, y: GROUND, z, ry: r() * 0.4, sx: 20 + r() * 30, sy: 14 + r() * 30 + (z > 900 ? r() * 60 : 0), sz: 20 + r() * 30 });
  }
  // 北岸、西北远景（黄龙/武林）
  for (let i = 0; i < 120; i++) {
    const x = 2100 + r() * 2500, z = 600 - r() * 2600;
    const h = heightAt(x, z);
    if (h > GROUND + 8) continue;
    ts.push({ x, y: GROUND, z, ry: r(), sx: 25 + r() * 30, sy: 30 + r() * 70, sz: 25 + r() * 30 });
  }
  // 钱江新城高楼（东南远景）
  for (let i = 0; i < 40; i++) ts.push({ x: -3500 - r() * 2500, y: GROUND, z: 2500 + r() * 2500, ry: r(), sx: 40, sy: 120 + r() * 150, sz: 40 });
  const im = instanced(geo, mat, ts);
  // 每栋楼的窗格按尺寸平铺：用 onBeforeCompile 读取实例缩放
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec2 rep = abs(normal.y) > 0.5 ? vec2(0.0) : vec2((abs(normal.x) > 0.5 ? isc.z : isc.x) / 12.0, isc.y / 12.0);
        #ifdef USE_MAP
          vMapUv = uv * rep;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = uv * rep;
        #endif
      #endif`);
  };
  return [im];
}

function exteriorMaterials() {
  const M = {};
  const sm = (p) => new THREE.MeshStandardMaterial(p);
  const stoneT = T.plaster({ size: 256, tone: [168, 162, 150], amp: 0.12, seed: 201 }); stoneT.repeat.set(0.25, 0.25);
  M.stone = sm({ map: stoneT, roughness: 0.9 });
  M.stoneLight = sm({ color: 0xcfcac0, roughness: 0.85 });
  M.coping = sm({ map: T.granitePavers({ size: 256, tiles: [2, 1], tone: [178, 174, 166] }), roughness: 0.8 });
  M.coping.map.repeat.set(1 / 1.2, 1 / 0.6);
  const pv = T.granitePavers({ size: 512, tiles: [4, 8], tone: [150, 146, 138] }); pv.repeat.set(1 / 2.4, 1 / 2.4);
  M.pavers = sm({ map: pv, roughness: 0.85 });
  M.paversFar = sm({ color: 0x8d8a83, roughness: 0.9 });
  const gr = T.grass(512); gr.repeat.set(1 / 4, 1 / 4);
  M.lawn = sm({ map: gr, roughness: 1, color: 0xc8dca8 });
  M.hedge = sm({ map: T.forestCanopy(256), color: 0x6f8a52, roughness: 1 });
  M.hedge.map.repeat.set(1 / 2, 1 / 2);
  M.rock = sm({ color: 0x77736b, roughness: 0.95, flatShading: true });
  M.gravel = sm({ color: 0xb8b2a6, roughness: 1 });
  M.mulch = sm({ color: 0x4a3a2c, roughness: 1 });
  M.taihu = sm({ color: 0x8f8b82, roughness: 0.9 });
  M.bark = sm({ color: 0x4a3c2e, roughness: 1 });
  M.iron = sm({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.6 });
  M.lampGlass = sm({ color: 0xf6eedc, emissive: 0xffd28a, emissiveIntensity: 0, roughness: 0.4 });
  M.pond = sm({ color: 0x2b3d36, roughness: 0.05, metalness: 0.4 });
  M.darkWood = sm({ color: 0x3a2a1e, roughness: 0.8 });
  M.boatWood = sm({ color: 0x5a3a22, roughness: 0.7 });
  M.boatSeat = sm({ color: 0x8a5a36, roughness: 0.7 });
  M.whiteWall = sm({ color: 0xe8e4da, roughness: 0.9 });
  const rt = T.roofTiles(256); rt.repeat.set(6, 3);
  M.roofTile = sm({ map: rt, roughness: 0.8, color: 0x8a8c8e });
  M.pagodaRed = sm({ color: 0x8a2f1f, roughness: 0.7 });
  M.pagodaWall = sm({ color: 0x9a7448, roughness: 0.55, metalness: 0.4 });
  M.pagodaDark = sm({ color: 0x3a2618, roughness: 0.8 });
  M.pagodaGold = sm({ color: 0xc89a4a, roughness: 0.35, metalness: 0.9 });
  M.pagodaRoof = sm({ color: 0x6e5532, roughness: 0.45, metalness: 0.75 });
  M.pagodaGlow = sm({ color: 0x000000, emissive: 0xffb95a, emissiveIntensity: 0 });
  const br = T.brick(256); br.repeat.set(2, 2);
  M.pagodaBrick = sm({ map: br, roughness: 0.95, color: 0xcab8a0 });
  M.iron.name = 'iron';
  M.islandGrass = sm({ color: 0x4d6236, roughness: 1 });
  M.cityGround = sm({ color: 0x55584f, roughness: 1 });
  M.canopyBlue = sm({ color: 0x3d5f8a, roughness: 0.8, side: THREE.DoubleSide });
  M.canopyWhite = sm({ color: 0xe9e4d6, roughness: 0.8, side: THREE.DoubleSide });
  M.canopyRed = sm({ color: 0x9e3a2c, roughness: 0.8, side: THREE.DoubleSide });
  M.navy = sm({ color: 0x2a3446, roughness: 0.9 });
  M.skin = sm({ color: 0xd9b090, roughness: 0.7 });
  M.hair = sm({ color: 0x1c1712, roughness: 0.8 });
  M.straw = sm({ color: 0xc9a868, roughness: 0.9 });
  M.white = sm({ color: 0xf2f2f0, roughness: 0.5 });
  M.tintGlass = sm({ color: 0x4f6670, roughness: 0.1, metalness: 0.6 });
  M.windowWarm = sm({ color: 0xd8c39a, emissive: 0xffc77a, emissiveIntensity: 0, roughness: 0.5 });
  M.lantern = sm({ color: 0xc8302a, emissive: 0xff5a30, emissiveIntensity: 0.2, roughness: 0.6 });
  M.lotusFlower = sm({ color: 0xf2a6b8, roughness: 0.6, side: THREE.DoubleSide });
  return M;
}
