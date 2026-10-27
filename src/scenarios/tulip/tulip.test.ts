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

describe('行会议员', () => {
  function toRuling(seed = 'council') {
    const g = new TulipGame(seed, 'council');
    while (g.phase === 'table') g.act({ type: 'leave' });
    return g;
  }

  it('议员不能下场交易，但桌边的人彼此在签约', () => {
    const g = new TulipGame('council', 'council');
    const q = g.quotes[0];
    expect(g.act({ type: 'accept', npc: q.npc })).toBeNull();
    expect(g.contracts.length).toBe(0);
    const r = toRuling();
    expect(r.npcBook.length).toBeGreaterThan(3);
    expect(r.npcBook.every((d) => EVENINGS[d.evening].kind !== 'crash')).toBe(true);
  });

  it('三条规则下的输赢：照约履行最狠，作废谁也不赔，期权介于两者之间', () => {
    const g = toRuling();
    const sum = (rule: 'forward' | 'option' | 'void') => [...g.npcOutcome(rule).values()];
    const worst = (rule: 'forward' | 'option' | 'void') => Math.min(0, ...sum(rule));
    expect(sum('void').every((v) => v === 0)).toBe(true);
    expect(worst('forward')).toBeLessThan(worst('option'));
    // 每一笔都是一方付给另一方：总和为零（四舍五入误差以内）
    expect(Math.abs(sum('forward').reduce((a, b) => a + b, 0))).toBeLessThanOrEqual(6);
  });

  it('议员的提案与表决写进动作日志，读档后得到同样的结果', () => {
    const g = toRuling('saved');
    g.act({ type: 'rule', rule: 'forward' });
    const r = replayTulip('saved', 'council', g.log);
    expect(r.proposal).toBe('forward');
    expect(r.rule).toBe(g.rule);
    expect(r.votes).toEqual(g.votes);
    expect([...r.npcOutcome(r.rule)]).toEqual([...g.npcOutcome(g.rule)]);
  });
});

describe('行会议员：每晚都能出手', () => {
  const council = (seed = 'c') => new TulipGame(seed, 'council');
  const toEnd = (g: TulipGame) => {
    while (g.phase === 'table') g.act({ type: 'leave' });
    return g;
  };

  it('不游说，光凭你一票：提“照约履行”会被大会否决，通过的是期权', () => {
    const g = toEnd(council());
    g.act({ type: 'rule', rule: 'forward' });
    expect(g.proposal).toBe('forward');
    expect(g.rule).toBe('option');
  });

  it('游说公证人和市政官：照约履行也能过', () => {
    const g = council('lobby');
    for (const target of ['spiegel', 'witt', 'spiegel', 'witt', 'bloc', 'bloc']) {
      if (g.influence === 0) g.act({ type: 'leave' });
      g.act({ type: 'card', id: 'lobby-forward', target });
    }
    toEnd(g);
    g.act({ type: 'rule', rule: 'forward' });
    expect(g.rule).toBe('forward');
  });

  it('每晚只有两点影响力：用完就做不了别的', () => {
    const g = council();
    g.act({ type: 'card', id: 'notice' });
    g.act({ type: 'card', id: 'register' });
    expect(g.influence).toBe(0);
    expect(g.cards().find((c) => c.id === 'tax')?.blocked).toMatch(/影响力/);
    g.act({ type: 'card', id: 'tax' });
    expect(g.tax).toBe(false);
  });

  it('告示让之后每晚的价降温；定金让约定少一半', () => {
    const a = council('cool');
    const b = council('cool');
    b.act({ type: 'card', id: 'notice' });
    a.act({ type: 'leave' });
    b.act({ type: 'leave' });
    expect(b.price).toBeLessThan(a.price * 0.95);
    const dep = (on: boolean) => {
      const g = council('dep');
      if (on) g.act({ type: 'card', id: 'deposit' });
      return toEnd(g).npcBook.length;
    };
    expect(dep(true)).toBeLessThan(dep(false));
  });

  it('不登记时有些约定你根本听不到；登记之后一份不漏', () => {
    const g = council('reg');
    g.act({ type: 'leave' });
    g.act({ type: 'card', id: 'register' });
    const from = g.evening;
    toEnd(g);
    expect(g.npcBook.filter((d) => d.evening > from).every((d) => d.heard)).toBe(true);
    const blind = toEnd(council('reg'));
    expect(blind.npcBook.some((d) => !d.heard)).toBe(true);
  });

  it('收印花钱、崩盘后设救济金：照约履行下倾家荡产的人更少', () => {
    const plain = toEnd(council('relief'));
    const g = council('relief');
    g.act({ type: 'card', id: 'tax' });
    while (g.night.kind === 'normal') g.act({ type: 'leave' });
    g.act({ type: 'card', id: 'relief' });
    toEnd(g);
    expect(g.treasury).toBeGreaterThan(0);
    expect(g.ruined('forward').length).toBeLessThanOrEqual(plain.ruined('forward').length);
  });

  it('收了花农的礼却提“改作期权”：被花农记恨，威望大跌', () => {
    const g = council('gift');
    g.act({ type: 'card', id: 'gift-grower' });
    toEnd(g);
    g.act({ type: 'rule', rule: 'option' });
    const v = g.councilVerdict();
    expect(v.betrayed).toEqual(['grower']);
    expect(v.standing).toBeLessThan(50);
  });
});

describe('酒馆里的手段', () => {
  it('请老板透底：知道的底价误差不超过一成', () => {
    const g = new TulipGame('ask', 'speculator');
    const q = g.quotes[0];
    g.act({ type: 'card', id: 'ask-host', target: q.npc });
    expect(Math.abs(g.revealed[q.npc] - q.reservation) / q.reservation).toBeLessThanOrEqual(0.06);
    expect(g.cash).toBe(98);
  });

  it('放风：下一晚大家心里的价高一截', () => {
    const a = new TulipGame('rum', 'speculator');
    const b = new TulipGame('rum', 'speculator');
    b.act({ type: 'card', id: 'rumor' });
    a.act({ type: 'leave' });
    b.act({ type: 'leave' });
    expect(b.price).toBeGreaterThan(a.price * 1.05);
  });
});
