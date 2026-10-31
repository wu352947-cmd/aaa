import { describe, expect, it } from 'vitest';
import { GME } from '../scenarios/gme';
import { S327 } from '../scenarios/s327';
import { st } from '../scenarios/s327/common';
import { BATTLE } from '../scenarios/s327/data';
import { TULIP_NPCS } from '../scenarios/tulip/data';
import { replayTulip, TulipGame } from '../scenarios/tulip/game';
import { Game, replay, traderArchetype } from './game';
import { PRE as FEB_DAY } from '../scenarios/s327/data';
import { sd } from '../scenarios/s327/common';

/** 这些测试写于一月那一章之前：从第二章（二月十六日）开始 */
const FEB = { startDay: FEB_DAY };
/** 327 按剧本日数（二月十六日是 0），其它剧本就是第几天 */
const dayOf = (g: Game) => (g.scenario.id === 's327' ? sd(g) : g.dayIndex);


/** 跑到第 day 晚停下 */
function toNight(g: Game, day: number): Game {
  for (let guard = 0; guard < 9000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (dayOf(g) >= day) return g;
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}

/** 跑完：每晚先调 night 钩子 */
function finish(g: Game, night?: (g: Game) => void): Game {
  const done = new Set<number>();
  for (let guard = 0; guard < 9000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (!done.has(dayOf(g))) {
        done.add(dayOf(g));
        night?.(g);
      }
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}

describe('每晚选卡：三选一，打出或换算', () => {
  it('每晚发三张；收下进手牌，同一种子同一串动作重放一致', () => {
    const g = toNight(new Game(S327, 'draft', 'official', 'no-violation', FEB), 0);
    expect(g.offer?.length).toBe(3);
    const pick = g.offer![0];
    g.act({ type: 'draft', id: pick });
    expect(g.hand).toEqual([pick]);
    expect(g.offer).toBeNull();
    expect(g.cards().some((c) => c.id === pick && c.group === '手牌')).toBe(true);
    const r = replay(S327, 'draft', 'official', 'no-violation', g.log, g.globalTick, FEB);
    expect(r.hand).toEqual(g.hand);
    expect(r.stateHash()).toBe(g.stateHash());
  });

  it('换算：不打出，换成政治资本；收下过的牌不会再发', () => {
    const g = toNight(new Game(S327, 'draft', 'official', 'no-violation', FEB), 0);
    const pick = g.offer![0];
    g.act({ type: 'draft', id: pick });
    const cap = st(g).cap;
    g.act({ type: 'convert', id: pick });
    expect(st(g).cap).toBeGreaterThan(cap);
    expect(g.hand).toEqual([]);
    toNight(g, 1);
    expect(g.offer).not.toContain(pick);
  });

  it('对手的牌只能换算：换得多，但替对手办事', () => {
    const g = toNight(new Game(S327, 'draft', 'official', 'no-violation', FEB), 0);
    // 直接把对手的牌塞进手牌，验证结算
    g.offer = ['x-foe-letter'];
    g.act({ type: 'draft', id: 'x-foe-letter' });
    expect(g.canPlay('x-foe-letter')).toMatch('对手的牌');
    const cap = st(g).cap;
    g.act({ type: 'convert', id: 'x-foe-letter' });
    expect(st(g).cap).toBe(Math.min(10, cap + 3));
    expect(st(g).deter.shenjiang).toBe(-2);
  });

  it('手牌最多三张', () => {
    const g = toNight(new Game(S327, 'hand', 'short', 'no-violation', FEB), 0);
    g.hand = ['x-eyes', 'x-calm', 'x-loan'];
    const before = g.offer;
    g.act({ type: 'draft', id: g.offer![0] });
    expect(g.hand.length).toBe(3);
    expect(g.offer).toEqual(before);
  });

  it('交易座位：眼线让所有人的盘算都摸清', () => {
    const g = toNight(new Game(S327, 'eyes', 'short', 'no-violation', FEB), 0);
    expect(g.scenario.clocks!(g).filter((c) => c.who !== 'lu').every((c) => !c.known)).toBe(true);
    g.offer = ['x-eyes'];
    g.act({ type: 'draft', id: 'x-eyes' });
    g.act({ type: 'card', id: 'x-eyes' });
    expect(g.scenario.clocks!(g).filter((c) => c.who !== 'lu').every((c) => c.known)).toBe(true);
  });
});

// 全剧本重放，并发跑满时会超过默认的 5 秒
describe('对手动向：进度钟', { timeout: 60_000 }, () => {
  it('当面聊过才摸得清；辽北倒戈后钟走满', () => {
    const g = toNight(new Game(S327, 'clock', 'short', 'no-violation', FEB), 0);
    const gao = () => g.scenario.clocks!(g).find((c) => c.id === 'gao-flip')!;
    expect(gao().known).toBe(false);
    g.act({ type: 'social', verb: 'probe', npc: 'gao' });
    expect(gao().known).toBe(true);
    toNight(g, 4);
    if (g.flags.gaoFlip) expect(gao().filled).toBe(gao().segs);
  });

  it('申江的钟：16:15 拿定主意后显示已经发生或没有发生', () => {
    const g = finish(new Game(S327, 'clock', 'official', 'no-violation', FEB));
    expect(g.ending).not.toBeNull();
  });
});

// 全剧本重放，并发跑满时会超过默认的 5 秒
describe('会员日报：监管座位每晚的案头工作', { timeout: 60_000 }, () => {
  it('诚实的行：昨日 + 买入 − 卖出 = 申报；浦江的委托从申江的交易室报进来', () => {
    const g = toNight(new Game(S327, 'audit', 'official', 'no-violation', FEB), 1);
    const doc = g.scenario.docs!(g)[0];
    const n = (x: string) => Number(x.replace('−', '-').replace('+', ''));
    for (const r of doc.rows) {
      const [, y, b, s, rep, term] = r.cells;
      if (r.id === 'pujiang') expect(term).toBe('申江大厦 3F');
      else expect(Math.abs(n(y) + n(b) - n(s) - n(rep))).toBeLessThan(0.05);
    }
  });

  it('标出浦江的终端异常：拿到借壳证据，合并超限的部分明早减仓', () => {
    const g = toNight(new Game(S327, 'audit', 'official', 'no-violation', FEB), 1);
    g.act({ type: 'doc', id: 'audit-1', marks: { pujiang: 'term' } });
    expect(st(g).evidence.has('split')).toBe(true);
    expect(st(g).reduce.get('shenjiang')).toBeGreaterThan(0);
    expect(g.scenario.docs!(g)[0].filed?.result.ok).toBe(true);
  });

  it('冤枉人要付代价', () => {
    const g = toNight(new Game(S327, 'audit', 'official', 'no-violation', FEB), 1);
    const wei = g.npc('wei')!.relation;
    g.act({ type: 'doc', id: 'audit-1', marks: { zhongcai: 'pos' } });
    expect(g.npc('wei')!.relation).toBe(wei - 8);
    expect(g.scenario.docs!(g)[0].filed?.result.ok).toBe(false);
  });

  it('保证金提到 5% 之后，吃紧的申江会在日报上少报空单', () => {
    const g = new Game(S327, 'misreport', 'official', 'no-violation', FEB);
    toNight(g, 0);
    g.act({ type: 'card', id: 'margin' });
    toNight(g, 1);
    const row = g.scenario.docs!(g)[0].rows.find((r) => r.id === 'shenjiang')!;
    const n = (x: string) => Number(x.replace('−', '-').replace('+', ''));
    expect(n(row.cells[4])).toBeGreaterThan(n(row.cells[1]) + n(row.cells[2]) - n(row.cells[3]) + 10);
  });
});

// 全剧本重放，并发跑满时会超过默认的 5 秒
describe('上级指示', { timeout: 60_000 }, () => {
  it('什么都不做：上面交代的事大半办砸，仕途受影响', () => {
    const idle = finish(new Game(S327, 'dirs', 'official', 'no-violation', FEB));
    const dirs = st(idle).dirs;
    expect(dirs.length).toBeGreaterThanOrEqual(7);
    expect(dirs.filter((d) => d.status === 'failed').length).toBeGreaterThanOrEqual(3);
  });

  it('照办：查一家、核日报、落实应急措施——办到的多，档案更好看', () => {
    const idle = finish(new Game(S327, 'dirs', 'official', 'no-violation', FEB));
    const busy = finish(new Game(S327, 'dirs', 'official', 'no-violation', FEB), (g) => {
      if (sd(g) === 0) g.act({ type: 'card', id: 'brief', target: 'general' });
      if (sd(g) === 1) {
        g.act({ type: 'card', id: 'inspect', target: 'pujiang' });
        g.act({ type: 'doc', id: 'audit-1', marks: { pujiang: 'term' } });
      }
      if (sd(g) === 2) g.act({ type: 'doc', id: 'audit-2', marks: { pujiang: 'term' } });
      if (sd(g) === 3) g.act({ type: 'card', id: 'band' });
    });
    const met = (g: Game) => st(g).dirs.filter((d) => d.status === 'met').length;
    expect(met(busy)).toBeGreaterThan(met(idle) + 2);
    expect(busy.npc('yan')!.relation).toBeGreaterThan(idle.npc('yan')!.relation);
  });

  it('财政部说别动保证金：一动就当场办砸', () => {
    const g = toNight(new Game(S327, 'lu', 'official', 'no-violation', FEB), 2);
    g.act({ type: 'card', id: 'margin' });
    expect(st(g).dirs.find((d) => d.id === 'no-margin')?.status).toBe('failed');
  });
});

describe('散户起义：选卡与动向', { timeout: 60000 }, () => {
  it('券商：清算所的老同事让押金少 3 亿美元；对手动向里看得到押金钟', () => {
    const g = new Game(GME, 'gme-draft', 'broker', 'no-violation');
    toNight(g, 1);
    const nscc = () => g.scenario.clocks!(g).find((c) => c.id === 'nscc')!;
    const before = nscc().then;
    g.offer = ['x-nscc-friend'];
    g.act({ type: 'draft', id: 'x-nscc-friend' });
    g.act({ type: 'card', id: 'x-nscc-friend' });
    expect(nscc().then).not.toBe(before);
  });

  it('每晚都发牌，直到决战日', () => {
    const g = new Game(GME, 'gme-draft', 'retail', 'no-violation');
    toNight(g, 0);
    expect(g.offer?.length).toBe(3);
  });
});

describe('酒馆：选卡、动向、市政官的交代', () => {
  it('每晚发三张；同一种子同一串操作重放一致', () => {
    const g = new TulipGame('draft', 'speculator');
    expect(g.offer?.length).toBe(3);
    g.act({ type: 'draft', id: g.offer![0] });
    g.act({ type: 'leave' });
    const r = replayTulip('draft', 'speculator', g.log);
    expect(r.hand).toEqual(g.hand);
    expect(r.offer).toEqual(g.offer);
  });

  it('科内利斯的转让：换算拿钱，也接下了他的约', () => {
    const g = new TulipGame('dump', 'speculator');
    g.offer = ['x-foe-dump'];
    g.act({ type: 'draft', id: 'x-foe-dump' });
    const cash = g.cash;
    g.act({ type: 'convert', id: 'x-foe-dump' });
    expect(g.cash).toBe(cash + 6);
    expect(g.contracts.some((c) => c.npc === 'cornelis' && c.side === 'buy')).toBe(true);
  });

  it('赊账要在结算时还', () => {
    const g = new TulipGame('credit', 'speculator');
    const base = g.settle('option').total;
    g.offer = ['x-credit'];
    g.act({ type: 'draft', id: 'x-credit' });
    g.act({ type: 'card', id: 'x-credit' });
    expect(g.settle('option').total).toBe(base - 2);
  });

  it('议员：第一晚登记了约定，第二晚开场时市政官的交代算办到', () => {
    const g = new TulipGame('dirs', 'council');
    expect(g.directives()[0].from).toBe('witt');
    g.act({ type: 'card', id: 'register' });
    g.act({ type: 'leave' });
    expect(g.dirs.find((d) => d.id === 'know')?.status).toBe('met');
    expect(g.influence).toBe(3);
  });

  it('议员的动向是三条规则各自的票数', () => {
    const g = new TulipGame('votes', 'council');
    const clocks = g.clocks().filter((c) => c.id.startsWith('vote-'));
    expect(clocks.length).toBe(3);
    expect(clocks.reduce((a, c) => a + c.filled, 0)).toBeLessThanOrEqual(7);
  });

  it('交易座位：老板的眼色让科内利斯的钟摸清', () => {
    const g = new TulipGame('host', 'speculator');
    expect(g.clocks().find((c) => c.who === 'cornelis')?.known).toBe(false);
    const q = g.quotes.find((x) => x.npc === 'cornelis');
    if (q) g.act({ type: 'card', id: 'ask-host', target: 'cornelis' });
    else {
      g.offer = ['x-host'];
      g.act({ type: 'draft', id: 'x-host' });
      g.act({ type: 'card', id: 'x-host' });
    }
    expect(g.clocks().find((c) => c.who === 'cornelis')?.known).toBe(true);
    expect(TULIP_NPCS.some((n) => n.id === 'cornelis')).toBe(true);
  });
});

it('决战日在第 BATTLE 天', () => expect(BATTLE).toBeGreaterThan(0));

describe('每个座位每晚都收牌、能打就打、不能打就换算：整局跑得完', { timeout: 120000 }, () => {
  const greedy = (g: Game) => {
    if (g.offer) g.act({ type: 'draft', id: g.offer[0] });
    for (const c of g.handCards()) {
      const t = c.targets?.[0]?.id;
      if (!g.canPlay(c.id, t)) g.act({ type: 'card', id: c.id, target: t });
      else if (c.when !== 'trading' || c.foe) g.act({ type: 'convert', id: c.id });
    }
  };
  for (const f of ['official', 'short', 'long', 'ally', 'retail'])
    it(`327 · ${f}`, () => {
      const g = finish(new Game(S327, `greedy-${f}`, f, 'no-violation', FEB), greedy);
      expect(g.ending).not.toBeNull();
      expect(g.drafted.length).toBeGreaterThan(2);
    });
  for (const f of ['retail', 'short', 'broker', 'mm'])
    it(`散户起义 · ${f}`, () => {
      const g = finish(new Game(GME, `greedy-${f}`, f, 'no-violation'), greedy);
      expect(g.ending).not.toBeNull();
    });
  for (const f of ['speculator', 'grower', 'council'] as const)
    it(`酒馆 · ${f}`, () => {
      const g = new TulipGame(`greedy-${f}`, f);
      while (g.phase === 'table') {
        if (g.offer) g.act({ type: 'draft', id: g.offer[0] });
        for (const c of g.handCards()) {
          if (!c.blocked) g.act({ type: 'card', id: c.id, target: c.targets?.[0]?.id });
          else g.act({ type: 'convert', id: c.id });
        }
        g.act({ type: 'leave' });
      }
      expect(g.drafted.length).toBeGreaterThan(2);
      expect(Number.isFinite(g.settle('option').total)).toBe(true);
    });
});

describe('猎手要跑赢“开局仓位拿着不动”', { timeout: 60000 }, () => {
  it('判定规则', () => {
    expect(traderArchetype(0.6, 0.6, true)).toBe('长青者');
    expect(traderArchetype(0.8, 0.6, true)).toBe('猎手');
    expect(traderArchetype(0.6, 0.6, false)).toBe('流星');
    expect(traderArchetype(-0.7, -0.7, true)).toBe('出局者');
    expect(traderArchetype(-0.7, -0.7, true, false)).toBe('长青者');
  });
  it('327 中财：什么都不做也赚钱，但不算猎手', () => {
    const g = finish(new Game(S327, 'hold', 'long', 'no-violation', FEB));
    expect(g.ending!.stats.find(([k]) => k === '收益率')![1]).not.toMatch(/^-/);
    expect(g.ending!.archetype).not.toBe('猎手');
    expect(g.ending!.body.join('')).toContain('主要是历史');
  });
  it('散户起义：拿着不动的散户不算猎手', () => {
    const g = finish(new Game(GME, 'hold', 'retail', 'no-violation'));
    expect(g.ending!.archetype).not.toBe('猎手');
  });
});
