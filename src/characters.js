// 人物：可动画的角色模型（玩家、爱斯梅拉达、卡西莫多、克洛德·弗罗洛），群众与鸽群
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { world, groundAt } from './world.js';
import { mulberry32 } from './util.js';
import { glowTex } from './textures.js';

const std = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

export const SKINS = {
  pilgrim: { name: '朝圣者', desc: '披着粗呢斗篷、手持朝圣杖的旅人', robe: 0x5b4632, tunic: 0x6d5a40, skin: 0xd9b08c, hair: 0x3a2a1c, hood: true, staff: true },
  gringoire: { name: '甘果瓦', desc: '落魄诗人、《圣母的公正判决》圣迹剧作者', robe: 0x2d3d6a, tunic: 0xb8862b, skin: 0xe0b896, hair: 0x6a4a2a, hat: 0x1d1d1d, legs: 0x7a1e1e },
  esmeralda: { name: '爱斯梅拉达', desc: '在广场上跳舞的吉卜赛姑娘', robe: 0xb0141e, tunic: 0xf0e6d0, skin: 0xc58f62, hair: 0x140c08, dress: true, scarf: 0xe8b830 },
  quasimodo: { name: '卡西莫多', desc: '圣母院的敲钟人，驼背、独眼、红发', robe: 0x6a5a3a, tunic: 0x8a3a24, skin: 0xd8a882, hair: 0xa8401c, hump: true },
  frollo: { name: '克洛德·弗罗洛', desc: '圣母院副主教', robe: 0x161616, tunic: 0x222222, skin: 0xd8b494, hair: 0x5a5a5a, hood: false, bald: true },
};

/* 角色：返回 { root, update(dt, speed, mode) } —— 以几何组 + 关节分组实现骨骼式摆动 */
export function makeCharacter(skinKey = 'pilgrim', scale = 1) {
  const s = SKINS[skinKey];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mRobe = std(s.robe), mTunic = std(s.tunic), mSkin = std(s.skin, 0.7), mHair = std(s.hair, 1);
  const mLeg = std(s.legs ?? 0x3a3028), mShoe = std(0x2a1d14);
  const hump = s.hump ? 1 : 0;

  // 腿
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0, 0.92, side * 0.11);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.46, 8), mLeg);
    thigh.position.y = -0.23;
    const knee = new THREE.Group(); knee.position.y = -0.46;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.44, 8), mLeg);
    shin.position.y = -0.22;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.1), mShoe);
    shoe.position.set(0.05, -0.44, 0);
    knee.add(shin, shoe);
    hip.add(thigh, knee);
    body.add(hip);
    legs.push({ hip, knee });
    if (s.dress) { thigh.visible = false; }
  }
  // 躯干
  const torso = new THREE.Group();
  torso.position.y = 0.92;
  body.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.56, 10), mTunic);
  chest.position.y = 0.3;
  chest.scale.set(1, 1, 1.25);
  torso.add(chest);
  // 长袍下摆 / 裙子
  const skirtH = s.dress ? 0.86 : 0.5;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, s.dress ? 0.42 : 0.27, skirtH, 12, 1, true), s.dress ? mRobe : mTunic);
  skirt.position.y = -skirtH / 2 + 0.06;
  skirt.material.side = THREE.DoubleSide;
  torso.add(skirt);
  // 斗篷
  if (!s.dress) {
    const cloak = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.05, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9), mRobe);
    cloak.material.side = THREE.DoubleSide;
    cloak.position.set(0, 0.06, 0);
    cloak.rotation.y = Math.PI / 2;
    torso.add(cloak);
  } else {
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16), std(s.scarf));
    sash.rotation.x = Math.PI / 2; sash.position.y = 0.06; torso.add(sash);
  }
  if (hump) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mTunic);
    h.position.set(-0.14, 0.48, 0.05); h.scale.set(1, 0.9, 1.2);
    torso.add(h);
    torso.rotation.z = 0.0;
  }
  // 头
  const neck = new THREE.Group();
  neck.position.y = 0.62 - hump * 0.08;
  neck.position.x = hump * 0.08;
  torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), mSkin);
  head.position.y = 0.14; head.scale.set(1, 1.1, 0.95);
  neck.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 5).rotateZ(-Math.PI / 2), mSkin);
  nose.position.set(0.115, 0.13, 0); neck.add(nose);
  for (const side of [-1, 1]) {
    if (hump && side < 0) {
      // 卡西莫多：一只眼被肉瘤遮住
      const wart = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mSkin);
      wart.position.set(0.095, 0.17, side * 0.04); neck.add(wart);
      continue;
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), std(0x111111, 0.3));
    eye.position.set(0.1, 0.165, side * 0.04); neck.add(eye);
  }
  if (!s.bald) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mHair);
    hair.position.set(-0.01, 0.16, 0); neck.add(hair);
    if (s.dress) {
      const long = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 10, 1, true, Math.PI * 0.5, Math.PI), mHair);
      long.material.side = THREE.DoubleSide;
      long.position.set(-0.03, -0.02, 0); neck.add(long);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 16), std(s.scarf));
      scarf.position.y = 0.21; scarf.rotation.x = Math.PI / 2; scarf.rotation.z = 0.2; neck.add(scarf);
    }
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 14), mHair);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; neck.add(ring);
  }
  if (s.hood) {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.62), mRobe);
    hood.material.side = THREE.DoubleSide;
    hood.position.y = 0.15; neck.add(hood);
  }
  if (s.hat) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.16, 10), std(s.hat));
    hat.position.y = 0.28; neck.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), std(s.hat));
    brim.position.y = 0.22; neck.add(brim);
  }
  // 手臂
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(0, 0.52 - hump * 0.03, side * 0.24);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), s.dress ? mTunic : mRobe);
    up.position.y = -0.16;
    const el = new THREE.Group(); el.position.y = -0.32;
    const fo = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.04, 0.3, 8), s.dress ? mSkin : mTunic);
    fo.position.y = -0.15;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mSkin);
    hand.position.y = -0.32;
    el.add(fo, hand);
    sh.add(up, el);
    torso.add(sh);
    arms.push({ sh, el, hand: el });
  }
  if (s.staff) {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 6), std(0x4a3420));
    staff.position.set(0, -0.15, 0);
    arms[1].el.add(staff);
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), std(0xc8a050));
    gourd.position.set(0, 0.55, 0.03); staff.add(gourd);
  }
  if (skinKey === 'esmeralda') {
    const tamb = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 14, 1, true), std(0xc8a060));
    tamb.material.side = THREE.DoubleSide;
    tamb.position.y = -0.36; tamb.rotation.x = Math.PI / 2;
    arms[1].el.add(tamb);
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(scale);
  if (hump) body.rotation.z = -0.12;

  let phase = 0;
  const api = {
    root, skin: skinKey,
    update(dt, speed, mode = 'walk', t = 0) {
      if (mode === 'dance') {
        phase += dt * 5.0;
        legs[0].hip.rotation.z = Math.sin(phase) * 0.4; legs[1].hip.rotation.z = -Math.sin(phase) * 0.4;
        legs[0].knee.rotation.z = -Math.max(0, Math.sin(phase)) * 0.6; legs[1].knee.rotation.z = -Math.max(0, -Math.sin(phase)) * 0.6;
        arms[0].sh.rotation.x = 2.4 + Math.sin(phase * 0.5) * 0.4; arms[1].sh.rotation.x = -2.5 - Math.cos(phase * 0.5) * 0.4;
        arms[0].el.rotation.z = 0.4; arms[1].el.rotation.z = 0.5;
        body.position.y = Math.abs(Math.sin(phase)) * 0.06;
        torso.rotation.y = Math.sin(phase * 0.5) * 0.3;
        root.rotation.y += dt * 1.2;
        return;
      }
      if (mode === 'ring') {
        phase += dt * 2.0;
        arms[0].sh.rotation.z = 2.6 + Math.sin(phase) * 0.5; arms[1].sh.rotation.z = 2.6 + Math.sin(phase) * 0.5;
        arms[0].el.rotation.z = 0.2; arms[1].el.rotation.z = 0.2;
        body.position.y = Math.max(0, Math.sin(phase)) * 0.25;
        legs.forEach(l => { l.hip.rotation.z = Math.sin(phase) * 0.3; l.knee.rotation.z = -0.3; });
        return;
      }
      const sp = Math.min(speed, 8);
      phase += dt * (sp > 0.05 ? 2.2 + sp * 1.25 : 0);
      const amp = Math.min(1, sp / 3.5) * (sp > 4.5 ? 1.15 : 0.8);
      const sw = Math.sin(phase);
      legs[0].hip.rotation.z = sw * 0.55 * amp; legs[1].hip.rotation.z = -sw * 0.55 * amp;
      legs[0].knee.rotation.z = -Math.max(0, -Math.cos(phase)) * 0.9 * amp;
      legs[1].knee.rotation.z = -Math.max(0, Math.cos(phase)) * 0.9 * amp;
      arms[0].sh.rotation.z = -sw * 0.45 * amp; arms[1].sh.rotation.z = sw * 0.45 * amp;
      arms[0].el.rotation.z = 0.25 + amp * 0.3; arms[1].el.rotation.z = 0.25 + amp * 0.3;
      body.position.y = Math.abs(Math.cos(phase)) * 0.045 * amp;
      // 待机呼吸
      torso.scale.y = 1 + Math.sin(t * 1.8) * 0.008 * (1 - amp);
      if (sp < 0.05) { legs.forEach(l => { l.hip.rotation.z *= 0.85; l.knee.rotation.z *= 0.85; }); arms.forEach(a => { a.sh.rotation.z *= 0.9; }); }
    },
  };
  return api;
}

/* 山羊佳丽（Djali），镀金的小角 */
function makeGoat() {
  const g = new THREE.Group();
  const w = std(0xece6da);
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 4, 8).rotateZ(Math.PI / 2), w); b.position.y = 0.55; g.add(b);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.14), w); h.position.set(0.38, 0.72, 0); h.rotation.z = -0.4; g.add(h);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 5), new THREE.MeshStandardMaterial({ color: 0xe6b640, metalness: 1, roughness: 0.3 }));
    horn.position.set(0.33, 0.86, s * 0.04); horn.rotation.z = 0.5; g.add(horn);
  }
  const legs = [];
  for (const [dx, dz] of [[-0.22, -0.08], [-0.22, 0.08], [0.22, -0.08], [0.22, 0.08]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.42, 5), w);
    l.position.set(dx, 0.21, dz); g.add(l); legs.push(l);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, legs };
}

/* 群众：两组 InstancedMesh（身体着色 + 头部），在若干区域内随机漫步 */
export function buildCrowd(scene, quality) {
  const rng = mulberry32(6);
  const regions = [
    { x0: -55, x1: -8, z0: -30, z1: 30, n: 46 },          // 圣母院前广场
    { x0: -30, x1: 52, z0: -305, z1: -255, n: 50 },       // 河滩广场
    { x0: -150, x1: -60, z0: -3, z1: 3, n: 12 },          // 新圣母院街
    { x0: -162, x1: -158, z0: -236, z1: -122, n: 12 },    // 圣母桥
    { x0: -82, x1: -78, z0: 58, z1: 108, n: 8 },          // 小桥
    { x0: -402, x1: -398, z0: -240, z1: -122, n: 8 },     // 钱币兑换桥
    { x0: -400, x1: -100, z0: 31.5, z1: 36.5, n: 10 },
    { x0: 5, x1: 120, z0: -40, z1: -32, n: 8 },           // 修道院
  ];
  const total = regions.reduce((a, r) => a + Math.round(r.n * (quality === 'low' ? 0.5 : 1)), 0);
  // 身体：长袍 + 斗篷
  const parts = [];
  const robe = new THREE.CylinderGeometry(0.17, 0.3, 1.25, 8); robe.translate(0, 0.62, 0); parts.push(robe);
  const ch = new THREE.CylinderGeometry(0.2, 0.19, 0.35, 8); ch.translate(0, 1.38, 0); parts.push(ch);
  const bodyG = mergeGeometries(parts.map(p => p.toNonIndexed()));
  const headG = new THREE.SphereGeometry(0.12, 8, 6); headG.translate(0, 1.68, 0);
  const hatG = new THREE.CylinderGeometry(0.1, 0.14, 0.12, 8); hatG.translate(0, 1.8, 0);
  const bodies = new THREE.InstancedMesh(bodyG, std(0xffffff), total);
  const heads = new THREE.InstancedMesh(headG, std(0xd8ac88, 0.7), total);
  const hats = new THREE.InstancedMesh(hatG, std(0xffffff), total);
  bodies.castShadow = heads.castShadow = hats.castShadow = true;
  const palette = [0x6a2a22, 0x2c3a5a, 0x5a4a32, 0x3a4a2a, 0x7a6a4a, 0x2a2a2a, 0x8a5a2a, 0x4a2a4a, 0x9a8a6a, 0x5a1a1a, 0x22304a, 0x6a6a5a];
  const agents = [];
  const col = new THREE.Color();
  for (const r of regions) {
    const n = Math.round(r.n * (quality === 'low' ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const a = { r, x: r.x0 + rng() * (r.x1 - r.x0), z: r.z0 + rng() * (r.z1 - r.z0), tx: 0, tz: 0, sp: 0.6 + rng() * 0.8, wait: rng() * 4, ph: rng() * 6, h: 0.92 + rng() * 0.14 };
      a.tx = a.x; a.tz = a.z;
      const idx = agents.length;
      bodies.setColorAt(idx, col.setHex(palette[Math.floor(rng() * palette.length)]));
      hats.setColorAt(idx, col.setHex(palette[Math.floor(rng() * palette.length)]).multiplyScalar(0.8));
      heads.setColorAt(idx, col.setHSL(0.07, 0.4, 0.55 + rng() * 0.15));
      agents.push(a);
    }
  }
  scene.add(bodies, heads, hats);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  world.animated.push((t, dt) => {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.wait > 0) { a.wait -= dt; }
      else {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { a.wait = 1 + rng() * 6; a.tx = a.r.x0 + rng() * (a.r.x1 - a.r.x0); a.tz = a.r.z0 + rng() * (a.r.z1 - a.r.z0); }
        else { a.x += dx / d * a.sp * dt; a.z += dz / d * a.sp * dt; a.yaw = Math.atan2(dx, dz); }
      }
      const moving = a.wait <= 0;
      const y = groundAt(a.x, a.z, 4) + (moving ? Math.abs(Math.sin(t * 6 * a.sp + a.ph)) * 0.04 : 0);
      q.setFromAxisAngle(up, (a.yaw ?? 0));
      const sway = moving ? Math.sin(t * 6 * a.sp + a.ph) * 0.05 : 0;
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway));
      m.compose(v.set(a.x, y, a.z), q, sc.set(1, a.h, 1));
      bodies.setMatrixAt(i, m); heads.setMatrixAt(i, m); hats.setMatrixAt(i, m);
    }
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = hats.instanceMatrix.needsUpdate = true;
  });
  [bodies, heads, hats].forEach(o => { o.frustumCulled = false; });
  return agents;
}

/* 小说人物：广场上的爱斯梅拉达与山羊佳丽、钟楼上的卡西莫多、塔顶的弗罗洛 */
export function buildStoryCharacters(scene, mats) {
  const esm = makeCharacter('esmeralda');
  esm.root.position.set(-30, 0.02, 6);
  scene.add(esm.root);
  // 波斯旧地毯
  const carpetC = document.createElement('canvas'); carpetC.width = 128; carpetC.height = 96;
  const cx = carpetC.getContext('2d');
  cx.fillStyle = '#7a1a1a'; cx.fillRect(0, 0, 128, 96);
  cx.strokeStyle = '#d8a83a'; cx.lineWidth = 4; cx.strokeRect(6, 6, 116, 84);
  cx.fillStyle = '#1d2a5a'; cx.fillRect(18, 18, 92, 60);
  cx.fillStyle = '#d8a83a'; for (let i = 0; i < 5; i++) { cx.beginPath(); cx.moveTo(28 + i * 18, 48); cx.lineTo(37 + i * 18, 30); cx.lineTo(46 + i * 18, 48); cx.lineTo(37 + i * 18, 66); cx.fill(); }
  const ct = new THREE.CanvasTexture(carpetC); ct.colorSpace = THREE.SRGBColorSpace;
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: ct, roughness: 1 }));
  carpet.position.set(-30, 0.04, 6); carpet.receiveShadow = true;
  scene.add(carpet);
  const goat = makeGoat();
  goat.g.position.set(-28.2, 0.02, 7.2);
  scene.add(goat.g);
  // 围观的人群（环形静立）
  const ring = new THREE.Group();
  const rng = mulberry32(31);
  const pal = [0x6a2a22, 0x2c3a5a, 0x5a4a32, 0x3a4a2a, 0x7a6a4a, 0x2a2a2a, 0x8a5a2a];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + rng() * 0.2;
    const r = 4.2 + rng() * 1.2;
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 1.3, 8), std(pal[i % pal.length]));
    body.position.y = 0.65; p.add(body);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), std(0xd8ac88, 0.7));
    hd.position.y = 1.45; p.add(hd);
    p.position.set(-30 + Math.cos(a) * r, 0.02, 6 + Math.sin(a) * r);
    p.lookAt(-30, 0.8, 6);
    p.traverse(o => { if (o.isMesh) o.castShadow = true; });
    ring.add(p);
  }
  scene.add(ring);

  // 卡西莫多：南钟楼大钟旁
  const qua = makeCharacter('quasimodo');
  if (world.quasimodoSpot) { qua.root.position.copy(world.quasimodoSpot); qua.root.rotation.y = Math.PI / 2; }
  scene.add(qua.root);
  // 弗罗洛：北塔顶俯视广场（第七卷，他从塔上望着跳舞的姑娘）
  const fro = makeCharacter('frollo');
  fro.root.position.set(0.6, 68.2, -10);
  fro.root.rotation.y = Math.PI;
  scene.add(fro.root);

  // 河滩广场主显节篝火（第一卷：河滩的焰火、五朔节花柱与圣迹剧）
  const fire = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), mats.woodDark);
    log.rotation.z = Math.PI / 2 - 0.5; log.rotation.y = k / 8 * Math.PI * 2;
    log.position.y = 0.5; fire.add(log);
  }
  const flames = [];
  const fm = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.45 - k * 0.04, 1.6 + k * 0.15, 7, 1, true), fm);
    f.position.set((rng() - 0.5) * 0.8, 1.2, (rng() - 0.5) * 0.8);
    fire.add(f); flames.push(f);
  }
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  fireGlow.scale.setScalar(9); fireGlow.position.y = 1.6; fire.add(fireGlow);
  fire.position.set(8, 0, -265);
  scene.add(fire);
  if (!mats.lowQuality) {
    const fireLight = new THREE.PointLight(0xff8a3a, 0, 45, 1.6);
    fireLight.position.set(8, 3, -265);
    scene.add(fireLight);
    world.fireLight = fireLight;
  }

  // 广场上的灯笼与火把（夜间点亮）
  const lanterns = [[-56, 3, -20], [-56, 3, 20], [-10, 3, -30], [-10, 3, 30], [-50, 3, -250], [60, 3, -258], [-160, 3, -128], [-80, 3, 60], [-160, 3, -233]];
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lanterns.flat(), 3));
  const lMat = new THREE.PointsMaterial({ map: glowTex(), size: 3.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffa050, opacity: 0 });
  scene.add(new THREE.Points(lg, lMat));
  for (const [x, y, z] of lanterns) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, y, 6), mats.iron);
    pole.position.set(x, y / 2, z); scene.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), mats.flame);
    box.position.set(x, y + 0.1, z); scene.add(box);
  }
  world.lanternMat = lMat;

  // 鸽群 / 寒鸦：绕钟楼盘旋
  const birdG = new THREE.BufferGeometry();
  birdG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.35, 0.05, -0.05, 0, 0, -0.12, 0, 0, 0.18, 0, 0, -0.12, 0.35, 0.05, -0.05], 3));
  birdG.computeVertexNormals();
  const NB = 40;
  const birds = new THREE.InstancedMesh(birdG, new THREE.MeshStandardMaterial({ color: 0x3a3a40, side: THREE.DoubleSide }), NB);
  birds.frustumCulled = false;
  scene.add(birds);
  const bd = Array.from({ length: NB }, (_, i) => ({ r: 18 + rng() * 40, y: 50 + rng() * 30, sp: 0.2 + rng() * 0.25, ph: rng() * 6.28, cx: 10 + rng() * 40, cz: rng() * 20 - 10 }));

  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bv = new THREE.Vector3(), bs = new THREE.Vector3();
  world.animated.push((t, dt) => {
    esm.update(dt, 0, 'dance', t);
    goat.g.position.x = -30 + Math.cos(t * 0.6) * 1.9;
    goat.g.position.z = 6 + Math.sin(t * 0.6) * 1.9;
    goat.g.rotation.y = -t * 0.6 - Math.PI;
    goat.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 8 + i * 1.6) * 0.4; });
    const ringing = world.bells && world.bells.some(b => Math.abs(b.vel) > 0.25);
    qua.update(dt, 0, ringing ? 'ring' : 'walk', t);
    fro.update(dt, 0, 'walk', t);
    flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 9 + i * 2) * 0.25 + Math.sin(t * 23 + i) * 0.1; f.rotation.y = t * (i % 2 ? 1 : -1); });
    fireGlow.material.opacity = 0.7 + Math.sin(t * 11) * 0.15;
    for (let i = 0; i < NB; i++) {
      const b = bd[i];
      const a = b.ph + t * b.sp;
      bv.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 2.3) * 3, b.cz + Math.sin(a) * b.r);
      bq.setFromEuler(new THREE.Euler(0, -a, Math.sin(t * 2 + i) * 0.2));
      const flap = 0.4 + Math.abs(Math.sin(t * 12 + i)) * 0.8;
      bm.compose(bv, bq, bs.set(1, flap, 1));
      birds.setMatrixAt(i, bm);
    }
    birds.instanceMatrix.needsUpdate = true;
  });
  return { esm, qua, fro };
}
