import { describe, expect, it } from 'vitest';
import { S327 } from '../scenarios/s327';
import { DAYS, DECK_1995, PARAMS } from '../scenarios/s327/data';
import { Game, replay } from './game';
import { Market, minuteIndex } from './market';

/** 不做任何操作地跑完整个剧本（决策一律选默认项） */
function runIdle(faction: string, seed = 'test'): Game {
  return replay(S327, seed, faction, 'no-violation', []);
}

describe('引擎验收 5.2-1 零干预回放', () => {
  const g = runIdle('retail');

  it('布局期每日收盘贴近真实（重建）收盘价', () => {
    for (let d = 0; d < DAYS.length - 1; d++) {
      const hist = DAYS[d].hist[DAYS[d].hist.length - 1];
      expect(Math.abs(g.market.closePrices[d] - hist)).toBeLessThanOrEqual(20); // ±0.20 元
    }
  });

  it('决战日复现盟友倒戈、尾盘砸盘与交易所裁决', () => {
    const bars = g.market.bars;
    const high = Math.max(...bars.map((b) => b.h));
    expect(Math.abs(high - 15198)).toBeLessThanOrEqual(50);
    expect(Math.abs(bars[minuteIndex('16:21')].c - 15130)).toBeLessThanOrEqual(40);
    expect(Math.abs(bars[bars.length - 1].c - 14740)).toBeLessThanOrEqual(50);
    expect(g.flags.voided).toBe(true);
    expect(Math.abs(g.market.closePrices[g.market.closePrices.length - 1] - 15130)).toBeLessThanOrEqual(20);
  });
});

describe('引擎验收 5.2-2 冲击符合平方根律', () => {
  function impact(frac: number): number {
    const m = new Market(DECK_1995, PARAMS, 'impact', 14800);
    m.beginDay({ ...DAYS[0], crowdShare: 0, hist: DAYS[0].hist.map(() => 14800) }, 0);
    m.step([]);
    const before = m.last;
    m.ex.add({ id: 'big', name: 'big', seat: '', group: 'big', cash: 1e12, pos: 0, avg: 0, exempt: true, violations: 0 });
    m.ex.submit({ owner: 'big', side: 'buy', qty: Math.round(DAYS[0].vDay * frac), type: 'market' });
    return m.last - before;
  }

  it('1% 与 10% 日成交量的冲击之比约为 √10', () => {
    const a = impact(0.01);
    const b = impact(0.1);
    const ratio = b / a;
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(3.8);
    // 量级：Y·σ·P·√(Q/V)
    const expected = PARAMS.Y * DAYS[0].sigma * 148 * Math.sqrt(0.1) * 100;
    expect(Math.abs(b - expected) / expected).toBeLessThan(0.3);
  });
});

describe('引擎验收 5.2-3 可复现', () => {
  it('同一种子 + 同一串操作 → 同一局', () => {
    const live = new Game(S327, 'seed-a', 'short', 'no-violation');
    for (let i = 0; i < 60; i++) live.tick();
    live.act({ type: 'order', req: { side: 'buy', qty: 200_000, type: 'market' } });
    for (let i = 0; i < 300; i++) live.tick();
    live.act({ type: 'social', verb: 'probe', npc: 'zhou' });
    live.act({ type: 'social', verb: 'exchange', npc: 'gao', option: 'share' });
    live.act({ type: 'end-night' });
    for (let i = 0; i < 100; i++) live.tick();
    const re = replay(S327, 'seed-a', 'short', 'no-violation', live.log, live.globalTick);
    expect(re.stateHash()).toBe(live.stateHash());
  });

  it('不同种子 → 不同的一局', () => {
    expect(runIdle('retail', 'x').stateHash()).not.toBe(runIdle('retail', 'y').stateHash());
    expect(runIdle('retail', 'x').stateHash()).toBe(runIdle('retail', 'x').stateHash());
  });
});

describe('引擎验收 5.2-4 规则在撮合层强制执行', () => {
  it('保证金不足的委托被挡下，并产生规则事件', () => {
    const g = new Game(S327, 'rules', 'retail', 'no-violation');
    g.tick();
    g.act({ type: 'order', req: { side: 'buy', qty: 1000, type: 'market' } });
    g.tick();
    expect(g.player.pos).toBe(0);
    expect(g.events.some((e) => e.rule === 'margin')).toBe(true);
  });

  it('超额透支的委托能成交，但被记录为违规并推高监管热度', () => {
    const g = new Game(S327, 'rules', 'retail', 'no-violation');
    g.tick();
    g.act({ type: 'order', req: { side: 'buy', qty: 1000, type: 'market', overdraw: true } });
    g.tick();
    expect(g.player.pos).toBe(1000);
    expect(g.player.violations).toBe(1);
    expect(g.heat).toBeGreaterThan(0);
    expect(g.linesCrossed).toBe(1);
  });

  it('休市时委托被拒绝', () => {
    const g = new Game(S327, 'rules', 'retail', 'no-violation');
    while (g.phase === 'trading') g.tick();
    g.act({ type: 'order', req: { side: 'buy', qty: 10, type: 'market' } });
    expect(g.events.some((e) => e.rule === 'session')).toBe(true);
  });
});

describe('剧本：玩家真的能改变历史', () => {
  it('空方守住盟友（违约金 + 高关系）时，辽北不会倒戈，10:05 的跳涨明显变小', () => {
    const g = new Game(S327, 'loyal', 'short', 'no-violation');
    const night = () => {
      while (g.phase === 'trading') g.tick();
    };
    night();
    g.act({ type: 'social', verb: 'exchange', npc: 'gao', option: 'share' });
    g.act({ type: 'social', verb: 'probe', npc: 'gao' });
    g.act({ type: 'social', verb: 'ally', npc: 'gao' });
    g.act({ type: 'end-night' });
    night();
    g.act({ type: 'social', verb: 'exchange', npc: 'gao', option: 'share' });
    g.act({ type: 'social', verb: 'probe', npc: 'gao' });
    g.act({ type: 'end-night' });
    const r = replay(S327, 'loyal', 'short', 'no-violation', g.log);
    expect(r.flags.gaoActed).toBeFalsy();
    const idle = runIdle('short', 'loyal');
    expect(idle.flags.gaoActed).toBe(true);
    const spike = (x: Game) => Math.max(...x.market.bars.slice(minuteIndex('10:04'), minuteIndex('10:09')).map((b) => b.h));
    expect(spike(r)).toBeLessThan(spike(idle) - 80);
  });

  it('空方选择最后八分钟砸盘 → 交易所宣布交易无效（历史结局）', () => {
    const g = new Game(S327, 'dump', 'short', 'no-violation');
    for (let guard = 0; guard < 5000 && !g.ending; guard++) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.id === 'last-eight' ? 'dump' : 'hold' });
      else g.tick();
    }
    expect(g.flags.voided).toBe(true);
    expect(g.flags.voidedBy).toBe('shenjiang');
    // 砸盘成交全部作废：持仓退回砸盘前，并按官方收盘价（砸盘前的价格）结算
    expect(g.player.pos).toBe(-2_200_000);
    expect(g.market.last).toBe(g.market.closePrices[g.market.closePrices.length - 1]);
    expect(g.market.last).toBeGreaterThan(15000);
    expect(g.ending?.id === 'history' || g.ending?.id === 'bust').toBe(true);
  });
});

describe('新座位：空翻多的盟友', () => {
  function play(choice: string): Game {
    const g = new Game(S327, 'ally', 'ally', 'no-betrayal');
    for (let guard = 0; guard < 5000 && !g.ending; guard++) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.id === 'ally-flip' ? choice : g.decision.choices[0].id });
      else g.tick();
    }
    return g;
  }

  it('倒戈时撕毁锁仓、越过底线，并在上午的暴涨里获利', () => {
    const g = play('flip');
    expect(g.alliances[0].brokenBy).toBe('player');
    expect(g.linesCrossed).toBeGreaterThan(0);
    expect(g.ending?.id).toBe('ally-flip');
    expect(g.equity()).toBeGreaterThan(g.flags.startEq as number);
  });

  it('守约时 10:05 的跳涨不会出现，玩家随空方亏损', () => {
    const loyal = play('hold');
    const flip = play('flip');
    const spike = (x: Game) => Math.max(...x.market.bars.slice(minuteIndex('9:58'), minuteIndex('10:03')).map((b) => b.h));
    expect(spike(loyal)).toBeLessThan(spike(flip) - 80);
    expect(loyal.ending?.id).toBe('ally-loyal');
    expect(loyal.equity()).toBeLessThan(loyal.flags.startEq as number);
  });
});

describe('新座位：交易所值班官员', () => {
  function play(choices: Record<string, string>): Game {
    const g = new Game(S327, 'official', 'official', 'no-violation');
    for (let guard = 0; guard < 5000 && !g.ending; guard++) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: choices[g.decision.id] ?? g.decision.choices[0].id });
      else g.tick();
    }
    return g;
  }

  it('裁决“全部有效”时不作废，按砸盘后的价格收盘', () => {
    const g = play({ ruling: 'valid' });
    expect(g.flags.voided).toBeFalsy();
    expect(g.market.closePrices[g.market.closePrices.length - 1]).toBeLessThan(14900);
    expect(g.ending?.archetype).toBe('旁观者');
  });

  it('裁决“违规后无效”复现历史结局', () => {
    const g = play({ ruling: 'void' });
    expect(g.flags.voided).toBe(true);
    expect(g.ending?.archetype).toBe('守门人');
  });

  it('尾盘立即停市：之后没有成交，砸盘幅度被截住', () => {
    const g = play({ 'reg-dump': 'halt', ruling: 'void' });
    const bars = g.market.bars;
    expect(bars.slice(minuteIndex('16:24')).every((b) => b.v === 0)).toBe(true);
    expect(Math.min(...bars.map((b) => b.l))).toBeGreaterThan(14800);
  });

  it('提高保证金只影响这一局，不污染剧本常量', () => {
    const g = play({ 'reg-spike': 'margin', ruling: 'void' });
    expect(g.market.ex.deck.marginRate).toBe(0.05);
    expect(S327.deck.marginRate).toBe(0.025);
    expect(new Game(S327, 'x', 'retail', 'no-violation').market.ex.deck.marginRate).toBe(0.025);
  });
});
