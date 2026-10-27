import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { DAYS_2021, NYSE } from './data';
import { GME } from './index';

function play(faction: string, choices: Record<string, string> = {}, seed = 'gme', night?: (g: Game) => void): Game {
  const g = new Game(GME, seed, faction, 'no-violation');
  for (let guard = 0; guard < 10000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      night?.(g);
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: choices[g.decision.id] ?? g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}

describe('散户起义：零干预回放', { timeout: 60000 }, () => {
  const g = replay(GME, 'zero', 'retail', 'no-violation', []);
  it('布局期收盘贴近史料（±5%）', () => {
    for (let d = 0; d < 4; d++) {
      const hist = DAYS_2021[d].hist[DAYS_2021[d].hist.length - 1];
      expect(Math.abs(g.market.closePrices[d] - hist) / hist).toBeLessThan(0.05);
    }
  });
  it('决战日：冲高、限制买入后暴跌、收盘回升', () => {
    const b = g.market.bars;
    expect(Math.max(...b.map((x) => x.h))).toBeGreaterThan(44000);
    expect(Math.min(...b.slice(NYSE.index('10:00')).map((x) => x.l))).toBeLessThan(15000);
    expect(Math.abs(b[b.length - 1].c - 19360) / 19360).toBeLessThan(0.15);
    expect(g.flags.restrictActive).toBe(true);
  });
  it('股票账户不做逐日盯市：散户的持仓成本一直是当初的 18 美元', () => {
    expect(g.player.avg).toBe(1800);
  });
  it('出现了 LULD 暂停，但不会整天停着', () => {
    const halted = g.market.bars.filter((x) => x.v === 0).length;
    expect(halted).toBeGreaterThan(0);
    expect(halted).toBeLessThan(NYSE.minutes * 0.3);
  });
});

describe('散户起义：玩家真的能改变历史', { timeout: 60000 }, () => {
  it('券商连夜融资、不限制买入：暴跌不会发生', () => {
    const g = play('broker', { nscc: 'raise' });
    expect(g.flags.restrictActive).toBeFalsy();
    expect(Math.min(...g.market.bars.slice(NYSE.index('10:00')).map((x) => x.l))).toBeGreaterThan(25000);
    expect(g.ending?.id).toBe('broker-raised');
  });

  it('限制买入在撮合层生效：散户的买单被挡下，卖单照常成交', () => {
    const g = new Game(GME, 'close-only', 'retail', 'no-violation');
    while (!g.isBattleDay) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else g.tick();
    }
    while (g.market.t <= NYSE.index('10:05')) {
      if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: 'hold' });
      else g.tick();
    }
    g.act({ type: 'order', req: { side: 'buy', qty: 1, type: 'market' } });
    for (let i = 0; i < 12; i++) g.tick();
    expect(g.events.some((e) => e.rule === 'close-only' && e.text.includes('只允许卖出已有持仓'))).toBe(true);
    const before = g.player.pos;
    g.act({ type: 'order', req: { side: 'sell', qty: 10, type: 'market' } });
    for (let i = 0; i < 12 && g.player.pos === before; i++) g.tick();
    expect(g.player.pos).toBe(before - 10);
  });

  it('做空基金：不接受注资、一直扛着，会在决战日被强平；接受注资并在跳空日回补，能活下来', () => {
    expect(play('short').bankrupt).toBe(true);
    const saved = play('short', { 'gap-open': 'cover-all' }, 'gme', (g) => {
      if (g.dayIndex === 1) g.act({ type: 'social', verb: 'exchange', npc: 'stone', option: 'bailout' });
    });
    expect(saved.bankrupt).toBe(false);
    expect(saved.player.pos).toBe(0);
    expect(saved.ending?.id).toBe('short-covered');
  });

  it('卖空受借券上限约束', () => {
    const g = new Game(GME, 'borrow', 'short', 'no-violation');
    g.tick();
    g.act({ type: 'order', req: { side: 'sell', qty: 2_000_000, type: 'market' } });
    g.tick();
    expect(g.events.some((e) => e.rule === 'no-borrow')).toBe(true);
    expect(g.player.pos).toBe(-10_000_000);
  });
});
