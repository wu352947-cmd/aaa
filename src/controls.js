// 输入：移动端虚拟摇杆 + 右侧滑动转视角 + 双指缩放；桌面端 WASD + 鼠标拖动 + 滚轮
export class Input {
  constructor(el, joyEl, knobEl) {
    this.el = el;
    this.joyEl = joyEl; this.knobEl = knobEl;
    this.move = { x: 0, y: 0 };
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    this.keys = {};
    this.run = false;
    this.jump = false;
    this.enabled = true;
    this.joyId = null; this.lookIds = new Map();
    this.pinchDist = 0;
    this.onTap = null;

    el.addEventListener('touchstart', e => this.touchStart(e), { passive: false });
    el.addEventListener('touchmove', e => this.touchMove(e), { passive: false });
    el.addEventListener('touchend', e => this.touchEnd(e), { passive: false });
    el.addEventListener('touchcancel', e => this.touchEnd(e), { passive: false });

    let dragging = false, lx = 0, ly = 0, downX = 0, downY = 0;
    el.addEventListener('mousedown', e => { dragging = true; lx = downX = e.clientX; ly = downY = e.clientY; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      this.lookDX += e.clientX - lx; this.lookDY += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', e => { if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 4 && this.onTap) this.onTap(e.clientX, e.clientY); dragging = false; });
    el.addEventListener('wheel', e => { this.zoom += e.deltaY * 0.01; e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; this.keys[e.code] = true; if (e.code === 'Space') this.jump = true; });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  touchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const leftZone = t.clientX < window.innerWidth * 0.42 && t.clientY > window.innerHeight * 0.35;
      if (leftZone && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyCX = t.clientX; this.joyCY = t.clientY;
        this.joyEl.style.left = (t.clientX - 60) + 'px';
        this.joyEl.style.top = (t.clientY - 60) + 'px';
        this.joyEl.classList.add('active');
        this.knobEl.style.transform = 'translate(0px,0px)';
      } else {
        this.lookIds.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() });
      }
    }
    if (this.lookIds.size === 2) {
      const [a, b] = [...this.lookIds.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        let dx = t.clientX - this.joyCX, dy = t.clientY - this.joyCY;
        const d = Math.hypot(dx, dy), R = 55;
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        this.move.x = dx / R; this.move.y = -dy / R;
        this.run = d > R * 0.95;
        this.knobEl.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (this.lookIds.has(t.identifier)) {
        const p = this.lookIds.get(t.identifier);
        if (this.lookIds.size === 1) { this.lookDX += (t.clientX - p.x) * 1.15; this.lookDY += (t.clientY - p.y) * 1.15; }
        p.x = t.clientX; p.y = t.clientY;
      }
    }
    if (this.lookIds.size === 2) {
      const [a, b] = [...this.lookIds.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoom -= (d - this.pinchDist) * 0.03;
      this.pinchDist = d;
    }
  }
  touchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this.joyId = null; this.move.x = this.move.y = 0; this.run = false;
        this.joyEl.classList.remove('active');
      } else if (this.lookIds.has(t.identifier)) {
        const p = this.lookIds.get(t.identifier);
        if (Math.hypot(t.clientX - p.sx, t.clientY - p.sy) < 8 && performance.now() - p.t < 300 && this.onTap) this.onTap(t.clientX, t.clientY);
        this.lookIds.delete(t.identifier);
      }
    }
  }

  // 键盘与摇杆合并后的移动向量
  getMove() {
    let x = this.move.x, y = this.move.y;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, run: this.run || k.ShiftLeft || k.ShiftRight };
  }
  consumeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return r; }
  consumeZoom() { const z = this.zoom; this.zoom = 0; return z; }
}
