import { hex, type RGB } from './pix';

/** 设计文档 11.1：每个年代一套调色板 */
export type Era = '1637' | '1995' | '2015' | '2021';

export interface Palette {
  ink: RGB;
  deep: RGB;
  dark: RGB;
  mid: RGB;
  light: RGB;
  paper: RGB;
  accent: RGB;
  accent2: RGB;
  glow: RGB;
  skin: RGB[];
}

export const PALETTES: Record<Era, Palette> = {
  // 黄金时代室内油画、烛光酒馆：暖棕、郁金香红
  '1637': {
    ink: hex('#140c07'),
    deep: hex('#24160d'),
    dark: hex('#3d2716'),
    mid: hex('#6b4426'),
    light: hex('#a8743e'),
    paper: hex('#e8d4a8'),
    accent: hex('#c8323a'),
    accent2: hex('#e6b450'),
    glow: hex('#ffd27a'),
    skin: [hex('#e9b48c'), hex('#d39a72'), hex('#c4865d')],
  },
  // 红马甲交易大厅、粗颗粒胶片：褪色红、铁灰
  '1995': {
    ink: hex('#121416'),
    deep: hex('#1e2226'),
    dark: hex('#33393f'),
    mid: hex('#59626a'),
    light: hex('#8f989e'),
    paper: hex('#d9d2c2'),
    accent: hex('#b3412f'),
    accent2: hex('#d9a441'),
    glow: hex('#f2e2a8'),
    skin: [hex('#e3b48f'), hex('#d4a07a'), hex('#c58e68')],
  },
  // 深圳的玻璃幕墙、会议室的胡桃木、地产商的烫金：青灰、暗金、A 股的红
  '2015': {
    ink: hex('#0c1315'),
    deep: hex('#132228'),
    dark: hex('#1f3740'),
    mid: hex('#3b6470'),
    light: hex('#7ea6ae'),
    paper: hex('#e6e1d4'),
    accent: hex('#c9a24a'),
    accent2: hex('#d6453a'),
    glow: hex('#f3dc9a'),
    skin: [hex('#e6b892'), hex('#d4a07a'), hex('#c28c66')],
  },
  // 手机屏幕、表情包、论坛截图：高饱和紫、霓虹黄
  '2021': {
    ink: hex('#0b0614'),
    deep: hex('#160c2a'),
    dark: hex('#2a1650'),
    mid: hex('#5b2bb0'),
    light: hex('#9b6bff'),
    paper: hex('#efe9ff'),
    accent: hex('#ffe23d'),
    accent2: hex('#2ef2c8'),
    glow: hex('#c9a8ff'),
    skin: [hex('#f1c3a0'), hex('#c98d63'), hex('#8d5a3b')],
  },
};

export function eraOfScenario(id: string): Era {
  return id === 'tulip' ? '1637' : id === 'gme2021' ? '2021' : id === 'takeover2015' ? '2015' : '1995';
}
