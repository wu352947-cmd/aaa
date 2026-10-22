// 室内陈设：祭坛屏（jubé）、唱诗班围屏与座椅、主祭坛与圣髑盒、圣克里斯托夫巨像、
// “燕巢式”管风琴、烛冠、圣母像与还愿烛架、光束与浮尘
import * as THREE from 'three';
import { M, archMolding, archPlane, statueGeometry, extrude, pinnacleGeometry } from '../geom.js';
import { P, naveBayX, choirBayX } from './plan.js';
import { statue, balustrade, arcade } from './parts.js';
import { addBox, addOBB, world } from '../world.js';
import { glowTex, beamTex } from '../textures.js';

export function buildInterior(b, scene, mats) {
  const { FL, NH } = P;

  /* ---------- 祭坛屏 Jubé（13 世纪，分隔中殿与唱诗班） ---------- */
  const jx = P.CHOIR0 + 0.2, jd = 2.2, jh = 6.4;
  const jw = 2 * (NH - 0.8);
  b.box('carved', jx, FL, -jw / 2, jx + jd, FL + 0.5, jw / 2);
  // 正面七个尖拱 + 中央门
  const nA = 7, aw = jw / nA;
  for (let i = 0; i < nA; i++) {
    const zc = -jw / 2 + (i + 0.5) * aw;
    const isDoor = i === 3;
    b.add('carved', archMolding(aw - 0.25, isDoor ? 3.4 : 2.6, 1, 0.1, true, 0, 8), M(jx - 0.05, FL + 0.5, zc, 0, -Math.PI / 2, 0));
    // 山花
    const gab = [new THREE.Vector2(-aw / 2 + 0.1, 0), new THREE.Vector2(aw / 2 - 0.1, 0), new THREE.Vector2(0, 1.4)];
    b.add('carved', extrude(gab, 0.25), M(jx - 0.1, FL + 4.7, zc, 0, -Math.PI / 2, 0));
    if (!isDoor) {
      // 彩绘浮雕面板（受难故事）
      b.add('choirRelief', new THREE.PlaneGeometry(aw - 0.4, 2.2), M(jx - 0.02, FL + 2.1, zc, 0, -Math.PI / 2, 0), { keepUV: true });
      b.box('carved', jx, FL + 0.5, zc - aw / 2 + 0.05, jx + jd, FL + 4.7, zc + aw / 2 - 0.05);
    }
    b.cyl('carved', jx - 0.15, FL + 0.5, zc - aw / 2, 0.12, 4.2, 6);
  }
  // 门道两侧墙与顶部
  b.box('carved', jx, FL + 4.0, -aw / 2, jx + jd, FL + 4.7, aw / 2);
  b.box('carved', jx - 0.3, FL + 4.7, -jw / 2 - 0.2, jx + jd + 0.3, FL + 5.4, jw / 2 + 0.2);
  balustrade(b, 'carved', jx - 0.2, -jw / 2, jx - 0.2, jw / 2, FL + 5.4, 1.0, 0.45);
  addBox(jx, -jw / 2 - 0.3, jx + jd, -aw / 2, -5, FL + 6);
  addBox(jx, aw / 2, jx + jd, jw / 2 + 0.3, -5, FL + 6);
  // 凯旋十字架与圣母、圣约翰像
  const cy = FL + jh;
  b.box('gilt', jx + 1.0, cy, -0.12, jx + 1.25, cy + 5.2, 0.12);
  b.box('gilt', jx + 1.0, cy + 3.4, -1.5, jx + 1.25, cy + 3.7, 1.5);
  const corpus = statueGeometry('small');
  b.add('statue', corpus, M(jx + 0.95, cy + 1.8, 0, 0, -Math.PI / 2, 0, 0.95, 1.0, 0.6), { uvScale: 1.5 });
  statue(b, 'statue', 'saint', jx + 1.1, FL + 5.4, -2.2, -1, 0, 1.1);
  statue(b, 'statue', 'saint', jx + 1.1, FL + 5.4, 2.2, -1, 0, 1.1);

  /* ---------- 唱诗班围屏（14 世纪彩绘浮雕） ---------- */
  for (const s of [-1, 1]) {
    const z = s * (NH - 0.15);
    for (let i = 0; i < P.CHOIR_BAYS; i++) {
      const x0 = choirBayX(i) + 0.9, x1 = choirBayX(i + 1) - 0.9;
      if (i === 0) continue;
      b.box('carved', x0, FL, z - 0.25, x1, FL + 3.8, z + 0.25);
      b.add('choirRelief', new THREE.PlaneGeometry(x1 - x0 - 0.2, 2.4), M((x0 + x1) / 2, FL + 2.0, z + s * 0.27, 0, s > 0 ? 0 : Math.PI, 0), { keepUV: true });
      arcade(b, 'carved', x0, z + s * 0.3, x1, z + s * 0.3, FL + 3.2, 0.9, 4, 0.05, 0.6, 0.05);
      addBox(x0 - 0.9, z - 0.3, x1 + 0.9, z + 0.3, -5, FL + 4);
    }
  }
  // 后殿处的围屏
  for (let k = 0; k < 5; k++) {
    const a0 = -Math.PI / 2 + k / 5 * Math.PI, a1 = -Math.PI / 2 + (k + 1) / 5 * Math.PI;
    const r = NH - 0.4;
    const xa = P.XA + Math.cos(a0) * r, za = Math.sin(a0) * r, xb = P.XA + Math.cos(a1) * r, zb = Math.sin(a1) * r;
    const len = Math.hypot(xb - xa, zb - za) - 1.6;
    const ang = Math.atan2(-(zb - za), xb - xa);
    b.add('carved', new THREE.BoxGeometry(len, 3.8, 0.5), M((xa + xb) / 2, FL + 1.9, (za + zb) / 2, 0, ang, 0));
    addOBB((xa + xb) / 2, (za + zb) / 2, len / 2 + 0.6, 0.3, ang, -5, FL + 4);
  }

  /* ---------- 唱诗班木雕座椅 ---------- */
  for (const s of [-1, 1]) {
    const x0 = P.CHOIR0 + 3.0, x1 = choirBayX(5) - 0.4;
    const z = s * (NH - 1.2);
    b.box('wood', x0, FL, z - 0.5, x1, FL + 0.5, z + 0.5);
    b.box('wood', x0, FL + 0.5, z - 0.5, x1, FL + 1.0, z - 0.35 * s);
    b.box('woodDark', x0, FL, s * (NH - 0.55) - 0.1, x1, FL + 3.6, s * (NH - 0.55) + 0.1);
    b.box('wood', x0, FL + 3.6, s * (NH - 1.0) - 0.45, x1, FL + 3.8, s * (NH - 1.0) + 0.45);
    for (let x = x0; x < x1; x += 0.8) {
      b.box('woodDark', x - 0.04, FL + 0.5, z - 0.5, x + 0.04, FL + 1.3, z + 0.5);
      b.add('wood', pinnacleGeometry(0.12, 0.9), M(x, FL + 3.8, s * (NH - 1.3)));
    }
    // 前排矮座
    b.box('wood', x0 + 1, FL, s * (NH - 2.6) - 0.4, x1, FL + 0.45, s * (NH - 2.6) + 0.4);
    addBox(x0, s * (NH - 3.0), x1, s * (NH - 0.4), -5, FL + 3.8);
  }
  // 鹰形讲经台（铜）
  b.cyl('bronze', P.CHOIR0 + 14, FL, 0, 0.12, 1.4, 8);
  b.cyl('bronze', P.CHOIR0 + 14, FL, 0, 0.35, 0.15, 8);
  b.add('bronze', new THREE.SphereGeometry(0.25, 8, 6), M(P.CHOIR0 + 14, FL + 1.5, 0));
  b.add('bronze', new THREE.BoxGeometry(0.6, 0.05, 0.9).rotateZ(0.3), M(P.CHOIR0 + 14, FL + 1.75, 0));

  /* ---------- 主祭坛（雨果：堆满圣龛与圣髑盒的古老哥特祭坛） ---------- */
  const ax = P.XA - 2.0;
  for (let k = 0; k < 3; k++) b.box('stone', ax - 3 - k * 0.4, FL, -3.5 + k * 0.3, ax + 2.5, FL + 0.18 * (k + 1), 3.5 - k * 0.3);
  const AF = FL + 0.54;
  b.box('stone', ax - 0.7, AF, -1.7, ax + 0.7, AF + 1.05, 1.7);
  b.box('gilt', ax - 0.72, AF + 0.1, -1.6, ax - 0.7, AF + 0.95, 1.6);
  b.box('whiteCloth', ax - 0.75, AF + 1.05, -1.8, ax + 0.75, AF + 1.1, 1.8);
  b.box('redCloth', ax - 0.76, AF + 0.6, -1.81, ax + 0.76, AF + 1.06, 1.81);
  // 金色祭坛后屏
  b.box('gilt', ax + 0.5, AF + 1.1, -1.6, ax + 0.7, AF + 2.4, 1.6);
  for (let i = 0; i < 5; i++) {
    const z = -1.3 + i * 0.65;
    b.add('gold', archMolding(0.5, 0.6, 1, 0.03, true, 0, 6), M(ax + 0.48, AF + 1.3, z, 0, -Math.PI / 2, 0));
    statue(b, 'gilt', 'small', ax + 0.45, AF + 1.25, z, -1, 0, 0.45);
  }
  // 四角铜柱与持烛天使、红色帷幔
  for (const zz of [-2.0, 2.0]) for (const xx of [ax - 1.0, ax + 1.0]) {
    b.cyl('bronze', xx, AF, zz, 0.07, 3.0, 8);
    statue(b, 'gilt', 'angel', xx, AF + 3.0, zz, -1, -zz * 0.3, 0.42);
  }
  for (const zz of [-2.0, 2.0]) b.box('redCloth', ax - 1.0, AF + 0.4, zz - 0.02, ax + 1.0, AF + 2.6, zz + 0.02);
  b.box('redCloth', ax + 1.0, AF + 0.4, -2.0, ax + 1.02, AF + 2.6, 2.0);
  // 圣马塞尔圣髑盒（高举于立柱之上）
  for (const zz of [-0.8, 0.8]) for (const xx of [ax + 1.6, ax + 2.4]) b.cyl('bronze', xx, AF, zz, 0.08, 3.2, 8);
  b.box('gold', ax + 1.4, AF + 3.2, -1.1, ax + 2.6, AF + 3.9, 1.1);
  const roof = [new THREE.Vector2(-0.6, 0), new THREE.Vector2(0.6, 0), new THREE.Vector2(0, 0.6)];
  b.add('gold', extrude(roof, 2.2), M(ax + 2.0, AF + 3.9, 0));
  for (let i = 0; i < 4; i++) b.add('gold', new THREE.SphereGeometry(0.1, 6, 5), M(ax + 2.0, AF + 4.5, -0.8 + i * 0.53));
  // 小圣髑盒
  for (let i = 0; i < 4; i++) {
    const z = -1.4 + i * 0.93;
    b.box('gold', ax + 0.0 - 0.2, AF + 1.1, z - 0.18, ax + 0.2, AF + 1.45, z + 0.18);
    b.add('gold', new THREE.ConeGeometry(0.22, 0.3, 4).rotateY(Math.PI / 4), M(ax, AF + 1.6, z));
  }
  b.box('gold', ax - 0.05, AF + 1.1, -0.06, ax + 0.05, AF + 1.9, 0.06);
  b.box('gold', ax - 0.05, AF + 1.6, -0.3, ax + 0.05, AF + 1.7, 0.3);
  addBox(ax - 1.2, -2.2, ax + 2.8, 2.2, -5, FL + 4);

  /* ---------- 圣克里斯托夫巨像（1413 年由安托万·德塞萨尔立，1785 年拆除） ---------- */
  const scx = naveBayX(1) - 0.2, scz = NH - 1.7;
  b.box('stone', scx - 1.0, FL, scz - 1.0, scx + 1.0, FL + 1.2, scz + 1.0);
  statue(b, 'statue', 'saint', scx, FL + 1.2, scz, -1, -0.35, 4.6);
  statue(b, 'statue', 'small', scx + 0.1, FL + 1.2 + 7.9, scz + 0.6, -1, 0, 0.75); // 肩上的圣婴
  b.cyl('woodDark', scx - 1.1, FL + 1.2, scz - 0.6, 0.18, 7.6, 6, 0.12);         // 手杖（树干）
  addBox(scx - 1.1, scz - 1.1, scx + 1.1, scz + 1.1, -5, FL + 9);
  // 跪像：安托万·德塞萨尔
  const kneel = statueGeometry('saint');
  b.add('statue', kneel, M(scx - 2.6, FL, scz - 0.4, 0, Math.atan2(1, 0.3), 0, 0.9, 0.62, 0.9), { uvScale: 1.2 });

  /* ---------- “燕巢式”管风琴（1403 年，悬挂于中殿北侧楼廊） ---------- */
  const ox = naveBayX(3) + (naveBayX(4) - naveBayX(3)) / 2, oz = -NH + 0.9, oy = P.TRIB_Y - 1.5;
  b.box('woodDark', ox - 2.6, oy - 0.6, oz - 0.2, ox + 2.6, oy, oz + 1.2);
  b.add('woodDark', new THREE.ConeGeometry(2.0, 2.4, 4, 1).rotateY(Math.PI / 4), M(ox, oy - 1.8, oz + 0.6, Math.PI, 0, 0, 1.3, 1, 0.5));
  b.box('wood', ox - 2.5, oy, oz - 0.1, ox + 2.5, oy + 6.2, oz + 0.1);
  for (let i = 0; i < 17; i++) {
    const x = ox - 2.2 + i * 0.275;
    const h = 2.4 + Math.sin(i / 16 * Math.PI) * 2.6;
    b.cyl('gold', x, oy + 0.4, oz + 0.35, 0.1, h, 8);
    b.add('gold', new THREE.ConeGeometry(0.1, 0.25, 8).rotateX(Math.PI), M(x, oy + 0.28, oz + 0.35));
  }
  for (const dx of [-2.5, 0, 2.5]) b.add('wood', pinnacleGeometry(0.22, 2.0), M(ox + dx, oy + 6.2, oz));
  b.box('blueCloth', ox - 2.4, oy + 5.0, oz + 0.12, ox + 2.4, oy + 6.0, oz + 0.14);

  /* ---------- 中殿东南柱上的“巴黎圣母”像与还愿烛架 ---------- */
  const vx = P.CROSS1 - 1.6, vz = NH + 1.6;
  b.box('carved', vx - 0.5, FL, vz - 0.5, vx + 0.5, FL + 2.2, vz + 0.5);
  statue(b, 'statue', 'saint', vx, FL + 2.2, vz, -0.7, -0.7, 1.15);
  b.add('carved', archMolding(1.3, 2.0, 1, 0.08, true, 0, 8), M(vx - 0.4, FL + 2.2, vz - 0.4, 0, -Math.PI / 4, 0));
  addBox(vx - 0.6, vz - 0.6, vx + 0.6, vz + 0.6, -5, FL + 4);
  const candles = [];
  for (const [cxx, czz] of [[vx - 2.4, vz - 0.6], [vx - 1.2, vz - 2.2]]) {
    b.box('iron', cxx - 0.8, FL, czz - 0.3, cxx + 0.8, FL + 0.9, czz + 0.3);
    b.box('iron', cxx - 0.85, FL + 0.9, czz - 0.35, cxx + 0.85, FL + 0.95, czz + 0.35);
    for (let i = 0; i < 12; i++) {
      const px = cxx - 0.7 + (i % 6) * 0.28, pz = czz - 0.15 + Math.floor(i / 6) * 0.3;
      const h = 0.15 + ((i * 7) % 5) * 0.06;
      b.cyl('candle', px, FL + 0.95, pz, 0.03, h, 6);
      candles.push([px, FL + 0.95 + h + 0.05, pz, 0.6]);
    }
    addBox(cxx - 0.9, czz - 0.4, cxx + 0.9, czz + 0.4, -5, FL + 1.2);
  }
  // 祭坛蜡烛
  for (let i = 0; i < 6; i++) {
    const z = -1.5 + i * 0.6;
    b.cyl('gold', ax - 0.4, AF + 1.1, z, 0.06, 0.25, 6);
    b.cyl('candle', ax - 0.4, AF + 1.35, z, 0.04, 0.55, 6);
    candles.push([ax - 0.4, AF + 1.95, z, 1.0]);
  }
  for (const zz of [-2.0, 2.0]) for (const xx of [ax - 1.0, ax + 1.0]) candles.push([xx, AF + 3.95, zz - 0.1, 1.0]);

  /* ---------- 烛冠（悬挂的铁制圆形烛架） ---------- */
  const crowns = [];
  for (let i = 1; i < P.NAVE_BAYS; i += 2) crowns.push([naveBayX(i) + 2.6, 0]);
  crowns.push([(P.CROSS0 + P.CROSS1) / 2, 0]);
  crowns.push([choirBayX(2) + 2.7, 0]);
  for (const [cx, cz] of crowns) {
    const y = 9.5;
    b.add('iron', new THREE.TorusGeometry(1.6, 0.06, 5, 32).rotateX(Math.PI / 2), M(cx, y, cz));
    b.add('iron', new THREE.TorusGeometry(1.6, 0.03, 4, 32).rotateX(Math.PI / 2), M(cx, y + 0.35, cz));
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2;
      const len = P.VC - y;
      const g = new THREE.CylinderGeometry(0.015, 0.015, len, 3);
      const p0 = new THREE.Vector3(cx + Math.cos(a) * 1.6, y, cz + Math.sin(a) * 1.6), p1 = new THREE.Vector3(cx, P.VC - 0.5, cz);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      b.add('iron', g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, p0.distanceTo(p1) / len, 1)));
    }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      const px = cx + Math.cos(a) * 1.6, pz = cz + Math.sin(a) * 1.6;
      b.cyl('candle', px, y + 0.06, pz, 0.035, 0.35, 5);
      candles.push([px, y + 0.47, pz, 0.8]);
    }
  }

  /* ---------- 挂毯与旗帜（主显节 / 愚人节装饰） ---------- */
  for (let i = 1; i < P.NAVE_BAYS; i++) {
    for (const s of [-1, 1]) {
      if ((i + (s > 0 ? 1 : 0)) % 2) continue;
      const x = naveBayX(i);
      b.add('banner' + (i % 4), new THREE.PlaneGeometry(1.1, 2.6), M(x, P.ARC_SPRING + 1.8, s * (NH - 1.0), 0, s > 0 ? Math.PI : 0, 0), { keepUV: true });
    }
  }

  /* ---------- 烛火：一个 InstancedMesh 的发光火焰 + 光晕精灵 ---------- */
  const flameGeo = new THREE.ConeGeometry(0.035, 0.13, 6);
  flameGeo.translate(0, 0.02, 0);
  const flames = new THREE.InstancedMesh(flameGeo, mats.flame, candles.length);
  const mm = new THREE.Matrix4();
  candles.forEach(([x, y, z], i) => { mm.makeTranslation(x, y, z); flames.setMatrixAt(i, mm); });
  flames.frustumCulled = false;
  scene.add(flames);
  // 光晕
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(candles.flatMap(c => [c[0], c[1] + 0.03, c[2]]), 3));
  glowGeo.setAttribute('size', new THREE.Float32BufferAttribute(candles.map(c => c[3]), 1));
  const glowMat = new THREE.PointsMaterial({ map: glowTex(), size: 0.7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb060, sizeAttenuation: true });
  const glow = new THREE.Points(glowGeo, glowMat);
  scene.add(glow);
  world.animated.push((t) => {
    flames.scale.y = 1;
    glowMat.size = 0.65 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.04;
  });

  // 室内点光源（仅在室内时开启）
  const lightSpots = mats.lowQuality ? [] : [[naveBayX(3), 7, 0], [P.CROSS0 + 7, 6, 4], [ax - 3, 5, 0]];
  for (const [x, y, z] of lightSpots) {
    const L = new THREE.PointLight(0xffa860, 0, 40, 1.5);
    L.position.set(x, y, z);
    L.userData.interior = true;
    L.userData.base = 40;
    scene.add(L);
    world.lights.push(L);
  }

  /* ---------- 光束（来自南侧高窗）与浮尘 ---------- */
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe6c0, opacity: 0.0, side: THREE.DoubleSide, fog: false });
  const beams = new THREE.Group();
  for (let i = 0; i < P.NAVE_BAYS + P.CHOIR_BAYS; i += 1) {
    const x = i < P.NAVE_BAYS ? naveBayX(i) + 2.6 : choirBayX(i - P.NAVE_BAYS) + 2.75;
    const S0 = new THREE.Vector3(x, 28.5, NH - 0.3), E0 = new THREE.Vector3(x + 1.5, FL, -NH + 1.0);
    const len = S0.distanceTo(E0);
    const g = new THREE.PlaneGeometry(2.2, len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), S0.clone().sub(E0).normalize());
    for (const rot of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(g, beamMat);
      m.position.copy(S0).add(E0).multiplyScalar(0.5);
      m.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot));
      m.renderOrder = 5;
      beams.add(m);
    }
  }
  beams.userData.mat = beamMat;
  scene.add(beams);
  world.beams = beams;

  const NDUST = 900;
  const dpos = new Float32Array(NDUST * 3);
  for (let i = 0; i < NDUST; i++) {
    dpos[i * 3] = 5 + Math.random() * 100; dpos[i * 3 + 1] = FL + Math.random() * 28; dpos[i * 3 + 2] = (Math.random() - 0.5) * 12;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dMat = new THREE.PointsMaterial({ map: glowTex(), color: 0xfff0d0, size: 0.09, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dGeo, dMat);
  dust.frustumCulled = false;
  scene.add(dust);
  world.dust = dust;
  world.animated.push((t, dt) => {
    if (!dust.visible) return;
    for (let i = 0; i < NDUST; i++) {
      dpos[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.002 - 0.0015;
      dpos[i * 3] += Math.cos(t * 0.2 + i * 1.3) * 0.002;
      if (dpos[i * 3 + 1] < FL) dpos[i * 3 + 1] = FL + 28;
    }
    dGeo.attributes.position.needsUpdate = true;
    void dt;
  });
  void archPlane;
}
