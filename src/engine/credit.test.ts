import { describe, expect, it } from 'vitest';
import { GME } from '../scenarios/gme';
import { S327 } from '../scenarios/s327';
import { Game } from './game';

function to(g: Game, day: number, minute = 0) {
  for (let guard = 0; guard < 20000; guard++) {
    if (g.phase === 'night') g.act({ type: 'end-night' });
    else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else if (g.dayIndex >= day && g.market.t >= minute) return;
    else g.tick();
  }
}

describe('杠杆与借券', { timeout: 60000 }, () => {
  it('融资：散户满仓买入后，超出自有资金的部分按天计息', () => {
    const g = new Game(GME, 'loan', 'retail', 'no-violation');
    to(g, 0, 5);
    const ex = g.market.ex;
    const room = Math.floor((ex.equity(g.player) / ex.deck.marginRate - g.player.pos * ex.contractValue(ex.last)) / ex.contractValue(ex.last));
    g.act({ type: 'order', req: { side: 'buy', qty: Math.floor(room * 0.9), type: 'market' } });
    g.tick();
    expect(ex.marginLoan(g.player)).toBeGreaterThan(0);
    to(g, 1);
    expect(g.flags.loanInterest as number).toBeGreaterThan(0);
  });

  it('营业部垫资：最多三倍；权益碰到平仓线，营业部立刻平仓收回借款', () => {
    const g = new Game(S327, 'otc', 'retail', 'no-violation');
    to(g, 0, 5);
    const own = g.netEquity();
    g.act({ type: 'credit', op: 'take', amount: own * 10 });
    expect(g.credit!.loan).toBeCloseTo(own * 3, -2);
    expect(g.netEquity()).toBeCloseTo(own, -2);
    // 满仓做空，再让价格一路往上走
    const ex = g.market.ex;
    const lots = Math.floor((ex.equity(g.player) / (ex.contractValue(ex.last) * ex.deck.marginRate)) * 0.95);
    g.act({ type: 'order', req: { side: 'sell', qty: lots, type: 'market' } });
    g.tick();
    expect(g.player.pos).toBe(-lots);
    for (let i = 0; i < 300 && g.credit!.loan > 0 && g.phase === 'trading'; i++) {
      // 买盘源源不断：价格持续往上走
      g.market.flow = g.market.day.vDay * 30;
      g.tick();
    }
    expect(g.credit!.loan).toBe(0);
    expect(g.player.pos).toBe(0);
    expect(g.flags.otcLiquidated).toBe(1);
  });

  it('止损与止盈：一张触发，另一张撤掉；只平仓，不反手', () => {
    const g = new Game(S327, 'stops', 'retail', 'no-violation');
    to(g, 0, 5);
    g.act({ type: 'order', req: { side: 'buy', qty: 20, type: 'market' } });
    g.tick();
    const last = g.market.last;
    g.act({ type: 'plan-add', plan: { label: '止损', cond: 'lte', price: last - 2, side: 'sell', qty: 20, spread: 1, oco: 7, closeOnly: true } });
    g.act({ type: 'plan-add', plan: { label: '止盈', cond: 'gte', price: last + 2, side: 'sell', qty: 20, spread: 1, oco: 7, closeOnly: true } });
    // 先平掉一半：止损触发时只卖剩下的
    g.act({ type: 'order', req: { side: 'sell', qty: 10, type: 'market' } });
    for (let i = 0; i < 300 && g.player.pos !== 0 && g.phase === 'trading'; i++) {
      g.market.flow -= g.market.day.vDay * 0.02;
      g.tick();
    }
    expect(g.player.pos).toBe(0);
    const [stop, take] = g.plans.filter((p) => p.oco === 7);
    expect(stop.done || stop.remaining != null).toBe(true);
    expect(take.done).toBe(true);
    g.tick();
    expect(g.player.pos).toBe(0);
  });

  it('借券：多借能多卖空，费率跟着涨；价格翻倍后被召回，多出来的空单第二天开盘强制买回', () => {
    const g = new Game(GME, 'lend', 'short', 'no-violation');
    to(g, 0, 5);
    const before = g.player.borrowLimit!;
    g.act({ type: 'card', id: 'borrow', target: '1000000' });
    expect(g.player.borrowLimit).toBe(before + 1_000_000);
    g.act({ type: 'order', req: { side: 'sell', qty: 1_000_000, type: 'market' } });
    to(g, 3, 20);
    expect(g.intel.some((i) => i.id.startsWith('recall-'))).toBe(true);
    expect(-g.player.pos).toBeLessThanOrEqual(g.player.borrowLimit!);
  });
});
