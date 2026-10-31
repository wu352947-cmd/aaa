import type { Game } from '../../engine/game';
import type { Actor } from '../../engine/market';
import { LOCALS } from './data';

/**
 * 联系汇率与拆息。
 *
 * 1998 年 8 月的核心不是汇率本身，是利率：炒家借港元砸联系汇率，
 * 金管局要么放弃 7.75，要么抽紧银根守汇率。拆息一高，
 * 所有借钱做多的人当天就多付利息，撑不住就被迫平仓——
 * 平仓的卖压把股市打下去，而炒家的空单就在股市里。
 *
 * 所以这一局真正在动的是两个数：对港元的压力，和隔夜拆息。
 */

/** 港元受到的压力（0–100） */
export function pressure(g: Game): number {
  return Number(g.flags.hkPressure ?? 40);
}

export function setPressure(g: Game, v: number): void {
  g.flags.hkPressure = Math.max(0, Math.min(100, Math.round(v)));
}

export function addPressure(g: Game, d: number, why: string): void {
  const before = pressure(g);
  setPressure(g, before + d);
  if (Math.abs(pressure(g) - before) >= 5) {
    g.push({ kind: 'intel', text: `港元压力 ${pressure(g)}：${why}` });
  }
}

/** 金管局自己加的息（年化），加息卡累计 */
export function hike(g: Game): number {
  return Number(g.flags.hkHike ?? 0);
}

/** 隔夜拆息（年化）：基础 5 厘，压力每 10 点抬 2.8 厘，再加金管局的加息 */
export function hibor(g: Game): number {
  return 0.05 + (pressure(g) / 100) * 0.28 + hike(g);
}

/** 拆息到了多少，杠杆盘开始被迫减仓 */
export const SQUEEZE_AT = 0.12;

/** 杠杆盘被拆息压着卖的力度：拆息越高，卖得越急 */
export function squeezeRate(g: Game): number {
  const over = hibor(g) - SQUEEZE_AT;
  return over <= 0 ? 0 : Math.min(0.03, over * 0.07);
}

/**
 * 杠杆盘：本地借钱做多期指的人。拆息一高，他们每分钟被迫卖出一点。
 * 这批人不在剧本里露脸，但他们是 1998 年 8 月真正的输家。
 */
export function forcedSellerActor(g: Game): Actor {
  return {
    id: 'hk-forced',
    onTick() {
      const a = g.market.ex.accounts.get(LOCALS);
      if (!a || a.pos <= 0) return [];
      const frac = squeezeRate(g);
      if (frac <= 0) return [];
      const qty = Math.max(1, Math.round(a.pos * frac));
      if (qty < 1) return [];
      return [{ owner: LOCALS, side: 'sell', qty, type: 'market' }];
    },
  };
}

/** 每天开盘：压力自己消退一点；拆息跟着重算 */
export function pegDayStart(g: Game): void {
  // 没人继续攻，压力会退；但退得慢——市场记性很长
  setPressure(g, pressure(g) * 0.93);
  const h = hibor(g);
  if (h >= 0.15) g.push({ kind: 'intel', text: `隔夜拆息 ${(h * 100).toFixed(1)} 厘：借钱做多的人撑不住了` });
}

/** 顶栏指标：压力与拆息 */
export function pegMeters(g: Game) {
  const h = hibor(g);
  return [
    {
      id: 'hibor',
      label: '隔夜拆息',
      value: `${(h * 100).toFixed(1)} 厘`,
      tip: '炒家借港元砸盘、金管局抽紧银根，拆息就会飙。拆息越高，借钱做多的人越撑不住，被迫平仓的卖压就越大。',
      tone: (h >= SQUEEZE_AT ? 'bad' : undefined) as 'bad' | undefined,
    },
    {
      id: 'pressure',
      label: '港元压力',
      pips: { on: Math.round(pressure(g) / 10), of: 10, tone: 'heat' as const },
      tip: '对联系汇率的压力。压力越高，拆息越高；压力到顶，金管局必须做选择。',
    },
  ];
}
