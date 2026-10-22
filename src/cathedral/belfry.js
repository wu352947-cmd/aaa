// 钟楼：南塔木质钟架与大钟“玛丽”“雅克琳”（雨果：卡西莫多最钟爱的钟），
// 北塔的小钟群，以及墙上的刻字 ἈΝΆΓΚΗ
import * as THREE from 'three';
import { M } from '../geom.js';
import { P } from './plan.js';
import { world, addBox } from '../world.js';

function bellGeometry(R) {
  const prof = [
    [0.0, 1.32], [0.32, 1.3], [0.48, 1.22], [0.52, 1.05], [0.55, 0.75], [0.62, 0.45], [0.78, 0.2], [0.98, 0.04], [1.0, 0.0], [0.93, 0.0], [0.75, 0.15], [0.56, 0.42], [0.48, 0.75], [0.44, 1.05], [0.3, 1.2], [0.0, 1.22],
  ].map(([x, y]) => new THREE.Vector2(x * R, y * R));
  const g = new THREE.LatheGeometry(prof, 32);
  g.translate(0, -1.32 * R, 0);
  return g;
}

export function buildBelfry(b, scene, mats) {
  const bells = [];
  const { XT, BI0, ZF, BELFRY_FLOOR: F } = P;
  for (const s of [-1, 1]) {
    const z0 = s * (BI0 + 1.5), z1 = s * (ZF - 1.5);
    const zmin = Math.min(z0, z1), zmax = Math.max(z0, z1);
    const xa = 2.2, xb = XT - 2.2;
    // 橡木钟架：立柱、横梁、斜撑
    const posts = [];
    for (const x of [xa + 0.5, (xa + xb) / 2, xb - 0.5]) for (const z of [zmin + 0.7, (zmin + zmax) / 2, zmax - 0.7]) posts.push([x, z]);
    const topY = F + 11;
    for (const [x, z] of posts) b.box('wood', x - 0.22, F, z - 0.22, x + 0.22, topY, z + 0.22, { uvScale: 0.8 });
    for (const y of [F + 0.3, F + 5.5, topY - 0.3]) {
      for (const x of [xa + 0.5, (xa + xb) / 2, xb - 0.5]) b.box('wood', x - 0.2, y - 0.2, zmin + 0.5, x + 0.2, y + 0.2, zmax - 0.5, { uvScale: 0.8 });
      for (const z of [zmin + 0.7, (zmin + zmax) / 2, zmax - 0.7]) b.box('wood', xa + 0.3, y - 0.2, z - 0.2, xb - 0.3, y + 0.2, z + 0.2, { uvScale: 0.8 });
    }
    // 斜撑
    for (const x of [xa + 0.5, xb - 0.5]) {
      for (const [za, zb] of [[zmin + 0.7, (zmin + zmax) / 2], [(zmin + zmax) / 2, zmax - 0.7]]) {
        const len = Math.hypot(zb - za, 5.2);
        const ang = Math.atan2(5.2, zb - za);
        b.add('wood', new THREE.BoxGeometry(0.25, 0.25, len), M(x, F + 3.0, (za + zb) / 2, -ang, 0, 0), { uvScale: 0.8 });
      }
    }
    for (const [x, z] of posts) addBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, F - 1, F + 12);

    if (s > 0) {
      // 南塔：大钟“玛丽”与“雅克琳”
      bells.push(makeBell(scene, mats, (xa + xb) / 2 - 2.6, F + 9.7, (zmin + zmax) / 2 - 2.9 * s, 1.35, 'Marie', 0.5));
      bells.push(makeBell(scene, mats, (xa + xb) / 2 + 2.6, F + 9.7, (zmin + zmax) / 2 + 2.6 * s, 1.1, 'Jacqueline', 0.62));
      // 敲钟的卡西莫多（驼背、红发、独眼的敲钟人）
      world.quasimodoSpot = new THREE.Vector3((xa + xb) / 2 - 0.5, F, (zmin + zmax) / 2);
    } else {
      // 北塔：小钟群
      const xs = [xa + 2.2, (xa + xb) / 2, xb - 2.2];
      xs.forEach((x, i) => {
        bells.push(makeBell(scene, mats, x, F + 9.9, (zmin + zmax) / 2 - 2.6, 0.55 + i * 0.08, 'Thibault' + i, 1.0 + i * 0.15));
        bells.push(makeBell(scene, mats, x, F + 9.9, (zmin + zmax) / 2 + 2.6, 0.5 + i * 0.07, 'Pasquier' + i, 1.1 + i * 0.12));
      });
      // 雨果序言：“在圣母院一座钟楼的阴暗角落里，墙上刻着 ἈΝΆΓΚΗ”
      b.add('inscription', new THREE.PlaneGeometry(1.6, 0.8), M(XT - 1.52, F + 1.6, (zmin + zmax) / 2 + 3.0, 0, -Math.PI / 2, 0), { keepUV: true });
      world.anankeSpot = new THREE.Vector3(XT - 3.0, F, (zmin + zmax) / 2 + 3.0);
    }
  }
  world.bells = bells;
  world.ringBells = (strength = 1) => {
    bells.forEach((bl, i) => { bl.vel += (i < 2 ? 1.4 : 1.8) * strength * (0.7 + Math.random() * 0.3); });
  };
  world.animated.push((t, dt) => {
    for (const bl of bells) {
      // 阻尼摆
      bl.vel += -bl.angle * 3.2 * dt * bl.freq * 2;
      bl.vel *= Math.pow(0.55, dt);
      bl.angle += bl.vel * dt;
      bl.pivot.rotation.z = bl.angle;
      bl.clapper.rotation.z = -bl.angle * 0.6;
      const sgn = Math.sign(bl.angle);
      if (Math.abs(bl.angle) > 0.35 && sgn !== bl.lastSide) {
        bl.lastSide = sgn;
        if (world.onBellStrike) world.onBellStrike(bl);
      }
    }
  });
}

function makeBell(scene, mats, x, y, z, R, name, freq) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const bell = new THREE.Mesh(bellGeometry(R), mats.bronze);
  bell.position.y = -0.35;
  bell.castShadow = true;
  pivot.add(bell);
  // 钟顶木轭
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, R * 2.6), mats.woodDark);
  pivot.add(yoke);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, R * 3.4, 8).rotateX(Math.PI / 2), mats.iron);
  pivot.add(axle);
  // 钟舌
  const clapper = new THREE.Group();
  clapper.position.y = -0.4;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, R * 1.0, 6), mats.iron);
  rod.position.y = -R * 0.5;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 10, 8), mats.iron);
  ball.position.y = -R * 1.05;
  clapper.add(rod, ball);
  pivot.add(clapper);
  // 铭文带
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.52, 0.03, 4, 32).rotateX(Math.PI / 2), mats.gold);
  band.position.y = -0.35 - R * 0.25;
  pivot.add(band);
  pivot.rotation.order = 'YXZ';
  scene.add(pivot);
  return { pivot, clapper, angle: 0, vel: 0, freq, name, R, lastSide: 0, pos: new THREE.Vector3(x, y, z) };
}
