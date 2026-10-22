// 天空、日光、雾、云层、星空与时间段（晨 / 午 / 夕照 / 夜）
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { setFogSun } from './atmosphere.js';

const deg = Math.PI / 180;

export const PRESETS = {
  morning: {
    label: '晨雾', bearing: 105, elev: 13, turbidity: 6, rayleigh: 1.6, mie: 0.006, mieG: 0.8,
    sun: [1.0, 0.86, 0.72], sunI: 2.4, hemiSky: 0xc4d2df, hemiGround: 0x5c6450, hemiI: 0.55,
    fog: 0xc2cad0, fogSun: 0xf0e0c8, fogD: 0.00042, exposure: 0.62, env: 0.55, cloud: [0.98, 0.95, 0.92], cloudShade: [0.7, 0.74, 0.8], cover: 0.5,
    water: 0x3c574a, deep: 0x2c4238,
  },
  noon: {
    label: '晴午', bearing: 195, elev: 58, turbidity: 3.2, rayleigh: 1.0, mie: 0.004, mieG: 0.8,
    sun: [1.0, 0.97, 0.92], sunI: 3.2, hemiSky: 0xbfd6ee, hemiGround: 0x6a6f58, hemiI: 0.6,
    fog: 0xb0bfcc, fogSun: 0xd6dce0, fogD: 0.00028, exposure: 0.5, env: 0.6, cloud: [1, 1, 1], cloudShade: [0.72, 0.78, 0.86], cover: 0.55,
    water: 0x3b5a4b, deep: 0x2a4238,
  },
  sunset: {
    label: '雷峰夕照', bearing: 252, elev: 7, turbidity: 7.5, rayleigh: 2.4, mie: 0.007, mieG: 0.88,
    sun: [1.0, 0.64, 0.36], sunI: 2.9, hemiSky: 0xa8aebd, hemiGround: 0x4a4640, hemiI: 0.42,
    fog: 0x8e97a6, fogSun: 0xd9b996, fogD: 0.00036, exposure: 0.6, env: 0.5, cloud: [1.0, 0.72, 0.5], cloudShade: [0.55, 0.45, 0.5], cover: 0.5,
    water: 0x3d4a3e, deep: 0x2a3330,
  },
  night: {
    label: '湖畔夜色', bearing: 230, elev: 32, night: true,
    sun: [0.6, 0.7, 0.95], sunI: 0.12, hemiSky: 0x24304a, hemiGround: 0x0e1012, hemiI: 0.25,
    fog: 0x121824, fogSun: 0x1a2030, fogD: 0.00036, exposure: 0.85, env: 0.35, cloud: [0.18, 0.2, 0.26], cloudShade: [0.08, 0.09, 0.12], cover: 0.58,
    water: 0x0c1412, deep: 0x080d0c,
  },
};

const cloudVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const cloudFrag = /* glsl */`
  uniform float time; uniform vec3 sunDir; uniform vec3 litColor; uniform vec3 shadeColor; uniform float coverage; uniform vec3 camPos;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += noise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  void main() {
    vec2 p = vWorld.xz / 2600.0 + vec2(time * 0.0016, time * 0.0007);
    float n = fbm(p * vec2(1.0, 2.2));
    float c = smoothstep(coverage, coverage + 0.28, n);
    float d = length(vWorld.xz - camPos.xz);
    float fade = 1.0 - smoothstep(3500.0, 9000.0, d);
    float thick = fbm(p * 3.1 + 4.0);
    vec3 V = normalize(vWorld - camPos);
    float glow = pow(max(dot(V, sunDir), 0.0), 6.0);
    vec3 col = mix(shadeColor, litColor, smoothstep(0.25, 0.75, thick) * 0.7 + 0.3) + litColor * glow * 0.6;
    gl_FragColor = vec4(col, c * fade * 0.85);
  }`;

const nightVert = /* glsl */`
  varying vec3 vWorld;
  void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }`;
const nightFrag = /* glsl */`
  uniform vec3 moonDir; uniform vec3 camPos;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vWorld - camPos);
    float h = clamp(d.y, -0.2, 1.0);
    vec3 zenith = vec3(0.012, 0.02, 0.05), horizon = vec3(0.09, 0.11, 0.17);
    vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.45));
    // 城市光污染（东侧 +Z）
    col += vec3(0.16, 0.09, 0.04) * pow(1.0 - abs(h), 10.0) * (0.4 + 0.6 * max(d.z, 0.0));
    // 星星
    vec2 sp = vec2(atan(d.z, d.x) * 260.0, asin(clamp(d.y, -1.0, 1.0)) * 260.0);
    vec2 cell = floor(sp);
    float s = hash(cell);
    float tw = step(0.9965, s) * smoothstep(0.04, 0.4, h) * (0.5 + 0.5 * hash(cell + 3.1));
    vec2 f = fract(sp) - 0.5;
    col += vec3(0.9, 0.92, 1.0) * tw * smoothstep(0.35, 0.0, length(f)) * 1.4;
    // 月亮与月晕
    float m = dot(d, moonDir);
    col += vec3(1.0, 0.97, 0.88) * smoothstep(0.99955, 0.9997, m) * 3.0;
    col += vec3(0.25, 0.28, 0.36) * pow(max(m, 0.0), 60.0) * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.sunDir = new THREE.Vector3();
    this.preset = null;

    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.night = new THREE.Mesh(new THREE.SphereGeometry(8800, 32, 16), new THREE.ShaderMaterial({
      vertexShader: nightVert, fragmentShader: nightFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { moonDir: { value: new THREE.Vector3(0, 1, 0) }, camPos: { value: new THREE.Vector3() } },
    }));
    this.night.frustumCulled = false;
    this.night.visible = false;
    scene.add(this.night);

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 }, sunDir: { value: this.sunDir }, litColor: { value: new THREE.Color() }, shadeColor: { value: new THREE.Color() },
        coverage: { value: 0.5 }, camPos: { value: new THREE.Vector3() },
      },
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 1300;
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -2;
    scene.add(this.clouds);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const ss = quality === 'high' ? 2048 : 1536;
    this.sun.shadow.mapSize.set(ss, ss);
    const cam = this.sun.shadow.camera;
    cam.left = -15; cam.right = 15; cam.top = 15; cam.bottom = -15; cam.near = 1; cam.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.sun.target.position.set(0, 1.5, 4.5);
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xcccccc, 0.0003);

    // 环境光照贴图（PMREM）
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    this.envSky.scale.setScalar(50);
    this.envNight = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), this.night.material);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(80, 32), new THREE.MeshBasicMaterial({ color: 0x3a4236 }));
    this.envGround.rotation.x = -Math.PI / 2;
    this.envGround.position.y = -3;
    this.envScene.add(this.envSky, this.envNight, this.envGround);
    this.envRT = null;
  }

  setPreset(name, { onEnv } = {}) {
    const p = PRESETS[name];
    this.preset = name;
    const b = p.bearing * deg, e = p.elev * deg;
    this.sunDir.set(Math.cos(b) * Math.cos(e), Math.sin(e), Math.sin(b) * Math.cos(e)).normalize();
    const u = this.sky.material.uniforms;
    if (!p.night) {
      u.turbidity.value = p.turbidity; u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.mieG;
      u.sunPosition.value.copy(this.sunDir);
    }
    this.sky.visible = !p.night; this.night.visible = !!p.night;
    this.envSky.visible = !p.night; this.envNight.visible = !!p.night;
    this.night.material.uniforms.moonDir.value.copy(this.sunDir);

    this.sun.color.setRGB(...p.sun);
    this.sun.intensity = p.sunI;
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 90);
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.scene.fog.color.set(p.fog); this.scene.fog.density = p.fogD;
    setFogSun(this.sunDir, new THREE.Color(p.fogSun ?? p.fog));
    this.renderer.toneMappingExposure = p.exposure;
    this.cloudMat.uniforms.litColor.value.setRGB(...p.cloud);
    this.cloudMat.uniforms.shadeColor.value.setRGB(...p.cloudShade);
    this.cloudMat.uniforms.coverage.value = p.cover;
    this.envGround.material.color.set(p.night ? 0x0a0c0e : 0x46503f);

    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.night ? 0.35 : 0.9;
    if (onEnv) onEnv(this.envRT.texture, p);
    this.renderer.shadowMap.needsUpdate = true;
    return p;
  }

  update(t, camera) {
    this.sky.position.copy(camera.position);
    this.night.position.copy(camera.position);
    this.night.material.uniforms.camPos.value.copy(camera.position);
    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    this.cloudMat.uniforms.time.value = t;
    this.cloudMat.uniforms.camPos.value.copy(camera.position);
  }
}
