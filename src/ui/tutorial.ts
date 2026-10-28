import { replay, type Game } from '../engine/game';

/**
 * 难度与教学（设计文档第十三章）。
 *
 * 难度只改界面和节奏，不碰撮合与价格：同一种子在任何难度下都是同一个市场，排行榜照样可以重放校验。
 * 新手档的界面逐层解锁：价格线 → K 线与逐笔 → 订单簿 → 杠杆 → 衍生品。每层配一个小目标，
 * 完成就解锁下一层；不去做也没关系，到了对应的交易日自动解锁，决战日全部打开。
 * 解锁进度从动作日志推出来，读档后自然恢复，不必另存。
 */

export type Difficulty = 'novice' | 'standard' | 'expert' | 'iron';

export const DIFFICULTIES: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'novice', name: '新手', desc: '界面逐层解锁，每层一个小目标；情报标出可信度；倒计时多一半；每局可以撤回一天。' },
  { id: 'standard', name: '标准', desc: '一开始就是全部界面。情报的可信度藏在背后。' },
  { id: 'expert', name: '专家', desc: '倒计时只有六成；老周不再提点你。' },
  { id: 'iron', name: '铁人', desc: '专家之上：决战日不能暂停，时间不等人。' },
];

export const difficultyName = (d: string | undefined) => DIFFICULTIES.find((x) => x.id === d)?.name ?? '标准';

export interface Layer {
  n: number;
  name: string;
  /** 这一层打开了什么 */
  opens: string;
  /** 完成它就解锁下一层 */
  goal: string;
}

export const LAYERS: Layer[] = [
  { n: 1, name: '价格线', opens: '分时图、买入卖出、你的账户', goal: '下第一笔单：买入或卖出都行' },
  { n: 2, name: 'K 线与逐笔', opens: '日线、逐笔成交（每一笔大单都带着席位号）', goal: '撑过第一个收盘，读一次夜里的复盘' },
  { n: 3, name: '订单簿', opens: '盘口、限价单与冰山单、挂单列表、计划书', goal: '挂一张限价单，或写一条计划书' },
  { n: 4, name: '杠杆', opens: '融资与垫资、止损止盈', goal: '设一对止损止盈，或者借一次钱' },
  { n: 5, name: '衍生品', opens: '期权链与现券', goal: '' },
];

/** 当前解锁到第几层（1–5）。非新手档、或不下单的座位（监管）一律全开 */
export function tutorialLayer(g: Game): number {
  if (g.difficulty !== 'novice' || g.faction.observer) return 5;
  const acts = g.log.map((l) => l.action);
  let n = 1;
  if (acts.some((a) => a.type === 'order')) n = 2;
  if (n >= 2 && g.dayIndex >= 1) n = 3;
  if (n >= 3 && acts.some((a) => (a.type === 'order' && a.req.type === 'limit') || a.type === 'plan-add')) n = 4;
  if (n >= 4 && acts.some((a) => (a.type === 'plan-add' && a.plan.oco != null) || (a.type === 'credit' && a.op === 'take'))) n = 5;
  // 不去做目标也会按天解锁：第几个交易日就至少开到第几层，决战日全部打开
  const byDay = g.day.kind === 'layout' ? g.dayIndex + 1 : 5;
  return Math.min(5, Math.max(n, byDay));
}

/** 倒计时的倍率 */
export function countdownScale(g: Game): number {
  return g.difficulty === 'novice' ? 1.5 : g.difficulty === 'expert' || g.difficulty === 'iron' ? 0.6 : 1;
}

export const canUndo = (g: Game) => g.difficulty === 'novice' && g.undos < 1 && !g.ending;

/**
 * 撤回一天：回到今天开盘（夜里撤回，就回到刚过去那一天的开盘）。
 * 用的是存档同一套重放：把今天开盘之后的动作从日志里拿掉，再重放到开盘那一分钟。
 */
export function undoDay(g: Game): Game {
  const start = g.dayIndex * (g.market.session.minutes + 1);
  const next = replay(
    g.scenario,
    g.seed,
    g.factionId,
    g.principleId,
    g.log.filter((l) => l.at < start),
    start,
  );
  next.difficulty = g.difficulty;
  next.undos = g.undos + 1;
  return next;
}

/** 可信度的粗略标注（只在新手档显示） */
export function credLabel(c: number): [string, string] {
  return c >= 0.8 ? ['可信度高', 'hi'] : c >= 0.5 ? ['可信度一般', 'mid'] : ['可信度低', 'lo'];
}
