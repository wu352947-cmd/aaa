import { describe, expect, it } from 'vitest';
import { APRIL_VALUE, EVENINGS, OPTION_FEE } from './data';
import { replayTulip, TulipGame } from './game';

function leaveUntil(g: TulipGame, evening: number) {
  while (g.evening < evening && g.phase === 'table') g.act({ type: 'leave' });
}

describe('酒馆里的花', () => {
  it('同一种子 + 同一串操作 → 同一局', () => {
    const g = new TulipGame('s', 'speculator');
    const seller = g.quotes.find((q) => q.side === 'sell')!;
    g.act({ type: 'counter', npc: seller.npc, price: seller.price - 30 });
    g.act({ type: 'accept', npc: seller.npc });
    g.act({ type: 'leave' });
    const r = replayTulip('s', 'speculator', g.log);
    expect(r.contracts).toEqual(g.contracts);
    expect(r.quotes).toEqual(g.quotes);
  });

  it('还价：出价够到对方底价就成交，否则对方让一半，最多还两次', () => {
    const g = new TulipGame('haggle', 'speculator');
    const q = g.quotes.find((x) => x.side === 'sell')!;
    const t1 = g.act({ type: 'counter', npc: q.npc, price: 1 })!;
    expect(t1.kind).toBe('counter');
    expect(q.price).toBeGreaterThanOrEqual(q.reservation);
    g.act({ type: 'counter', npc: q.npc, price: 1 });
    const t3 = g.act({ type: 'counter', npc: q.npc, price: 1 })!;
    expect(t3.kind).toBe('refuse');
    const q2 = g.quotes.find((x) => x.side === 'sell' && !x.done)!;
    const t4 = g.act({ type: 'counter', npc: q2.npc, price: q2.reservation })!;
    expect(t4.kind).toBe('deal');
    expect(g.contracts[0].price).toBe(q2.reservation);
  });

  it('你买得多，下一晚的价就被抬高', () => {
    const a = new TulipGame('impact', 'speculator');
    const b = new TulipGame('impact', 'speculator');
    for (const q of a.quotes.filter((x) => x.side === 'sell')) a.act({ type: 'accept', npc: q.npc });
    a.act({ type: 'leave' });
    b.act({ type: 'leave' });
    expect(a.price).toBeGreaterThan(b.price);
  });

  it('崩盘之夜几乎没有买家，唯一的买价远低于前一晚', () => {
    const g = new TulipGame('crash', 'speculator');
    leaveUntil(g, EVENINGS.findIndex((e) => e.kind === 'crash'));
    const bids = g.quotes.filter((q) => q.side === 'buy');
    expect(bids.length).toBe(1);
    expect(bids[0].price).toBeLessThan(EVENINGS[4].anchor * 0.3);
  });

  it('行会改规则：高位买入的投机客从资不抵债变成只赔 3.5%', () => {
    const g = new TulipGame('peak', 'speculator');
    leaveUntil(g, 4);
    for (const q of g.quotes.filter((x) => x.side === 'sell').slice(0, 3)) g.act({ type: 'accept', npc: q.npc });
    const fwd = g.settle('forward');
    const opt = g.settle('option');
    expect(fwd.total).toBeLessThan(0);
    expect(opt.total).toBeGreaterThan(0);
    const k = g.contracts[0].price;
    expect(opt.lines[0].amount).toBeCloseTo(-k * OPTION_FEE, 1);
    expect(fwd.lines[0].amount).toBe(APRIL_VALUE - k);
  });

  it('行会改规则：高位卖出的种植者只拿到 3.5%，球茎还留在自己手里', () => {
    const g = new TulipGame('grow', 'grower');
    leaveUntil(g, 4);
    const q = g.quotes.find((x) => x.side === 'buy')!;
    g.act({ type: 'accept', npc: q.npc });
    const fwd = g.settle('forward');
    const opt = g.settle('option');
    expect(fwd.total).toBeGreaterThan(opt.total + q.price * 0.8);
    expect(opt.bulbsValue).toBe(6 * APRIL_VALUE);
    expect(fwd.bulbsValue).toBe(5 * APRIL_VALUE);
  });
});
