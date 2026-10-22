// 玩家：移动、碰撞、第一/第三人称相机、角色模型与步行动画
import * as THREE from 'three';
import { Builder } from './builder.js';

const PI = Math.PI;

export class Player {
  constructor(camera, colliders, M) {
    this.camera = camera;
    this.colliders = colliders;
    this.walls = colliders.filter((c) => c.wall);
    this.pos = new THREE.Vector2(0.5, 4.4);
    this.yaw = 0; // 0 = 朝 -Z（西湖方向）
    this.pitch = -0.04;
    this.radius = 0.22;
    this.eye = 1.62;
    this.mode = 'first';
    this.move = new THREE.Vector2();
    this.lookDelta = new THREE.Vector2();
    this.speed = 0;
    this.phase = 0;
    this.bob = 0;
    this.camDist = 2.3;
    this.facing = PI;
    this.character = makeCharacter(M);
    this.character.visible = false;
  }

  setMode(m) {
    this.mode = m;
    this.character.visible = m === 'third';
  }

  teleport(x, z, yaw) {
    this.pos.set(x, z);
    if (yaw !== undefined) { this.yaw = yaw; this.facing = yaw + PI; }
    this.pitch = -0.04;
  }

  collide(p) {
    const r = this.radius;
    for (let pass = 0; pass < 3; pass++) {
      for (const c of this.colliders) {
        if (p.x < c.x1 - r || p.x > c.x2 + r || p.y < c.z1 - r || p.y > c.z2 + r) continue;
        const cx = Math.max(c.x1, Math.min(p.x, c.x2)), cz = Math.max(c.z1, Math.min(p.y, c.z2));
        let dx = p.x - cx, dz = p.y - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-9) {
          // 中心在盒内：沿最短方向推出
          const l = p.x - c.x1, rr = c.x2 - p.x, t = p.y - c.z1, b = c.z2 - p.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) p.x = c.x1 - r; else if (m === rr) p.x = c.x2 + r; else if (m === t) p.y = c.z1 - r; else p.y = c.z2 + r;
          continue;
        }
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cz + (dz / d) * r;
      }
    }
  }

  update(dt, t) {
    // 视角
    this.yaw -= this.lookDelta.x;
    this.pitch -= this.lookDelta.y;
    this.pitch = Math.max(-1.25, Math.min(1.1, this.pitch));
    this.lookDelta.set(0, 0);
    // 移动（相对朝向）
    const mag = Math.min(1, this.move.length());
    const target = mag * (mag > 0.85 ? 2.4 : 1.5);
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (mag > 0.01) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const mx = (rx * this.move.x + fx * this.move.y) / mag;
      const mz = (rz * this.move.x + fz * this.move.y) / mag;
      const step = this.speed * dt;
      const sub = Math.ceil(step / 0.08);
      for (let i = 0; i < sub; i++) {
        this.pos.x += (mx * step) / sub;
        this.pos.y += (mz * step) / sub;
        this.collide(this.pos);
      }
      const want = Math.atan2(mx, mz);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 10);
    }
    this.phase += this.speed * dt * 4.2;
    const moving = this.speed > 0.15;
    this.bob += ((moving ? 1 : 0) - this.bob) * Math.min(1, dt * 6);

    const y0 = this.pos.y < 0 ? -0.02 : 0; // 露台略低
    const cam = this.camera;
    if (this.mode === 'first') {
      const by = Math.sin(this.phase * 2) * 0.022 * this.bob;
      cam.position.set(this.pos.x, y0 + this.eye + by, this.pos.y);
      cam.rotation.set(this.pitch, this.yaw, Math.sin(this.phase) * 0.004 * this.bob, 'YXZ');
    } else {
      const ch = this.character;
      ch.position.set(this.pos.x, y0, this.pos.y);
      ch.rotation.y = this.facing;
      animateCharacter(ch, this.phase, this.bob, t);
      const head = new THREE.Vector3(this.pos.x, y0 + 1.52, this.pos.y);
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      // 相机碰撞（2D 射线）
      let dist = this.camDist;
      const bx = -dir.x, bz = -dir.z;
      const hl = Math.hypot(bx, bz);
      if (hl > 1e-4) {
        const hit = this.raycast(head.x, head.z, bx / hl, bz / hl, dist * hl + 0.3);
        if (hit !== null) dist = Math.min(dist, Math.max(0.35, (hit - 0.22) / hl));
      }
      const p = head.clone().addScaledVector(dir, -dist);
      p.y = Math.min(p.y, 2.6);
      p.y = Math.max(p.y, y0 + 0.3);
      cam.position.copy(p);
      cam.lookAt(head.x, head.y - 0.05, head.z);
    }
  }

  raycast(ox, oz, dx, dz, maxT, skipGlass = false) {
    let best = null;
    for (const c of this.walls) {
      if (skipGlass && c.glass) continue;
      const x1 = c.x1 - 0.05, x2 = c.x2 + 0.05, z1 = c.z1 - 0.05, z2 = c.z2 + 0.05;
      let t0 = 0, t1 = maxT;
      if (Math.abs(dx) < 1e-6) { if (ox < x1 || ox > x2) continue; } else {
        let a = (x1 - ox) / dx, b = (x2 - ox) / dx; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-6) { if (oz < z1 || oz > z2) continue; } else {
        let a = (z1 - oz) / dz, b = (z2 - oz) / dz; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue;
      }
      if (t0 > 0.01 && (best === null || t0 < best)) best = t0;
    }
    return best;
  }
}

/* ---------------- 角色模型（休闲装：亚麻衬衫 + 卡其裤） ---------------- */
function makeCharacter(M) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b896, roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.95, map: M.bedLinen.map });
  const pants = new THREE.MeshStandardMaterial({ color: 0x8f7d62, roughness: 0.9, map: M.bedLinen.map });
  const hair = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.7 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.6 });
  const g = new THREE.Group();
  const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; return m; };
  const hips = new THREE.Group(); hips.position.y = 0.92; g.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  torso.add(mk(new THREE.CapsuleGeometry(0.16, 0.36, 6, 16), shirt, 0, 0.3, 0));
  torso.children[0].scale.set(1.15, 1, 0.75);
  torso.add(mk(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin, 0, 0.62, 0));
  const head = new THREE.Group(); head.position.y = 0.76; torso.add(head);
  head.add(mk(new THREE.SphereGeometry(0.105, 24, 18), skin));
  head.children[0].scale.set(0.92, 1.12, 1);
  const h = mk(new THREE.SphereGeometry(0.112, 24, 14, 0, PI * 2, 0, PI * 0.55), hair, 0, 0.025, -0.008);
  h.scale.set(0.95, 1.08, 1.04); head.add(h);
  head.add(mk(new THREE.SphereGeometry(0.02, 8, 6), skin, 0, -0.01, 0.1));
  const pelvis = mk(new THREE.CapsuleGeometry(0.15, 0.08, 4, 12), pants, 0, 0.0, 0); pelvis.scale.set(1.1, 1, 0.8); hips.add(pelvis);
  const limbs = {};
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(s * 0.09, -0.02, 0); hips.add(thigh);
    thigh.add(mk(new THREE.CapsuleGeometry(0.068, 0.34, 4, 10), pants, 0, -0.22, 0));
    const knee = new THREE.Group(); knee.position.y = -0.44; thigh.add(knee);
    knee.add(mk(new THREE.CapsuleGeometry(0.056, 0.34, 4, 10), pants, 0, -0.2, 0));
    const foot = mk(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe, 0, -0.43, 0.04); knee.add(foot);
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.215, 0.52, 0); torso.add(shoulder);
    shoulder.add(mk(new THREE.CapsuleGeometry(0.052, 0.24, 4, 10), shirt, 0, -0.15, 0));
    const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
    elbow.add(mk(new THREE.CapsuleGeometry(0.04, 0.22, 4, 10), skin, 0, -0.13, 0));
    elbow.add(mk(new THREE.SphereGeometry(0.045, 10, 8), skin, 0, -0.28, 0.01));
    limbs[s] = { thigh, knee, shoulder, elbow };
  }
  // 脚下柔和阴影
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), M.blob);
  blob.rotation.x = -PI / 2; blob.position.y = 0.006; blob.renderOrder = 1;
  g.add(blob);
  g.userData = { hips, torso, head, limbs };
  g.traverse((o) => o.layers.set(1));
  void Builder;
  return g;
}

function animateCharacter(g, phase, walk, t) {
  const { hips, torso, head, limbs } = g.userData;
  const s = Math.sin(phase), c = Math.cos(phase);
  for (const side of [-1, 1]) {
    const L = limbs[side];
    const ph = side > 0 ? s : -s;
    L.thigh.rotation.x = ph * 0.5 * walk;
    L.knee.rotation.x = Math.max(0, (side > 0 ? -c : c)) * 0.7 * walk;
    L.shoulder.rotation.x = -ph * 0.4 * walk;
    L.shoulder.rotation.z = side * 0.06;
    L.elbow.rotation.x = -0.25 - Math.max(0, -ph) * 0.3 * walk;
  }
  hips.position.y = 0.92 + Math.abs(c) * 0.03 * walk + Math.sin(t * 2) * 0.004 * (1 - walk);
  torso.rotation.y = s * 0.08 * walk;
  torso.rotation.x = 0.04 * walk;
  head.rotation.y = -s * 0.05 * walk;
}
