import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { ALLY, HIDE, LONG, SHORT } from './common';
import { PRE } from './data';
import { S327 } from './index';

const SEATS = [SHORT, LONG, ALLY, HIDE];

describe('第一章：一月份', { timeout: 120000 }, () => {
  it('没人搅局时，一月走完，二月十六日各家的仓位和史料相差不到一成', () => {
    for (const seat of ['retail', 'official']) {
      const g = new Game(S327, 'jan-fid', seat, 'no-violation');
      for (let guard = 0; guard < 20000 && g.dayIndex < PRE; guard++) {
        if (g.phase === 'night') g.act({ type: 'end-night' });
        else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
        else g.tick();
      }
      expect(g.dayIndex).toBe(PRE);
      const feb = new Game(S327, 'jan-fid', seat, 'no-violation', { startDay: PRE });
      for (const id of SEATS) {
        const want = feb.market.ex.acct(id).pos;
        expect(Math.abs(g.market.ex.acct(id).pos - want), `${seat}/${id}`).toBeLessThan(Math.abs(want) * 0.1);
      }
    }
  });

  it('一月里逐笔能看到各家席位的大单', () => {
    const g = new Game(S327, 'jan-tape', 'retail', 'no-violation');
    const start = g.market.ex.acct(SHORT).pos;
    while (g.phase === 'trading') g.decision ? g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id }) : g.tick();
    expect(g.market.ex.acct(SHORT).pos).toBeLessThan(start);
  });
});
