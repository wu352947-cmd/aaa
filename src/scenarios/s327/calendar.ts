import { fmtYi } from '../../engine/exchange';
import type { CardDef, CardResult, Game } from '../../engine/game';
import { fundingRate } from './delivery';
import { mofScore } from './world';

/**
 * 跨期：319 合约。
 *
 * 同一只国债、晚一个交割月。两个月份之间的价差不是猜出来的，是持有成本：
 * 远月交割要多占三个月资金，所以
 *
 *   价差（319 − 327）= （票息 − 资金成本）× 三个月 / 365 × 价格
 *
 * 资金一紧，远月贴水更深；资金一松，远月升水。再叠一层贴息预期的分歧：
 * 保值贴补是一次性的，近月吃得到、远月吃不到，所以预期越强，远月相对越弱。
 *
 * 交易员做的不是"猜 327 涨跌"，而是"猜这个价差该收还是该放"——它跟方向无关，
 * 只跟资金松紧和政策预期有关。
 */

/** 两个交割月之间大约三个月 */
const GAP_DAYS = 90;
/** 92(3) 的持有收益（年化），与现券一致 */
const CARRY_YIELD = 0.125;
/** 319 的盘口比 327 薄得多：同样的单子推得更远 */
const IMPACT = 4;

/** 价差（分）= 319 − 327 */
export function spread319(g: Game): number {
  const carry = (CARRY_YIELD - fundingRate(g)) * (GAP_DAYS / 365) * g.market.last;
  // 贴息预期：0.83 是基准，越往上近月越强、远月相对越弱
  const policy = (mofScore(g) - 0.83) * 600;
  return Math.round(carry - policy);
}

/** 319 报价（分） */
export function price319(g: Game): number {
  return g.market.last + spread319(g);
}

interface Cal {
  /** 正 = 多 319，负 = 空 319 */
  qty: number;
  /** 持仓均价（分） */
  avg: number;
}

const STATE = new WeakMap<Game, Cal>();
export function cal(g: Game): Cal {
  let c = STATE.get(g);
  if (!c) STATE.set(g, (c = { qty: 0, avg: 0 }));
  return c;
}

/** 319 的浮动盈亏（元）：每 1 分 = 每口 2 元 */
export function calValue(g: Game): number {
  const c = cal(g);
  return c.qty === 0 ? 0 : (price319(g) - c.avg) * c.qty * 2;
}

/** 319 每口占用的保证金（元） */
function marginOf(px: number, qty: number): number {
  return Math.abs(qty) * (px / 100) * 200 * 0.025;
}

const lots = (q: number) => (q >= 10_000 ? `${(q / 10_000).toFixed(q % 10_000 ? 1 : 0)} 万口` : `${q} 口`);

/**
 * 成交：319 没有真正的订单簿，按报价加自己推出来的滑点成交。
 * 开仓要先占得住保证金；平仓部分实现盈亏进现金。
 */
export function trade319(g: Game, side: 'buy' | 'sell', qty: number): { ok: boolean; fill: number; note: string } {
  const c = cal(g);
  const q = Math.max(1, Math.round(qty));
  const px = price319(g);
  const fill = Math.round(px + (side === 'buy' ? 1 : -1) * (q / 10_000) * IMPACT);
  const dir = side === 'buy' ? 1 : -1;
  const next = c.qty + dir * q;
  // 加仓要占保证金；减仓不用
  if (Math.abs(next) > Math.abs(c.qty)) {
    const need = marginOf(fill, next);
    if (need > Math.max(0, g.equity())) return { ok: false, fill, note: `保证金不够：开这么多要 ${fmtYi(need)}` };
  }
  if (c.qty === 0 || Math.sign(c.qty) === dir) {
    c.avg = (c.avg * Math.abs(c.qty) + fill * q) / (Math.abs(c.qty) + q);
    c.qty = next;
  } else {
    const close = Math.min(q, Math.abs(c.qty));
    g.player.cash += (fill - c.avg) * close * Math.sign(c.qty) * 2;
    c.qty += dir * close;
    if (c.qty === 0) c.avg = 0;
    const rest = q - close;
    if (rest > 0) {
      c.qty = dir * rest;
      c.avg = fill;
    }
  }
  return { ok: true, fill, note: '' };
}

/** 盘中风控：319 这一腿的权益撑不住维持保证金，就当场平掉 */
export function calRisk(g: Game): void {
  const c = cal(g);
  if (!c.qty) return;
  const need = marginOf(price319(g), c.qty) * 1.2;
  if (g.equity() >= need) return;
  const px = price319(g);
  g.player.cash += (px - c.avg) * c.qty * 2;
  g.push({ kind: 'liquidation', rule: 'forced-liquidation', text: `319 这一腿的保证金不够了，${lots(Math.abs(c.qty))}被强平` });
  c.qty = 0;
  c.avg = 0;
}

export function calCards(g: Game): CardDef[] {
  const c = cal(g);
  const px = price319(g);
  const sp = spread319(g);
  const sizes = (g.factionId === 'retail' ? [1, 5] : [5_000, 20_000, 50_000]).filter(
    (q) => marginOf(px, c.qty + q) <= Math.max(0, g.equity()),
  );
  const out: CardDef[] = [
    {
      id: 'cal-buy',
      name: '买 319（远月）',
      group: '跨期价差',
      color: 'white',
      does: `319 比 327 晚三个月交割，现在 ${(px / 100).toFixed(2)} 元，价差 ${(sp / 100).toFixed(2)} 元。远月吃不到这次贴息，资金一紧就贴得更深。`,
      cost: '保证金开仓；319 的盘口比 327 薄，大单推得动价格。',
      when: 'trading',
      targets: sizes.map((q) => ({ id: String(q), label: `买 ${lots(q)}` })),
      status: c.qty > 0 ? `持多 ${lots(c.qty)}` : undefined,
      blocked: !sizes.length ? '保证金不够' : undefined,
    },
    {
      id: 'cal-sell',
      name: '卖 319（远月）',
      group: '跨期价差',
      color: 'white',
      does: `做空远月。资金松、远月升水的时候，这个方向才划算。`,
      cost: '保证金开仓；被挤的时候远月比近月更难平。',
      when: 'trading',
      targets: sizes.map((q) => ({ id: String(q), label: `卖 ${lots(q)}` })),
      status: c.qty < 0 ? `持空 ${lots(-c.qty)}` : undefined,
      blocked: !sizes.length ? '保证金不够' : undefined,
    },
  ];
  // 价差组合：两条腿一起做，跟方向无关
  if (sizes.length) {
    out.push({
      id: 'cal-long-spread',
      name: '做多价差：买 319 + 卖 327',
      group: '跨期价差',
      color: 'white',
      does: `价差现在 ${(sp / 100).toFixed(2)} 元。做多价差是赌它变大：远月相对走强，或者近月被砸。跟涨跌无关，只跟资金松紧和政策预期有关。`,
      cost: `两条腿都要占保证金，近月那腿还要过限仓。`,
      when: 'trading',
      targets: sizes.map((n) => ({ id: String(n), label: `做 ${lots(n)}` })),
    });
    out.push({
      id: 'cal-short-spread',
      name: '做空价差：卖 319 + 买 327',
      group: '跨期价差',
      color: 'white',
      does: `做空价差是赌它变小：资金收紧、远月贴水加深，或者贴息预期变强、近月更强。`,
      cost: '两条腿都要占保证金。',
      when: 'trading',
      targets: sizes.map((n) => ({ id: String(n), label: `做 ${lots(n)}` })),
    });
  }
  if (c.qty !== 0) {
    out.push({
      id: 'cal-flat',
      name: '平掉 319',
      group: '跨期价差',
      color: 'white',
      does: `把手里的 ${lots(Math.abs(c.qty))} ${c.qty > 0 ? '多单' : '空单'}平掉。`,
      cost: '按当前报价加滑点成交。',
      when: 'trading',
    });
  }
  return out;
}

export function calPlay(g: Game, id: string, target?: string): CardResult {
  const R = (title: string, effects: string[]): CardResult => ({ ok: true, title, effects });
  const q = Number(target) || 0;
  const exec = (side: 'buy' | 'sell', n: number, extra: string[] = []) => {
    const r = trade319(g, side, n);
    if (!r.ok) return R('没成交', [r.note]);
    return R(`${side === 'buy' ? '买进' : '卖出'} 319 ${lots(n)}`, [`成交 ${(r.fill / 100).toFixed(2)} 元`, ...extra]);
  };
  switch (id) {
    case 'cal-buy':
      return exec('buy', q);
    case 'cal-sell':
      return exec('sell', q);
    case 'cal-long-spread': {
      const r = trade319(g, 'buy', q);
      if (!r.ok) return R('没成交', [r.note]);
      g.pending.push({ owner: g.player.id, side: 'sell', qty: q, type: 'market', tag: 'cal' });
      return R('做多价差', [`买 319 ${lots(q)} @ ${(r.fill / 100).toFixed(2)}`, `327 卖出 ${lots(q)}`, `当前价差 ${(spread319(g) / 100).toFixed(2)} 元`]);
    }
    case 'cal-short-spread': {
      const r = trade319(g, 'sell', q);
      if (!r.ok) return R('没成交', [r.note]);
      g.pending.push({ owner: g.player.id, side: 'buy', qty: q, type: 'market', tag: 'cal' });
      return R('做空价差', [`卖 319 ${lots(q)} @ ${(r.fill / 100).toFixed(2)}`, `327 买入 ${lots(q)}`, `当前价差 ${(spread319(g) / 100).toFixed(2)} 元`]);
    }
    case 'cal-flat': {
      const c = cal(g);
      if (!c.qty) return R('没有仓位', []);
      const r = trade319(g, c.qty > 0 ? 'sell' : 'buy', Math.abs(c.qty));
      if (!r.ok) return R('没成交', [r.note]);
      return R('平掉 319', [`成交 ${(r.fill / 100).toFixed(2)} 元`]);
    }
  }
  return R('没有效果', []);
}
