import { PALETTES, type Era } from './palettes';
import { bayer, hex, mix, Pix, type RGB } from './pix';

/** 人物外观：头发、帽子、胡子、眼镜、衣着。只描述样子，不写任何秘密。 */
export interface Look {
  era: Era;
  skin: number;
  hair: RGB;
  hairStyle: 'short' | 'bald' | 'long' | 'bun' | 'side' | 'messy' | 'crop';
  hat?: 'capotain' | 'coif' | 'beret' | 'cap' | 'headband' | 'hood' | 'headphones';
  beard?: 'full' | 'mustache' | 'goatee' | 'stubble';
  glasses?: boolean;
  outfit: RGB;
  collar: 'ruff' | 'falling' | 'shirt' | 'tie' | 'vest' | 'hoodie' | 'tee' | 'blouse';
  accent?: RGB;
  old?: boolean;
  /** 窄脸 / 圆脸 */
  face?: 'narrow' | 'round';
}

const BLACK = hex('#1a1412');
const GREY = hex('#9a9690');
const WHITE = hex('#efe8dc');
const BROWN = hex('#4a2c18');
const DARK_BROWN = hex('#2e1d12');
const BLOND = hex('#b8904a');
const RED_VEST = hex('#b3302a');

export const LOOKS: Record<string, Look> = {
  // ── 1637 哈勒姆 ──
  jan: { era: '1637', skin: 0, hair: BROWN, hairStyle: 'messy', outfit: hex('#5a4630'), collar: 'falling', face: 'round' },
  pieter: { era: '1637', skin: 1, hair: BLOND, hairStyle: 'short', hat: 'beret', outfit: hex('#e6dcc8'), collar: 'shirt', beard: 'stubble', face: 'round' },
  cornelis: { era: '1637', skin: 2, hair: GREY, hairStyle: 'long', hat: 'capotain', beard: 'full', outfit: hex('#3a2d22'), collar: 'falling', old: true, face: 'narrow' },
  maritje: { era: '1637', skin: 0, hair: DARK_BROWN, hairStyle: 'bun', hat: 'coif', outfit: BLACK, collar: 'ruff', face: 'narrow' },
  dirck: { era: '1637', skin: 1, hair: DARK_BROWN, hairStyle: 'side', hat: 'capotain', beard: 'goatee', outfit: hex('#2a2a36'), collar: 'ruff', accent: hex('#c8a040') },
  hendrick: { era: '1637', skin: 0, hair: hex('#8a4a22'), hairStyle: 'long', hat: 'beret', outfit: hex('#6a2a2a'), collar: 'falling', face: 'narrow' },
  gerrit: { era: '1637', skin: 2, hair: hex('#6a4a2a'), hairStyle: 'bald', beard: 'mustache', outfit: hex('#7a5a3a'), collar: 'shirt', face: 'round' },
  meer: { era: '1637', skin: 2, hair: GREY, hairStyle: 'side', hat: 'capotain', beard: 'full', outfit: hex('#2d3a22'), collar: 'ruff', old: true, face: 'round' },
  schaep: { era: '1637', skin: 0, hair: BROWN, hairStyle: 'short', hat: 'capotain', outfit: BLACK, collar: 'ruff', beard: 'mustache', face: 'narrow' },
  bloc: { era: '1637', skin: 1, hair: hex('#7a3a1a'), hairStyle: 'messy', outfit: hex('#6a1e24'), collar: 'falling', beard: 'full', face: 'round' },
  spiegel: { era: '1637', skin: 0, hair: GREY, hairStyle: 'side', glasses: true, outfit: BLACK, collar: 'falling', old: true },
  goes: { era: '1637', skin: 1, hair: WHITE, hairStyle: 'bald', hat: 'beret', outfit: BLACK, collar: 'falling', beard: 'full', old: true, face: 'narrow' },
  witt: { era: '1637', skin: 0, hair: DARK_BROWN, hairStyle: 'long', hat: 'capotain', outfit: hex('#202838'), collar: 'ruff', beard: 'goatee', accent: hex('#c8a040') },
  // ── 1995 上海 ──
  gao: { era: '1995', skin: 2, hair: BLACK, hairStyle: 'crop', outfit: hex('#3a3026'), collar: 'tie', accent: hex('#b8302a'), face: 'round' },
  wei: { era: '1995', skin: 0, hair: hex('#3a3634'), hairStyle: 'side', glasses: true, outfit: hex('#2a2e36'), collar: 'tie', accent: hex('#3a4a6a'), old: true },
  chen: { era: '1995', skin: 1, hair: BLACK, hairStyle: 'short', glasses: true, outfit: hex('#2e3338'), collar: 'tie', accent: hex('#4a4a4a'), face: 'narrow' },
  su: { era: '1995', skin: 0, hair: BLACK, hairStyle: 'long', outfit: hex('#c8b89a'), collar: 'blouse', face: 'narrow' },
  zhou: { era: '1995', skin: 2, hair: GREY, hairStyle: 'side', outfit: RED_VEST, collar: 'vest', old: true },
  qian: { era: '1995', skin: 1, hair: BLACK, hairStyle: 'side', outfit: hex('#4a3a2a'), collar: 'shirt', accent: hex('#d9a441'), face: 'round' },
  shen: { era: '1995', skin: 0, hair: hex('#2a2624'), hairStyle: 'side', outfit: hex('#22262c'), collar: 'tie', accent: hex('#6a2020'), face: 'narrow' },
  lu: { era: '1995', skin: 1, hair: BLACK, hairStyle: 'short', glasses: true, outfit: hex('#3a3e44'), collar: 'tie', accent: hex('#2a3a5a') },
  yan: { era: '1995', skin: 2, hair: hex('#4a4644'), hairStyle: 'crop', outfit: hex('#2a2c30'), collar: 'tie', accent: hex('#5a2a2a'), old: true, face: 'narrow' },
  // ── 2015 深圳 ──
  ye: { era: '2015', skin: 2, hair: BLACK, hairStyle: 'crop', outfit: hex('#1e2a30'), collar: 'shirt', face: 'round' },
  wang: { era: '2015', skin: 1, hair: GREY, hairStyle: 'side', outfit: hex('#2a3a30'), collar: 'shirt', old: true, face: 'narrow' },
  yu: { era: '2015', skin: 0, hair: BLACK, hairStyle: 'short', glasses: true, outfit: hex('#26323a'), collar: 'tie', accent: hex('#3b6470') },
  fu: { era: '2015', skin: 1, hair: hex('#3a3634'), hairStyle: 'side', outfit: hex('#202428'), collar: 'tie', accent: hex('#7a2a24'), old: true },
  wu: { era: '2015', skin: 0, hair: BLACK, hairStyle: 'side', outfit: hex('#3a3026'), collar: 'tie', accent: hex('#c9a24a'), face: 'round' },
  lin: { era: '2015', skin: 2, hair: GREY, hairStyle: 'crop', glasses: true, outfit: hex('#2a2e36'), collar: 'tie', accent: hex('#2a5a8a'), old: true },
  chang: { era: '2015', skin: 1, hair: hex('#4a4644'), hairStyle: 'short', outfit: hex('#1e2226'), collar: 'tie', accent: hex('#5a2a2a'), old: true, face: 'narrow' },
  xu: { era: '2015', skin: 0, hair: BLACK, hairStyle: 'long', outfit: hex('#c8b89a'), collar: 'blouse', face: 'narrow' },
  zhong: { era: '2015', skin: 2, hair: WHITE, hairStyle: 'side', glasses: true, outfit: hex('#5a5a4a'), collar: 'shirt', old: true },
  // ── 2021 纽约 ──
  cat: { era: '2021', skin: 0, hair: hex('#5a3a22'), hairStyle: 'short', hat: 'headband', beard: 'stubble', outfit: hex('#3a3a44'), collar: 'tee', accent: hex('#d8322a') },
  jack: { era: '2021', skin: 0, hair: BLOND, hairStyle: 'messy', hat: 'headphones', outfit: hex('#5b2bb0'), collar: 'hoodie', accent: hex('#ffe23d'), face: 'round' },
  rowan: { era: '2021', skin: 1, hair: hex('#3a2a1a'), hairStyle: 'side', outfit: hex('#22263a'), collar: 'shirt', beard: 'stubble', face: 'narrow' },
  stone: { era: '2021', skin: 0, hair: GREY, hairStyle: 'bald', glasses: true, outfit: hex('#1e2230'), collar: 'tie', accent: hex('#4a6aa8'), old: true },
  tom: { era: '2021', skin: 1, hair: BLACK, hairStyle: 'short', outfit: hex('#2a2a2a'), collar: 'tee', face: 'round' },
  susan: { era: '2021', skin: 0, hair: hex('#c89a4a'), hairStyle: 'long', outfit: hex('#a82a5a'), collar: 'blouse', face: 'narrow' },
  bill: { era: '2021', skin: 0, hair: WHITE, hairStyle: 'side', glasses: true, beard: 'mustache', outfit: hex('#3a4a6a'), collar: 'shirt', old: true },
};

/** 没登记过外观的人：按名字生成一个 */
export function lookFor(id: string, era: Era): Look {
  if (LOOKS[id]) return LOOKS[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const pick = <T,>(xs: T[]) => xs[Math.abs(h >> 3) % xs.length];
  return { era, skin: Math.abs(h) % 3, hair: pick([BLACK, BROWN, DARK_BROWN, GREY]), hairStyle: pick(['short', 'side', 'crop'] as const), outfit: pick([hex('#2a2e36'), hex('#3a3026'), hex('#33393f')]), collar: era === '1637' ? 'falling' : 'shirt' };
}

export type Mood = 'smile' | 'neutral' | 'frown';

/**
 * 32×32 的人物立绘。blink 闭眼，talk 张嘴（0 闭 / 1 开），mood 决定嘴角。
 */
export function drawPortrait(p: Pix, look: Look, opts: { blink?: boolean; talk?: number; mood?: Mood } = {}): void {
  const pal = PALETTES[look.era];
  const skin = pal.skin[look.skin] ?? pal.skin[0];
  const shade = mix(skin, pal.ink, 0.28);
  const deepShade = mix(skin, pal.ink, 0.5);
  const hl = mix(skin, hex('#ffffff'), 0.18);
  // 背景：年代主色的抖动渐变
  p.vgrad(0, 0, 32, 32, mix(pal.dark, pal.mid, 0.25), pal.deep);
  if (look.era === '1637') p.glow(26, 6, 12, pal.glow, 0.35);
  if (look.era === '2021') p.glow(4, 28, 14, pal.light, 0.4);

  const narrow = look.face === 'narrow';
  const round = look.face === 'round';
  const rx = narrow ? 6 : round ? 7.6 : 7;
  const cx = 16;
  const cy = 14;
  const ry = 8.6;

  // 长发在头后面
  if (look.hairStyle === 'long') {
    p.rect(cx - rx - 1, cy - 4, 2 * rx + 3, 13, look.hair);
    p.rect(cx - rx - 1, cy + 8, 3, 4, look.hair);
    p.rect(cx + rx - 1, cy + 8, 3, 4, look.hair);
  }
  if (look.hat === 'hood' || look.collar === 'hoodie') {
    p.disc(cx, cy + 1, 11, mix(look.outfit, pal.ink, 0.15));
  }

  // 衣服与肩膀
  for (let y = 24; y < 32; y++) {
    const half = 8 + (y - 24) * 1.4;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, bayer(x, y) < (y - 24) / 14 ? mix(look.outfit, pal.ink, 0.25) : look.outfit);
  }
  // 脖子
  p.rect(cx - 2, 21, 5, 4, shade);

  // 领口
  switch (look.collar) {
    case 'ruff': // 拉夫领：白色的褶领
      for (let x = cx - 8; x <= cx + 8; x++) {
        const y0 = 22 + Math.round(Math.abs(x - cx) * 0.12);
        p.set(x, y0, WHITE);
        p.set(x, y0 + 1, x % 2 ? WHITE : mix(WHITE, pal.ink, 0.25));
        p.set(x, y0 + 2, WHITE);
      }
      break;
    case 'falling': // 平铺的白色大翻领
      for (let x = cx - 6; x <= cx + 6; x++) for (let y = 24; y < 27 - Math.floor(Math.abs(x - cx) / 3); y++) p.set(x, y, WHITE);
      break;
    case 'shirt':
      p.rect(cx - 3, 24, 7, 3, WHITE);
      p.set(cx, 25, mix(WHITE, pal.ink, 0.3));
      break;
    case 'tie':
      p.rect(cx - 3, 24, 7, 2, WHITE);
      p.set(cx - 3, 26, WHITE);
      p.set(cx + 3, 26, WHITE);
      p.rect(cx - 1, 25, 3, 7, look.accent ?? pal.accent);
      p.set(cx, 25, mix(look.accent ?? pal.accent, hex('#ffffff'), 0.25));
      break;
    case 'vest': // 场内交易员的红马甲，里面白衬衫
      p.rect(cx - 3, 24, 7, 8, WHITE);
      p.rect(cx - 1, 25, 3, 7, look.outfit);
      p.set(cx, 28, pal.accent2);
      break;
    case 'blouse':
      p.rect(cx - 2, 24, 5, 2, mix(look.outfit, WHITE, 0.4));
      p.line(cx - 4, 24, cx, 28, mix(look.outfit, WHITE, 0.5));
      p.line(cx + 4, 24, cx, 28, mix(look.outfit, WHITE, 0.5));
      break;
    case 'hoodie':
      p.line(cx - 2, 25, cx - 2, 29, mix(look.outfit, WHITE, 0.6));
      p.line(cx + 2, 25, cx + 2, 29, mix(look.outfit, WHITE, 0.6));
      if (look.accent) p.disc(cx + 6, 29, 1, look.accent);
      break;
    case 'tee':
      p.hline(cx - 3, cx + 3, 24, mix(look.outfit, pal.ink, 0.4));
      if (look.accent) p.rect(cx - 2, 27, 5, 3, look.accent);
      break;
  }

  // 脸：椭圆 + 右侧阴影
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      // 下巴收窄
      const chin = y > cy + 3 ? 1 + (y - cy - 3) * 0.05 : 1;
      if (dx * dx * chin * chin + dy * dy > 1) continue;
      let c = skin;
      if (dx > 0.45 && bayer(x, y) < (dx - 0.45) * 2) c = shade;
      if (dx < -0.5 && dy < 0 && bayer(x, y) < 0.3) c = hl;
      p.set(x, y, c);
    }
  // 耳朵
  p.set(cx - Math.round(rx) - 1, cy + 1, shade);
  p.set(cx - Math.round(rx) - 1, cy + 2, shade);
  p.set(cx + Math.round(rx) + 1, cy + 1, deepShade);
  p.set(cx + Math.round(rx) + 1, cy + 2, deepShade);

  // 头发
  const top = Math.floor(cy - ry);
  const hairDark = mix(look.hair, pal.ink, 0.3);
  const hairTop = (rows: number, fringe: (x: number) => number) => {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x - cx) / (rx + 1);
      const arc = Math.round(Math.sqrt(Math.max(0, 1 - dx * dx)) * rows);
      for (let y = top + rows - arc - 1; y < top + rows + fringe(x); y++) p.set(x, y, bayer(x, y) < 0.25 ? hairDark : look.hair);
    }
  };
  switch (look.hairStyle) {
    case 'short':
      hairTop(4, () => 0);
      break;
    case 'crop':
      hairTop(3, () => 0);
      break;
    case 'side':
      hairTop(4, (x) => (x < cx - 1 ? 1 : 0));
      p.line(cx - 2, top + 1, cx - 1, top + 4, hairDark);
      break;
    case 'messy':
      hairTop(5, (x) => (x % 3 === 0 ? 1 : 0));
      p.set(cx - 4, top - 1, look.hair);
      p.set(cx + 2, top - 1, look.hair);
      break;
    case 'long':
      hairTop(5, (x) => (Math.abs(x - cx) > rx - 2 ? 6 : 0));
      break;
    case 'bun':
      hairTop(4, () => 0);
      p.disc(cx + 4, top, 2, look.hair);
      break;
    case 'bald':
      p.rect(cx - Math.round(rx), cy - 2, 2, 4, look.hair);
      p.rect(cx + Math.round(rx) - 1, cy - 2, 2, 4, look.hair);
      p.set(cx - 2, top + 2, hl);
      break;
  }
  if (look.old) {
    p.set(cx - 4, cy + 4, shade);
    p.set(cx + 4, cy + 4, deepShade);
    p.hline(cx - 2, cx + 1, top + 5, shade);
  }

  // 帽子
  const hatC = look.era === '1637' ? BLACK : look.outfit;
  switch (look.hat) {
    case 'capotain': // 17 世纪荷兰的高筒帽
      p.rect(cx - rx - 3, top + 2, 2 * rx + 7, 2, hatC);
      p.rect(cx - rx + 1, top - 5, 2 * rx - 1, 7, hatC);
      p.hline(cx - rx + 1, cx + rx - 1, top, mix(hatC, hex('#c8a040'), 0.5));
      break;
    case 'coif': // 白色头巾帽
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x - cx) / (rx + 1);
        const arc = Math.round(Math.sqrt(Math.max(0, 1 - dx * dx)) * 6);
        for (let y = top + 6 - arc; y < top + 4 + (Math.abs(x - cx) > rx - 1 ? 6 : 0); y++) p.set(x, y, bayer(x, y) < 0.2 ? mix(WHITE, pal.ink, 0.15) : WHITE);
      }
      break;
    case 'beret':
      p.rect(cx - rx - 1, top - 1, 2 * rx + 4, 3, hatC === BLACK ? hex('#3a2a2a') : hatC);
      p.rect(cx - rx + 1, top - 3, 2 * rx, 2, hatC === BLACK ? hex('#3a2a2a') : hatC);
      break;
    case 'cap':
      p.rect(cx - rx, top, 2 * rx + 1, 3, look.accent ?? pal.mid);
      p.rect(cx, top + 2, rx + 4, 1, look.accent ?? pal.mid);
      break;
    case 'headband':
      p.hline(cx - rx, cx + rx, top + 3, look.accent ?? pal.accent);
      p.hline(cx - rx, cx + rx, top + 4, look.accent ?? pal.accent);
      p.set(cx + rx + 1, top + 5, look.accent ?? pal.accent);
      p.set(cx + rx + 2, top + 6, look.accent ?? pal.accent);
      break;
    case 'headphones':
      p.line(cx - rx - 1, cy, cx - rx + 1, top - 1, hex('#222222'));
      p.line(cx + rx + 1, cy, cx + rx - 1, top - 1, hex('#222222'));
      p.hline(cx - rx + 1, cx + rx - 1, top - 2, hex('#222222'));
      p.rect(cx - rx - 2, cy - 1, 2, 4, look.accent ?? pal.accent);
      p.rect(cx + rx + 1, cy - 1, 2, 4, look.accent ?? pal.accent);
      break;
  }

  // 眉、眼、鼻、嘴
  const eyeY = cy;
  const brow = mix(look.hair, pal.ink, 0.2);
  const m = opts.mood ?? 'neutral';
  p.hline(cx - 5, cx - 3, eyeY - 2 + (m === 'frown' ? 0 : 0), brow);
  p.hline(cx + 2, cx + 4, eyeY - 2, brow);
  if (m === 'frown') {
    p.set(cx - 3, eyeY - 1, brow);
    p.set(cx + 2, eyeY - 1, brow);
  }
  if (opts.blink) {
    p.hline(cx - 5, cx - 3, eyeY, deepShade);
    p.hline(cx + 2, cx + 4, eyeY, deepShade);
  } else {
    p.set(cx - 4, eyeY, WHITE);
    p.set(cx - 3, eyeY, pal.ink);
    p.set(cx + 3, eyeY, pal.ink);
    p.set(cx + 4, eyeY, WHITE);
    p.set(cx - 4, eyeY + 1, shade);
    p.set(cx + 3, eyeY + 1, shade);
  }
  if (look.glasses) {
    const g = hex('#1e1e1e');
    for (const ox of [-6, 1]) {
      p.hline(cx + ox, cx + ox + 4, eyeY - 1, g);
      p.hline(cx + ox, cx + ox + 4, eyeY + 2, g);
      p.vline(cx + ox, eyeY - 1, eyeY + 2, g);
      p.vline(cx + ox + 4, eyeY - 1, eyeY + 2, g);
    }
    p.set(cx - 1, eyeY, g);
    p.set(cx, eyeY, g);
  }
  // 鼻子
  p.set(cx, eyeY + 2, shade);
  p.set(cx, eyeY + 3, shade);
  p.set(cx + 1, eyeY + 4, deepShade);
  // 胡子
  const beardC = mix(look.hair, pal.ink, 0.1);
  if (look.beard === 'full') {
    for (let y = eyeY + 4; y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx + 1); x <= Math.ceil(cx + rx - 1); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.05 && (y > eyeY + 5 || Math.abs(x - cx) > 2)) p.set(x, y, bayer(x, y) < 0.3 ? hairDark : beardC);
      }
    p.rect(cx - 2, cy + ry - 1, 5, 3, beardC);
  }
  if (look.beard === 'goatee') p.rect(cx - 1, cy + 7, 3, 3, beardC);
  if (look.beard === 'stubble')
    for (let y = eyeY + 5; y <= cy + ry - 1; y++) for (let x = cx - 4; x <= cx + 4; x++) if ((x + y) % 2 === 0 && Math.abs(x - cx) + (y - eyeY) > 4) p.set(x, y, mix(skin, look.hair, 0.45));
  // 嘴
  const mouthY = eyeY + 6;
  const lip = mix(skin, hex('#7a2a24'), 0.55);
  if (opts.talk) {
    p.hline(cx - 1, cx + 1, mouthY, hex('#3a1612'));
    p.hline(cx - 1, cx + 1, mouthY + 1, hex('#5a2018'));
  } else if (m === 'smile') {
    p.hline(cx - 1, cx + 1, mouthY + 1, lip);
    p.set(cx - 2, mouthY, lip);
    p.set(cx + 2, mouthY, lip);
  } else if (m === 'frown') {
    p.hline(cx - 1, cx + 1, mouthY, lip);
    p.set(cx - 2, mouthY + 1, lip);
    p.set(cx + 2, mouthY + 1, lip);
  } else p.hline(cx - 1, cx + 1, mouthY, lip);
  if (look.beard === 'mustache' || look.beard === 'full') p.hline(cx - 3, cx + 3, mouthY - 1, beardC);

  if (look.accent && look.era === '1637' && look.collar === 'ruff') p.set(cx + 6, 28, look.accent);
  p.engrave(pal.ink, 0.25);
}
