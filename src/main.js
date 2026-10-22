// 巴黎圣母院 1482 —— 主程序
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setAnisotropy, setTextureQuality } from './textures.js';
import { createMaterials } from './materials.js';
import { buildCathedral } from './cathedral/index.js';
import { buildCity } from './city/index.js';
import { landSDF, terrainHeight, WATER_Y } from './city/terrain.js';
import { SkySystem, SEASONS } from './sky.js';
import { world, groundAt, resolveCollisions, buildColliderGrid, pointBlocked } from './world.js';
import { makeCharacter, buildCrowd, buildStoryCharacters, SKINS } from './characters.js';
import { Input } from './controls.js';
import { AudioSystem } from './audio.js';
import { POIS } from './pois.js';
import { P } from './cathedral/plan.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const settings = { mode: 'tour', skin: 'pilgrim', quality: isTouch ? 'medium' : 'high' };
const state = { started: false, mode: 'tour', firstPerson: false, runToggle: false, uiHidden: false, timeFlow: false, muted: false };
const audio = new AudioSystem();

/* ---------------- 开始界面 ---------------- */
function bindChoices(id, key, attr) {
  const box = $(id);
  box.querySelectorAll('.choice').forEach(btn => {
    if (btn.dataset[attr] === settings[key]) { box.querySelectorAll('.choice').forEach(b => b.classList.remove('sel')); btn.classList.add('sel'); }
    btn.addEventListener('click', () => {
      box.querySelectorAll('.choice').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      settings[key] = btn.dataset[attr];
    });
  });
}
bindChoices('modeChoices', 'mode', 'mode');
bindChoices('skinChoices', 'skin', 'skin');
bindChoices('qualityChoices', 'quality', 'q');
if (!isTouch) $('ctrlHint').textContent = 'WASD 移动 · Shift 奔跑 · 空格跳跃 · 拖动鼠标转视角 · 滚轮缩放 · E 互动 · F 切换视角';
$('startBtn').addEventListener('click', () => { audio.init(); start(); });

const params = new URLSearchParams(location.search);
if (params.get('autostart')) {
  if (params.get('mode')) settings.mode = params.get('mode');
  if (params.get('q')) settings.quality = params.get('q');
  if (params.get('skin')) settings.skin = params.get('skin');
  setTimeout(start, 50);
}

/* ---------------- 全局对象 ---------------- */
let renderer, scene, camera, sky, mats, input, orbit, player, crowd, story;
const clock = new THREE.Clock();
let elapsed = 0;

const progress = (p, text) => new Promise(res => {
  $('barFill').style.width = Math.round(p * 100) + '%';
  if (text) $('loadText').textContent = text;
  requestAnimationFrame(() => setTimeout(res, 0));
});

async function start() {
  if (state.started) return;
  state.started = true;
  $('start').classList.add('hidden');
  $('loading').classList.remove('hidden');
  const q = settings.quality;
  await progress(0.02, '正在准备画布……');

  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: q !== 'low', powerPreference: 'high-performance' });
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  setAnisotropy(Math.min(renderer.capabilities.getMaxAnisotropy(), q === 'high' ? 8 : 4));
  setTextureQuality(q === 'high' ? 1 : 0.5);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, q === 'low' ? 2200 : 4500);
  camera.position.set(-90, 30, -60);

  await progress(0.06, '正在凿刻卢泰斯石灰岩……');
  mats = createMaterials();
  mats.lowQuality = q === 'low';
  await progress(0.3, '正在砌筑西立面与双塔……');
  buildCathedral(scene, mats);
  await progress(0.55, '正在铺设 1482 年的街巷与桥梁……');
  buildCity(scene, mats, q);
  await progress(0.75, '巴黎的居民正在走上街头……');
  crowd = buildCrowd(scene, q);
  story = buildStoryCharacters(scene, mats);
  addClockFace();
  buildColliderGrid();

  sky = new SkySystem(renderer, scene);
  sky.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  sky.hour = 15.5;
  await progress(0.88, '正在点燃烛火……');

  input = new Input($('c'), $('joystick'), $('knob'));
  input.onTap = () => {};
  player = createPlayer(settings.skin);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.minDistance = 3;
  orbit.maxDistance = 900;
  orbit.target.set(50, 22, 0);
  orbit.enabled = false;

  setupUI();
  setMode(settings.mode);
  // 调试/分享参数：?cam=x,y,z,tx,ty,tz  ?tp=x,y,z,yaw  ?h=小时
  if (params.get('h')) sky.hour = +params.get('h');
  if (params.get('season')) sky.season = params.get('season');
  if (params.get('cam')) {
    const v = params.get('cam').split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]); orbit.target.set(v[3], v[4], v[5]);
    orbit.autoRotate = false; camera.lookAt(orbit.target);
  }
  if (params.get('tp')) { const v = params.get('tp').split(',').map(Number); teleport(v[0], v[1], v[2], v[3] || 0); }
  if (params.get('fp')) state.firstPerson = true;
  // 预编译着色器，减少首帧卡顿
  sky.update(new THREE.Vector3(30, 0, 0), 0, mats);
  renderer.compile(scene, camera);
  await progress(1, '欢迎来到 1482 年的巴黎');
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  showToast(settings.mode === 'tour' ? '1482 年 · 圣母院前广场' : '欣赏模式：拖动旋转 · 双指缩放');
  window.addEventListener('resize', onResize);
  onResize();
  renderer.setAnimationLoop(loop);
  window.__ready = true;
  window.__r = renderer; window.__scene = scene; window.__player = () => ({ pos: player.pos.toArray().map(v => +v.toFixed(2)), mode: state.mode, keys: input.keys });
  window.__shot = (o) => {
    if (o.mode && o.mode !== state.mode) setMode(o.mode);
    if (o.h !== undefined) sky.hour = o.h;
    if (o.season) sky.season = o.season;
    if (o.cam) { cineStop(); orbit.autoRotate = false; camera.position.set(o.cam[0], o.cam[1], o.cam[2]); orbit.target.set(o.cam[3], o.cam[4], o.cam[5]); camera.lookAt(orbit.target); }
    if (o.tp) { teleport(o.tp[0], o.tp[1], o.tp[2], o.tp[3] || 0); if (o.pitch !== undefined) player.camPitch = o.pitch; if (o.dist) player.camDist = o.dist; }
    state.firstPerson = !!o.fp;
    if (o.ring) world.ringBells(1);
  };
}

function addClockFace() {
  if (!world.clockTex) return;
  const m = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshStandardMaterial({ map: world.clockTex, roughness: 0.4, metalness: 0.3 }));
  m.position.copy(world.clockSpot);
  m.rotation.y = Math.PI / 2;
  scene.add(m);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

/* ---------------- 玩家 ---------------- */
function createPlayer(skin) {
  const ch = makeCharacter(skin);
  scene.add(ch.root);
  return {
    ch,
    pos: new THREE.Vector3(-46, 0, 1),
    vy: 0,
    yaw: 0,
    camYaw: 0,
    camPitch: 0.18,
    camDist: 5.5,
    grounded: true,
    speed: 0,
  };
}

function teleport(x, y, z, yaw = null) {
  const g = groundAt(x, z, y + 1.0);
  player.pos.set(x, g, z);
  player.vy = 0;
  if (yaw !== null) { player.camYaw = yaw; player.yaw = -yaw; }
  player.ch.root.position.copy(player.pos);
  player.ch.root.rotation.y = -player.camYaw;
}

const ceilingAt = (x, y, z) => {
  const inside = world.interiorZones.some(f => f(x, Math.min(y, 30), z));
  if (inside && y < 40) {
    const central = (x < P.XA ? Math.abs(z) < P.NH - 0.8 : Math.hypot(x - P.XA, z) < P.NH - 0.8) && x > 3.4;
    return central ? P.VC - 2.5 : P.AVC - 0.6;
  }
  if (x > 1.5 && x < 13.5 && Math.abs(z) > 6.4 && Math.abs(z) < 20.3 && y > P.BELFRY_FLOOR - 0.5 && y < P.TOWER_TOP - 0.5) return P.TOWER_TOP - 1.4;
  return Infinity;
};

const fwd = new THREE.Vector3(), tmpV = new THREE.Vector3(), head = new THREE.Vector3(), camTarget = new THREE.Vector3();
function updatePlayer(dt) {
  const m = input.getMove();
  const run = m.run || state.runToggle;
  const [ldx, ldy] = input.consumeLook();
  player.camYaw += ldx * 0.0055;
  player.camPitch = THREE.MathUtils.clamp(player.camPitch + ldy * 0.0045, -1.2, 1.35);
  player.camDist = THREE.MathUtils.clamp(player.camDist + input.consumeZoom() * 0.8, 1.6, 16);

  const cy = player.camYaw;
  const fx = Math.cos(cy), fz = Math.sin(cy);
  const rx = -Math.sin(cy), rz = Math.cos(cy);
  let mx = fx * m.y + rx * m.x, mz = fz * m.y + rz * m.x;
  const mag = Math.hypot(mx, mz);
  const target = mag > 0.05 ? (run ? 5.6 : 2.3) * Math.min(1, mag) : 0;
  player.speed += (target - player.speed) * Math.min(1, dt * 8);
  const prevX = player.pos.x, prevZ = player.pos.z;
  if (mag > 0.05) {
    mx /= mag; mz /= mag;
    player.pos.x += mx * player.speed * dt;
    player.pos.z += mz * player.speed * dt;
    const want = Math.atan2(-mz, mx);
    let d = want - player.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * 12);
  }
  resolveCollisions(player.pos, 0.35, player.pos.y, 1.7);
  // 防止走进河里
  const g0 = groundAt(player.pos.x, player.pos.z, player.pos.y + 0.6);
  if (g0 < WATER_Y - 0.2) { player.pos.x = prevX; player.pos.z = prevZ; }
  // 重力与跳跃
  if (input.jump && player.grounded) { player.vy = 5.2; player.grounded = false; }
  input.jump = false;
  player.vy -= 18 * dt;
  player.pos.y += player.vy * dt;
  const g = groundAt(player.pos.x, player.pos.z, player.pos.y + 0.65);
  if (player.pos.y <= g) { player.pos.y = g; player.vy = 0; player.grounded = true; }
  else if (player.grounded && player.pos.y - g < 0.45 && player.vy <= 0) { player.pos.y = g; player.vy = 0; }
  else player.grounded = false;
  if (player.pos.y < -20) teleport(-46, 0, 1, 0);

  player.ch.root.position.copy(player.pos);
  player.ch.root.rotation.y = player.yaw;
  player.ch.update(dt, player.speed, 'walk', elapsed);

  // 相机
  head.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
  const cp = player.camPitch;
  const dir = tmpV.set(Math.cos(cp) * fx, -Math.sin(cp), Math.cos(cp) * fz);
  if (state.firstPerson) {
    player.ch.root.visible = false;
    camera.position.copy(head).addScaledVector(dir, 0.15);
    camera.lookAt(camTarget.copy(head).addScaledVector(dir, 10));
  } else {
    player.ch.root.visible = true;
    const ceil = ceilingAt(head.x, head.y, head.z);
    let dist = player.camDist;
    const steps = Math.ceil(dist / 0.25);
    let ok = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps * dist;
      const px = head.x - dir.x * t, py = head.y - dir.y * t, pz = head.z - dir.z * t;
      if (pointBlocked(px, py, pz, 0.2) || py < groundAt(px, pz, py) + 0.25 || py > ceil) break;
      ok = t;
    }
    dist = Math.max(0.6, ok - 0.15);
    camera.position.set(head.x - dir.x * dist, head.y - dir.y * dist, head.z - dir.z * dist);
    camera.lookAt(camTarget.copy(head).addScaledVector(dir, 2));
    player.ch.root.visible = dist > 0.9;
  }
}

/* ---------------- 欣赏模式：电影漫游 ---------------- */
const cine = { on: false, idx: 0, t: 0, from: null, to: null };
const CINE_SHOTS = ['facade', 'judgment', 'kings', 'westrose', 'apse', 'spire', 'nave', 'christopher', 'crossing', 'choir', 'southbelfry', 'gallery', 'terrace', 'parvis', 'greve', 'pontnd', 'palais', 'iles'];
function cineStart() {
  cine.on = true; cine.idx = 0; cine.t = 0;
  cine.from = { p: camera.position.clone(), t: orbit.target.clone() };
  orbit.autoRotate = false; $('btnAuto').classList.remove('on');
  $('btnCine').classList.add('on');
  setShot(0);
}
function setShot(i) {
  const poi = POIS.find(p => p.id === CINE_SHOTS[i % CINE_SHOTS.length]);
  const v = poi.view;
  cine.to = { p: new THREE.Vector3(v[0], v[1], v[2]), t: new THREE.Vector3(v[3], v[4], v[5]) };
  showCaption(poi.name, poi.fr);
}
function cineStop() { cine.on = false; $('btnCine').classList.remove('on'); hideCaption(); }
function updateCine(dt) {
  cine.t += dt;
  const T = 5.5, HOLD = 4.0;
  const k = Math.min(1, cine.t / T);
  const e = k * k * (3 - 2 * k);
  // 过渡：两次镜头之间先拉高再落下
  const lift = Math.sin(Math.PI * e) * Math.min(40, cine.from.p.distanceTo(cine.to.p) * 0.25);
  camera.position.lerpVectors(cine.from.p, cine.to.p, e); camera.position.y += lift;
  orbit.target.lerpVectors(cine.from.t, cine.to.t, e);
  if (k >= 1) {
    // 停留时缓慢推镜
    const h = cine.t - T;
    camera.position.lerp(orbit.target, 0.0025);
    if (h > HOLD) {
      cine.from = { p: camera.position.clone(), t: orbit.target.clone() };
      cine.idx++; cine.t = 0;
      setShot(cine.idx);
    }
  }
  camera.lookAt(orbit.target);
}

/* ---------------- 模式切换 ---------------- */
function setMode(mode) {
  state.mode = mode;
  if (mode === 'tour') {
    orbit.enabled = false;
    cineStop();
    $('tourUI').classList.remove('hidden');
    $('admireUI').classList.add('hidden');
    $('mSwitch').textContent = '切换到欣赏模式';
    player.ch.root.visible = true;
    if (player.pos.y === 0 && player.pos.x === -46) teleport(-46, 0, 1, 0);
  } else {
    orbit.enabled = true;
    $('tourUI').classList.add('hidden');
    $('admireUI').classList.remove('hidden');
    $('mSwitch').textContent = '切换到漫步游览';
    $('interact').innerHTML = '';
    camera.position.set(-110, 45, -85);
    orbit.target.set(45, 24, 0);
    orbit.autoRotate = true; orbit.autoRotateSpeed = 0.35;
    $('btnAuto').classList.add('on');
  }
}

/* ---------------- 交互点 ---------------- */
const NB = { x: 11.2, z: -10.4 }, SB = { x: 12, z: 18.5 };
const interactions = [
  { at: [8, P.FL, -14.5], r: 3.2, acts: [['↑ 登上北钟楼', () => goTo(NB.x, P.BELFRY_FLOOR, NB.z, 0, '北钟楼')]] },
  { at: [8, P.FL, 14.5], r: 3.2, acts: [['↑ 登上南钟楼（大钟玛丽）', () => goTo(SB.x, P.BELFRY_FLOOR, SB.z, Math.PI * 0.75, '南钟楼')]] },
  { at: [7.5, P.BELFRY_FLOOR, -13.4], r: 7.5, acts: [
    ['阅读墙上刻字 ἈΝΆΓΚΗ', () => showPOI('ananke', false)],
    ['↑ 登上塔顶平台', () => goTo(7, P.TOWER_TOP, -13, Math.PI * 0.6, '北塔塔顶')],
    ['→ 双塔之间的长廊', () => goTo(0.8, P.CHIM_Y, 0, Math.PI, '双塔长廊')],
    ['↓ 下到教堂', () => goTo(8, P.FL, -12, 0, '中殿')]] },
  { at: [7.5, P.BELFRY_FLOOR, 13.4], r: 7.5, acts: [
    ['🔔 敲响大钟', () => ringBells()],
    ['↑ 登上塔顶平台', () => goTo(7, P.TOWER_TOP, 13, Math.PI * 0.85, '南塔塔顶')],
    ['→ 双塔之间的长廊', () => goTo(0.8, P.CHIM_Y, 0, Math.PI, '双塔长廊')],
    ['↓ 下到教堂', () => goTo(8, P.FL, 12, 0, '中殿')]] },
  { at: [7, P.TOWER_TOP, -13], r: 9, acts: [['↓ 回到北钟楼', () => goTo(NB.x, P.BELFRY_FLOOR, NB.z, 0, '北钟楼')]] },
  { at: [7, P.TOWER_TOP, 13], r: 9, acts: [['↓ 回到南钟楼', () => goTo(SB.x, P.BELFRY_FLOOR, SB.z, Math.PI * 0.75, '南钟楼')]] },
  { at: [0.8, P.CHIM_Y, 0], r: 6, acts: [['← 北钟楼', () => goTo(NB.x, P.BELFRY_FLOOR, NB.z, 0, '北钟楼')], ['→ 南钟楼', () => goTo(SB.x, P.BELFRY_FLOOR, SB.z, Math.PI * 0.75, '南钟楼')]] },
  { at: [-38, 0, -247], r: 5, acts: [['隔窗窥看“老鼠洞”', () => showPOI('rathole', false)]] },
  { at: [-5, 0, -280], r: 6, acts: [['了解：耻辱柱', () => showPOI('pilori', false)]] },
  { at: [-30, 0, 6], r: 7, acts: [['了解：爱斯梅拉达', () => showPOI('parvis', false)]] },
  { at: [17.5, P.FL, 3], r: 4, acts: [['了解：圣克里斯托夫巨像', () => showPOI('christopher', false)]] },
  { at: [-10, 0, -19], r: 4, acts: [['了解：弃婴床与卡西莫多', () => showPOI('stjean', false)]] },
];
function goTo(x, y, z, yaw, label) {
  fade(() => { teleport(x, y, z, yaw); if (label) showToast(label); });
}
function ringBells() {
  world.ringBells(1);
  showToast('卡西莫多扑向钟绳——“玛丽”轰然作响！');
}
let lastInteractKey = '';
function updateInteractions() {
  const p = player.pos;
  const acts = [];
  for (const it of interactions) {
    if (Math.abs(p.y - it.at[1]) > 2.5) continue;
    if (Math.hypot(p.x - it.at[0], p.z - it.at[2]) < it.r) acts.push(...it.acts);
  }
  const key = acts.map(a => a[0]).join('|');
  if (key !== lastInteractKey) {
    lastInteractKey = key;
    const box = $('interact');
    box.innerHTML = '';
    acts.forEach(([label, fn], i) => {
      const b = document.createElement('button');
      b.textContent = label + (i === 0 && !isTouch ? '  [E]' : '');
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      box.appendChild(b);
    });
    state.firstAction = acts[0] ? acts[0][1] : null;
  }
}

/* ---------------- 界面 ---------------- */
function showToast(t) {
  const el = $('toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(showToast.h); showToast.h = setTimeout(() => el.classList.remove('show'), 2600);
}
function showCaption(title, sub) {
  const c = $('caption'); c.innerHTML = `<b>${title}</b>${sub || ''}`; c.classList.add('show');
}
function hideCaption() { $('caption').classList.remove('show'); }
function fade(fn) {
  const el = $('c');
  el.style.transition = 'opacity 0.25s'; el.style.opacity = '0';
  setTimeout(() => { fn(); el.style.opacity = '1'; }, 260);
}
function closePanels() { ['poiPanel', 'timePanel', 'menuPanel'].forEach(id => $(id).classList.add('hidden')); }
function togglePanel(id) { const was = $(id).classList.contains('hidden'); closePanels(); if (was) $(id).classList.remove('hidden'); }

function showPOI(id, travel = true) {
  const poi = POIS.find(p => p.id === id);
  if (!poi) return;
  $('infoTitle').textContent = poi.name;
  $('infoFr').textContent = poi.fr;
  $('infoText').textContent = poi.text;
  $('infoQuote').textContent = poi.quote || '';
  const btns = $('infoBtns'); btns.innerHTML = '';
  if (travel) {
    if (poi.pos && state.mode === 'tour') {
      const b = document.createElement('button'); b.textContent = '前往此处';
      b.onclick = () => { $('info').classList.add('hidden'); goTo(poi.pos[0], poi.pos[1], poi.pos[2], poi.yaw, poi.name); };
      btns.appendChild(b);
    }
    const v = document.createElement('button'); v.textContent = state.mode === 'tour' ? '以欣赏视角观看' : '飞往此视角';
    v.onclick = () => { $('info').classList.add('hidden'); if (state.mode !== 'admire') setMode('admire'); flyTo(poi); };
    btns.appendChild(v);
  }
  $('info').classList.remove('hidden');
}
function flyTo(poi) {
  orbit.autoRotate = false; $('btnAuto').classList.remove('on');
  cine.on = true; cine.idx = 0; cine.t = 0;
  cine.from = { p: camera.position.clone(), t: orbit.target.clone() };
  const v = poi.view;
  cine.to = { p: new THREE.Vector3(v[0], v[1], v[2]), t: new THREE.Vector3(v[3], v[4], v[5]) };
  cine.single = true;
  showCaption(poi.name, poi.fr);
  setTimeout(hideCaption, 5000);
}

function setupUI() {
  // 地点列表
  const list = $('poiList');
  let group = '';
  for (const p of POIS) {
    if (p.group !== group) { group = p.group; const g = document.createElement('div'); g.className = 'poi-group'; g.textContent = group; list.appendChild(g); }
    const b = document.createElement('button'); b.className = 'poi';
    b.innerHTML = `<b>${p.name}</b><i>${p.fr}</i>`;
    b.onclick = () => { closePanels(); showPOI(p.id); };
    list.appendChild(b);
  }
  $('btnPOI').onclick = () => togglePanel('poiPanel');
  $('btnTime').onclick = () => togglePanel('timePanel');
  $('btnMenu').onclick = () => togglePanel('menuPanel');
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));
  $('infoClose').onclick = () => $('info').classList.add('hidden');
  $('btnPhoto').onclick = () => { state.uiHidden = true; $('hud').classList.add('hidden'); closePanels(); $('info').classList.add('hidden'); $('btnShowUI').classList.remove('hidden'); };
  $('btnShowUI').onclick = () => { state.uiHidden = false; $('hud').classList.remove('hidden'); $('btnShowUI').classList.add('hidden'); };
  // 时间
  const slider = $('timeSlider');
  slider.oninput = () => { sky.hour = +slider.value; };
  document.querySelectorAll('#timePanel [data-h]').forEach(b => b.onclick = () => { sky.hour = +b.dataset.h; slider.value = sky.hour; });
  document.querySelectorAll('#seasonBtns [data-s]').forEach(b => b.onclick = () => {
    document.querySelectorAll('#seasonBtns button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); sky.season = b.dataset.s; showToast(SEASONS[sky.season].name);
  });
  $('timeFlow').onchange = (e) => { state.timeFlow = e.target.checked; };
  // 菜单
  $('mSwitch').onclick = () => { closePanels(); setMode(state.mode === 'tour' ? 'admire' : 'tour'); };
  $('mSound').onclick = () => { state.muted = !state.muted; audio.setMuted(state.muted); $('mSound').textContent = '声音：' + (state.muted ? '关' : '开'); };
  $('mHelp').onclick = () => {
    closePanels();
    $('infoTitle').textContent = '操作说明'; $('infoFr').textContent = 'Comment jouer';
    $('infoText').innerHTML = isTouch
      ? '左下方任意位置按住拖动：虚拟摇杆移动（推到底即奔跑）<br>右侧滑动：转动视角；双指捏合：拉近/拉远<br>“视角”按钮：第一/第三人称切换<br>靠近钟楼楼梯、大钟、刻字、老鼠洞等处会出现互动按钮<br>“地点”：名胜导览与快速传送；右上小地图：点击打开大地图'
      : 'WASD / 方向键：移动　Shift：奔跑　空格：跳跃<br>按住鼠标拖动：转动视角　滚轮：缩放<br>E：互动　F：切换第一/第三人称　M：地图<br>“地点”：名胜导览与快速传送';
    $('infoQuote').textContent = ''; $('infoBtns').innerHTML = '';
    $('info').classList.remove('hidden');
  };
  $('mAbout').onclick = () => {
    closePanels();
    $('infoTitle').textContent = '关于本作'; $('infoFr').textContent = 'Notre-Dame de Paris, 1482';
    $('infoText').innerHTML = '场景依据雨果《巴黎圣母院》（1831）第三卷《圣母院》《巴黎鸟瞰》等章节，以及大教堂的实测尺寸（全长约 128 米、宽 48 米、钟楼高 69 米、中殿拱顶约 33 米、西玫瑰窗直径约 9.6 米、南北玫瑰窗约 13 米）复原 1482 年的状态：<br>· 西立面前的十一级台阶、门洞大型雕像与列王廊彩绘王像（1793 年被毁）<br>· 约 1250 年的中世纪尖塔（1786 年拆除，并非今日维奥莱-勒-杜克的尖塔）<br>· 祭坛屏、圣克里斯托夫巨像、燕巢式管风琴、堆满圣髑盒的哥特祭坛<br>· 1482 年尚无 19 世纪的“怪兽长廊”石像，只有中世纪滴水兽<br>周边：主宫医院、圣约翰圆堂、小桥与小夏特莱、圣母桥（1413 年木桥）、钱币兑换桥与大夏特莱、河滩广场（柱屋、耻辱柱、绞刑架、罗兰塔“老鼠洞”）、西岱宫与圣礼拜堂、牛岛与圣母岛草地、腓力·奥古斯都城墙、卢浮宫与巴士底。<br>所有模型、纹理与声音均为程序化实时生成。';
    $('infoQuote').textContent = '“建筑是用石头写成的书。”'; $('infoBtns').innerHTML = '';
    $('info').classList.remove('hidden');
  };
  // 行动按钮
  const tapBtn = (id, fn) => { const el = $(id); el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false }); el.addEventListener('click', fn); };
  tapBtn('btnJump', () => { input.jump = true; });
  tapBtn('btnCam', () => { state.firstPerson = !state.firstPerson; $('btnCam').textContent = state.firstPerson ? '第一' : '视角'; showToast(state.firstPerson ? '第一人称' : '第三人称'); });
  tapBtn('btnRun', () => { state.runToggle = !state.runToggle; $('btnRun').classList.toggle('on', state.runToggle); });
  $('btnAuto').onclick = () => { cineStop(); orbit.autoRotate = !orbit.autoRotate; $('btnAuto').classList.toggle('on', orbit.autoRotate); };
  $('btnCine').onclick = () => { if (cine.on && !cine.single) cineStop(); else { cine.single = false; cineStart(); } };
  $('btnToTour').onclick = () => setMode('tour');
  orbit.addEventListener('start', () => { if (cine.on) cineStop(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyE' && state.firstAction) state.firstAction();
    if (e.code === 'KeyF' && state.mode === 'tour') $('btnCam').click();
    if (e.code === 'KeyM') openMap();
  });
  // 地图
  drawMapBase();
  $('minimap').addEventListener('click', openMap);
  $('minimap').addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); openMap(); });
  $('minimap').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  $('mapClose').onclick = () => $('mapOverlay').classList.add('hidden');
  $('bigmap').addEventListener('click', onMapClick);
  // 阻止面板上的触摸穿透到画布
  ['poiPanel', 'timePanel', 'menuPanel', 'info', 'mapOverlay'].forEach(id => $(id).addEventListener('touchstart', e => e.stopPropagation(), { passive: true }));
  // 钟声
  world.onBellStrike = (bl) => {
    const f = bl.name === 'Marie' ? 98 : bl.name === 'Jacqueline' ? 123 : 230 + (bl.R < 0.6 ? 120 : 40) * (1 + bl.freq);
    audio.bell(f, bl.R > 1 ? 0.9 : 0.35, camera.position.distanceTo(bl.pos));
  };
}

/* ---------------- 地图 ---------------- */
const MAP = { x0: -820, x1: 780, z0: -420, z1: 260 };
let mapBase = null;
function drawMapBase() {
  const W = 800, H = Math.round(W * (MAP.z1 - MAP.z0) / (MAP.x1 - MAP.x0));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = MAP.x0 + (i / W) * (MAP.x1 - MAP.x0), z = MAP.z0 + (j / H) * (MAP.z1 - MAP.z0);
    const d = landSDF(x, z);
    const k = (j * W + i) * 4;
    if (d > 0) { img.data[k] = 58; img.data[k + 1] = 78; img.data[k + 2] = 92; }
    else { const h = terrainHeight(x, z); img.data[k] = 196 + h; img.data[k + 1] = 180 + h; img.data[k + 2] = 146; }
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const sx = W / (MAP.x1 - MAP.x0), sz = H / (MAP.z1 - MAP.z0);
  const X = x => (x - MAP.x0) * sx, Z = z => (z - MAP.z0) * sz;
  // 建筑轮廓（由碰撞体绘制）
  g.fillStyle = 'rgba(110,84,58,0.85)';
  for (const c of world.colliders) {
    if (c.y1 < 2) continue;
    if (c.t === 'circle') { g.beginPath(); g.arc(X(c.x), Z(c.z), Math.max(1, c.r * sx), 0, Math.PI * 2); g.fill(); continue; }
    g.save(); g.translate(X(c.cx), Z(c.cz)); g.rotate(-Math.atan2(c.s, c.c));
    g.fillRect(-c.hx * sx, -c.hz * sz, c.hx * 2 * sx, c.hz * 2 * sz); g.restore();
  }
  // 圣母院平面
  g.fillStyle = '#5a4630';
  g.fillRect(X(-2), Z(-24), (P.XA + 2) * sx, 48 * sz);
  g.beginPath(); g.arc(X(P.XA), Z(0), 24 * sx, -Math.PI / 2, Math.PI / 2); g.fill();
  g.fillRect(X(57), Z(-27), 14 * sx, 54 * sz);
  g.font = 'bold 13px serif'; g.fillStyle = '#2a1e10'; g.textAlign = 'center';
  const labels = [[50, 40, '巴黎圣母院'], [-500, -140, '西岱宫'], [-545, 4, '圣礼拜堂'], [10, -330, '河滩广场'], [-160, -250, '圣母桥'], [-80, 135, '小夏特莱'], [-400, -305, '大夏特莱'], [-40, 66, '主宫医院'], [520, -110, '牛岛 · 圣母岛'], [-300, 210, '大学区（左岸）'], [-300, -385, '城区（右岸）'], [200, -150, '塞纳河']];
  labels.forEach(([x, z, t]) => { g.fillStyle = 'rgba(255,248,230,0.75)'; g.fillText(t, X(x) + 1, Z(z) + 1); g.fillStyle = '#2a1e10'; g.fillText(t, X(x), Z(z)); });
  mapBase = c;
  MAP.W = W; MAP.H = H; MAP.X = X; MAP.Z = Z;
}
function drawMinimap() {
  const c = $('minimap'), g = c.getContext('2d');
  const S = c.width;
  const scale = 0.9; // 像素/米
  const px = state.mode === 'tour' ? player.pos.x : orbit.target.x, pz = state.mode === 'tour' ? player.pos.z : orbit.target.z;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
  const k = scale * (MAP.x1 - MAP.x0) / MAP.W;
  g.drawImage(mapBase, S / 2 - MAP.X(px) * k, S / 2 - MAP.Z(pz) * k, MAP.W * k, MAP.H * k);
  // 方向箭头
  g.translate(S / 2, S / 2);
  const yaw = state.mode === 'tour' ? player.camYaw : Math.atan2(orbit.target.z - camera.position.z, orbit.target.x - camera.position.x);
  g.rotate(yaw);
  g.fillStyle = '#d82020'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, 10); g.lineTo(-5, 0); g.lineTo(-10, -10); g.closePath(); g.stroke(); g.fill();
  g.restore();
}
function openMap() {
  const c = $('bigmap');
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / MAP.W, vh / MAP.H) * 0.96;
  c.width = MAP.W; c.height = MAP.H;
  c.style.width = MAP.W * s + 'px'; c.style.height = MAP.H * s + 'px';
  const g = c.getContext('2d');
  g.drawImage(mapBase, 0, 0);
  for (const p of POIS) {
    if (!p.pos) continue;
    const x = MAP.X(p.pos[0]), y = MAP.Z(p.pos[2]);
    g.fillStyle = '#d8b25a'; g.strokeStyle = '#2a1e10'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const px = state.mode === 'tour' ? player.pos : orbit.target;
  g.fillStyle = '#d82020'; g.beginPath(); g.arc(MAP.X(px.x), MAP.Z(px.z), 7, 0, Math.PI * 2); g.fill();
  $('mapOverlay').classList.remove('hidden');
}
function onMapClick(e) {
  const c = $('bigmap'); const r = c.getBoundingClientRect();
  const mx = (e.clientX - r.left) / r.width * MAP.W, my = (e.clientY - r.top) / r.height * MAP.H;
  let best = null, bd = 1e9;
  for (const p of POIS) {
    if (!p.pos) continue;
    const d = Math.hypot(MAP.X(p.pos[0]) - mx, MAP.Z(p.pos[2]) - my);
    if (d < bd) { bd = d; best = p; }
  }
  if (best && bd < 30) { $('mapOverlay').classList.add('hidden'); showPOI(best.id); }
}

/* ---------------- 主循环 ---------------- */
let interiorF = 0, lastHour = 0, frames = 0, fpsT = 0, fps = 0, placeT = 0;
const center = new THREE.Vector3();
let cpuAvg = 0;
function loop() {
  const realDt = clock.getDelta();
  const dt = Math.min(0.1, realDt);
  const t0 = performance.now();
  elapsed += dt;
  frames++; fpsT += realDt;
  if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; window.__stats = { fps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; $('stats').textContent = `FPS ${fps.toFixed(0)} · DrawCalls ${renderer.info.render.calls} · 三角面 ${(renderer.info.render.triangles / 1000).toFixed(0)}k`; }

  if (state.timeFlow) { sky.hour += dt / 60; if (sky.hour >= 24) sky.hour -= 20; $('timeSlider').value = sky.hour; }
  if (Math.floor(sky.hour) !== Math.floor(lastHour) && state.timeFlow) { world.ringBells(0.6); }
  lastHour = sky.hour;

  if (state.mode === 'tour') {
    updatePlayer(dt);
    updateInteractions();
    center.copy(player.pos);
  } else {
    if (cine.on) {
      updateCine(dt);
      if (cine.single && cine.t > 5.5) { cine.on = false; cine.single = false; }
    } else orbit.update();
    center.copy(orbit.target);
    if (camera.position.y < terrainHeight(camera.position.x, camera.position.z) + 0.8) camera.position.y = terrainHeight(camera.position.x, camera.position.z) + 0.8;
  }

  // 室内判定（基于相机位置）
  const cp = camera.position;
  const inside = world.interiorZones.some(f => f(cp.x, cp.y, cp.z)) ? 1 : 0;
  interiorF += (inside - interiorF) * Math.min(1, dt * 3);
  // 太阳阴影相机跟随（按纹素对齐以避免闪烁）
  const snap = 2;
  center.set(Math.round(center.x / snap) * snap, 0, Math.round(center.z / snap) * snap);
  const day = sky.update(center, interiorF, mats);
  scene.environmentIntensity = (0.25 + 0.55 * day) * (1 - interiorF * 0.75);
  for (const L of world.lights) L.intensity = L.userData.base * interiorF * (1 - day * 0.55);
  if (world.fireLight) world.fireLight.intensity = (60 + Math.sin(elapsed * 13) * 8) * (1.2 - day);
  if (world.lanternMat) world.lanternMat.opacity = 1 - day;
  if (world.beams) {
    const sunUp = Math.max(0, sky.sunDir.y) * Math.max(0, sky.sunDir.z + 0.3);
    world.beams.userData.mat.opacity = 0.11 * Math.min(1, sunUp * 2.5) * interiorF;
    world.beams.visible = interiorF > 0.02;
  }
  if (world.dust) world.dust.visible = interiorF > 0.05;
  if (world.water) {
    const u = world.water.material.uniforms;
    u.time.value = elapsed;
    u.sunDir.value.copy(sky.sunDir);
    u.sunColor.value.copy(sky.sun.color);
    u.day.value = day;
    u.fogColor.value.copy(scene.fog.color);
    u.fogDensity.value = scene.fog.density;
    u.skyColor.value.setRGB(0.35, 0.5, 0.75).multiplyScalar(0.15 + 0.85 * day);
    u.horizonColor.value.copy(scene.fog.color);
  }
  for (const f of world.animated) f(elapsed, dt);

  // 音频环境
  const nearWater = Math.max(0, 1 - Math.abs(landSDF(cp.x, cp.z) + 2) / 30);
  let crowdNear = 0;
  if (crowd) for (let i = 0; i < crowd.length; i += 4) { const a = crowd[i]; const d = Math.hypot(a.x - cp.x, a.z - cp.z); if (d < 40) crowdNear += (40 - d) / 40; }
  audio.update(dt, { interior: interiorF, river: nearWater, crowd: Math.min(1, crowdNear / 4), height: cp.y, day });

  // 地名与时钟
  placeT -= dt;
  if (placeT < 0) {
    placeT = 0.5;
    const camIn = world.interiorZones.some(f => f(camera.position.x, camera.position.y, camera.position.z));
    $('placeName').textContent = placeName(state.mode === 'tour' ? player.pos : camIn ? camera.position : orbit.target);
    const h = Math.floor(sky.hour), m = Math.floor((sky.hour - h) * 60);
    $('clockText').textContent = `1482 年 · ${SEASONS[sky.season].name.split(' · ')[1]} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    $('timeVal').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (!state.uiHidden) drawMinimap();
  cpuAvg = cpuAvg * 0.95 + (performance.now() - t0) * 0.05;
  window.__cpu = cpuAvg;
  renderer.render(scene, camera);
}

function placeName(p) {
  if (p.y > P.TOWER_TOP - 1) return '钟楼塔顶';
  if (p.y > P.BELFRY_FLOOR - 1 && p.x < 16) return p.z < 0 ? '北钟楼' : '南钟楼';
  if (p.y > P.CHIM_Y - 1 && p.x < 4) return '双塔长廊';
  if (world.interiorZones.some(f => f(p.x, p.y, p.z))) {
    if (p.x < P.NAVE1) return '圣母院 · 中殿';
    if (p.x < P.CROSS1) return '圣母院 · 十字交叉';
    return '圣母院 · 唱诗班';
  }
  let best = '巴黎', bd = 1e9;
  for (const poi of POIS) {
    if (!poi.pos) continue;
    const d = Math.hypot(poi.pos[0] - p.x, poi.pos[2] - p.z);
    if (d < bd) { bd = d; best = poi.name; }
  }
  if (bd < 60) return best;
  if (landSDF(p.x, p.z) > 0) return '塞纳河';
  if (p.z < -232) return '右岸 · 城区';
  if (p.z > 104) return '左岸 · 大学区';
  return '西岱岛';
}
void SKINS; void pointBlocked;
