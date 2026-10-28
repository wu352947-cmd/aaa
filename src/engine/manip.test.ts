import { describe, expect, it } from 'vitest';
import { S327 } from '../scenarios/s327';
import { Game } from './game';

/** 跑到第 day 天第 minute 分钟 */
function to(g: Game, day: number, minute: number) {
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

describe('盘口博弈：操纵手法真的推得动价格，也真的会被抓', { timeout: 60000 }, () => {
  it('虚假申报：现价下方挂一张大买单，价格被托上去；撤掉后被记一笔', () => {
    const a = new Game(S327, 'spoof', 'short', 'no-violation');
    const b = new Game(S327, 'spoof', 'short', 'no-violation');
    to(a, 0, 60);
    to(b, 0, 60);
    const px = a.market.last - 5;
    a.act({ type: 'order', req: { side: 'buy', qty: 600_000, type: 'limit', price: px, ttl: 20 } });
    run(a, 15);
    run(b, 15);
    expect(a.market.lean).toBeGreaterThan(0.3);
    expect(a.market.reference).toBeGreaterThan(b.market.reference);
    a.act({ type: 'cancel-all' });
    a.act({ type: 'order', req: { side: 'buy', qty: 600_000, type: 'limit', price: a.market.last - 5, ttl: 5 } });
    run(a, 8);
    expect(a.market.ex.dayStats.get(a.player.id)!.bigCancelled).toBeGreaterThanOrEqual(2);
    to(a, 1, 0);
    expect(a.heat).toBeGreaterThan(0);
    expect(a.flags['surveil-spoofing']).toBe(1);
  });

  it('冰山单：只露出一小截，盘口倾斜远小于把整张单子亮出来', () => {
    const lean = (display?: number) => {
      const g = new Game(S327, 'ice', 'short', 'no-violation');
      to(g, 0, 60);
      g.act({ type: 'order', req: { side: 'buy', qty: 600_000, type: 'limit', price: g.market.last - 5, display, ttl: 20 } });
      run(g, 3);
      return g.market.lean;
    };
    const none = (() => {
      const g = new Game(S327, 'ice', 'short', 'no-violation');
      to(g, 0, 60);
      run(g, 3);
      return g.market.lean;
    })();
    expect(lean() - none).toBeGreaterThan(0.8);
    expect(lean(10_000) - none).toBeLessThan(0.2);
  });

  it('对倒：持仓不变，成交量放大，跟风盘把价格抬上去；收盘被交易所记下', () => {
    const a = new Game(S327, 'wash', 'short', 'no-violation');
    const b = new Game(S327, 'wash', 'short', 'no-violation');
    to(a, 0, 100);
    to(b, 0, 100);
    const pos = a.player.pos;
    for (let i = 0; i < 12; i++) {
      a.act({ type: 'order', req: { side: 'buy', qty: 150_000, type: 'limit', price: a.market.ex.book.best('sell') ?? a.market.last, wash: true } });
      run(a, 1);
      run(b, 1);
    }
    run(a, 10);
    run(b, 10);
    expect(a.player.pos).toBe(pos);
    expect(a.market.ex.trades.filter((t) => t.wash).length).toBe(12);
    // 跟风盘与散户情绪跟着放量上涨的盘面
    const trendBought = (g: Game) => g.market.ex.trades.filter((t) => t.buyer === 'trend').reduce((s, t) => s + t.qty, 0);
    expect(trendBought(a)).toBeGreaterThan(trendBought(b));
    to(a, 1, 0);
    expect(a.flags['surveil-wash-trade']).toBe(1);
    expect(a.linesCrossed).toBeGreaterThan(0);
  });

  it('尾市拉抬：收盘前十分钟集中买入，收盘价被抬高，交易所记一笔', () => {
    const a = new Game(S327, 'close', 'short', 'no-violation');
    const b = new Game(S327, 'close', 'short', 'no-violation');
    // eslint-disable-next-line prefer-const
    let L = a.market.session.minutes;
    to(a, 0, L - 10);
    to(b, 0, L - 10);
    for (let i = 0; i < 9; i++) a.act({ type: 'order', req: { side: 'buy', qty: 120_000, type: 'market' } }), run(a, 1);
    run(b, 9);
    run(a, 2);
    run(b, 2);
    expect(a.market.closePrices[0]).toBeGreaterThan(b.market.closePrices[0]);
    expect(a.flags['surveil-marking-close']).toBe(1);
  });
});
