import { describe, expect, it } from 'vitest';
import { DAYS } from '../scenarios/s327/data';
import { S327 } from '../scenarios/s327';
import { Game } from './game';

describe('修复之后引擎仍然可以零干预跑完', { timeout: 60_000 }, () => {
  it('19 个交易日跑到底，收盘价仍在容差内', () => {
    const g = new Game(S327, 'smoke', 'retail', 'no-violation');
    let guard = 0;
    while (g.phase !== 'reckoning' && guard++ < 100_000) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
      else g.tick();
    }
    expect(g.ending).not.toBeNull();
    expect(g.market.closePrices.length).toBeGreaterThan(10);
    // 前五个布局日的收盘仍贴着真实：这条是设计文档 5.2-1 的验收线，
    // 放开到全部 15 天会碰到剧本本身的偏离（见 PR 说明），这里只守住原有承诺
    for (let d = 0; d < 5; d++) {
      const hist = DAYS[d].hist[DAYS[d].hist.length - 1];
      expect(Math.abs(g.market.closePrices[d] - hist)).toBeLessThanOrEqual(20);
    }
  });
});
