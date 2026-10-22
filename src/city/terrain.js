// 地形：西岱岛、圣母岛与牛岛（1482 年尚为无人草地）、塞纳河两岸，以及河水着色器
import * as THREE from 'three';
import { world } from '../world.js';
import { fbm } from '../util.js';

export const WATER_Y = -2.2;

function sdRoundBox(x, z, cx, cz, hx, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
const bankN = (x) => -232 + 10 * Math.sin(x / 260 + 0.6) + 5 * Math.sin(x / 90);
const bankS = (x) => 104 + 8 * Math.sin(x / 230 + 2.0) + 4 * Math.sin(x / 70 + 1);

// 西岱岛：用若干圆角矩形拼合，东端收窄为“田地”（Terrain）
export const islands = [
  { cx: -300, cz: -30, hx: 460, hz: 92, r: 50 },
  { cx: 150, cz: -38, hx: 70, hz: 80, r: 55 },
  { cx: 412, cz: -48, hx: 105, hz: 46, r: 40, meadow: true },   // 牛岛
  { cx: 640, cz: -42, hx: 115, hz: 52, r: 45, meadow: true },   // 圣母岛
  { cx: -840, cz: -40, hx: 26, hz: 18, r: 14, meadow: true },   // 犹太人岛（小岛）
];

// 有符号距离：负值为陆地
export function landSDF(x, z) {
  // 河道：bankN < z < bankS 之间为正；两岸为负
  let d = Math.min(z - bankN(x), bankS(x) - z);
  for (const i of islands) d = Math.min(d, sdRoundBox(x, z, i.cx, i.cz, i.hx, i.hz, i.r));
  return d;
}
export function isMeadow(x, z) {
  return islands.some(i => i.meadow && sdRoundBox(x, z, i.cx, i.cz, i.hx, i.hz, i.r) < 0);
}

export function terrainHeight(x, z) {
  const d = landSDF(x, z);
  if (d > 0) {
    // 河床
    return Math.max(-9, -0.3 - d * 0.6 - Math.min(d, 20) * 0.1);
  }
  let h = 0;
  // 河岸缓坡
  if (d > -3) h = d * 0.1;
  // 左岸：圣热纳维耶芙山
  if (z > 200) h += Math.min(28, (z - 200) * 0.045);
  // 右岸轻微起伏
  if (z < -350) h += Math.min(6, (-350 - z) * 0.01);
  return h;
}

export function buildTerrain(scene, mats) {
  world.terrainHeight = terrainHeight;
  const X0 = -1400, X1 = 1400, Z0 = -1000, Z1 = 1000;
  const NX = 260, NZ = 180;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ);
  g.rotateX(-Math.PI / 2);
  g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = g.attributes.position;
  const paved = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = terrainHeight(x, z);
    p.setY(i, h);
    const d = landSDF(x, z);
    let pv = 0;
    if (d < -4 && !isMeadow(x, z)) {
      const urban = Math.abs(x) < 1100 && z > -800 && z < 700;
      pv = urban ? 0.85 : 0.2;
      // 城市边缘与远郊为土路/草地
      const n = fbm((x + 2000) / 60, (z + 2000) / 60, 64, 3, 5);
      if (n > 0.62) pv *= 0.4;
    }
    // 圣母院东端的“田地”花园与河滩
    if (x > 120 && x < 240 && z > -120 && z < 40) pv = 0.05;
    if (x > -45 && x < 75 && z < -228 && z > -312) pv = z > -252 ? 0.35 : 0.9; // 河滩广场：沙滩与铺石
    paved[i] = pv;
  }
  g.setAttribute('paved', new THREE.BufferAttribute(paved, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mats.ground);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  // 远景地面
  const far = new THREE.Mesh(new THREE.RingGeometry(1350, 4400, 48, 1).rotateX(-Math.PI / 2), mats.groundFar);
  far.position.y = 2;
  scene.add(far);

  // 河水
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 520, 1, 1).rotateX(-Math.PI / 2), createWaterMaterial());
  water.position.set(0, WATER_Y, -64);
  water.name = 'water';
  scene.add(water);
  world.water = water;
  return mesh;
}

export function createWaterMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(1, 1, 1) },
      skyColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
      horizonColor: { value: new THREE.Color(0.8, 0.82, 0.85) },
      waterColor: { value: new THREE.Color(0.05, 0.075, 0.07) },
      fogColor: { value: new THREE.Color() },
      fogDensity: { value: 0.001 },
      day: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */`
      uniform float time; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 skyColor; uniform vec3 horizonColor;
      uniform vec3 waterColor; uniform vec3 fogColor; uniform float fogDensity; uniform float day;
      varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float waves(vec2 p){
        float t = time;
        float v = 0.0;
        v += n2(p*0.35 + vec2(t*0.25, t*0.05))*0.5;
        v += n2(p*0.9 + vec2(t*0.45, -t*0.12))*0.25;
        v += n2(p*2.3 + vec2(t*0.9, t*0.3))*0.125;
        v += n2(p*5.1 + vec2(-t*1.3, t*0.7))*0.06;
        return v;
      }
      void main(){
        vec2 p = vW.xz;
        float e = 0.15;
        float c = waves(p);
        vec3 n = normalize(vec3(-(waves(p+vec2(e,0.0))-c)/e*0.35, 1.0, -(waves(p+vec2(0.0,e))-c)/e*0.35));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.04 + 0.96*pow(1.0 - max(dot(n,V),0.0), 5.0);
        vec3 R = reflect(-V, n);
        vec3 refl = mix(horizonColor, skyColor, clamp(R.y*1.6,0.0,1.0));
        float spec = pow(max(dot(R, sunDir),0.0), 220.0) * 6.0 * day;
        float spec2 = pow(max(dot(R, sunDir),0.0), 18.0) * 0.25 * day;
        vec3 col = mix(waterColor * (0.35 + 0.65*day), refl * vec3(0.78,0.86,0.95), fres*0.7) + sunColor*(spec+spec2);
        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-fogDensity*fogDensity*dist*dist);
        col = mix(col, fogColor, clamp(f,0.0,1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return m;
}
