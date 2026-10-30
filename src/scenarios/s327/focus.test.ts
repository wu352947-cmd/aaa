import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { DAYS, PRE } from './data';
import { basis, spot } from './delivery';
import { S327 } from './index';

const dayOf = (target: number) => Math.max(0, Math.min(DAYS.length - 1, PRE + target));
const at = (seat: string, seed: string, target: number) => {
  const g = new Game(S327, seed, seat, 'no-violation', { startDay: dayOf(target) });
  g.tick();
  return g;
};
const focus = (g: Game) => g.scenario.focus?.(g) ?? null;

describe('焦点：现在最该看的一件事', { timeout: 60_000 }, () => {
  it('基差够宽、手上没券时，提示可以做期现套利', () => {
    const g = at('long', 'f1', -6); // 春节前资金紧，基差为负
    expect(basis(g)).toBeLessThan(-2);
    expect(spot(g).held).toBe(0);
    const f = focus(g);
    expect(f).toContain('基差');
    expect(f).toContain('现券比期货便宜');
  });

  it('监管座位没有这一条：他不下单', () => {
    const g = at('official', 'f2', -6);
    expect(focus(g)).toBeNull();
  });

  it('收盘后不报：夜里没有盘中局面可看', () => {
    const g = at('long', 'f3', -6);
    while (g.phase === 'trading') {
      if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
      else g.tick();
    }
    expect(g.phase).toBe('night');
    expect(focus(g)).toBeNull();
  });

  it('基差收窄到没有套利空间、仓位也轻的时候，安静下来', () => {
    // 节后资金松：基差转正，买券卖期货是倒贴的，不该再提示
    const g = at('long', 'f4', 2);
    expect(basis(g)).toBeGreaterThan(-2);
    const f = focus(g);
    if (f) {
      // 若还有别的理由（保证金、限额、交割），必须说得出来是哪一个
      expect(f).toMatch(/保证金|限额|交割|浮盈/);
    }
  });

  it('保证金吃紧时先报危险，而不是还在聊套利', () => {
    const g = at('long', 'f5', -6);
    // 现金几乎打光、仓位上满：保证金占用远超权益
    g.player.cash = 1_000;
    g.player.pos = 10;
    g.player.avg = g.market.last;
    expect(g.marginNeed()).toBeGreaterThan(g.equity() * 0.8);
    expect(focus(g)).toContain('保证金');
  });
});
