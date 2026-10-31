import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { DAYS, PRE } from './data';
import { cal, calCards, calValue, price319, spread319, trade319 } from './calendar';
import { fundingRate } from './delivery';
import { S327 } from './index';

const dayOf = (t: number) => Math.max(0, Math.min(DAYS.length - 1, PRE + t));
const at = (seat: string, seed: string, t: number) => {
  const g = new Game(S327, seed, seat, 'no-violation', { startDay: dayOf(t) });
  g.tick();
  return g;
};

describe('跨期价差 319', { timeout: 60_000 }, () => {
  it('319 = 327 + 价差，价差由持有成本推出来', () => {
    const g = at('long', 'c1', -6);
    expect(price319(g)).toBe(g.market.last + spread319(g));
  });

  it('资金紧的时候远月贴水更深，资金松的时候升水', () => {
    const tight = at('long', 'c2', -6); // 春节前资金 20%
    const loose = at('long', 'c2', 1); // 节后资金 10%
    expect(fundingRate(tight)).toBeGreaterThan(fundingRate(loose));
    // 资金成本越高，远月贴水越深（价差越小）
    expect(spread319(tight)).toBeLessThan(spread319(loose));
  });

  it('买 319：占用保证金，市值计入权益', () => {
    const g = at('long', 'c3', -6);
    const eq0 = g.equity();
    const r = trade319(g, 'buy', 20_000); // 数量要够大，滑点才不会被四舍五入吃掉
    expect(r.ok).toBe(true);
    expect(cal(g).qty).toBe(20_000);
    // 开仓那一刻，权益只少了滑点和手续费那一部分
    expect(Math.abs(g.equity() - eq0)).toBeLessThan(eq0 * 0.01);
    expect(calValue(g)).toBeLessThan(0); // 买入价含滑点，立刻浮亏
  });

  it('保证金不够就开不了', () => {
    const g = at('long', 'c4', -6);
    const r = trade319(g, 'buy', 100_000_000);
    expect(r.ok).toBe(false);
    expect(r.note).toContain('保证金');
    expect(cal(g).qty).toBe(0);
  });

  it('做多价差：319 进多头，327 那一腿卖出', () => {
    const g = at('long', 'c5', -6);
    const card = calCards(g).find((c) => c.id === 'cal-long-spread');
    expect(card).toBeDefined();
    const q = Number(card!.targets![0].id);
    const pos0 = g.player.pos;
    g.act({ type: 'card', id: 'cal-long-spread', target: String(q) });
    expect(cal(g).qty).toBe(q);
    g.tick();
    expect(g.player.pos - pos0).toBeLessThan(0);
  });

  it('平掉 319：仓位归零，实现盈亏进现金', () => {
    const g = at('long', 'c6', -6);
    trade319(g, 'buy', 20_000);
    const cash0 = g.player.cash;
    g.act({ type: 'card', id: 'cal-flat' });
    expect(cal(g).qty).toBe(0);
    expect(g.player.cash).not.toBe(cash0);
  });

  it('监管座位没有跨期卡：他不下单', () => {
    const g = at('official', 'c7', -6);
    expect(g.cards().some((c) => c.id.startsWith('cal-'))).toBe(false);
  });
});
