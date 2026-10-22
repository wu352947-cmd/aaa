/**
 * 《午夜点名》ROLL CALL AT MIDNIGHT —— 分镜脚本
 *
 * 午夜 00:13，十三名学生被困在连江一中。广播宣布唯一的规则：天亮之前，别被点到名字。
 * 开膛手杰克开始“点名”：每念到一个名字，校园某处就有一支手电熄灭，原地站起一个纸扎人。
 * 血雾像收缩的圈一样合拢。最后一个女孩跑到东门，铁门为她打开——广播念出了第十三个名字。
 *
 * 坐标系与游戏一致：x 向东，z 向南，y 向上，单位米。
 */

export const DURATION = 187

export type V3 = [number, number, number]

export interface CamKey {
  u: number // 镜头内进度 0..1
  p: V3
  t: V3
  fov?: number
  roll?: number
}

export interface Shot {
  id: string
  start: number
  end: number
  title: string // 分镜说明（开发用）
  keys: CamKey[]
  ease?: 'smooth' | 'linear' | 'in' | 'out'
  shake?: number // 手持晃动幅度
  black?: boolean // 黑场
  time?: 'horror' | 'dawn'
  fog?: number
  moon?: V3 // 月亮方向（剪影镜头）
  flashlight?: boolean // 机位自带手电（主观镜头）
  light?: number // 环境光倍率（默认 0.5，比游戏更暗）
}

const S = (id: string, start: number, end: number, title: string, keys: CamKey[], o: Partial<Shot> = {}): Shot => ({ id, start, end, title, keys, ...o })

export const SHOTS: Shot[] = [
  S('s01', 0, 9, '黑场。时钟走动，片头字。', [{ u: 0, p: [0, -2000, 0], t: [0, -2000, -1] }], { black: true }),
  S(
    's02',
    9,
    24,
    '航拍：从血色云层里俯冲，整座校园在血月下展开；镜头穿过悬在云中的出品字样。',
    [
      { u: 0, p: [300, 600, 760], t: [60, 0, 80], fov: 50 },
      { u: 0.45, p: [165, 360, 470], t: [20, 0, 50], fov: 48 },
      { u: 1, p: [-20, 120, 230], t: [-80, 10, 60], fov: 44, roll: -0.06 },
    ],
    { ease: 'smooth', fog: 0.0035, light: 0.85 },
  ),
  S(
    's03',
    24,
    33,
    '推镜：钟楼。指针倒转，停在 00:13。第一声钟响，切黑。',
    [
      { u: 0, p: [-104, 22, 150], t: [-118, 31, 79], fov: 42 },
      { u: 1, p: [-118, 28.4, 92], t: [-118, 28.3, 82], fov: 26 },
    ],
    { ease: 'in', fog: 0.012 },
  ),
  S('s04', 33, 39, '片名卡（黑场）。', [{ u: 0, p: [0, -2000, 0], t: [0, -2000, -1] }], { black: true }),
  S(
    's05',
    39,
    50,
    '00:13。低机位横移：升旗广场上挤作一团的学生，手电光乱晃。广播响起。',
    [
      { u: 0, p: [-34, 1.3, 44.5], t: [4, 2.6, 10], fov: 40 },
      { u: 1, p: [-14, 1.5, 42], t: [10, 3, 6], fov: 36 },
    ],
    { ease: 'linear', shake: 0.004 },
  ),
  S(
    's06',
    50,
    56.4,
    '仰拍剪影：笃行楼顶，血月正中站着戴高礼帽的人。荷兰角。',
    [
      { u: 0, p: [7, 1, 27], t: [0, 26, -10], fov: 32, roll: 0.16 },
      { u: 1, p: [5, 1.1, 24], t: [0, 27.6, -10.4], fov: 12, roll: 0.2 },
    ],
    { ease: 'in', moon: [-0.12, 0.58, -0.8], fog: 0.008 },
  ),
  S(
    's06b',
    56.4,
    57.6,
    '闪回：1888 年，伦敦白教堂，煤气灯下远去的背影。',
    [
      { u: 0, p: [0.6, -498.3, 9], t: [0, -498.6, -10], fov: 38 },
      { u: 1, p: [0.4, -498.3, 7.8], t: [0, -498.6, -10], fov: 36 },
    ],
    { ease: 'linear', fog: 0.05 },
  ),
  S(
    's06c',
    57.6,
    60,
    '回到楼顶：人已经不见了。',
    [
      { u: 0, p: [5, 1.1, 24], t: [0, 27.6, -10.4], fov: 12, roll: 0.2 },
      { u: 1, p: [5, 1.1, 24], t: [0, 27.4, -10.4], fov: 13, roll: 0.2 },
    ],
    { moon: [-0.12, 0.58, -0.8], fog: 0.008 },
  ),
  S(
    's07',
    60,
    70,
    '恐慌：人群四散。手持跟拍，镜头被撞得左右甩。',
    [
      { u: 0, p: [3, 1.6, 36], t: [-20, 1.2, 46], fov: 50 },
      { u: 0.35, p: [1, 1.5, 33], t: [24, 1.4, 40], fov: 52 },
      { u: 0.7, p: [-2, 1.6, 31], t: [-6, 1.2, 8], fov: 50 },
      { u: 1, p: [-4, 1.4, 34], t: [-30, 1.6, 60], fov: 48 },
    ],
    { ease: 'linear', shake: 0.06 },
  ),
  S(
    's08',
    70,
    80,
    '古榕下：一个女孩缩在气根里。广播念出她的名字。手电滚落，原地站着一个纸人。',
    [
      { u: 0, p: [-27, 1.3, 73], t: [-12, 1.1, 62], fov: 34 },
      { u: 0.55, p: [-23, 1.3, 70], t: [-12, 1.0, 62], fov: 30 },
      { u: 0.56, p: [-15.5, 0.35, 64.5], t: [-11.6, 0.2, 62.4], fov: 40 },
      { u: 0.8, p: [-15.5, 0.6, 64.5], t: [-12, 1.1, 62], fov: 40 },
      { u: 1, p: [-15.2, 1.4, 64.2], t: [-12, 1.45, 62], fov: 32 },
    ],
    { ease: 'linear', fog: 0.022 },
  ),
  S(
    's09',
    80,
    92,
    '上帝视角：整座校园是一张地图。手电光点一个接一个熄灭，血雾的圈在收拢。',
    [
      { u: 0, p: [12, 560, 62], t: [12, 0, 60], fov: 40, roll: 0 },
      { u: 1, p: [12, 430, 36], t: [12, 0, 34], fov: 40, roll: 0.35 },
    ],
    { ease: 'linear', fog: 0.0015, light: 0.9 },
  ),
  S(
    's10',
    92,
    104,
    '操场：死去的学生变成纸人，在跑道中央列队“做早操”。横移。所有的头一起转过来。',
    [
      { u: 0, p: [46, 1.6, 79], t: [50, 1.5, 100], fov: 38 },
      { u: 0.75, p: [88, 1.6, 79], t: [90, 1.5, 100], fov: 36 },
      { u: 1, p: [92, 1.6, 80], t: [80, 1.6, 95], fov: 28 },
    ],
    { ease: 'linear', fog: 0.024, light: 0.35 },
  ),
  S(
    's11',
    104,
    118,
    '追逐：女孩迎着镜头狂奔，身后的雾里，他走得不紧不慢——每一次剪辑，他都更近。',
    [
      { u: 0, p: [-60.5, 1.45, 45.6], t: [-50, 1.5, 45], fov: 42 },
      { u: 1, p: [-133.3, 1.45, 45.6], t: [-122, 1.5, 45], fov: 42 },
    ],
    { ease: 'linear', shake: 0.025, fog: 0.02 },
  ),
  S(
    's12',
    118,
    132,
    '躲藏：她背贴古榕，关掉手电。镜头绕树一周——他就站在树的另一边。',
    [
      { u: 0, p: [-9.4, 1.45, 87], t: [-10, 1.35, 83], fov: 34 },
      { u: 0.35, p: [-5.2, 1.5, 84.5], t: [-10, 1.35, 82], fov: 34 },
      { u: 0.7, p: [-5.5, 1.6, 76], t: [-10, 1.5, 78], fov: 34 },
      { u: 0.82, p: [-8.6, 1.7, 74.6], t: [-10, 1.85, 77], fov: 30 },
      { u: 1, p: [-9.4, 1.85, 75.6], t: [-10, 1.95, 77], fov: 26 },
    ],
    { ease: 'linear', fog: 0.024 },
  ),
  S(
    's13',
    132,
    144,
    '东门：对称构图。铁门自己缓缓打开，她向镜头奔来。',
    [
      { u: 0, p: [196, 1.5, -25.5], t: [150, 3.2, -25.5], fov: 30 },
      { u: 1, p: [186, 1.5, -25.5], t: [150, 2.2, -25.5], fov: 24 },
    ],
    { ease: 'linear', fog: 0.017 },
  ),
  S(
    's14',
    144,
    156,
    '反打：她在门口回头。整条大道站满了纸人，杰克站在最前面。第十三声钟响。',
    [
      { u: 0, p: [177.5, 1.75, -23.9], t: [140, 1.6, -25.5], fov: 38 },
      { u: 1, p: [176.4, 1.7, -24.4], t: [150, 1.7, -25.5], fov: 28 },
    ],
    { ease: 'linear', fog: 0.02 },
  ),
  S(
    's15',
    156,
    162,
    '主观：她的手电一点点暗下去。黑暗里只剩一双红眼睛，越来越近。',
    [
      { u: 0, p: [171, 1.6, -25.5], t: [150, 1.6, -25.5], fov: 50 },
      { u: 1, p: [171.2, 1.6, -25.5], t: [150, 1.75, -25.5], fov: 44 },
    ],
    { ease: 'linear', shake: 0.012, flashlight: true, fog: 0.02 },
  ),
  S('s16', 162, 170, '黑场。结语卡。', [{ u: 0, p: [0, -2000, 0], t: [0, -2000, -1] }], { black: true }),
  S(
    's17',
    170,
    187,
    '尾声：黎明前的冷蓝。升机位从空旷的广场升起，旗杆下站着第十三个纸人。片尾字幕。',
    [
      { u: 0, p: [0.5, 1.7, 40], t: [1.8, 1.4, 21], fov: 36 },
      { u: 1, p: [0, 48, 36], t: [0, 0, 10], fov: 42 },
    ],
    { ease: 'smooth', time: 'dawn', fog: 0.008, light: 1 },
  ),
]

/** 字幕卡（中英双语）。{STUDIO} 在运行时替换为出品方署名 */
export interface Card {
  start: number
  end: number
  zh: string
  en?: string
  style: 'whisper' | 'title' | 'pa' | 'loc' | 'chapter' | 'epigraph' | 'credit' | 'final'
}

export const CARDS: Card[] = [
  { start: 1.5, end: 7.6, zh: '每一帧画面　每一个音符', en: 'EVERY FRAME. EVERY NOTE.', style: 'whisper' },
  { start: 4.2, end: 7.6, zh: '皆以代码生成', en: 'GENERATED IN CODE', style: 'whisper' },
  { start: 33.6, end: 38.6, zh: '午夜点名', en: 'ROLL CALL AT MIDNIGHT', style: 'title' },
  { start: 39.4, end: 44.5, zh: '00:13　福建 · 连江一中', en: 'LIANJIANG NO.1 HIGH SCHOOL · FUJIAN', style: 'loc' },
  { start: 41.2, end: 45.2, zh: '【广播】同学们，现在开始点名。', en: '[PA] Students. Roll call begins now.', style: 'pa' },
  { start: 45.6, end: 49.8, zh: '【广播】规则只有一条：天亮之前，别被点到名字。', en: "[PA] There is only one rule: don't let your name be called before dawn.", style: 'pa' },
  { start: 56.4, end: 57.6, zh: '1888　伦敦 · 白教堂', en: 'WHITECHAPEL, LONDON', style: 'loc' },
  { start: 72.6, end: 75.4, zh: '【广播】高二（7）班，林晓——', en: '[PA] Class 7, Grade 11. Lin Xiao—', style: 'pa' },
  { start: 80.6, end: 85, zh: '雾，在收拢。', en: 'THE FOG IS CLOSING IN.', style: 'chapter' },
  { start: 106, end: 109, zh: '别回头。', en: "DON'T LOOK BACK.", style: 'chapter' },
  { start: 147.2, end: 151.6, zh: '【广播】最后一位。第十三号——', en: '[PA] The last one. Number thirteen—', style: 'pa' },
  { start: 163, end: 169, zh: '那一夜的点名，没有人缺席。', en: 'AT THAT ROLL CALL, NO ONE WAS ABSENT.', style: 'epigraph' },
  { start: 172.5, end: 176, zh: '编剧　{STUDIO}', en: 'WRITTEN BY {STUDIO}', style: 'credit' },
  { start: 175.5, end: 179, zh: '导演 · 摄影 · 视效　{STUDIO}', en: 'DIRECTED, SHOT & VFX BY {STUDIO}', style: 'credit' },
  { start: 178.5, end: 182, zh: '作曲 · 音效 · 剪辑　{STUDIO}', en: 'MUSIC, SOUND & EDIT BY {STUDIO}', style: 'credit' },
  { start: 182, end: 187, zh: '一部完全由 {STUDIO} 以代码生成的电影', en: 'A FILM GENERATED ENTIRELY IN CODE BY {STUDIO}', style: 'final' },
]

/** 存活人数 */
export const COUNTER: [number, number][] = [
  [64, 13],
  [76.2, 12],
  [82, 11],
  [83.6, 10],
  [85.2, 9],
  [86.6, 8],
  [87.8, 7],
  [88.9, 6],
  [90, 5],
  [91, 4],
  [99, 3],
  [111, 2],
  [130.2, 1],
  [160.8, 0],
]
export const COUNTER_SPAN: [number, number] = [64, 162]

/** 上帝视角中熄灭的手电光点：[x, z, 熄灭时间] */
export const DOTS: [number, number, number][] = [
  [-120, 104, 82],
  [80, 120, 83.6],
  [-60, -40, 85.2],
  [130, -60, 86.6],
  [-150, 60, 87.8],
  [20, 60, 88.9],
  [-100, -80, 90],
  [100, 20, 91],
  [-30, 140, 99],
  [150, 110, 111],
  [-160, -10, 999],
  [60, -100, 999],
]

/** 女主角的奔跑路线（追逐与东门） */
export function heroineAt(t: number): { x: number; z: number; yaw: number; run: boolean; visible: boolean } {
  if (t >= 104 && t < 118) {
    const x = -55 - 5.2 * (t - 104)
    return { x, z: 45, yaw: -Math.PI / 2, run: true, visible: true }
  }
  if (t >= 118 && t < 132) return { x: -10, z: 83.2, yaw: 0, run: false, visible: true }
  if (t >= 132 && t < 144) {
    const x = Math.min(171, 108 + 5.6 * (t - 132))
    return { x, z: -25.5, yaw: Math.PI / 2, run: x < 171, visible: true }
  }
  if (t >= 144 && t < 156) {
    const turn = Math.min(1, (t - 144) / 1.6)
    return { x: 171, z: -25.5, yaw: Math.PI / 2 + Math.PI * turn, run: false, visible: true }
  }
  return { x: 0, z: 0, yaw: 0, run: false, visible: false }
}

/** 杰克的位置 */
export function ripperAt(t: number): { x: number; y: number; z: number; yaw: number; visible: boolean; tilt: number; knife: number } {
  if (t >= 50 && t < 56.4) return { x: 0, y: 26.62, z: -10.3, yaw: 0, visible: true, tilt: Math.max(0, t - 53.5) * 0.15, knife: -0.15 }
  if (t >= 56.4 && t < 57.6) return { x: 0, y: -500, z: -6 - (t - 56.4) * 1.2, yaw: Math.PI, visible: true, tilt: 0, knife: -0.15 }
  if (t >= 104 && t < 118) {
    // 每次剪辑跳近一截：14 → 10 → 6 → 3 米
    const gap = t < 108 ? 14 : t < 111 ? 10 : t < 114 ? 6.5 : 3.2
    const gx = -55 - 5.2 * (t - 104)
    return { x: gx + gap, y: 0, z: 45.3, yaw: -Math.PI / 2, visible: true, tilt: 0.1, knife: -0.4 }
  }
  if (t >= 118 && t < 132) return { x: -10.2, y: 0, z: 76.6, yaw: Math.PI * 0.08 + (t > 127 ? Math.min(1, (t - 127) / 1.5) * Math.PI * 0.9 : 0), visible: t > 121, tilt: t > 126 ? Math.min(1.2, (t - 126) * 0.5) : 0, knife: -0.3 }
  if (t >= 144 && t < 156) {
    const walk = Math.max(0, t - 150) * 0.33
    return { x: 160 + walk, y: 0, z: -25.5, yaw: Math.PI / 2, visible: true, tilt: 0.25, knife: -0.5 }
  }
  if (t >= 156 && t < 162) {
    const d = THREE_lerp(9, 0.9, Math.min(1, (t - 156) / 4.4))
    return { x: 171 - d, y: 0, z: -25.5, yaw: Math.PI / 2, visible: true, tilt: 0.35, knife: t > 159.5 ? -2.2 : -0.6 }
  }
  return { x: 0, y: -3000, z: 0, yaw: 0, visible: false, tilt: 0, knife: 0 }
}

function THREE_lerp(a: number, b: number, k: number) {
  return a + (b - a) * k
}

/** 出品方署名：发布时由页面 <meta name="film-studio"> 注入 */
export function studio() {
  const m = document.querySelector('meta[name="film-studio"]') as HTMLMetaElement | null
  return m?.content || 'CLAUDE'
}
