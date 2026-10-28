import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { DAYS_2021, NYSE } from './data';
import { GME } from './index';
import { DESK, deskEquity, hedgeTarget, mm } from './mm';

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

describe('散户起义：手段', { timeout: 60000 }, () => {
  it('券商这一周做足准备（融资、提保证金、停期权、找清算所）：凌晨可以照常开放', () => {
    const g = play('broker', { nscc: 'open' }, 'ready', (x) => {
      if (x.dayIndex <= 1) x.act({ type: 'card', id: 'raise-early' });
      if (x.dayIndex === 2) x.act({ type: 'card', id: 'margin-full' });
      if (x.dayIndex === 3) x.act({ type: 'card', id: 'call-nscc' });
    });
    expect(g.flags.opened).toBe(true);
    expect(g.flags.restrictActive).toBeFalsy();
    expect(g.ending?.id).toBe('broker-ready');
  });

  it('没有准备：凌晨的选项里没有“照常开放”', () => {
    const g = new Game(GME, 'unready', 'broker', 'no-violation');
    while (!g.decision || g.decision.id !== 'nscc') {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else g.tick();
    }
    expect(g.decision.choices.some((c) => c.id === 'open')).toBe(false);
  });

  it('暂停期权开仓：做市商被迫买进的对冲股票少了两成多', () => {
    const run = (off: boolean) =>
      play('broker', {}, 'opt', (x) => {
        if (off && x.dayIndex === 1 && !x.flags.optionsOff) x.act({ type: 'card', id: 'options-off' });
      });
    // 价格的高点还受其他几股资金影响，单看一局不稳；对冲买盘本身是这张卡直接改变的东西
    const hedged = (x: Game) => x.market.ex.trades.filter((t) => t.buyer === 'fortress').reduce((a, t) => a + t.qty, 0);
    expect(hedged(run(true))).toBeLessThan(hedged(run(false)) * 0.85);
  });

  it('被限制买入的散户转户：一小时后又能买', () => {
    const g = new Game(GME, 'switch', 'retail', 'no-violation');
    while (!g.isBattleDay || g.market.t <= NYSE.index('10:05')) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: 'hold' });
      else g.tick();
    }
    expect(g.player.closeOnly).toBe(true);
    g.act({ type: 'card', id: 'switch' });
    for (let i = 0; i < 62; i++) {
      if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: 'hold' });
      g.tick();
    }
    expect(g.player.closeOnly).toBe(false);
  });
});

describe('做市商：卖期权、做对冲、赚价差', { timeout: 120000 }, () => {
  it('开局已经按 delta 对冲好；顶栏换成交易台的指标', () => {
    const g = new Game(GME, 'mm', 'mm', 'no-violation');
    expect(Math.abs(hedgeTarget(g) - g.player.pos)).toBeLessThan(10);
    expect(deskEquity(g)).toBeCloseTo(DESK, -6);
    expect(GME.meters!(g)!.map((m) => m.id)).toEqual(['desk', 'gap', 'calls', 'pfof', 'rep']);
  });

  it('自动对冲：价格往上冲，持股跟着加；停掉对冲，持股不动', () => {
    const on = play('mm', {}, 'mm-h');
    const off = play('mm', { 'mm-gap': 'bet' }, 'mm-h', (g) => {
      if (g.dayIndex === 0 && mm(g).hedge) g.act({ type: 'card', id: 'mm-hedge' });
    });
    expect(mm(on).hedgeBought).toBeGreaterThan(5_000_000);
    // 第一天收盘后才停：之后一股没再追
    expect(mm(off).hedgeBought).toBeLessThan(mm(on).hedgeBought * 0.5);
    expect(Math.abs(hedgeTarget(off) - off.player.pos)).toBeGreaterThan(Math.abs(hedgeTarget(on) - on.player.pos));
  });

  it('每晚照卖看涨期权：债越滚越大；停卖之后不再增加', () => {
    const sell = play('mm', {}, 'mm-s');
    const stop = play('mm', {}, 'mm-s', (g) => {
      if (g.dayIndex === 0 && mm(g).selling) g.act({ type: 'card', id: 'mm-calls' });
    });
    // 开局一笔 + 22、25、26 日夜里的买单各一笔（决战日前夜不再卖）
    expect(mm(sell).lots.length).toBe(4);
    expect(mm(stop).lots.length).toBe(1);
    expect(deskEquity(stop)).toBeGreaterThan(deskEquity(sell));
  });

  it('回购：期权了结，对冲的股票当晚按收盘价卖掉', () => {
    const g = new Game(GME, 'mm-b', 'mm', 'no-violation');
    while (g.phase !== 'night') g.tick();
    const before = deskEquity(g);
    g.act({ type: 'card', id: 'mm-buyback', target: 'all' });
    expect(mm(g).lots.length).toBe(0);
    expect(g.player.pos).toBe(0);
    // 多付一成溢价
    expect(deskEquity(g)).toBeLessThan(before);
    expect(before - deskEquity(g)).toBeLessThan(before * 0.05);
  });

  it('抢先交易：价差收入翻倍，热度上去，结局是蛀虫', () => {
    const clean = play('mm', {}, 'mm-f');
    const dirty = new Game(GME, 'mm-f', 'mm', 'no-violation');
    for (let guard = 0; guard < 10000 && !dirty.ending; guard++) {
      if (dirty.phase === 'night') dirty.act({ type: 'end-night' });
      else if (dirty.decision) dirty.act({ type: 'decision', id: dirty.decision.id, choice: dirty.decision.choices[0].id });
      else {
        if (dirty.market.t === 5) dirty.act({ type: 'card', id: 'mm-frontrun' });
        dirty.tick();
      }
    }
    expect(mm(dirty).pfof).toBeGreaterThan(mm(clean).pfof * 2);
    expect(dirty.heatTier()).toBeGreaterThan(1);
    expect(dirty.ending!.archetype).toBe('蛀虫');
  });

  it('决战日限制买入后要决定还报不报价：撤单让挂单变薄', () => {
    const asked: string[] = [];
    const g = new Game(GME, 'mm-q', 'mm', 'no-violation');
    for (let guard = 0; guard < 10000 && !g.ending; guard++) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) {
        asked.push(g.decision.id);
        g.act({ type: 'decision', id: g.decision.id, choice: g.decision.id === 'mm-quote' ? 'pull' : g.decision.choices[0].id });
        if (asked.at(-1) === 'mm-quote') expect(g.market.depthScale).toBe(0.25);
      } else g.tick();
    }
    expect(asked).toContain('mm-quote');
    expect(g.ending!.id).toBe('mm-pulled');
  });

  it('同一种子 + 同一串操作 → 同一局', () => {
    const a = play('mm', {}, 'mm-r', (g) => {
      if (g.dayIndex === 1 && !mm(g).quoting.startsWith('w')) g.act({ type: 'card', id: 'mm-wide' });
    });
    const b = replay(GME, 'mm-r', 'mm', 'no-violation', a.log);
    expect(b.stateHash()).toBe(a.stateHash());
    expect(deskEquity(b)).toBe(deskEquity(a));
  });
});
