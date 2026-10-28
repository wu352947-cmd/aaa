import { describe, expect, it } from 'vitest';
import { GME } from '../scenarios/gme';
import { Game, replay } from './game';
import { price } from './options';

function to(g: Game, day: number, minute = 0) {
  for (let guard = 0; guard < 20000; guard++) {
    if (g.phase === 'night') g.act({ type: 'end-night' });
    else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else if (g.dayIndex >= day && g.market.t >= minute) return;
    else g.tick();
  }
}
const run = (g: Game, n: number) => {
  for (let i = 0; i < n && g.phase === 'trading'; i++) g.tick();
};

describe('期权链', { timeout: 60000 }, () => {
  it('定价：看涨随股价上涨；同一行权价同一到期日，看涨减看跌等于股价减行权价', () => {
    const T = 5 / 252;
    expect(price('call', 6000, 6000, T, 2).value).toBeGreaterThan(price('call', 5000, 6000, T, 2).value);
    const c = price('call', 5000, 6000, T, 2).value;
    const p = price('put', 5000, 6000, T, 2).value;
    expect(c - p).toBeCloseTo(50 - 60, 6);
    expect(price('call', 7000, 6000, 0, 2).value).toBe(10);
  });

  it('散户买看涨期权：按卖价付现金，按中间价计入权益', () => {
    const g = new Game(GME, 'opt', 'retail', 'no-violation');
    to(g, 0, 10);
    const cash = g.player.cash;
    const eq = g.equity();
    const q = g.optQuote('call', 6000, '0129');
    g.act({ type: 'option', side: 'buy', kind: 'call', strike: 6000, expiry: '0129', qty: 5 });
    expect(g.player.cash).toBeCloseTo(cash - q.ask * 500, 2);
    expect(g.opts[0].qty).toBe(5);
    // 买卖价差的一半算是交易成本
    expect(eq - g.equity()).toBeCloseTo((q.ask - q.mid) * 500, 2);
    g.act({ type: 'option', side: 'sell', kind: 'call', strike: 6000, expiry: '0129', qty: 5 });
    expect(g.opts.length).toBe(0);
    expect(g.player.cash).toBeCloseTo(cash - (q.ask - q.bid) * 500, 2);
  });

  it('现金不够就买不了：散户不能空手买期权', () => {
    const g = new Game(GME, 'opt2', 'retail', 'no-violation');
    to(g, 0, 10);
    g.act({ type: 'option', side: 'buy', kind: 'call', strike: 4000, expiry: '0219', qty: 1000 });
    expect(g.opts.length).toBe(0);
    expect(g.events.some((e) => e.rule === 'option-cash')).toBe(true);
  });

  it('大量买入看涨期权：做市商被迫买股票对冲，股价被推高；卖回去，对冲跟着平掉', () => {
    const a = new Game(GME, 'gamma', 'short', 'no-violation');
    const b = new Game(GME, 'gamma', 'short', 'no-violation');
    to(a, 0, 30);
    to(b, 0, 30);
    a.act({ type: 'option', side: 'buy', kind: 'call', strike: 5000, expiry: '0129', qty: 80_000 });
    run(a, 40);
    run(b, 40);
    expect(a.dealerHedge).toBeGreaterThan(2_000_000);
    expect(a.market.last).toBeGreaterThan(b.market.last);
    a.act({ type: 'option', side: 'sell', kind: 'call', strike: 5000, expiry: '0129', qty: 80_000 });
    run(a, 60);
    expect(Math.abs(a.dealerHedge)).toBeLessThan(200_000);
  });

  it('同一种子 + 同一串期权操作 → 同一局', () => {
    const g = new Game(GME, 'rep', 'retail', 'no-violation');
    to(g, 0, 10);
    g.act({ type: 'option', side: 'buy', kind: 'call', strike: 6000, expiry: '0129', qty: 3 });
    to(g, 1, 30);
    g.act({ type: 'option', side: 'sell', kind: 'call', strike: 6000, expiry: '0129', qty: 1 });
    to(g, 2, 0);
    const r = replay(GME, 'rep', 'retail', 'no-violation', g.log, g.globalTick);
    expect(r.stateHash()).toBe(g.stateHash());
  });
});
