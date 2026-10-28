import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { BATTLE_2015, DAYS_2015 } from './data';
import { RAIDER, stake, tally, TAKEOVER } from './index';

const HALT0 = DAYS_2015.findIndex((d) => d.kind === 'halt');
type Plan = { night?: (g: Game) => void; day?: (g: Game) => void; decide?: (id: string) => string | undefined };

function play(seat: string, seed: string, p: Plan = {}): Game {
  const g = new Game(TAKEOVER, seed, seat, 'no-violation');
  const seen = new Set<number>();
  for (let guard = 0; guard < 30000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (!seen.has(g.dayIndex)) {
        seen.add(g.dayIndex);
        p.night?.(g);
      }
      if (!g.ending) g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: p.decide?.(g.decision.id) ?? g.decision.choices[0].id });
    else {
      p.day?.(g);
      g.tick();
    }
  }
  return g;
}
const card = (g: Game, id: string) => {
  const c = g.cards().find((x) => x.id === id);
  if (c && !g.canPlay(id)) g.act({ type: 'card', id });
};
const talk = (g: Game, npc: string, option: string) => g.act({ type: 'social', verb: 'exchange', npc, option });

describe('门口的野蛮人：控制权之争', { timeout: 120000 }, () => {
  it('举牌：跨过 5% 就公告、当天不能再买；几周后的下一个交易日冷静期就过了', () => {
    const g = new Game(TAKEOVER, 'stake', 'raider', 'no-violation');
    g.tick();
    g.act({ type: 'order', req: { side: 'buy', qty: 100_000_000, type: 'market' } });
    for (let i = 0; i < 5; i++) g.tick();
    expect(stake(g, RAIDER)).toBeGreaterThanOrEqual(0.05);
    expect(g.player.freeze?.rule).toBe('stake-5');
    expect(g.intel.some((i) => i.id === 'stake-1')).toBe(true);
    const before = g.player.pos;
    g.act({ type: 'order', req: { side: 'buy', qty: 10_000_000, type: 'market' } });
    g.tick();
    expect(g.player.pos).toBe(before);
    // 卖出不受影响
    while (g.phase === 'trading') g.decision ? g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id }) : g.tick();
    g.act({ type: 'end-night' });
    expect(g.player.freeze).toBeUndefined();
  });

  it('30% 那条线：只能走要约；要约绕过订单簿，直接多拿 5%', () => {
    const g = new Game(TAKEOVER, 'tender', 'raider', 'no-violation');
    g.player.pos = Math.round(g.market.ex.acct(RAIDER).pos * 0 + 0.3 * 11_039_000_000);
    g.player.cash += 1e11;
    g.tick();
    expect(g.player.freeze?.rule).toBe('tender-30');
    while (g.phase === 'trading') g.tick();
    // 管理层一看到 30% 当晚就会停牌；这里假设它没停
    expect(g.flags.halted).toBe(true);
    delete g.flags.halted;
    const p0 = stake(g, RAIDER);
    card(g, 'tender');
    expect(stake(g, RAIDER)).toBeGreaterThan(p0 + 0.045);
    // 还在 30% 以上：再想在盘中买，仍然只能走要约
    expect(g.player.freeze?.rule).toBe('tender-30');
  });

  it('管理层停牌：剩下的交易日跳过，直接到会议室；复牌那天按停牌前的收盘价跌停开盘', () => {
    const g = new Game(TAKEOVER, 'halt', 'defender', 'no-violation');
    while (g.phase === 'trading') g.tick();
    card(g, 'halt');
    const pre = g.market.closePrices[g.market.closePrices.length - 1];
    g.act({ type: 'end-night' });
    expect(g.dayIndex).toBe(HALT0);
    expect(g.isHalted).toBe(true);
    // 停牌期间鼎华一股也买不了
    const r = stake(g, RAIDER);
    while (g.dayIndex < BATTLE_2015) g.act({ type: 'end-night' });
    expect(stake(g, RAIDER)).toBe(r);
    if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: 'silent' });
    g.tick();
    expect(g.market.last).toBeLessThanOrEqual(Math.round(pre * 0.9) + 30);
  });

  it('守方的一条路：先和华岳通气、请白衣骑士、停牌、举报资金来源——监管出手后鼎华不能投票，定增通过', () => {
    const g = play('defender', 'knight', {
      night: (g) => {
        if (g.dayIndex === 0) {
          talk(g, 'fu', 'consult');
          talk(g, 'lin', 'knight');
          talk(g, 'wu', 'seat');
        }
        if (g.dayIndex === 1) {
          card(g, 'huayue-add');
          g.act({ type: 'social', verb: 'report', npc: 'chang' });
        }
        if (g.dayIndex === 2) {
          talk(g, 'xu', 'story');
          card(g, 'halt');
        }
        card(g, 'placement');
      },
      decide: (id) => (id === 'resume-mgmt' ? 'welcome' : undefined),
    });
    expect(g.flags.crackdown).toBe(true);
    expect(g.flags.egmPass).toBeFalsy();
    expect(g.flags.placementPass).toBe(true);
    expect(stake(g, 'pengcheng')).toBeGreaterThan(stake(g, RAIDER));
    expect(['held', 'pyrrhic']).toContain(g.ending!.id);
  });

  it('攻方的一条路：不碰万能险、争取华岳和安泰，在临时股东大会上拿到过半数，入主万川', () => {
    const g = play('raider', 'control', {
      night: (g) => {
        card(g, 'offbook');
        card(g, 'egm');
        if (g.dayIndex === 0) {
          talk(g, 'fu', 'seats');
          talk(g, 'wu', 'deal');
          talk(g, 'zhong', 'listen');
        }
      },
      day: (g) => {
        if (g.dayIndex === 0 && g.market.t === 1) g.act({ type: 'credit', op: 'take', amount: 2e10 });
      },
      decide: (id) => (id === 'resume' ? 'topup' : undefined),
    });
    expect(g.heat).toBeLessThan(50);
    expect(g.flags.egmPass).toBe(true);
    expect(g.ending!.id).toBe('control');
  });

  it('在最高处加满杠杆、复牌时什么都不做：第二个跌停碰到资管计划的平仓线', () => {
    const g = play('raider', 'margin', {
      night: (g) => card(g, 'offbook'),
      day: (g) => {
        // 停牌前最后一天：借满资管计划的钱，用朋友的账户绕过冷静期，24 元附近全部买进
        if (g.dayIndex !== 4) return;
        if (g.market.t === 1) g.act({ type: 'credit', op: 'take', amount: 1e12 });
        if (g.player.freeze?.rule === 'stake-5') card(g, 'concert');
        const room = Math.floor(g.market.ex.equity(g.player) / (g.market.last / 100)) - g.player.pos;
        if (g.market.t % 5 === 2 && room > 1e6) g.act({ type: 'order', req: { side: 'buy', qty: Math.min(room, 60_000_000), type: 'market' } });
      },
    });
    expect(g.flags.otcLiquidated).toBeTruthy();
    expect(g.ending!.id).toBe('busted');
  });

  it('表决按持股算：鼎华被限制表决时，它的票不算', () => {
    const g = new Game(TAKEOVER, 'tally', 'defender', 'no-violation');
    const a = tally(g, 'egm');
    g.flags.crackdown = true;
    const b = tally(g, 'egm');
    expect(b.yes).toBeLessThan(a.yes);
  });

  it('可重放', () => {
    const g = play('raider', 'replay', { night: (g) => card(g, 'offbook') });
    const again = replay(TAKEOVER, 'replay', 'raider', 'no-violation', g.log);
    expect(again.stateHash()).toBe(g.stateHash());
    expect(again.ending!.id).toBe(g.ending!.id);
  });
});
