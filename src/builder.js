// 静态几何构建器：按材质收集几何体并合并，大幅降低 draw call（移动端关键）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

// 以米为单位的 UV 盒子，保证贴图比例在所有表面一致
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0], uv.getY(idx) * dims[f][1]);
    }
  }
  return g;
}

export function roundedBox(w, h, d, r = 0.03, seg = 3) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  scaleUV(g, Math.max(w, d), h);
  return g;
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

function normalizeGeo(g) {
  let geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

export class Builder {
  constructor() {
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
    this.colliders = [];
    this.shadowSet = new Set();
  }
  get cur() { return this.stack[this.stack.length - 1]; }

  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    const m = new THREE.Matrix4().makeRotationY(ry);
    if (s !== 1) m.scale(new THREE.Vector3(s, s, s));
    m.setPosition(x, y, z);
    this.stack.push(this.cur.clone().multiply(m));
    return this;
  }
  pop() { this.stack.pop(); return this; }

  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_v.set(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const g = normalizeGeo(geo);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.cur, _m));
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return g;
  }

  // 盒子：(x,z) 为中心，y 为底面
  box(mat, x, y, z, w, h, d, ry = 0) {
    return this.add(boxGeo(w, h, d), mat, x, y + h / 2, z, 0, ry, 0);
  }
  rbox(mat, x, y, z, w, h, d, r = 0.03, ry = 0, rx = 0) {
    return this.add(roundedBox(w, h, d, r), mat, x, y + h / 2, z, rx, ry, 0);
  }
  cyl(mat, x, y, z, rt, rb, h, seg = 24, rx = 0, rz = 0, open = false) {
    // 水平放置（|rx| 或 |rz| 较大）时 y 为中心，否则 y 为底面
    const centered = Math.abs(rx) > 0.5 || Math.abs(rz) > 0.5;
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, x, centered ? y : y + h / 2, z, rx, 0, rz);
  }
  sphere(mat, x, y, z, r, sx = 1, sy = 1, sz = 1, seg = 20) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), mat, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  plane(mat, x, y, z, w, h, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    scaleUV(g, w, h);
    return this.add(g, mat, x, y, z, rx, ry, rz);
  }
  // 平面贴图使用 0..1 UV（画作、地毯等）
  quad(mat, x, y, z, w, h, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, rz);
  }

  // 碰撞盒（局部坐标，自动变换为世界 AABB）
  collide(x1, z1, x2, z2) {
    const pts = [[x1, z1], [x2, z1], [x1, z2], [x2, z2]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(this.cur));
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    this.colliders.push({ x1: Math.min(...xs), z1: Math.min(...zs), x2: Math.max(...xs), z2: Math.max(...zs) });
  }
  collideC(cx, cz, w, d) { this.collide(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2); }

  flush(parent, { cast = true, receive = true, layer = null, noShadowMats = new Set() } = {}) {
    const meshes = [];
    for (const [mat, list] of this.buckets) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      const transparent = mat.transparent || mat.userData.noShadow || noShadowMats.has(mat);
      mesh.castShadow = cast && !transparent && !mat.userData.noCast;
      mesh.receiveShadow = receive && !mat.userData.noReceive;
      if (mat.userData.renderOrder) mesh.renderOrder = mat.userData.renderOrder;
      if (layer !== null) mesh.layers.set(layer);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}
