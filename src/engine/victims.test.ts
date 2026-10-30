import { describe, expect, it } from 'vitest';
import { S327 } from '../scenarios/s327';
import { GME } from '../scenarios/gme';
import { Game, replay, type Scenario } from './game';

/** 玩到结局；pick 决定决策，night 每晚调一次 */
function play(sc: Scenario, seat: string, seed: string, pick: (id: string) => string | undefined = () => undefined, night?: (g: Game) => void): Game {
  const g = new Game(sc, seed, seat, 'no-violation');
  const seen = new Set<number>();
  for (let guard = 0; guard < 30000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (!seen.has(g.dayIndex)) {
        seen.add(g.dayIndex);
        night?.(g);
      }
      if (!g.ending) g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: pick(g.decision.id) ?? g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}
const letters = (g: Game) => g.intel.filter((i) => i.kind === 'victim');

describe('受害者视角：每次黑色操作，对面都有一个人', { timeout: 120000 }, () => {
  it('干干净净地打完，一封信也没有', () => {
    expect(letters(play(S327, 'retail', 'clean'))).toEqual([]);
  });

  it('327 空方砸盘：决战日当晚收到信，数字取自当天的盘面；重放出来一字不差', () => {
    const g = play(S327, 'short', 'v1', (id) => (id === 'last-eight' ? 'dump' : undefined));
    const ls = letters(g);
    const battle = g.scenario.days.findIndex((d) => d.kind === 'battle');
    expect(ls.some((l) => l.day === battle && l.body.includes('最后八分钟'))).toBe(true);
    expect(ls[0].body).toMatch(/\d+\.\d\d 元/);
    const again = replay(S327, 'v1', 'short', 'no-violation', g.log);
    expect(letters(again).map((l) => l.body)).toEqual(ls.map((l) => l.body));
  });

  it('夜里打出黑牌，当晚就有回音', () => {
    const g = play(S327, 'short', 'v2', undefined, (g) => {
      if (g.isAftermath && !g.canPlay('shred')) g.act({ type: 'card', id: 'shred' });
    });
    const shred = letters(g).find((l) => l.body.includes('销毁交易记录'));
    expect(shred).toBeTruthy();
    expect(g.scenario.days[shred!.day].kind).toBe('aftermath');
  });

  it('对倒被交易所查到，也有人跟进去', () => {
    const g = new Game(S327, 'v3', 'short', 'no-violation');
    while (g.market.t < 100) g.tick();
    for (let i = 0; i < 6; i++) {
      g.act({ type: 'order', req: { side: 'buy', qty: 150_000, type: 'limit', price: g.market.ex.book.best('sell') ?? g.market.last, wash: true } });
      g.tick();
    }
    while (g.phase === 'trading') g.decision ? g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id }) : g.tick();
    expect(letters(g).some((l) => l.body.includes('对敲'))).toBe(true);
  });

  it('黑牌打得再多：每个人一局只来一次信，爆了仓的人不会再写；同一种操作只回音一次', () => {
    for (const seed of ['m1', 'm2', 'm3']) {
      const g = play(
        S327,
        'short',
        seed,
        (id) => (id === 'last-eight' ? 'dump' : id === 'after-flip' ? 'press' : undefined),
        (g) => {
          for (const c of g.cards()) if (c.color === 'black' && !g.canPlay(c.id, c.targets?.[0]?.id)) g.act({ type: 'card', id: c.id, target: c.targets?.[0]?.id });
        },
      );
      const ls = letters(g);
      const from = ls.map((l) => l.source);
      expect(new Set(from).size).toBe(from.length);
      expect(new Set(ls.map((l) => l.body)).size).toBe(ls.length);
      expect(ls.length).toBeLessThanOrEqual(8);
      expect(g.darkDeeds.length).toBeGreaterThan(0);
      // 最重的那一下不能因为人用完了就没有回音
      expect(ls.some((l) => l.body.includes('最后八分钟'))).toBe(true);
    }
  });

  it('散户起义：做市商撤掉报价，对面是美国的散户', () => {
    const g = play(GME, 'mm', 'v4', (id) => (id === 'mm-quote' ? 'pull' : undefined));
    if (g.flags.mmQuote === 'pull') expect(letters(g).some((l) => l.body.includes('撤掉了报价') && l.body.includes('美元'))).toBe(true);
  });
});
