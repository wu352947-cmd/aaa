import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { GME } from './index';
import { GW, GW_POS, npcBrokerChoice } from './world';

function run(seat: string, seed: string, day?: (g: Game) => void) {
  const g = new Game(GME, seed, seat, 'no-violation');
  for (let i = 0; i < 20000 && !g.ending; i++) {
    if (g.phase === 'night') g.act({ type: 'end-night' });
    else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else {
      day?.(g);
      g.tick();
    }
  }
  return g;
}

describe('散户起义：这一局的世界', { timeout: 300000 }, () => {
  it('没人搅局时大致还原历史：灰狼被注资、27 日开盘平完、券商限制买入', () => {
    for (const seed of ['g1', 'g2']) {
      const g = run('retail', seed);
      const c = g.market.closePrices;
      expect(g.flags.npcBailout).toBe(true);
      expect(g.market.ex.acct(GW).pos).toBe(0);
      expect(c[3]).toBeGreaterThan(30000);
      expect(c[3]).toBeLessThan(40000);
      expect(g.flags.restrictActive).toBe(true);
    }
  });

  it('灰狼死扛不平：跳空那天跌破维持保证金，被主经纪商盘中强平——强平的买单自己就把逼空推了上去', () => {
    const g = run('short', 'g1');
    expect(g.flags.pbLiquidated).toBe(true);
    expect(g.player.pos).toBe(0);
    expect(g.market.closePrices[3]).toBeGreaterThan(30000);
  });

  it('灰狼 25 日一开盘就全部平掉：价格提前涨上去', () => {
    const base = run('retail', 'g1');
    const g = run('short', 'g1', (x) => {
      if (x.dayIndex === 1 && x.market.t === 5 && x.player.pos < 0) x.act({ type: 'order', req: { side: 'buy', qty: -x.player.pos, type: 'market' } });
    });
    expect(g.market.ex.acct(GW).pos).toBe(0);
    expect(g.market.closePrices[1]).toBeGreaterThan(base.market.closePrices[1] * 1.08);
    expect(GW_POS).toBe(10_000_000);
  });

  it('券商的决定看押金缺口', () => {
    expect(npcBrokerChoice(3_700_000_000)).toBe('restrict');
    expect(npcBrokerChoice(2_500_000_000)).toBe('cap');
    expect(npcBrokerChoice(1_500_000_000)).toBe('open');
  });

  it('可重放', () => {
    const g = run('short', 'g3');
    const r = replay(GME, 'g3', 'short', 'no-violation', g.log);
    expect(r.stateHash()).toBe(g.stateHash());
  });
});
