// 天空、太阳、月亮、星空、雾与环境光照（随时间与季节变化）
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { glowTex } from './textures.js';

const LAT = 48.853 * Math.PI / 180;
export const SEASONS = {
  epiphany: { name: '主显节 · 1月6日', decl: -22.5 },
  spring: { name: '春 · 3月', decl: 2 },
  summer: { name: '夏 · 6月', decl: 23 },
};

export class SkySystem {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.82;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x6b5a44, 0.9);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, 0.0);
    scene.add(this.amb);

    scene.fog = new THREE.FogExp2(0xc8d0d8, 0.0011);

    // 星空
    const N = 2500, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 3500; pos[i * 3 + 1] = Math.cos(ph) * 3500; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 3500;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -1;
    scene.add(this.stars);
    // 月亮
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const mx = mc.getContext('2d');
    const gr = mx.createRadialGradient(64, 64, 20, 64, 64, 64);
    gr.addColorStop(0, 'rgba(240,240,225,1)'); gr.addColorStop(0.42, 'rgba(235,235,220,1)'); gr.addColorStop(0.5, 'rgba(200,210,230,0.25)'); gr.addColorStop(1, 'rgba(160,180,220,0)');
    mx.fillStyle = gr; mx.fillRect(0, 0, 128, 128);
    mx.fillStyle = 'rgba(160,160,150,0.35)';
    [[54, 52, 7], [72, 70, 9], [60, 78, 5], [76, 50, 4]].forEach(([x, y, r]) => { mx.beginPath(); mx.arc(x, y, r, 0, 7); mx.fill(); });
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(170);
    scene.add(this.moon);
    void glowTex;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.envRT = null;

    this.hour = 15.5;
    this.season = 'spring';
    this.sunDir = new THREE.Vector3();
    this.daylight = 1;
    this.interior = 0;
    this.lastEnvKey = '';
  }

  computeSun() {
    const decl = SEASONS[this.season].decl * Math.PI / 180;
    const H = (this.hour - 12) * 15 * Math.PI / 180;
    const el = Math.asin(Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT));
    this.sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    this.elev = el;
    return this.sunDir;
  }

  update(center, interiorFactor = 0, mats = null) {
    const d = this.computeSun();
    const el = this.elev;
    const day = THREE.MathUtils.smoothstep(el, -0.1, 0.12);
    const golden = 1 - THREE.MathUtils.smoothstep(el, 0.05, 0.45);
    this.daylight = day;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(d).multiplyScalar(1000);
    this.envSky.material.uniforms.sunPosition.value.copy(d).multiplyScalar(1000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) this.envSky.material.uniforms[k].value = u[k].value;

    // 太阳光：低角度时偏暖
    const sunCol = new THREE.Color().setRGB(1.0, 0.93 - golden * 0.28, 0.84 - golden * 0.5);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 2.7 * day * (1 - interiorFactor * 0.25);
    // 月光
    const moonDir = d.clone().multiplyScalar(-1);
    if (moonDir.y < 0.25) moonDir.y = 0.25 + (0.25 - moonDir.y) * 0.3;
    moonDir.normalize();
    const lightDir = day > 0.02 ? d : moonDir;
    this.sun.position.copy(center).addScaledVector(lightDir, 300);
    this.sun.target.position.copy(center);
    if (day <= 0.02) { this.sun.color.setRGB(0.55, 0.65, 0.95); this.sun.intensity = 0.35; }

    this.hemi.intensity = (0.12 + 0.6 * day) * (1 - interiorFactor * 0.85);
    this.hemi.color.setRGB(0.62 + 0.15 * day, 0.7 + 0.1 * day, 0.95).lerp(new THREE.Color(1.0, 0.86, 0.66), interiorFactor);
    this.hemi.groundColor.setRGB(0.32 * day + 0.04, 0.27 * day + 0.04, 0.2 * day + 0.06).lerp(new THREE.Color(0.45, 0.36, 0.26), interiorFactor);
    this.amb.intensity = 0.02 + 0.05 * (1 - day);
    this.amb.color.setRGB(0.5, 0.6, 1.0);

    // 雾色：取天空地平线附近的颜色
    const fogDay = new THREE.Color(0xc9d3dc).lerp(new THREE.Color(0xe8b890), golden * 0.6);
    const fogNight = new THREE.Color(0x0d1220);
    this.scene.fog.color.copy(fogNight).lerp(fogDay, day);
    this.scene.fog.density = 0.0009 + golden * 0.0004 + (1 - day) * 0.0004;
    this.starMat.opacity = 1 - THREE.MathUtils.smoothstep(el, -0.15, 0.02);
    this.stars.position.copy(center);
    this.moon.position.copy(center).addScaledVector(moonDir, 3300);
    this.moon.material.opacity = 1 - day * 0.85;
    this.renderer.toneMappingExposure = 0.6 + 0.32 * day + interiorFactor * (0.8 + (1 - day) * 0.5);

    // 彩窗亮度：白天由日光透射
    if (mats) {
      const gl = 0.05 + 0.6 * day;
      for (const k of ['glassIn', 'roseWestIn', 'roseNorthIn', 'roseSouthIn']) mats[k].color.setScalar(gl);
      if (mats.facade.emissiveMap) mats.facade.emissiveIntensity = (1 - day) * 1.4;
      // 夜晚：教堂内的烛光透出彩窗
      for (const k of ['glassOut', 'roseWestOut', 'roseNorthOut', 'roseSouthOut']) mats[k].emissiveIntensity = (1 - day) * 0.35;
    }

    // 环境贴图（仅在时间明显变化时重算）
    const key = Math.round(this.hour * 4) + this.season;
    if (key !== this.lastEnvKey) {
      this.lastEnvKey = key;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.25 + 0.55 * day;
    }
    return day;
  }
}
