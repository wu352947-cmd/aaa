import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { ALLY, HIDE, LONG, SHORT } from './common';
import { PRE } from './data';
import { S327 } from './index';

const SEATS = [SHORT, LONG, ALLY, HIDE];

describe('第一章：一月份', { timeout: 120000 }, () => {
  it('一月走完，二月十六日开盘时各家的仓位和直接从第二章开始一模一样', () => {
    for (const seat of ['retail', 'official']) {
      const g = new Game(S327, 'jan-fid', seat, 'no-violation');
      for (let guard = 0; guard < 20000 && g.dayIndex < PRE; guard++) {
        if (g.phase === 'night') g.act({ type: 'end-night' });
        else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
        else g.tick();
      }
      expect(g.dayIndex).toBe(PRE);
      const feb = new Game(S327, 'jan-fid', seat, 'no-violation', { startDay: PRE });
      for (const id of SEATS) expect(g.market.ex.acct(id).pos, `${seat}/${id}`).toBe(feb.market.ex.acct(id).pos);
    }
  });

  it('一月里逐笔能看到各家席位的大单', () => {
    const g = new Game(S327, 'jan-tape', 'retail', 'no-violation');
    const start = g.market.ex.acct(SHORT).pos;
    while (g.phase === 'trading') g.decision ? g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id }) : g.tick();
    expect(g.market.ex.acct(SHORT).pos).toBeLessThan(start);
  });
});
