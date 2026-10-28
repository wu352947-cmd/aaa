import { describe, expect, it } from 'vitest';
import { GME } from '../scenarios/gme';
import { S327 } from '../scenarios/s327';
import { BATTLE } from '../scenarios/s327/data';
import { Game, replay, type Scenario } from './game';

/** 跑到第 until 天开盘；每晚先调 night */
function upTo(sc: Scenario, seat: string, seed: string, until: number, night: (g: Game) => void = () => {}): Game {
  const g = new Game(sc, seed, seat, 'no-violation');
  const seen = new Set<number>();
  for (let guard = 0; guard < 20000 && g.dayIndex < until && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (!seen.has(g.dayIndex)) {
        seen.add(g.dayIndex);
        night(g);
      }
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}
const bull = (g: Game) => g.spin(1, '贴息在即', '测试');

describe('报纸：同一张报纸，不同的人读出不同的东西', { timeout: 120000 }, () => {
  it('塞进去的稿子成了明早的头条；散户跟着看多，消息驱动的人跟、逆向的人反着来', () => {
    const base = upTo(S327, 'retail', 'p1', 1);
    const g = upTo(S327, 'retail', 'p1', 1, bull);
    expect(g.papers[0].headline).toBe('贴息在即');
    expect(g.papers[0].spun).toEqual(['测试']);
    expect(g.market.sentiment).toBeGreaterThan(base.market.sentiment + 0.3);
    expect(g.npc('gao')!.view!).toBeGreaterThan(0.5); // 机会主义：跟
    expect(g.npc('wei')!.view!).toBeGreaterThan(0.5); // 消息驱动：跟
    expect(g.npc('shen')!.view!).toBeLessThan(-0.5); // 逆向：反着来
    expect(g.npc('chen')!.view ?? 0).toBe(0); // 规则：不看报纸
    expect(g.intel.find((i) => i.id === 'paper-read-1')!.body).toContain('冷笑');
  });

  it('看法改变出手：报纸天天看多，魏国梁布局期吸筹更勤，高振宇更想倒戈，沈立行更不肯认输', () => {
    const base = upTo(S327, 'retail', 'p2', BATTLE);
    const g = upTo(S327, 'retail', 'p2', BATTLE, bull);
    const buys = (x: Game) => x.market.ex.trades.filter((t) => t.buyer === 'zhongcai' && t.aggressor === 'buy').length;
    expect(buys(g)).toBeGreaterThan(buys(base));
    expect(g.npc('gao')!.view!).toBeGreaterThan(0);
    expect(g.npc('shen')!.view!).toBeLessThan(0);
  });

  it('散户起义：报纸天天喊逼空，做空基金反着读，回补得更慢', () => {
    const base = upTo(GME, 'retail', 'p3', 3);
    const g = upTo(GME, 'retail', 'p3', 3, bull);
    const gw = (x: Game) => x.market.ex.acct('greywolf').pos;
    expect(g.npc('rowan')!.view!).toBeLessThan(0);
    // 第三天收盘前回补的量更少：空单剩得更多
    expect(gw(g)).toBeLessThan(gw(base));
  });

  it('媒体吹风经过动作日志，重放出来同一张报纸、同样的看法', () => {
    const g = upTo(S327, 'long', 'p4', 3, (g) => {
      if (!g.canPlay('press')) g.act({ type: 'card', id: 'press' });
    });
    expect(g.papers.some((p) => p.spun?.includes('中财信托'))).toBe(true);
    const again = replay(S327, 'p4', 'long', 'no-violation', g.log, g.globalTick);
    expect(again.stateHash()).toBe(g.stateHash());
    expect(again.papers.map((p) => p.headline)).toEqual(g.papers.map((p) => p.headline));
  });
});
