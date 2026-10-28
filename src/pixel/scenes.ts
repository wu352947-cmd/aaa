import { PALETTES, type Era } from './palettes';
import { bayer, hex, mix, noise, Pix, type RGB } from './pix';
import { lookFor, type Look } from './portrait';

/**
 * 世界层场景。每个场景是一个纯函数：(画布, 动画帧, 状态) → 像素。
 * 设计文档的规矩：插画里不放数字——价格、金额只出现在数据层。
 */

export interface SceneState {
  /** 0–1：现场的热度（成交量、人声） */
  heat?: number;
  /** 最近的涨跌方向 */
  dir?: -1 | 0 | 1;
  halted?: boolean;
  /** 决战日 / 崩盘夜：更多人、更紧张 */
  climax?: boolean;
  /** 崩盘之后：人散了 */
  empty?: boolean;
  /** 券商限制买入 */
  restricted?: boolean;
  /** 夜晚 */
  night?: boolean;
  /** 褪色（越过底线、结局回望） */
  faded?: number;
  /** 桌边坐着谁（酒馆、议事厅） */
  who?: string[];
  /** 价格走势的形状（只画形状，不画数字） */
  shape?: number[];
  /** 涨跌颜色：红涨（cn）还是绿涨 */
  redUp?: boolean;
}

export type SceneId = 'tavern' | 'floor' | 'room' | 'desk' | 'study' | 'chamber';
export const SCENE_SIZE = { w: 320, h: 96 };

const WHITE = hex('#f2ece0');

// ───────────── 小人 ─────────────

/** 一个 7×15 的站立小人。pose：down 垂手 / up 举手打手势 / phone 打电话 */
function figure(p: Pix, x: number, y: number, o: { skin: RGB; hair: RGB; body: RGB; shirt?: RGB; legs: RGB; pose?: 'down' | 'up' | 'phone'; hat?: RGB; bob?: number }) {
  const by = y + (o.bob ?? 0);
  // 头
  p.rect(x + 2, by, 3, 3, o.skin);
  p.hline(x + 2, x + 4, by, o.hair);
  p.set(x + 2, by + 1, o.hair);
  if (o.hat) {
    p.hline(x + 1, x + 5, by, o.hat);
    p.hline(x + 2, x + 4, by - 1, o.hat);
  }
  // 身体
  p.rect(x + 1, by + 3, 5, 6, o.body);
  if (o.shirt) p.vline(x + 3, by + 3, by + 5, o.shirt);
  // 手臂
  const pose = o.pose ?? 'down';
  if (pose === 'up') {
    p.vline(x, by - 1, by + 4, o.body);
    p.set(x, by - 2, o.skin);
    p.vline(x + 6, by + 3, by + 7, o.body);
  } else if (pose === 'phone') {
    p.vline(x, by + 3, by + 7, o.body);
    p.vline(x + 6, by + 1, by + 4, o.body);
    p.set(x + 5, by + 1, hex('#202020'));
  } else {
    p.vline(x, by + 3, by + 7, o.body);
    p.vline(x + 6, by + 3, by + 7, o.body);
    p.set(x, by + 8, o.skin);
    p.set(x + 6, by + 8, o.skin);
  }
  // 腿
  p.rect(x + 1, by + 9, 2, 5, o.legs);
  p.rect(x + 4, by + 9, 2, 5, o.legs);
}

/** 桌后坐着的半身像（用人物外观表配色）：头 7×8，身子 13 宽 */
function bust(p: Pix, x: number, y: number, look: Look, t: number, slump = 0) {
  const pal = PALETTES[look.era];
  const skin = pal.skin[look.skin] ?? pal.skin[0];
  const shade = mix(skin, pal.ink, 0.28);
  const yy = y + slump;
  // 身子与肩
  p.rect(x, yy + 9, 13, 10, look.outfit);
  p.rect(x + 1, yy + 8, 11, 1, look.outfit);
  p.vline(x + 12, yy + 9, yy + 18, mix(look.outfit, pal.ink, 0.3));
  if (look.collar === 'ruff') {
    p.hline(x + 1, x + 11, yy + 8, WHITE);
    p.hline(x + 2, x + 10, yy + 9, WHITE);
  } else if (look.collar === 'falling') p.rect(x + 3, yy + 8, 7, 2, WHITE);
  else if (look.collar === 'vest' || look.collar === 'tie' || look.collar === 'shirt') {
    p.rect(x + 5, yy + 8, 3, 3, WHITE);
    if (look.collar === 'tie') p.vline(x + 6, yy + 9, yy + 14, look.accent ?? pal.accent);
  }
  // 头
  p.rect(x + 3, yy, 7, 8, skin);
  p.rect(x + 8, yy + 1, 2, 7, shade);
  p.hline(x + 4, x + 8, yy + 8, shade);
  const hair = look.hairStyle === 'bald' ? skin : look.hair;
  p.hline(x + 3, x + 9, yy, hair);
  p.hline(x + 3, x + 9, yy + 1, look.hairStyle === 'crop' || look.hairStyle === 'bald' ? skin : hair);
  if (look.hairStyle !== 'bald') p.vline(x + 3, yy + 1, yy + 3, hair);
  if (look.hairStyle === 'long') {
    p.vline(x + 2, yy + 1, yy + 9, look.hair);
    p.vline(x + 10, yy + 1, yy + 9, look.hair);
  }
  if (look.hairStyle === 'bald') {
    p.vline(x + 3, yy + 3, yy + 5, look.hair);
    p.vline(x + 9, yy + 3, yy + 5, look.hair);
  }
  if (look.beard === 'full') p.rect(x + 3, yy + 5, 7, 4, look.hair);
  if (look.beard === 'goatee') p.rect(x + 5, yy + 6, 3, 3, look.hair);
  if (look.beard === 'mustache') p.hline(x + 4, x + 8, yy + 5, look.hair);
  if (look.glasses) {
    p.hline(x + 3, x + 9, yy + 3, hex('#1e1e1e'));
  }
  if (look.hat === 'capotain') {
    p.hline(x, x + 12, yy - 1, hex('#18120e'));
    p.rect(x + 3, yy - 6, 7, 5, hex('#18120e'));
  } else if (look.hat === 'coif') {
    p.rect(x + 2, yy - 1, 9, 2, WHITE);
    p.vline(x + 2, yy, yy + 6, WHITE);
    p.vline(x + 10, yy, yy + 6, WHITE);
  } else if (look.hat === 'beret') p.rect(x + 2, yy - 2, 9, 2, hex('#3a2a2a'));
  // 眼睛：偶尔眨一下
  const blink = (Math.floor(t / 2) + x) % 31 === 0;
  if (!blink) {
    p.set(x + 4, yy + 3, pal.ink);
    p.set(x + 7, yy + 3, pal.ink);
  } else {
    p.hline(x + 4, x + 5, yy + 3, shade);
    p.hline(x + 7, x + 8, yy + 3, shade);
  }
  p.hline(x + 5, x + 6, yy + 6, mix(skin, hex('#7a2a24'), 0.5));
  // 手搁在桌上
  p.rect(x - 1, yy + 16, 2, 2, skin);
  p.rect(x + 12, yy + 16, 2, 2, skin);
}

// ───────────── 1637：金鹿酒馆 ─────────────

function tavern(p: Pix, t: number, s: SceneState) {
  const pal = PALETTES['1637'];
  const { w, h } = p;
  // 后墙：木板
  p.vgrad(0, 0, w, 64, pal.dark, pal.deep);
  for (let x = 0; x < w; x += 11) p.vline(x, 0, 63, mix(pal.deep, pal.ink, 0.4));
  for (let x = 5; x < w; x += 22) for (let y = 8; y < 64; y += 19) p.set(x, y, mix(pal.dark, pal.light, 0.3));
  // 横梁
  p.rect(0, 0, w, 4, pal.ink);
  p.hline(0, w, 4, pal.mid);
  // 窗：冬夜与雪
  const wx = 22;
  p.rect(wx - 2, 10, 40, 30, pal.mid);
  p.vgrad(wx, 12, 36, 26, hex('#0c1422'), hex('#1c2a40'));
  // 远处的屋顶（哈勒姆的阶梯形山墙）
  for (let i = 0; i < 4; i++) {
    const bx = wx + i * 9;
    const bh = 6 + ((i * 7) % 5);
    p.rect(bx, 38 - bh, 8, bh, hex('#0a0e16'));
    for (let k = 0; k < 3; k++) p.rect(bx + k, 38 - bh - 3 + k, 8 - 2 * k, 1, hex('#0a0e16'));
    if (i % 2 === 0) p.set(bx + 3, 33, hex('#e8b850'));
  }
  if (!s.empty) for (let i = 0; i < 18; i++) {
    const sx = wx + Math.floor(noise(i, 1) * 36);
    const sy = 12 + Math.floor((noise(i, 2) * 26 + t * (0.3 + noise(i, 3) * 0.4)) % 26);
    p.set(sx, sy, WHITE);
  }
  p.vline(wx + 18, 12, 37, pal.mid);
  p.hline(wx, wx + 35, 25, pal.mid);
  // 墙上的郁金香画
  p.rect(104, 12, 22, 26, pal.accent2);
  p.rect(106, 14, 18, 22, mix(pal.deep, pal.dark, 0.5));
  p.vline(115, 22, 33, hex('#3a6a2a'));
  p.line(115, 30, 111, 26, hex('#3a6a2a'));
  p.sprite(112, 17, ['.r.r.r.', 'rrrrrrr', 'rRRrRRr', '.rrrrr.', '..rrr..'], { r: pal.accent, R: mix(pal.accent, WHITE, 0.3) });
  // 架子与酒杯
  p.rect(150, 22, 60, 2, pal.mid);
  for (let i = 0; i < 6; i++) p.sprite(153 + i * 10, 16, ['ww.', 'wwh', 'ww.', 'ww.'], { w: mix(pal.paper, pal.mid, 0.3), h: pal.mid });
  // 壁炉
  const fx = 244;
  p.rect(fx, 14, 64, 50, hex('#5a5048'));
  for (let y = 14; y < 64; y += 5) for (let x = fx + ((y / 5) % 2) * 4; x < fx + 64; x += 8) p.rect(x, y, 7, 4, mix(hex('#5a5048'), hex('#7a6a5a'), noise(x, y) * 0.5));
  p.rect(fx + 12, 34, 40, 30, pal.ink);
  p.rect(fx - 3, 12, 70, 4, pal.mid);
  // 火焰：每帧不同的高度
  const fire = s.empty ? 0.4 : 1;
  for (let x = fx + 14; x < fx + 50; x++) {
    const hgt = Math.floor((6 + 10 * noise(x, Math.floor(t / 2)) + 6 * Math.sin(x * 0.7 + t * 0.6)) * fire);
    for (let k = 0; k < hgt; k++) {
      const y = 62 - k;
      const c = k < hgt * 0.3 ? hex('#ffe9a0') : k < hgt * 0.65 ? hex('#f5a020') : hex('#c83a14');
      if (bayer(x, y) < 0.95 - k / (hgt + 2) * 0.5) p.set(x, y, c);
    }
  }
  p.glow(fx + 32, 50, 46, pal.glow, s.empty ? 0.25 : 0.55);

  // 桌后的人
  const who = s.who ?? [];
  const seats = s.empty ? who.slice(0, 2) : who;
  seats.forEach((id, i) => {
    const look = lookFor(id, '1637');
    bust(p, 52 + i * 30, 42, look, t + i * 5, s.empty ? 3 : 0);
  });
  // 长桌
  p.rect(30, 60, 210, 6, pal.light);
  p.hline(30, 239, 60, mix(pal.light, WHITE, 0.25));
  p.rect(30, 66, 210, 3, pal.mid);
  p.rect(40, 69, 4, 27, pal.mid);
  p.rect(226, 69, 4, 27, pal.mid);
  // 地板
  p.vgrad(0, 69, w, h - 69, pal.dark, pal.ink);
  for (let x = 0; x < w; x += 16) p.line(160 + (x - 160) * 0.6, 69, x, h, mix(pal.dark, pal.ink, 0.5));
  // 桌上：石板、酒杯、花瓶
  for (let i = 0; i < seats.length; i++) {
    const sx = 66 + i * 30;
    p.rect(sx, 56, 10, 5, hex('#2c3236'));
    p.rect(sx, 56, 10, 1, pal.mid);
    // 粉笔划痕（不是数字）
    p.hline(sx + 2, sx + 2 + Math.floor(noise(i, 7) * 6), 58, WHITE);
    p.hline(sx + 2, sx + 4, 59, mix(WHITE, hex('#2c3236'), 0.4));
    p.sprite(sx + 13, 55, ['ww', 'wh', 'ww'], { w: pal.paper, h: pal.mid });
  }
  // 蜡烛
  for (const cx of [48, 140, 212]) {
    p.rect(cx, 54, 2, 6, pal.paper);
    const fl = Math.floor(noise(cx, Math.floor(t / 2)) * 2);
    p.set(cx, 52 - fl, hex('#ffe9a0'));
    p.set(cx + (fl ? 1 : 0), 53, hex('#f5a020'));
    p.glow(cx, 52, s.empty ? 10 : 16, pal.glow, 0.5);
  }
  // 花瓶里的郁金香
  p.rect(180, 54, 5, 6, hex('#3a5a7a'));
  p.vline(182, 47, 54, hex('#3a6a2a'));
  p.sprite(180, 44, ['r.r.r', 'rrrrr', '.rrr.'], { r: s.empty ? mix(pal.accent, pal.ink, 0.4) : pal.accent });
  if (s.empty) p.darken(0.3, pal.ink);
  p.engrave(pal.ink, 0.3);
}

// ───────────── 1995：交易大厅 ─────────────

function floor1995(p: Pix, t: number, s: SceneState) {
  const pal = PALETTES['1995'];
  const { w, h } = p;
  const heat = Math.max(0, Math.min(1, s.heat ?? 0.3));
  p.vgrad(0, 0, w, 58, pal.mid, pal.dark);
  // 老饭店大厅的柱子与拱
  for (let cx = 8; cx < w; cx += 78) {
    p.rect(cx, 0, 10, 58, pal.light);
    p.rect(cx + 7, 0, 3, 58, mix(pal.light, pal.ink, 0.3));
    p.rect(cx - 2, 0, 14, 3, pal.paper);
    p.rect(cx - 2, 54, 14, 4, mix(pal.light, pal.ink, 0.2));
  }
  // 行情大板：只亮灯，不显示数字。画面变宽时，大板与钟留在中间
  const ox = Math.floor((w - 320) / 2);
  const bx = 46 + ox;
  const bw = 228;
  p.rect(bx - 3, 4, bw + 6, 32, pal.ink);
  p.rect(bx - 3, 4, bw + 6, 1, pal.light);
  const up = s.redUp === false ? hex('#3fbf6a') : hex('#e5484d');
  const down = s.redUp === false ? hex('#e5484d') : hex('#3fbf6a');
  const frame = Math.floor(t / (s.climax ? 1 : 3));
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 36; col++) {
      const x = bx + 2 + col * 6;
      const y = 7 + row * 5;
      let c: RGB = mix(pal.ink, pal.dark, 0.6);
      const n = noise(col, row * 31 + frame);
      if (s.halted) c = row === 2 && col % 2 === 0 ? pal.accent2 : c;
      else if (n < 0.35 + heat * 0.5) {
        const bias = s.dir === 1 ? 0.7 : s.dir === -1 ? 0.3 : 0.5;
        c = noise(col + 99, row + frame) < bias ? up : down;
        if (n > 0.3 + heat * 0.45) c = pal.accent2;
      }
      p.rect(x, y, 4, 3, c);
    }
  // 横幅（红布）
  p.rect(0, 38, w, 5, pal.accent);
  p.hline(0, w, 38, mix(pal.accent, WHITE, 0.25));
  for (let x = 10; x < w; x += 40) p.rect(x, 39, 22, 3, mix(pal.accent, pal.accent2, 0.35));
  // 钟
  const ck = { x: 300 + ox + (w > 400 ? 40 : 0), y: 18 };
  p.disc(ck.x, ck.y, 7, pal.paper);
  p.disc(ck.x, ck.y, 6, WHITE);
  const a = t * 0.08;
  p.line(ck.x, ck.y, ck.x + Math.round(Math.cos(a) * 5), ck.y + Math.round(Math.sin(a) * 5), pal.ink);
  p.line(ck.x, ck.y, ck.x + Math.round(Math.cos(a / 12) * 3), ck.y + Math.round(Math.sin(a / 12) * 3), pal.ink);
  // 地面
  p.vgrad(0, 58, w, h - 58, pal.dark, pal.ink);
  for (let x = -60; x < w + 60; x += 22) p.line(w / 2 + (x - w / 2) * 0.35, 58, x, h, mix(pal.dark, pal.ink, 0.45));
  // 交易席位：一排桌子与电话
  for (let x = 6; x < w; x += 34) {
    p.rect(x, 70, 26, 5, pal.light);
    p.rect(x, 75, 26, 2, mix(pal.light, pal.ink, 0.4));
    p.sprite(x + 3, 67, ['kkk', 'k.k'], { k: hex('#1a1a1a') });
    p.rect(x + 14, 68, 7, 2, pal.paper);
  }
  // 红马甲：人数与手势随热度变化
  const n = Math.round((8 + heat * 26 + (s.climax ? 8 : 0)) * (w / 320));
  const yellow = hex('#d9b341');
  for (let i = 0; i < n; i++) {
    const fx = Math.floor(noise(i, 5) * (w - 10));
    const depth = noise(i, 6);
    const fy = 44 + Math.floor(depth * 18) + (depth > 0.55 ? 14 : 0);
    if (fy > 74) continue;
    const busy = noise(i, frame + 3) < heat * (s.halted ? 0.1 : 0.9);
    const skin = pal.skin[i % 3];
    const vest = i % 7 === 0 ? yellow : pal.accent;
    figure(p, fx, fy, {
      skin,
      hair: hex('#141414'),
      body: vest,
      shirt: WHITE,
      legs: mix(pal.ink, pal.dark, 0.5),
      pose: busy ? (noise(i, frame) < 0.5 ? 'up' : 'phone') : 'down',
      bob: busy && frame % 2 === i % 2 ? -1 : 0,
    });
  }
  if (s.halted) p.darken(0.35, pal.ink);
  p.grain(Math.floor(t / 2), 0.07);
  p.engrave(pal.ink, 0.25);
}

// ───────────── 2021：卧室里的手机与屏幕 ─────────────

function room2021(p: Pix, t: number, s: SceneState) {
  const pal = PALETTES['2021'];
  const { w, h } = p;
  const heat = Math.max(0, Math.min(1, s.heat ?? 0.3));
  p.vgrad(0, 0, w, 70, pal.dark, pal.deep);
  // 窗外的城市
  p.rect(14, 8, 70, 46, mix(pal.mid, pal.ink, 0.3));
  p.vgrad(16, 10, 66, 42, hex('#0a0420'), hex('#2a0c4a'));
  for (let i = 0; i < 9; i++) {
    const bx = 16 + i * 7 + Math.floor(noise(i, 1) * 3);
    const bh = 10 + Math.floor(noise(i, 2) * 26);
    p.rect(bx, 52 - bh, 6, bh, hex('#06020e'));
    for (let y = 52 - bh + 2; y < 50; y += 3) for (let x = bx + 1; x < bx + 5; x += 2) if (noise(x, y, Math.floor(t / 20)) < 0.35) p.set(x, y, pal.accent);
  }
  p.vline(49, 10, 51, mix(pal.mid, pal.ink, 0.3));
  // 墙上的海报：火箭与钻石
  p.rect(100, 8, 30, 38, pal.paper);
  p.rect(102, 10, 26, 34, pal.deep);
  const rocketY = 26 - Math.floor((t / 3) % 6);
  p.sprite(110, rocketY, ['..w..', '.www.', '.wbw.', '.www.', 'wwwww', 'w.r.w', '..y..'], { w: WHITE, b: pal.accent2, r: hex('#ff5a3a'), y: pal.accent });
  p.sprite(104, 12, ['.c.', 'ccc', '.c.'], { c: pal.accent });
  p.sprite(121, 36, ['.d.', 'ddd', '.d.'], { d: pal.accent2 });
  p.rect(140, 14, 22, 16, pal.accent);
  p.sprite(144, 17, ['kk.kk', 'kk.kk', '.....', 'k...k', '.kkk.'], { k: pal.ink });
  // 霓虹灯条
  p.hline(0, w, 2, pal.light);
  p.glow(200, 2, 40, pal.light, 0.35);
  // 书桌
  p.rect(150, 62, 170, 6, hex('#3a2a4a'));
  p.rect(150, 68, 170, 3, hex('#22182e'));
  // 显示器：走势的形状，没有数字
  const mx = 186;
  const my = 20;
  const mw = 96;
  const mh = 40;
  p.rect(mx - 3, my - 3, mw + 6, mh + 6, hex('#16121e'));
  p.rect(mx, my, mw, mh, hex('#07040e'));
  p.rect(mx + mw / 2 - 4, my + mh + 3, 8, 6, hex('#16121e'));
  const shape = s.shape && s.shape.length > 1 ? s.shape : Array.from({ length: 24 }, (_, i) => 0.5 + 0.3 * Math.sin(i / 3 + t / 10));
  const lo = Math.min(...shape);
  const hi = Math.max(...shape);
  const col = s.dir === -1 ? hex('#ff4a6a') : pal.accent2;
  let px0 = -1;
  let py0 = -1;
  for (let i = 0; i < shape.length; i++) {
    const x = mx + 3 + Math.round((i / (shape.length - 1)) * (mw - 6));
    const y = my + mh - 4 - Math.round(((shape[i] - lo) / Math.max(1e-9, hi - lo)) * (mh - 8));
    if (px0 >= 0) p.line(px0, py0, x, y, col);
    px0 = x;
    py0 = y;
  }
  p.glow(mx + mw / 2, my + mh / 2, 50, s.restricted ? hex('#ff4a6a') : col, 0.3);
  if (s.restricted) {
    // 只许卖出：屏幕上一把锁
    p.rect(mx + mw / 2 - 8, my + 12, 16, 14, hex('#ff4a6a'));
    p.rect(mx + mw / 2 - 5, my + 6, 10, 7, hex('#07040e'));
    p.hline(mx + mw / 2 - 5, mx + mw / 2 + 4, my + 6, hex('#ff4a6a'));
    p.vline(mx + mw / 2 - 5, my + 6, my + 12, hex('#ff4a6a'));
    p.vline(mx + mw / 2 + 4, my + 6, my + 12, hex('#ff4a6a'));
    p.rect(mx + mw / 2 - 1, my + 17, 2, 4, hex('#07040e'));
  }
  // 手机：通知在跳
  const ph = { x: 296, y: 50 };
  p.rect(ph.x, ph.y, 10, 12, hex('#16121e'));
  p.rect(ph.x + 1, ph.y + 1, 8, 10, pal.mid);
  const notes = Math.round(1 + heat * 4);
  for (let i = 0; i < notes; i++) if ((Math.floor(t / 2) + i) % 3 !== 0) p.rect(ph.x + 2, ph.y + 2 + i * 2, 6, 1, i % 2 ? pal.accent : WHITE);
  p.glow(ph.x + 5, ph.y + 6, 12, pal.glow, 0.4 + heat * 0.3);
  // 桌前的人：连帽衫背影
  const bob = heat > 0.6 && Math.floor(t / 2) % 2 === 0 ? -1 : 0;
  p.disc(228, 66 + bob, 9, pal.mid);
  p.rect(219, 66 + bob, 19, 30, pal.mid);
  p.disc(228, 58 + bob, 6, mix(pal.mid, pal.ink, 0.25));
  p.hline(222, 234, 52 + bob, hex('#222222'));
  p.rect(219, 56 + bob, 2, 4, pal.accent);
  p.rect(235, 56 + bob, 2, 4, pal.accent);
  // 地面
  p.vgrad(0, 71, 150, h - 71, pal.deep, pal.ink);
  p.vgrad(150, 71, w - 150, h - 71, mix(pal.deep, pal.ink, 0.4), pal.ink);
  p.engrave(pal.ink, 0.25);
}

// ───────────── 2021：华尔街的交易台 ─────────────

function desk2021(p: Pix, t: number, s: SceneState) {
  const pal = PALETTES['2021'];
  const { w, h } = p;
  const heat = Math.max(0, Math.min(1, s.heat ?? 0.3));
  const frame = Math.floor(t / (s.climax ? 1 : 2));
  const up = s.redUp ? hex('#ff4a6a') : pal.accent2;
  const down = s.redUp ? pal.accent2 : hex('#ff4a6a');
  const wall = mix(pal.deep, pal.ink, 0.35);
  p.vgrad(0, 0, w, 62, wall, pal.deep);
  // 天花板的灯带
  p.rect(0, 0, w, 3, pal.ink);
  for (let x = 8; x < w; x += 44) {
    p.rect(x, 2, 26, 1, pal.paper);
    p.glow(x + 13, 3, 14, pal.glow, 0.25);
  }
  // 落地窗：曼哈顿的夜
  p.rect(10, 6, 116, 50, mix(pal.mid, pal.ink, 0.55));
  p.vgrad(12, 8, 112, 46, hex('#05030c'), hex('#1a0c34'));
  for (let i = 0; i < 14; i++) {
    const bx = 12 + i * 8 + Math.floor(noise(i, 4) * 3);
    const bh = 12 + Math.floor(noise(i, 5) * 34);
    p.rect(bx, 54 - bh, 7, bh, hex('#04020a'));
    for (let y = 54 - bh + 2; y < 52; y += 3) for (let x = bx + 1; x < bx + 6; x += 2) if (noise(x, y, Math.floor(t / 30)) < 0.28) p.set(x, y, mix(pal.glow, pal.accent, noise(x, y, 7)));
  }
  for (const x of [40, 68, 96]) p.vline(x, 8, 53, mix(pal.mid, pal.ink, 0.5));
  // 墙上的大屏：走势的形状和一片热力格，没有数字
  const sx = 138;
  const sy = 7;
  const sw = 170;
  const sh = 40;
  p.rect(sx - 2, sy - 2, sw + 4, sh + 4, hex('#16121e'));
  p.rect(sx, sy, sw, sh, hex('#06040c'));
  const shape = s.shape && s.shape.length > 1 ? s.shape : Array.from({ length: 24 }, (_, i) => 0.5 + 0.3 * Math.sin(i / 3 + t / 10));
  const lo = Math.min(...shape);
  const hi = Math.max(...shape);
  const lineC = s.dir === -1 ? down : up;
  let x0 = -1;
  let y0 = -1;
  for (let i = 0; i < shape.length; i++) {
    const x = sx + 3 + Math.round((i / (shape.length - 1)) * 100);
    const y = sy + sh - 5 - Math.round(((shape[i] - lo) / Math.max(1e-9, hi - lo)) * (sh - 10));
    if (x0 >= 0) p.line(x0, y0, x, y, lineC);
    x0 = x;
    y0 = y;
  }
  // 右边：期权链的热力格（越热越亮）
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 9; c++) {
      const n = noise(c, r * 13 + frame);
      const lit = n < 0.3 + heat * 0.6;
      const k = noise(c + 40, r + frame);
      p.rect(sx + 110 + c * 6, sy + 3 + r * 5, 5, 4, lit ? (k < (s.dir === -1 ? 0.3 : 0.7) ? mix(up, hex('#06040c'), 0.25) : mix(down, hex('#06040c'), 0.25)) : hex('#140f20'));
    }
  p.glow(sx + sw / 2, sy + sh / 2, 60, lineC, 0.18);
  if (s.restricted) {
    // 券商只许卖出：大屏上一条红色横幅和一把锁
    p.rect(sx, sy + 15, sw, 10, hex('#7a1428'));
    p.rect(sx + sw / 2 - 5, sy + 17, 10, 7, hex('#ff4a6a'));
    p.rect(sx + sw / 2 - 3, sy + 13, 6, 4, hex('#7a1428'));
    p.hline(sx + sw / 2 - 3, sx + sw / 2 + 2, sy + 13, hex('#ff4a6a'));
    p.vline(sx + sw / 2 - 3, sy + 13, sy + 17, hex('#ff4a6a'));
    p.vline(sx + sw / 2 + 2, sy + 13, sy + 17, hex('#ff4a6a'));
  }
  if (s.halted) for (let x = sx; x < sx + sw; x += 8) p.rect(x, sy + sh - 3, 5, 2, pal.accent);
  // 地面
  p.vgrad(0, 62, w, h - 62, mix(pal.deep, pal.ink, 0.5), pal.ink);
  for (let x = -40; x < w + 40; x += 26) p.line(w / 2 + (x - w / 2) * 0.4, 62, x, h, mix(pal.deep, pal.ink, 0.7));
  // 一排交易席位：每个座位两块屏，屏上是跳动的柱子
  const seats = 6;
  for (let i = 0; i < seats; i++) {
    const dx = 8 + i * 52;
    for (let m = 0; m < 2; m++) {
      const mx = dx + m * 17;
      p.rect(mx, 49, 16, 11, hex('#16121e'));
      p.rect(mx + 1, 50, 14, 8, hex('#07050f'));
      const busy = s.halted ? 0.1 : 0.35 + heat * 0.65;
      for (let b = 0; b < 6; b++) {
        if (noise(i * 7 + m, b, frame) > busy) continue;
        const bh = 1 + Math.floor(noise(i + b, m, frame + 1) * 6);
        p.vline(mx + 2 + b * 2, 57, 57 - bh + 1, noise(i, b + m * 9, frame) < (s.dir === -1 ? 0.35 : 0.65) ? up : down);
      }
      p.rect(mx + 7, 60, 2, 2, hex('#16121e'));
      p.glow(mx + 8, 54, 10, pal.glow, 0.15 + heat * 0.15);
    }
  }
  // 桌沿
  p.rect(0, 62, w, 3, hex('#2a2238'));
  p.hline(0, w, 62, mix(hex('#2a2238'), pal.light, 0.3));
  // 交易员的背影：坐在屏幕前，后脑勺挡住屏幕下沿；越忙，越多人在打电话、比手势
  for (let i = 0; i < seats; i++) {
    const cx = 25 + i * 52;
    const look = noise(i, 77);
    const vest = look < 0.5 ? hex('#4a505e') : look < 0.8 ? hex('#2a3040') : hex('#5a4a6e');
    const shirt = mix(pal.paper, vest, 0.3);
    const skin = pal.skin[i % 3];
    const hair = [hex('#1a1410'), hex('#5a3a22'), hex('#2a2a2a'), hex('#8a7a60')][i % 4];
    const busy = !s.halted && noise(i, frame + 11) < heat * 0.8;
    const bob = busy && (frame + i) % 2 === 0 ? -1 : 0;
    // 椅背
    p.rect(cx - 10, 74, 20, 22, hex('#0e0a14'));
    p.hline(cx - 10, cx + 9, 74, hex('#2a2238'));
    // 肩膀与背心
    p.rect(cx - 11, 69 + bob, 22, 14, shirt);
    p.rect(cx - 9, 68 + bob, 18, 15, vest);
    p.rect(cx - 7, 67 + bob, 14, 1, vest);
    // 后脑勺
    p.rect(cx - 4, 59 + bob, 9, 9, skin);
    p.rect(cx - 5, 58 + bob, 11, 6, hair);
    p.rect(cx - 4, 57 + bob, 9, 1, hair);
    p.set(cx - 5, 64 + bob, skin);
    p.set(cx + 5, 64 + bob, skin);
    if (busy) {
      if (noise(i, frame + 5) < 0.5) {
        // 举手比价
        p.rect(cx + 10, 58 + bob, 2, 11, shirt);
        p.rect(cx + 10, 56 + bob, 2, 2, skin);
      } else {
        // 打电话
        p.rect(cx - 12, 62 + bob, 2, 8, shirt);
        p.rect(cx - 7, 60 + bob, 2, 4, hex('#101010'));
      }
    }
  }
  if (s.halted) p.darken(0.25, pal.ink);
  p.engrave(pal.ink, 0.22);
}

// ───────────── 夜间书房 ─────────────

function study(p: Pix, t: number, s: SceneState & { era?: Era }) {
  const era = s.era ?? '1995';
  const pal = PALETTES[era];
  const { w } = p;
  p.vgrad(0, 0, w, 66, mix(pal.dark, pal.deep, 0.3), pal.deep);
  // 窗与天际线
  const wx = 190;
  p.rect(wx - 3, 6, 112, 52, pal.mid);
  p.vgrad(wx, 9, 106, 46, hex('#05070e'), hex('#121a30'));
  for (let i = 0; i < 14; i++) p.set(wx + Math.floor(noise(i, 9) * 106), 10 + Math.floor(noise(i, 8) * 20), WHITE);
  p.disc(wx + 88, 18, 4, hex('#efe6c0'));
  const sil = hex('#03040a');
  const lit = era === '2021' ? pal.accent : pal.glow;
  if (era === '1637') {
    // 哈勒姆：阶梯山墙与圣巴佛教堂的尖塔
    for (let i = 0; i < 7; i++) {
      const bx = wx + i * 15;
      const bh = 12 + ((i * 5) % 7);
      p.rect(bx, 55 - bh, 13, bh, sil);
      for (let k = 0; k < 4; k++) p.rect(bx + k * 1.5, 55 - bh - 4 + k, 13 - k * 3, 1, sil);
      p.set(bx + 6, 55 - bh + 5, lit);
    }
    p.rect(wx + 50, 22, 8, 33, sil);
    p.line(wx + 54, 8, wx + 50, 22, sil);
    p.line(wx + 54, 8, wx + 57, 22, sil);
  } else if (era === '1995') {
    // 上海：外滩的楼影，东方明珠（1994 年建成）
    for (let i = 0; i < 8; i++) {
      const bx = wx + i * 13;
      const bh = 8 + ((i * 7) % 9);
      p.rect(bx, 55 - bh, 12, bh, sil);
      if (i % 2) p.set(bx + 5, 55 - bh + 3, lit);
    }
    const tx = wx + 74;
    p.vline(tx, 10, 55, sil);
    p.vline(tx + 1, 10, 55, sil);
    p.disc(tx, 40, 5, sil);
    p.disc(tx, 26, 3, sil);
    p.disc(tx, 18, 1, sil);
    p.line(tx - 6, 55, tx, 40, sil);
    p.line(tx + 7, 55, tx + 1, 40, sil);
    if (Math.floor(t / 4) % 2 === 0) p.set(tx, 9, hex('#ff4040'));
    p.disc(tx, 40, 2, hex('#c85a8a'));
  } else {
    for (let i = 0; i < 10; i++) {
      const bx = wx + i * 11;
      const bh = 14 + Math.floor(noise(i, 3) * 30);
      p.rect(bx, 55 - bh, 10, bh, sil);
      for (let y = 55 - bh + 2; y < 54; y += 3) for (let x = bx + 1; x < bx + 9; x += 2) if (noise(x, y, 4) < 0.3) p.set(x, y, lit);
    }
  }
  p.vline(wx + 53, 9, 54, pal.mid);
  // 墙上的钟与书架
  p.rect(20, 8, 70, 46, mix(pal.dark, pal.ink, 0.35));
  for (let r = 0; r < 3; r++) {
    p.hline(20, 89, 22 + r * 15, pal.mid);
    for (let x = 22; x < 88; x += 4) {
      const bh = 8 + Math.floor(noise(x, r) * 5);
      const c = [pal.accent, pal.mid, pal.light, pal.accent2][Math.floor(noise(x, r + 3) * 4)];
      p.rect(x, 22 + r * 15 - bh, 3, bh, mix(c, pal.ink, 0.25));
    }
  }
  p.disc(140, 22, 9, pal.light);
  p.disc(140, 22, 7, pal.paper);
  const a = t * 0.05;
  p.line(140, 22, 140 + Math.round(Math.cos(a) * 6), 22 + Math.round(Math.sin(a) * 6), pal.ink);
  p.line(140, 22, 140 + Math.round(Math.cos(a / 12 + 2) * 4), 22 + Math.round(Math.sin(a / 12 + 2) * 4), pal.ink);
  // 书桌
  p.rect(0, 66, w, 30, mix(pal.mid, pal.dark, 0.3));
  p.hline(0, w, 66, pal.light);
  // 台灯：年代不同，灯也不同
  const lx = 46;
  if (era === '1637') {
    p.rect(lx, 56, 3, 10, pal.paper);
    const fl = Math.floor(noise(lx, Math.floor(t / 2)) * 2);
    p.set(lx + 1, 54 - fl, hex('#ffe9a0'));
    p.set(lx + 1, 55, hex('#f5a020'));
  } else {
    p.rect(lx - 2, 64, 10, 2, pal.ink);
    p.line(lx + 3, 64, lx + 8, 50, pal.ink);
    p.sprite(lx + 2, 44, ['..ggggg.', '.ggggggg', 'gggggggg'], { g: era === '2021' ? pal.mid : hex('#2a5a3a') });
  }
  p.glow(lx + 6, 60, 52, pal.glow, s.night === false ? 0.2 : 0.55);
  // 报纸、信、茶杯
  p.rect(80, 70, 52, 20, pal.paper);
  p.rect(84, 72, 26, 3, mix(pal.paper, pal.ink, 0.6));
  for (let y = 77; y < 88; y += 2) p.hline(84, 84 + 18 + Math.floor(noise(y, 1) * 8), y, mix(pal.paper, pal.ink, 0.35));
  for (let y = 77; y < 88; y += 2) p.hline(112, 112 + 14, y, mix(pal.paper, pal.ink, 0.35));
  p.rect(140, 74, 18, 12, mix(pal.paper, pal.light, 0.2));
  p.line(140, 74, 149, 80, mix(pal.paper, pal.ink, 0.4));
  p.line(157, 74, 149, 80, mix(pal.paper, pal.ink, 0.4));
  p.rect(170, 76, 8, 8, era === '2021' ? pal.accent : pal.paper);
  p.vline(179, 78, 81, era === '2021' ? pal.accent : pal.paper);
  for (let i = 0; i < 3; i++) p.set(172 + i * 2, 73 - ((Math.floor(t / 3) + i) % 4), mix(WHITE, pal.dark, 0.5));
  if (era === '2021') {
    p.rect(200, 76, 10, 14, hex('#16121e'));
    p.rect(201, 77, 8, 11, pal.mid);
    if (Math.floor(t / 3) % 2) p.rect(202, 78, 6, 1, pal.accent);
  }
  p.engrave(pal.ink, 0.3);
}

// ───────────── 1637：阿姆斯特丹的议事厅 ─────────────

function chamber(p: Pix, t: number, s: SceneState) {
  const pal = PALETTES['1637'];
  const { w, h } = p;
  p.vgrad(0, 0, w, 64, mix(pal.dark, pal.mid, 0.3), pal.deep);
  // 高窗
  for (const x of [30, 140, 250]) {
    p.rect(x - 2, 4, 40, 44, pal.mid);
    p.vgrad(x, 6, 36, 40, hex('#9ab0c0'), hex('#c8d4d8'));
    p.vline(x + 18, 6, 45, pal.mid);
    for (let y = 14; y < 46; y += 8) p.hline(x, x + 35, y, pal.mid);
    p.glow(x + 18, 40, 40, hex('#e8eef0'), 0.25);
  }
  // 挂毯：行会徽记（郁金香）
  p.rect(98, 6, 26, 36, pal.accent);
  p.rect(100, 8, 22, 32, mix(pal.accent, pal.ink, 0.25));
  p.sprite(105, 14, ['..g..', 'r.g.r', 'rrrrr', 'rRrRr', '.rrr.', '..g..', '..g..', '.ggg.'], { r: pal.accent2, R: WHITE, g: hex('#3a6a2a') });
  p.rect(208, 6, 26, 36, pal.accent);
  p.rect(210, 8, 22, 32, mix(pal.accent, pal.ink, 0.25));
  p.sprite(215, 14, ['..g..', 'r.g.r', 'rrrrr', 'rRrRr', '.rrr.', '..g..', '..g..', '.ggg.'], { r: pal.accent2, R: WHITE, g: hex('#3a6a2a') });
  // 议员们
  const who = s.who ?? [];
  who.forEach((id, i) => bust(p, 26 + i * 40, 42, lookFor(id, '1637'), t + i * 7));
  // 长桌（绿呢）
  p.rect(14, 60, 292, 6, hex('#2d4a2a'));
  p.hline(14, 305, 60, hex('#4a6a3a'));
  p.rect(14, 66, 292, 3, pal.mid);
  for (let i = 0; i < who.length; i++) {
    p.rect(40 + i * 40, 57, 8, 3, pal.paper);
    p.line(50 + i * 40, 58, 53 + i * 40, 55, pal.ink);
  }
  p.vgrad(0, 69, w, h - 69, pal.dark, pal.ink);
  for (let x = 0; x < w; x += 12) for (let y = 70 + ((x / 12) % 2) * 6; y < h; y += 12) p.rect(x, y, 6, 6, mix(pal.dark, pal.paper, 0.12));
  p.engrave(pal.ink, 0.3);
}

/** 把 320 宽的构图放在中间，两侧按最边上一列的颜色延展（墙与地板本来就是横向均匀的） */
function widen(p: Pix, draw: (q: Pix) => void) {
  if (p.w === SCENE_SIZE.w) return draw(p);
  const q = new Pix(SCENE_SIZE.w, p.h);
  draw(q);
  const ox = Math.floor((p.w - q.w) / 2);
  for (let y = 0; y < p.h; y++) {
    const left = q.get(0, y);
    const right = q.get(q.w - 1, y);
    for (let x = 0; x < p.w; x++) {
      const sx = x - ox;
      if (sx >= 0 && sx < q.w) p.set(x, y, q.get(sx, y));
      else {
        // 延展的部分稍暗、带一点抖动，免得像拉伸
        const c = sx < 0 ? left : right;
        const d = sx < 0 ? -sx : sx - q.w + 1;
        p.set(x, y, bayer(x, y) < Math.min(0.5, d / 400) ? mix(c, hex('#000000'), 0.35) : c);
      }
    }
  }
}

export function drawScene(p: Pix, id: SceneId, t: number, s: SceneState & { era?: Era } = {}): void {
  if (id !== 'floor' && p.w !== SCENE_SIZE.w) {
    widen(p, (q) => drawScene(q, id, t, { ...s, faded: 0 }));
    if (s.faded) p.desaturate(s.faded);
    return;
  }
  switch (id) {
    case 'tavern':
      tavern(p, t, s);
      break;
    case 'floor':
      floor1995(p, t, s);
      break;
    case 'room':
      room2021(p, t, s);
      break;
    case 'desk':
      desk2021(p, t, s);
      break;
    case 'study':
      study(p, t, s);
      break;
    case 'chamber':
      chamber(p, t, s);
      break;
  }
  if (s.faded) p.desaturate(s.faded);
}
