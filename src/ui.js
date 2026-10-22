// 触控/键鼠输入、HUD、户型图、景点标注
import * as THREE from 'three';
import { rooms, spots } from './layout.js';

const $ = (id) => document.getElementById(id);

export class Input {
  constructor(player) {
    this.player = player;
    this.sens = 1;
    this.keys = new Set();
    this.joyId = null;
    this.lookIds = new Map();
    this.joyOrigin = new THREE.Vector2();
    this.joyVec = new THREE.Vector2();
    this.touched = false;
    const el = $('touch');
    const joy = $('joy'), knob = joy.querySelector('.knob');
    const R = 56;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.touched = true;
      const isTouch = e.pointerType !== 'mouse';
      if (isTouch && e.clientX < window.innerWidth * 0.42 && this.joyId === null) {
        this.joyId = e.pointerId;
        this.joyOrigin.set(e.clientX, e.clientY);
        joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px';
        joy.classList.add('show');
        knob.style.transform = 'translate(0px,0px)';
        $('joyHint').style.opacity = '0';
      } else {
        this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) {
        const dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
        const l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
        knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
        this.joyVec.set((dx * k) / R, (-dy * k) / R);
      } else if (this.lookIds.has(e.pointerId)) {
        const p = this.lookIds.get(e.pointerId);
        const s = (e.pointerType === 'mouse' ? 0.0042 : 0.0058) * this.sens;
        this.player.lookDelta.x += (e.clientX - p.x) * s;
        this.player.lookDelta.y += (e.clientY - p.y) * s;
        p.x = e.clientX; p.y = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.joyId) {
        this.joyId = null; this.joyVec.set(0, 0);
        joy.classList.remove('show');
      }
      this.lookIds.delete(e.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      if (this.player.mode === 'third') this.player.camDist = Math.max(1.2, Math.min(4.5, this.player.camDist + e.deltaY * 0.002));
    }, { passive: true });
    window.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(dt) {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA')) x -= 1;
    if (k.has('KeyD')) x += 1;
    if (k.has('ArrowLeft')) this.player.lookDelta.x -= 1.8 * dt;
    if (k.has('ArrowRight')) this.player.lookDelta.x += 1.8 * dt;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (x || y) {
      const l = Math.hypot(x, y);
      this.player.move.set((x / l) * (run ? 1 : 0.8), (y / l) * (run ? 1 : 0.8));
    } else {
      this.player.move.copy(this.joyVec);
    }
  }
}

export function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toast._h);
  toast._h = setTimeout(() => (t.style.opacity = '0'), ms);
}

const roomNotes = {
  living: '正对西湖 · 落地窗面宽 8.6 米',
  dining: '八人岩板餐桌 · 通顶青瓷展柜',
  foyer: '水刀拼花 · 山水屏风',
  kitchen: '西厨中岛 · 嵌入式电器',
  master: '湖景主卧套房',
  mbath: '独立浴缸 · 双台盆',
  closet: '步入式衣帽间',
  study: '明式圈椅 · 古琴 · 龙井茶席',
  bed2: '湖景次卧套房',
  bath2: '干湿分离',
  laundry: '洗烘一体',
  terrace: '凭栏观湖 · 苏堤与南屏山',
};

export class HUD {
  constructor() {
    this.cur = null;
    this.compass = $('compassStrip');
    const strip = this.compass;
    // 方位刻度（bearing：北 0，东 90，南 180，西 270）
    const names = { 0: '北', 45: '东北', 90: '东', 135: '东南', 180: '南', 225: '西南', 270: '西', 315: '西北' };
    for (let k = -2; k <= 2; k++) for (let b = 0; b < 360; b += 15) {
      const s = document.createElement('span');
      const deg = b + k * 360;
      s.style.left = deg * 3 + 'px';
      if (names[b]) { s.textContent = b === 270 ? '西 · 湖' : names[b]; s.className = b % 90 === 0 ? 'major' : ''; if (b === 270) s.classList.add('lake'); }
      else s.textContent = '·';
      strip.appendChild(s);
    }
  }
  setRoom(r) {
    if (!r || r === this.cur) return;
    this.cur = r;
    $('roomName').textContent = r.name;
    $('roomMeta').textContent = `${r.area} ㎡ · ${roomNotes[r.id] || ''}`;
  }
  setYaw(yaw) {
    // 相机 yaw=0 朝 -Z（西，bearing 270），yaw 增大向左转
    let bearing = 270 - (yaw * 180) / Math.PI;
    bearing = ((bearing % 360) + 360) % 360;
    this.compass.style.transform = `translateX(${110 - bearing * 3}px)`;
  }
}

export class FloorMap {
  constructor(onGo) {
    this.c = $('mapCanvas');
    this.ctx = this.c.getContext('2d');
    this.onGo = onGo;
    const list = $('mapRooms');
    for (const r of rooms) {
      const b = document.createElement('button');
      b.className = 'btn'; b.type = 'button';
      b.textContent = r.name;
      b.addEventListener('click', () => onGo(r.id));
      list.appendChild(b);
    }
    this.c.addEventListener('click', (e) => {
      const rect = this.c.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * this.c.width, y = ((e.clientY - rect.top) / rect.height) * this.c.height;
      const [wx, wz] = this.toWorld(x, y);
      const r = rooms.find((r) => wx >= r.x1 && wx <= r.x2 && wz >= r.z1 && wz <= r.z2);
      if (r) onGo(r.id);
    });
  }
  // 平面图：湖在上方（-Z 向上），北在右
  toPx(x, z) { const s = 42; return [this.c.width / 2 + x * s, 150 + z * s]; }
  toWorld(px, py) { const s = 42; return [(px - this.c.width / 2) / s, (py - 150) / s]; }
  draw(player) {
    const { ctx, c } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    // 西湖
    const g = ctx.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, '#2f4a42'); g.addColorStop(1, '#1d2b27');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, 80);
    ctx.fillStyle = 'rgba(156,195,178,0.9)';
    ctx.font = '600 22px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('西　湖', c.width / 2, 48);
    ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(241,236,226,0.5)';
    ctx.textAlign = 'left'; ctx.fillText('← 南 · 雷峰塔', 20, 70);
    ctx.textAlign = 'right'; ctx.fillText('北 · 保俶塔 →', c.width - 20, 70);
    for (const r of rooms) {
      const [x1, y1] = this.toPx(r.x1, r.z1), [x2, y2] = this.toPx(r.x2, r.z2);
      const here = player && this.curRoom === r.id;
      ctx.fillStyle = r.outdoor ? 'rgba(120,96,70,0.5)' : here ? 'rgba(156,195,178,0.32)' : 'rgba(241,236,226,0.07)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = 'rgba(241,236,226,0.55)'; ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = here ? '#cfe5da' : 'rgba(241,236,226,0.85)';
      ctx.textAlign = 'center';
      ctx.font = `600 ${r.x2 - r.x1 < 3.2 ? 17 : 21}px "Noto Serif SC", serif`;
      ctx.fillText(r.name, (x1 + x2) / 2, (y1 + y2) / 2 + 2);
      ctx.font = '13px sans-serif'; ctx.fillStyle = 'rgba(241,236,226,0.45)';
      ctx.fillText(`${r.area}㎡`, (x1 + x2) / 2, (y1 + y2) / 2 + 22);
    }
    if (player) {
      const [px, py] = this.toPx(player.pos.x, player.pos.y);
      ctx.save(); ctx.translate(px, py); ctx.rotate(-player.yaw);
      ctx.fillStyle = '#b8392b';
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(10, 10); ctx.lineTo(0, 4); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

export class Landmarks {
  constructor(list) {
    this.wrap = $('labels');
    this.items = list.map((l) => {
      const d = document.createElement('div');
      d.className = 'lm';
      d.innerHTML = `<b>${l.name}</b><i></i>`;
      this.wrap.appendChild(d);
      return { ...l, el: d, dist: d.querySelector('i'), v: new THREE.Vector3(l.x, l.y, l.z) };
    });
    this.on = true;
  }
  update(camera, w, h, occluded) {
    const v = new THREE.Vector3();
    for (const it of this.items) {
      if (!this.on) { it.el.style.display = 'none'; continue; }
      v.copy(it.v).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && !(occluded && occluded(it.v));
      if (!visible) { it.el.style.display = 'none'; continue; }
      it.el.style.display = 'flex';
      it.el.style.left = ((v.x + 1) / 2) * w + 'px';
      it.el.style.top = ((1 - v.y) / 2) * h + 'px';
      const d = Math.hypot(it.v.x - camera.position.x, it.v.z - camera.position.z);
      it.dist.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} 公里` : `${Math.round(d)} 米`;
    }
  }
}

export { spots };
