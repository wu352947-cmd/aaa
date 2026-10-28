import { describe, expect, it } from 'vitest';
import { S327 } from '../scenarios/s327';
import { BATTLE, DAYS, DECK_1995, PARAMS } from '../scenarios/s327/data';
import { Game, replay } from './game';
import { Market, minuteIndex } from './market';

/** 不做任何操作地跑完整个剧本（决策一律选默认项） */
function runIdle(faction: string, seed = 'test'): Game {
  return replay(S327, seed, faction, 'no-violation', []);
}

describe('引擎验收 5.2-1 零干预回放', () => {
  const g = runIdle('retail');

  it('布局期每日收盘贴近真实（重建）收盘价', () => {
    for (let d = 0; d < BATTLE; d++) {
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
    // 官方收盘价就是砸盘开始前那一刻的价格，和上面 16:21 的收盘同一个容差（各种子在 ±0.40 元内散布）
    expect(Math.abs(g.market.closePrices[g.market.closePrices.length - 1] - 15130)).toBeLessThanOrEqual(40);
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

describe('监管座位：交易所监管负责人', () => {
  type Night = Record<number, [string, string?][]>;
  /** 跑完一局：nights 是每晚要打的卡，day 是盘中每分钟的钩子，ruling 是当晚裁决 */
  function play(opts: { nights?: Night; day?: (g: Game) => void; ruling?: string; seed?: string } = {}): Game {
    const g = new Game(S327, opts.seed ?? 'official', 'official', 'no-violation');
    const done = new Set<number>();
    for (let guard = 0; guard < 8000 && !g.ending; guard++) {
      if (g.phase === 'night') {
        if (!done.has(g.dayIndex)) {
          done.add(g.dayIndex);
          for (const [id, target] of opts.nights?.[g.dayIndex] ?? []) g.act({ type: 'card', id, target });
        }
        g.act({ type: 'end-night' });
      } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.id === 'ruling' ? (opts.ruling ?? 'void') : g.decision.choices[0].id });
      else {
        opts.day?.(g);
        g.tick();
      }
    }
    return g;
  }
  const low = (g: Game) => Math.min(...g.market.bars.slice(minuteIndex('16:22')).map((b) => b.l));

  it('剧本多出两夜余波：决战日之后还有清算', () => {
    const g = play();
    expect(DAYS.filter((d) => d.kind === 'aftermath').length).toBe(2);
    expect(g.papers.some((p) => p.day === BATTLE + 1)).toBe(true);
    expect(g.ending).not.toBeNull();
  });

  it('裁决“全部有效”时不作废，按砸盘后的价格收盘', () => {
    const g = play({ ruling: 'valid' });
    expect(g.flags.voided).toBeFalsy();
    expect(g.market.closePrices[BATTLE]).toBeLessThan(14900);
    expect(g.ending?.archetype).toBe('旁观者');
  });

  it('裁决“违规后无效”复现历史结局', () => {
    const g = play({ ruling: 'void' });
    expect(g.flags.voided).toBe(true);
    expect(g.ending?.id).toBe('official-void');
    // 上面交代的事一件不办，档案上的去向不会好看
    expect(['守门人', '流星']).toContain(g.ending?.archetype);
  });

  it('只撤销透支成交：正常成交保留，没有无辜的人被一起抹掉', () => {
    const g = play({ ruling: 'precise' });
    expect(g.flags.precise).toBe(true);
    expect(g.flags.innocentVoided).toBe(0);
    expect(play({ ruling: 'void' }).flags.innocentVoided).toBeGreaterThan(0);
  });

  it('砸盘一开始就停市：之后没有成交，砸盘幅度被截住', () => {
    const g = play({ day: (x) => x.isBattleDay && x.market.t === minuteIndex('16:23') && x.act({ type: 'card', id: 'halt' }) });
    expect(g.market.bars.slice(minuteIndex('16:24')).every((b) => b.v === 0)).toBe(true);
    expect(low(g)).toBeGreaterThan(14800);
  });

  it('尾盘前限令申江只许平仓：砸盘根本发不出来', () => {
    const g = play({ day: (x) => x.isBattleDay && x.market.t === minuteIndex('16:10') && x.act({ type: 'card', id: 'closeonly', target: 'shenjiang' }) });
    expect(g.flags.shenPlan).toBe('blocked');
    expect(g.flags.voided).toBeFalsy();
    expect(low(g)).toBeGreaterThan(14950);
    expect(g.ending?.id).toBe('official-defused');
  });

  it('布局期层层施压（吹风、稽查、电话、点名）：申江在尾盘认赔而不是砸盘', () => {
    const g = play({ nights: { 2: [['brief', 'general']], 3: [['inspect', 'shenjiang'], ['csrc']], 4: [['call', 'shenjiang'], ['brief', 'name-shen']] } });
    expect(g.intel.some((i) => i.id === 'ev-split')).toBe(true);
    expect(g.flags.shenPlan).toBe('cover');
    expect(g.flags.npcDump).toBeFalsy();
  });

  it('请财政部提前公告：开盘二十分钟内价格就到位，盟友在开盘就倒戈', () => {
    const g = play({ nights: { 2: [['mof']] } });
    expect(g.flags.mofPublic).toBe(true);
    expect(g.market.bars[20].c).toBeGreaterThan(15050);
    const idle = play();
    expect(idle.market.bars[20].c).toBeLessThan(14900);
  });

  it('协议平仓谈成后，申江的空单少了 80 万口，尾盘不再需要砸盘', () => {
    const g = play({ nights: { 2: [['mediate']], 3: [['mediate']], 4: [['mediate']] }, seed: 'med' });
    expect(g.flags.mediated).toBe(true);
    expect(g.flags.npcDump).toBeFalsy();
  });

  it('涨跌停板：决战日的价格被封在板上', () => {
    const g = play({ nights: { 3: [['csrc']], 4: [['band']] } });
    const settle = g.market.closePrices[BATTLE - 1];
    const hi = Math.max(...g.market.bars.map((b) => b.h));
    expect(hi).toBeLessThanOrEqual(settle + Math.round(settle * 0.015));
  });

  it('提高保证金只影响这一局，不污染剧本常量', () => {
    const g = play({ day: (x) => x.dayIndex === 0 && x.market.t === 10 && x.act({ type: 'card', id: 'margin-now' }) });
    expect(g.market.ex.deck.marginRate).toBe(0.05);
    expect(S327.deck.marginRate).toBe(0.025);
    expect(new Game(S327, 'x', 'retail', 'no-violation').market.ex.deck.marginRate).toBe(0.025);
  });

  it('政治资本不够时，卡打不出去', () => {
    const g = new Game(S327, 'broke', 'official', 'no-violation');
    while (g.phase === 'trading') g.tick();
    g.act({ type: 'card', id: 'mof' });
    g.act({ type: 'card', id: 'limit' });
    expect(g.canPlay('band')).toMatch(/政治资本不足/);
    g.act({ type: 'card', id: 'band' });
    expect(g.market.ex.deck.priceLimit).toBeNull();
    expect(g.flags.bandNext).toBeUndefined();
  });

  it('余波：没人处理的穿仓会员会连环违约，用风险基金垫付就不会', () => {
    const g = play({ ruling: 'valid' });
    expect(g.ending?.stats.find(([k]) => k === '会员穿仓 / 违约')).toBeDefined();
  });

  it('卡牌结算写进动作日志，读档重放得到同一局', () => {
    const live = new Game(S327, 'cards', 'official', 'no-violation');
    while (live.phase === 'trading') live.tick();
    live.act({ type: 'card', id: 'inspect', target: 'zhongcai' });
    live.act({ type: 'card', id: 'mediate' });
    live.act({ type: 'end-night' });
    for (let i = 0; i < 30; i++) live.tick();
    live.act({ type: 'card', id: 'notice' });
    for (let i = 0; i < 30; i++) live.tick();
    const re = replay(S327, 'cards', 'official', 'no-violation', live.log, live.globalTick);
    expect(re.stateHash()).toBe(live.stateHash());
    expect(re.cardLog.map((c) => c.result.title)).toEqual(live.cardLog.map((c) => c.result.title));
  });
});

describe('交易座位的手段', () => {
  function day1(f: string, card?: string) {
    const g = new Game(S327, 'w', f, 'no-violation');
    while (g.phase === 'trading') g.tick();
    g.act({ type: 'end-night' });
    while (g.market.t < 215) {
      if (card && g.market.t === 200) g.act({ type: 'card', id: card });
      g.tick();
    }
    return g;
  }

  it('对倒拉抬把价格推上去，散布谣言把价格压下来，两者都留痕', () => {
    const idle = day1('long').market.last;
    const wash = day1('long', 'wash');
    const veto = day1('short', 'fake-veto');
    expect(wash.market.last).toBeGreaterThan(idle + 5);
    expect(veto.market.last).toBeLessThan(idle - 5);
    expect(wash.heat).toBeGreaterThan(0);
    expect(veto.intel.some((i) => i.chain?.some((c) => c.altered && c.who === '你'))).toBe(true);
  });

  it('借壳分仓：空方的持仓限额变成 400 万口，越过“绝不违规”的底线', () => {
    const g = new Game(S327, 's', 'short', 'no-violation');
    g.act({ type: 'card', id: 'split' });
    expect(g.market.ex.limitOf(g.player)).toBe(4_000_000);
    expect(g.linesCrossed).toBe(1);
  });

  it('多方拿到代持证据后举报：申江在尾盘不敢全力砸盘', () => {
    const g = new Game(S327, 'rep', 'long', 'no-violation');
    for (let guard = 0; guard < 8000 && !g.ending; guard++) {
      if (g.phase === 'night') {
        if ((g.dayIndex === 1 || g.dayIndex === 2) && g.flags[`probed-${g.dayIndex}`] == null) {
          g.flags[`probed-${g.dayIndex}`] = true;
          g.act({ type: 'social', verb: 'probe', npc: 'zhou' });
        }
        if (g.dayIndex === 3 && !g.flags.repDone) {
          g.flags.repDone = true;
          g.act({ type: 'card', id: 'report-split' });
        }
        g.act({ type: 'end-night' });
      } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
      else g.tick();
    }
    expect(g.intel.some((i) => i.id === 'ev-split')).toBe(true);
    expect(g.flags.shenReported).toBe(true);
    expect(g.flags.shenPlan).not.toBe('dump');
  });
});

describe('消息树', () => {
  it('结局时每条传言都带着从源头到玩家的传递链，并标出被改动的一环', () => {
    const g = runIdle('short', 'tree');
    const tiexi = g.intel.find((i) => i.id === 'tiexi-1')!;
    expect(tiexi.chain!.length).toBeGreaterThan(1);
    expect(tiexi.chain!.some((h) => h.altered)).toBe(true);
  });

  it('背叛过高振宇的空方会收到他放的假消息；守约的不会', () => {
    const betray = new Game(S327, 'bait', 'short', 'no-violation');
    while (betray.phase === 'trading') betray.tick();
    betray.act({ type: 'social', verb: 'betray', npc: 'gao' });
    const g = replay(S327, 'bait', 'short', 'no-violation', betray.log);
    const bait = g.intel.find((i) => i.id === 'gao-bait');
    expect(bait).toBeDefined();
    expect(bait!.credibility).toBeLessThan(0.2);
    expect(runIdle('short', 'bait').intel.some((i) => i.id === 'gao-bait')).toBe(false);
  });
});
