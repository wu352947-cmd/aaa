import * as THREE from 'three';
import './atmosphere.js';
import { setMaxAnisotropy } from './textures.js';
import { createMaterials, interiorMaterials } from './materials.js';
import { buildApartment, INTERIOR_LAYER } from './apartment.js';
import { buildFurniture, MIRRORS } from './furniture.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { buildWestLake, LANDMARKS, windUniforms, DETAIL_LAYER } from './westlake.js';
import { Environment, PRESETS } from './env.js';
import { Player } from './player.js';
import { Input, HUD, FloorMap, Landmarks, toast } from './ui.js';
import { roomAt, rooms, spots } from './layout.js';

const $ = (id) => document.getElementById(id);
const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1400);
const params = new URLSearchParams(location.search);
const QUALITY = { low: { pr: 1.0, water: 384 }, mid: { pr: 1.5, water: 512 }, high: { pr: 2.0, water: 1024 } };
let quality = params.get('q') || (isMobile ? 'mid' : 'high');
try { quality = localStorage.getItem('qihu.q') || quality; } catch { /* 私密模式 */ }
if (!QUALITY[quality]) quality = 'mid';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function step(pct, msg) {
  $('loadBar').style.width = pct + '%';
  $('loadStatus').textContent = msg;
  await nextFrame();
}

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].pr));
  const appEl = $('app');
  const viewW = () => appEl.clientWidth || window.innerWidth, viewH = () => appEl.clientHeight || window.innerHeight;
  renderer.setSize(viewW(), viewH());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  $('app').appendChild(renderer.domElement);
  setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(isMobile ? 72 : 66, viewW() / viewH(), 0.1, 12000);
  camera.layers.enable(INTERIOR_LAYER);
  camera.layers.enable(DETAIL_LAYER);
  scene.add(camera);

  await step(6, '正在铺设人字拼橡木地板、打磨爵士白大理石…');
  const M = createMaterials(quality);
  await step(22, '正在砌筑墙体、安装落地窗与窗帘…');
  const apt = buildApartment(scene, M);
  await step(34, '正在摆放家具：岩板餐桌、明式圈椅、古琴…');
  const furn = buildFurniture(scene, M, INTERIOR_LAYER);
  await step(48, '正在生成西湖：湖盆、群山、苏堤与白堤…');
  const lake = buildWestLake(scene, quality);
  await step(70, '正在点亮天光：雷峰夕照…');
  const env = new Environment(renderer, scene, quality);
  // 入户门碰撞
  const colliders = [...apt.colliders, ...furn.colliders, { x1: 2.6, z1: 11.9, x2: 3.9, z2: 12.3, wall: true }];

  const player = new Player(camera, colliders, M);
  scene.add(player.character);

  // 实时镜面反射：只更新离玩家最近、且在视野内的一面镜子，其余保持上一帧画面
  const mirrorRes = quality === 'high' ? 1024 : quality === 'low' ? 384 : 640;
  const mirrors = MIRRORS.map((m) => {
    const geo = m.r ? new THREE.CircleGeometry(m.r, 48) : new THREE.PlaneGeometry(m.w, m.h);
    const ref = new Reflector(geo, { textureWidth: mirrorRes, textureHeight: mirrorRes, color: 0xd2d6d8, clipBias: 0.003, multisample: quality === 'low' ? 0 : 4 });
    ref.position.set(m.x, m.y, m.z);
    ref.rotation.y = m.ry;
    ref.layers.set(INTERIOR_LAYER);
    ref.camera.layers.enable(INTERIOR_LAYER);
    ref.camera.layers.enable(DETAIL_LAYER);
    const draw = ref.onBeforeRender;
    ref.onBeforeRender = (r, sc, cam) => {
      if (ref !== activeMirror || cam !== camera) return;
      const vis = player.character.visible;
      player.character.visible = true; // 镜中能看到自己
      if (player.mode === 'first') { player.character.position.set(player.pos.x, player.pos.y < 0 ? -0.02 : 0, player.pos.y); player.character.rotation.y = player.yaw + Math.PI; }
      draw.call(ref, r, sc, cam);
      player.character.visible = vis;
    };
    ref.updateMatrixWorld();
    scene.add(ref);
    return ref;
  });
  let activeMirror = null, mirrorTick = 0;
  const _mv = new THREE.Vector3(), _mn = new THREE.Vector3(), _mp = new THREE.Vector3();
  function pickMirror() {
    // 视野内 8 米以内的镜子轮流刷新（每帧只多渲染一次场景）
    const cand = [];
    for (const m of mirrors) {
      _mv.subVectors(camera.position, m.position);
      const d = _mv.length();
      _mn.set(0, 0, 1).applyQuaternion(m.quaternion);
      if (d > 8 || _mv.dot(_mn) <= 0) continue; // 在镜子背面
      _mp.copy(m.position).project(camera);
      if (_mp.z > 1 || Math.abs(_mp.x) > 1.3 || Math.abs(_mp.y) > 1.3) continue;
      cand.push(m);
    }
    activeMirror = cand.length ? cand[mirrorTick++ % cand.length] : null;
  }
  const s0 = spots.living;
  player.teleport(s0.x, s0.z, s0.yaw);

  // 室内补光（白天模拟窗口漫反射，夜晚为室内暖光）
  const fills = [
    { day: [0.5, 1.1, 1.4], night: [0.0, 2.6, 3.0], room: 'living' },
    { day: [-8.0, 1.1, 1.4], night: [-8.0, 2.6, 3.0], room: 'master' },
    { day: [8.5, 1.1, 1.4], night: [8.5, 2.5, 3.0], room: 'bed2' },
    { day: [-2.0, 1.6, 7.5], night: [-2.0, 2.2, 8.9], room: 'dining' },
    { day: [7.0, 1.6, 9.0], night: [7.0, 2.4, 9.0], room: 'kitchen' },
  ].map((f) => {
    const l = new THREE.PointLight(0xffffff, 0, 11, 2);
    scene.add(l);
    return { ...f, light: l };
  });

  // 环境光照：先用天空，再在客厅中央采集一次室内光照探针
  const probeRT = new THREE.WebGLCubeRenderTarget(quality === 'low' ? 128 : 256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.1, 12000, probeRT);
  cubeCam.layers.enable(INTERIOR_LAYER);
  cubeCam.children.forEach((c) => c.layers.enable(INTERIOR_LAYER));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let probeEnv = null;
  let lightsOn = false;

  function applyLights(on, preset) {
    lightsOn = on;
    const night = !!PRESETS[preset].night;
    const k = on ? 1 : 0;
    M.lightStrip.emissiveIntensity = on ? 2.4 : 0.0;
    M.downlight.emissiveIntensity = on ? 3.0 : 0.15;
    M.lampShade.emissiveIntensity = on ? 1.1 : 0;
    M.paperLantern.emissiveIntensity = on ? 1.3 : 0;
    M.coveGlow.opacity = on ? (night ? 0.5 : 0.25) : 0;
    for (const f of fills) {
      const p = on ? f.night : f.day;
      f.light.position.set(...p);
      if (on) { f.light.color.set(0xffd2a0); f.light.intensity = night ? 5.5 : 3.0; f.light.distance = 9; }
      else {
        const pr = PRESETS[preset];
        f.light.color.setRGB(...pr.sun).lerp(new THREE.Color(pr.hemiSky), 0.6);
        f.light.intensity = f.room === 'dining' || f.room === 'kitchen' ? 1.0 : 2.2;
        f.light.distance = 10;
      }
    }
    const L = lake.M;
    L.lampGlass.emissiveIntensity = night ? 2.2 : 0;
    L.pagodaGlow.emissiveIntensity = night ? 3.5 : 0;
    L.windowWarm.emissiveIntensity = night ? 1.6 : 0;
    L.lantern.emissiveIntensity = night ? 2.0 : 0.2;
    L.shoreLights.opacity = night ? 1 : 0;
    for (const [m, c, k] of [[L.pagodaWall, 0xffb054, 0.55], [L.pagodaRoof, 0xffa040, 0.25], [L.pagodaRed, 0xff7a3a, 0.5], [L.pagodaGold, 0xffc060, 0.5], [L.pagodaBrick, 0xffc27a, 0.35]]) {
      m.emissive.set(c); m.emissiveIntensity = night ? k : 0;
    }
    L.cityWindows.emissive.set(night ? 0xffffff : 0x000000);
    L.cityWindows.emissiveIntensity = night ? 0.9 : 0;
    lake.water.material.uniforms.nightLights.value = night ? 1 : 0;
    void k;
  }

  function captureProbe() {
    const wasVis = player.character.visible;
    player.character.visible = false;
    lake.water.enabled = false;
    lake.group.visible = true;
    const am = activeMirror; activeMirror = null;
    cubeCam.position.set(0.5, 1.45, 3.2);
    cubeCam.update(renderer, scene);
    lake.water.enabled = true;
    player.character.visible = wasVis;
    activeMirror = am;
    if (probeEnv) probeEnv.dispose();
    probeEnv = pmrem.fromCubemap(probeRT.texture);
    for (const m of interiorMaterials) { m.envMap = probeEnv.texture; }
  }

  let presetName = 'sunset';
  function setPreset(name) {
    presetName = name;
    const p = env.setPreset(name, {
      onEnv: (tex, pr) => {
        for (const m of interiorMaterials) {
          const first = !m.envMap;
          m.envMap = tex;
          m.envMapIntensity = pr.env;
          if (first) m.needsUpdate = true;
        }
        // 远山受天光较弱（逆光时呈剪影）
        const tm = lake.terrain.mesh.material;
        const firstT = !tm.envMap;
        tm.envMap = tex; tm.envMapIntensity = pr.night ? 0.25 : 0.38;
        if (firstT) tm.needsUpdate = true;
      },
    });
    const w = lake.water.material.uniforms;
    w.sunColor.value.setRGB(...p.sun).multiplyScalar(p.night ? 0.3 : 1.0);
    w.waterColor.value.set(p.water); w.deepColor.value.set(p.deep);
    w.skyColor.value.set(p.hemiSky);
    applyLights(p.night || name === 'sunset' ? true : false, name);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    captureProbe();
    for (const m of interiorMaterials) m.envMapIntensity = p.night ? 0.9 : 1.0;
    M.ceiling.envMapIntensity = 1.7; M.wall.envMapIntensity = 1.25; M.wallWarm.envMapIntensity = 1.2;
    $('bTime').textContent = p.label;
    $('bLight').classList.toggle('on', lightsOn);
  }

  await step(84, '正在编译着色器…');
  setPreset('sunset');
  renderer.compile(scene, camera);
  await step(96, '准备就绪');

  // UI
  const input = new Input(player);
  const hud = new HUD();
  const fmap = new FloorMap((id) => {
    const s = spots[id];
    if (s) player.teleport(s.x, s.z, s.yaw);
    $('map').hidden = true;
  });
  const landmarks = new Landmarks(Object.values(LANDMARKS));
  const order = ['sunset', 'night', 'morning', 'noon'];
  $('bTime').addEventListener('click', () => {
    const n = order[(order.indexOf(presetName) + 1) % order.length];
    setPreset(n);
    toast(`时段：${PRESETS[n].label}`);
  });
  $('bLight').addEventListener('click', () => {
    applyLights(!lightsOn, presetName);
    renderer.render(scene, camera);
    captureProbe();
    $('bLight').classList.toggle('on', lightsOn);
    toast(lightsOn ? '室内灯光已开启' : '室内灯光已关闭');
  });
  $('bView').addEventListener('click', () => {
    player.setMode(player.mode === 'first' ? 'third' : 'first');
    $('bView').textContent = player.mode === 'first' ? '第一人称' : '第三人称';
  });
  $('bLabel').classList.add('on');
  $('bLabel').addEventListener('click', () => { landmarks.on = !landmarks.on; $('bLabel').classList.toggle('on', landmarks.on); });
  $('bMap').addEventListener('click', () => { $('map').hidden = !$('map').hidden; $('settings').hidden = true; });
  $('mapClose').addEventListener('click', () => ($('map').hidden = true));
  $('bSet').addEventListener('click', () => { $('settings').hidden = !$('settings').hidden; $('map').hidden = true; });
  const segBtns = [...document.querySelectorAll('#qSeg .btn')];
  const markQ = () => segBtns.forEach((b) => b.classList.toggle('on', b.dataset.q === quality));
  markQ();
  segBtns.forEach((b) => b.addEventListener('click', () => {
    quality = b.dataset.q;
    try { localStorage.setItem('qihu.q', quality); } catch { /* ignore */ }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].pr));
    lake.water.renderTarget.setSize(QUALITY[quality].water, QUALITY[quality].water);
    lake.water.frameSkip = quality === 'low' ? 1 : 0;
    markQ();
  }));
  $('sens').addEventListener('input', (e) => (input.sens = parseFloat(e.target.value)));
  $('bFull').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape').catch(() => {}); }
      else await document.exitFullscreen();
    } catch { toast('当前浏览器不支持全屏'); }
  });

  // 尺寸自适应：容器尺寸变化（平板旋转、预览窗口展开、全屏切换等）时同步画布
  let lastW = 0, lastH = 0;
  function syncSize() {
    const w = viewW(), h = viewH();
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', syncSize);
  window.visualViewport?.addEventListener('resize', syncSize);
  if (window.ResizeObserver) new ResizeObserver(syncSize).observe(appEl);
  syncSize();

  // 进入
  $('loadBar').style.width = '100%';
  $('loadStatus').textContent = '已就绪';
  $('enter').hidden = false;
  const enter = () => {
    $('loader').style.opacity = '0';
    setTimeout(() => $('loader').remove(), 900);
    toast('左侧拖动行走 · 右侧滑动环顾 · 走近门扇会自动打开', 5200);
  };
  $('enter').addEventListener('click', enter, { once: true });
  if (params.has('auto')) enter();
  if (params.has('nohud')) document.querySelectorAll('.hud,#labels').forEach((e) => (e.style.display = 'none'));

  // 湖景可见性：在看不到前立面落地窗的房间里，跳过西湖整组的渲染（含水面反射）
  const facadePts = [];
  for (let x = -11.5; x <= 11.5; x += 1.15) for (const y of [0.6, 2.4]) facadePts.push(new THREE.Vector3(x, y, 0.12));
  const _v = new THREE.Vector3();
  let lakeHold = 0;
  function lakeVisible() {
    if (player.pos.y < 0.5 || player.mode === 'third') return true;
    const cx = camera.position.x, cz = camera.position.z;
    for (const p of facadePts) {
      _v.copy(p).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      const hit = player.raycast(cx, cz, dx / d, dz / d, d - 0.3);
      if (hit === null) return true;
    }
    return false;
  }

  // 主循环
  const clock = new THREE.Clock();
  let t = 0, fpsAcc = 0, fpsN = 0, shadowTimer = 0, mapTimer = 0;
  window.__qihu = { scene, camera, renderer, player, setPreset, applyLights, rooms, lake, env, doors: apt.doors };
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    input.update(dt);
    player.update(dt, t);
    // 门：靠近自动开启
    let doorMoving = false;
    for (const d of apt.doors) {
      const dist = Math.hypot(player.pos.x - d.x, player.pos.y - d.z);
      d.target = dist < 1.7 ? 1 : 0;
      const prev = d.open;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 1.6);
      if (d.open !== prev) { doorMoving = true; const e = d.open * d.open * (3 - 2 * d.open); d.pivot.rotation.y = d.sign * e * Math.PI * 0.5; }
    }
    shadowTimer += dt;
    if (doorMoving && shadowTimer > 0.15) { renderer.shadowMap.needsUpdate = true; shadowTimer = 0; }
    env.update(t, camera);
    windUniforms.uTime.value = t;
    lake.water.material.uniforms.time.value = t;
    for (const f of lake.dynamic) f(t, dt);
    const r = roomAt(player.pos.x, player.pos.y);
    if (r) { hud.setRoom(r); fmap.curRoom = r.id; }
    hud.setYaw(player.yaw);
    landmarks.update(camera, lastW, lastH, (p) => {
      if (!lake.group.visible) return true;
      const cx = camera.position.x, cz = camera.position.z, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      return player.raycast(cx, cz, dx / d, dz / d, 40, true) !== null;
    });
    mapTimer += dt;
    if (!$('map').hidden && mapTimer > 0.2) { fmap.draw(player); mapTimer = 0; }
    if (lakeVisible()) lakeHold = 0.4; else lakeHold -= dt;
    lake.group.visible = lakeHold > 0;
    syncSize();
    pickMirror();
    renderer.render(scene, camera);
    fpsAcc += dt; fpsN++;
    // 自适应分辨率：持续低帧率时降低像素比，帧率充裕时恢复
    if (fpsAcc > 1 && !still) {
      const fps = fpsN / fpsAcc;
      const maxPr = Math.min(window.devicePixelRatio, QUALITY[quality].pr);
      const pr = renderer.getPixelRatio();
      if (fps < 26 && pr > 0.7) renderer.setPixelRatio(Math.max(0.7, pr - 0.15));
      else if (fps > 52 && pr < maxPr) renderer.setPixelRatio(Math.min(maxPr, pr + 0.1));
    }
    if (fpsAcc > 1) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k 三角面`; fpsAcc = 0; fpsN = 0; }
    if (!still) requestAnimationFrame(frame);
  }
  const still = params.has('still');
  window.__qihu.frame = () => { clock.getDelta(); frame(); };
  fmap.draw(player);
  frame();
}

init().catch((e) => {
  console.error(e);
  $('loadStatus').textContent = '加载失败：' + (e && e.message ? e.message : e);
});
