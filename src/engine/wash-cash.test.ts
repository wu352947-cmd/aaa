import { describe, expect, it } from 'vitest';
import { DECK_1995 } from '../scenarios/s327/data';
import { Exchange, newAccount } from './exchange';

/** 一个只有两个真实账户（都不免检）的小交易所：撮合与收费都能算得清清楚楚 */
function mini(cash: number) {
  const ex = new Exchange(DECK_1995, 14800);
  ex.open = true;
  ex.add(newAccount({ id: 'p', name: '玩家', group: 'player', cash }));
  ex.add(newAccount({ id: 'm', name: '对手', group: 'rival', cash: 0 }));
  ex.book.rest({ owner: 'm', side: 'sell', price: 14800, qty: 10, tick: 0 });
  return ex;
}

describe('对倒付不出佣金就做不了', () => {
  it('账上不够双倍佣金时被挡下，现金与成交量都不动', () => {
    const ex = mini(100);
    const before = ex.acct('p').cash;
    const r = ex.submit({ owner: 'p', side: 'buy', qty: 500_000, type: 'market', wash: true });
    expect(r.rejected).toBe(true);
    expect(r.filled).toBe(0);
    expect(r.hits[0].rule).toBe('wash-cash');
    expect(ex.acct('p').cash).toBe(before);
    expect(ex.stats('p').wash).toBe(0);
  });

  it('钱够的时候照常对倒，并付双倍佣金、留下可被监察的成交痕迹', () => {
    const ex = mini(10_000_000);
    const r = ex.submit({ owner: 'p', side: 'buy', qty: 1000, type: 'market', wash: true });
    expect(r.filled).toBe(1000);
    expect(ex.stats('p').wash).toBe(1000);
    expect(ex.acct('p').pos).toBe(0);
    expect(ex.acct('p').cash).toBeCloseTo(10_000_000 - 2 * (14800 / 100) * 200 * 1000 * DECK_1995.feeRate!, 6);
  });
});

