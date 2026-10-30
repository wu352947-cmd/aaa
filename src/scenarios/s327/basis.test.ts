import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { BATTLE, DAYS, PRE } from './data';
import { basis, basisUnit, daysToDelivery, deliveryCards, fundingRate, spot, spotPrice, theoreticalBasis } from './delivery';
import { S327 } from './index';

/** 直接从某一天开盘：startDay 是绝对日序，sd 是相对二月十六日的偏移 */
const dayOf = (target: number) => Math.max(0, Math.min(DAYS.length - 1, PRE + target));
function at(seat: string, seed: string, target: number): Game {
  const g = new Game(S327, seed, seat, 'no-violation', { startDay: dayOf(target) });
  g.tick(); // 先推进一分钟，让做市商把盘口铺好
  return g;
}

describe('期现基差', { timeout: 60_000 }, () => {
  it('剩余期限越短，理论基差越靠近零；交割日归零', () => {
    const early = at('long', 'b1', -6);
    const late = at('long', 'b1', BATTLE);
    expect(daysToDelivery(early)).toBeGreaterThan(daysToDelivery(late));
    expect(daysToDelivery(late)).toBeGreaterThan(0);

    const done = new Game(S327, 'b1', 'long', 'no-violation', { startDay: dayOf(BATTLE + 1) });
    expect(daysToDelivery(done)).toBe(0);
    expect(Math.abs(theoreticalBasis(done))).toBeLessThan(1e-9);
  });

  it('资金一紧，carry 转负，现券反而比期货便宜', () => {
    const tight = at('long', 'b2', -6); // 春节前：资金成本 20%，高于票息
    const loose = at('long', 'b2', 1); // 节后：资金松下来
    expect(fundingRate(tight)).toBeGreaterThan(0.125);
    expect(fundingRate(loose)).toBeLessThan(0.125);
    expect(theoreticalBasis(tight)).toBeLessThan(0);
    expect(theoreticalBasis(loose)).toBeGreaterThan(0);
  });

  it('现券价 = 期货 + 基差 + 自己推出来的溢价 + 缺券溢价', () => {
    const g = at('long', 'b3', 0);
    const before = spotPrice(g) - g.market.last;
    const card = deliveryCards(g).find((c) => c.id === 'dlv-buy')!;
    g.act({ type: 'card', id: 'dlv-buy', target: card.targets![1].id });
    expect(spotPrice(g) - g.market.last).toBeGreaterThan(before);
    expect(basis(g)).toBeCloseTo(spotPrice(g) - g.market.last, 9);
    expect(basisUnit(basis(g))).toBeCloseTo(basis(g) * 2, 9);
  });
});

describe('期现套利组合', { timeout: 60_000 }, () => {
  it('两条腿一起建：现券进账、期货卖出，锁住的正是负基差', () => {
    const g = at('long', 'arb1', -6); // 春节前资金紧，基差为负
    const card = deliveryCards(g).find((c) => c.id === 'dlv-arb');
    expect(card).toBeDefined();
    const q = Number(card!.targets![0].id);
    expect(-basis(g) * q * 2).toBeGreaterThan(0); // 锁住的是正的

    const pos0 = g.player.pos;
    g.act({ type: 'card', id: 'dlv-arb', target: String(q) });
    expect(spot(g).held).toBe(q);

    g.tick(); // 期货那一腿本分钟报出，下一分钟成交
    const shorted = pos0 - g.player.pos;
    expect(shorted).toBeGreaterThan(0);
    expect(Math.abs(shorted - q)).toBeLessThan(q * 0.5 + 1);
  });

  it('基差为正的时候没有套利空间', () => {
    const g = at('long', 'arb2', 1); // 节后资金松，基差为正
    expect(theoreticalBasis(g)).toBeGreaterThan(0);
    expect(-basis(g) * 5000 * 2).toBeLessThan(0);
  });

  it('平掉组合：现券清零，期货腿反向', () => {
    const g = at('long', 'arb3', -6);
    const q = Number(deliveryCards(g).find((c) => c.id === 'dlv-arb')!.targets![0].id);
    g.act({ type: 'card', id: 'dlv-arb', target: String(q) });
    g.tick();
    expect(spot(g).held).toBe(q);

    const unwind = deliveryCards(g).find((c) => c.id === 'dlv-unwind');
    expect(unwind).toBeDefined();
    const pos0 = g.player.pos;
    g.act({ type: 'card', id: 'dlv-unwind' });
    expect(spot(g).held).toBe(0);
    g.tick();
    expect(g.player.pos - pos0).toBeGreaterThan(0);
  });
});
