import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { DAYS, PRE } from './data';
import { spot, spotPrice } from './delivery';
import { repo, repoCards, repoDaysLeft, repoLimit, repoNight } from './repo';
import { S327 } from './index';

const dayOf = (t: number) => Math.max(0, Math.min(DAYS.length - 1, PRE + t));
const at = (seed: string, t = -6) => {
  const g = new Game(S327, seed, 'long', 'no-violation', { startDay: dayOf(t) });
  g.tick();
  return g;
};

/** 先囤一批现券 */
function hoard(g: Game, q = 20_000) {
  const card = g.cards().find((c) => c.id === 'dlv-buy')!;
  g.act({ type: 'card', id: 'dlv-buy', target: card.targets!.find((x) => Number(x.id) <= q)?.id ?? card.targets![0].id });
}

describe('国债回购', { timeout: 60_000 }, () => {
  it('没有现券就借不到：回购是押券的', () => {
    const g = at('r1');
    expect(repoLimit(g)).toBe(0);
    expect(repoCards(g).find((c) => c.id === 'repo-take')!.blocked).toContain('现券');
  });

  it('押券能借到市值的八成，现金到账', () => {
    const g = at('r2');
    hoard(g);
    const value = spot(g).held * spotPrice(g) * 2;
    expect(repoLimit(g)).toBeCloseTo(value * 0.8, 0);
    const cash0 = g.player.cash;
    const card = repoCards(g).find((c) => c.id === 'repo-take')!;
    g.act({ type: 'card', id: 'repo-take', target: card.targets![0].id });
    expect(repo(g).loan).toBeGreaterThan(0);
    expect(g.player.cash).toBeGreaterThan(cash0);
    expect(repoDaysLeft(g)).toBe(7);
  });

  it('借满了就借不动：额度按市值八成封顶', () => {
    const g = at('r3');
    hoard(g);
    const card = repoCards(g).find((c) => c.id === 'repo-take')!;
    g.act({ type: 'card', id: 'repo-take', target: card.targets![card.targets!.length - 1].id });
    // 剩下的零头不够一万，借不出来
    expect(repoLimit(g)).toBeLessThan(10_000);
  });

  it('每晚计息，七个交易日后到期自动还', () => {
    const g = at('r4');
    hoard(g);
    const card = repoCards(g).find((c) => c.id === 'repo-take')!;
    g.act({ type: 'card', id: 'repo-take', target: card.targets![0].id });
    const loan = repo(g).loan;
    const cash0 = g.player.cash;
    repoNight(g);
    expect(g.player.cash).toBeLessThan(cash0);
    expect(repo(g).paid).toBeGreaterThan(0);
    // 推到到期日
    g.dayIndex = repo(g).due;
    repoNight(g);
    expect(repo(g).loan).toBe(0);
    expect(loan).toBeGreaterThan(0);
  });

  it('到期还不上：卖掉现券抵债', () => {
    const g = at('r5');
    hoard(g);
    const card = repoCards(g).find((c) => c.id === 'repo-take')!;
    g.act({ type: 'card', id: 'repo-take', target: card.targets![0].id });
    const held = spot(g).held;
    g.player.cash = 0;
    g.dayIndex = repo(g).due;
    repoNight(g);
    expect(spot(g).held).toBeLessThan(held);
    expect(repo(g).loan).toBe(0);
  });
});
