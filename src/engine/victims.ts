import { MINOR_DEEDS, type DarkDeed, type Game, type Victim } from './game';
import { Rng } from './rng';

/**
 * 受害者视角的共用部分：今天价格被推了多少、站在对面的人是谁、他丢了多少。
 * 剧本只提供人物和腔调；数字一律取自这一局的盘面。
 */

export interface Persona {
  from: string;
  /** 一句话介绍：退休的纺织女工、夜班护士…… */
  who: string;
  /** 本金（剧本货币） */
  stake: number;
  /** 算上杠杆，一块本金撑着多少块的仓位 */
  lev: number;
  /** 他站在哪一边：价格往他那边推，亏的是他 */
  says: { lost: (loss: string, move: string) => string; bust: (move: string) => string };
}

/**
 * 今天价格被推了多少（分）。你自己的单子推得比全天涨跌还多时（比如砸盘那天，消息先把价格抬了上去），
 * 用你推的那一截——对面的人是被它伤到的。
 */
export function dayMove(g: Game): { move: number; open: number; last: number } {
  const rc = g.recaps[g.recaps.length - 1];
  if (rc && rc.day === g.dayIndex) {
    const mine = rc.parts.find((x) => x.who === 'player')?.move ?? 0;
    return { move: Math.abs(mine) > Math.abs(rc.close - rc.open) ? mine : rc.close - rc.open, open: rc.open, last: rc.close };
  }
  const bars = g.market.bars;
  const open = bars[0]?.o ?? g.market.last;
  return { move: g.market.last - open, open, last: g.market.last };
}

/**
 * 按种子、日子和原因挑一个这一局还没出现过的人：每个人只写一次信，爆了仓的人不会再出现。
 * 同一局重放出来是同一封信。人都用完了返回 null。
 */
export function pick(g: Game, deed: DarkDeed, list: Persona[]): Persona | null {
  const seen = new Set(g.intel.filter((i) => i.kind === 'victim').map((i) => i.source));
  const left = list.filter((p) => !seen.has(p.from));
  // 最后两个人留给剧本里的危险抉择：砸盘那一下不能因为人用完了就没有回音
  if (left.length <= (MINOR_DEEDS.includes(deed.cause) || deed.cause === 'card' ? 2 : 0)) return null;
  return left[Math.floor(new Rng(`${g.seed}/victim/${deed.day}/${deed.cause}/${deed.label}`).next() * left.length)];
}

/**
 * 站在对面的人丢了多少：仓位 = 本金 × 杠杆，按今天的涨跌幅算；最少按 0.2% 的波动算（虚假申报、对倒那一点点也能扫掉止损）。
 * 返回 [亏损, 是否爆仓]。
 */
export function lossOf(p: Persona, move: number, price: number): [number, boolean] {
  const pct = Math.max(0.002, Math.abs(move) / Math.max(1, price));
  const loss = Math.round(p.stake * p.lev * pct);
  return loss >= p.stake ? [p.stake, true] : [loss, false];
}

export function letterFrom(g: Game, p: Persona, opening: string, fmtMoney: (x: number) => string, fmtMove: (fen: number) => string): Victim {
  const { move, last } = dayMove(g);
  const [loss, bust] = lossOf(p, move, last);
  const mv = fmtMove(Math.abs(move));
  return {
    from: p.from,
    title: bust ? `${p.from}爆仓了` : `${p.from}的一封信`,
    body: `${opening}\n\n${p.who}。${bust ? p.says.bust(mv) : p.says.lost(fmtMoney(loss), mv)}`,
  };
}
