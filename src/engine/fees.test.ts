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

describe('成交要真的收佣金', () => {
  it('买卖双方各付一次：按合约价值 × 费率从现金里扣', () => {
    const ex = mini(10_000_000);
    const notional = (14800 / 100) * 200 * 10; // 每口合约 200 倍，10 口
    const fee = notional * DECK_1995.feeRate!;
    const eq = ex.equity(ex.acct('p'));
    ex.submit({ owner: 'p', side: 'buy', qty: 10, type: 'market' });
    const p = ex.acct('p');
    const m = ex.acct('m');
    // 这个引擎开仓不动现金（用盯市权益算浮动盈亏），所以现金的变化就是佣金本身
    expect(p.cash).toBeCloseTo(10_000_000 - fee, 6);
    expect(p.pos).toBe(10);
    // 卖方开空同样只付自己的那一份佣金
    expect(m.cash).toBeCloseTo(-fee, 6);
    expect(m.pos).toBe(-10);
    // 成交那一刻的权益要体现这笔成本：开仓价等于市价，浮动盈亏为零
    const after = ex.equity(p, 14800);
    expect(after).toBeLessThan(eq);
    expect(eq - after).toBeCloseTo(fee, 6);
  });

  it('免检账户（做市、散户群体）不收费，背景撮合不受影响', () => {
    const ex = mini(10_000_000);
    ex.add(newAccount({ id: 'mm', name: '做市', group: 'gravity', exempt: true }));
    ex.book.rest({ owner: 'mm', side: 'sell', price: 14800, qty: 5, tick: 0 });
    ex.submit({ owner: 'p', side: 'buy', qty: 5, type: 'market' });
    expect(ex.acct('mm').cash).toBe(0);
    // 玩家照付自己那一份
    expect(ex.acct('p').cash).toBeCloseTo(10_000_000 - (14800 / 100) * 200 * 5 * DECK_1995.feeRate!, 6);
  });

  it('来回一趟同一个价位：亏损正好是两次佣金，不再是零成本', () => {
    const ex = mini(10_000_000);
    ex.book.rest({ owner: 'm', side: 'buy', price: 14800, qty: 10, tick: 0 });
    ex.submit({ owner: 'p', side: 'buy', qty: 10, type: 'market' });
    const fee = (14800 / 100) * 200 * 10 * DECK_1995.feeRate!;
    const afterBuy = ex.acct('p').cash;
    ex.submit({ owner: 'p', side: 'sell', qty: 10, type: 'market' });
    expect(ex.acct('p').pos).toBe(0);
    expect(afterBuy - ex.acct('p').cash).toBeCloseTo(fee, 6);
  });
});

