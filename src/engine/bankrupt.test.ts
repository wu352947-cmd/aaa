import { describe, expect, it } from 'vitest';
import { S327 } from '../scenarios/s327';
import { Game } from './game';

describe('没有仓位也能穿仓', () => {
  it('持仓为 0、现金为负：权益跌穿零就记破产', () => {
    const g = new Game(S327, 'bust', 'retail', 'no-violation');
    for (let i = 0; i < 5; i++) g.tick();
    g.player.pos = 0;
    g.player.avg = 0;
    g.player.cash = -50_000;
    expect(g.bankrupt).toBe(false);
    g.tick();
    expect(g.bankrupt).toBe(true);
    expect(g.events.some((e) => e.text.includes('欠'))).toBe(true);
  });

  it('现金还是正数时不该误判', () => {
    const g = new Game(S327, 'ok', 'retail', 'no-violation');
    for (let i = 0; i < 5; i++) g.tick();
    g.player.pos = 0;
    g.player.cash = 1;
    g.tick();
    expect(g.bankrupt).toBe(false);
  });
});

