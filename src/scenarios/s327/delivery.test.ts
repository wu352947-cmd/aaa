import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { BATTLE } from './data';
import { FLOAT, spot, spotPrice } from './delivery';
import { S327 } from './index';

/** 跑到第 day 晚（余波日直接就是夜晚），night 每晚调一次 */
function play(seat: string, seed: string, night: (g: Game) => void): Game {
  const g = new Game(S327, seed, seat, 'no-violation');
  const seen = new Set<number>();
  for (let guard = 0; guard < 20000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (!seen.has(g.dayIndex)) {
        seen.add(g.dayIndex);
        night(g);
      }
      if (!g.ending) g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}
const ret = (g: Game) => Number(g.ending!.stats.find(([k]) => k === '收益率')![1].replace('%', ''));

describe('92(3) 现券与实物交割', { timeout: 120000 }, () => {
  it('买现券：全额付现金，报价被推高，市值计入权益', () => {
    const g = new Game(S327, 'spot', 'long', 'no-violation');
    while (g.phase !== 'night') g.tick();
    const p0 = spotPrice(g);
    const eq = g.equity();
    g.act({ type: 'card', id: 'dlv-buy', target: '20000' });
    expect(spot(g).held).toBe(20_000);
    expect(spotPrice(g)).toBeGreaterThan(p0);
    // 权益只少了自己推高价格的那一点
    expect(Math.abs(g.equity() - eq)).toBeLessThan(eq * 0.01);
  });

  it('多头囤券再坚持交割：逼仓赚到溢价，但交易所干预、监管热度上去；协议平仓就没有这笔', () => {
    // 每晚囤 2 万口，三晚下来占流通量的四成
    const hoard = (g: Game) => {
      if (g.dayIndex < 3) g.act({ type: 'card', id: 'dlv-buy', target: '20000' });
    };
    const agree = play('long', 'sq', (g) => {
      hoard(g);
      if (g.dayIndex > BATTLE && !spot(g).choice) g.act({ type: 'card', id: 'dlv-agree' });
    });
    const deliver = play('long', 'sq', (g) => {
      hoard(g);
      if (g.dayIndex > BATTLE && !spot(g).choice) g.act({ type: 'card', id: 'dlv-deliver' });
    });
    expect(spot(deliver).held).toBe(60_000);
    expect(spot(deliver).held / FLOAT).toBeGreaterThan(0.3);
    expect(ret(deliver)).toBeGreaterThan(ret(agree));
    expect(deliver.heat).toBeGreaterThan(agree.heat);
    expect(deliver.ending!.body.join('')).toContain('交易所出面干预');
  });

  it('空头坚持交割却手里没券：高价求购，买不到的付违约金', () => {
    const noBonds = play('short', 'dl', (g) => {
      if (g.dayIndex > BATTLE && g.player.pos < 0 && !spot(g).choice) g.act({ type: 'card', id: 'dlv-deliver' });
    });
    const agree = play('short', 'dl', (g) => {
      if (g.dayIndex > BATTLE && g.player.pos < 0 && !spot(g).choice) g.act({ type: 'card', id: 'dlv-agree' });
    });
    if (noBonds.player.pos < 0) {
      expect(ret(noBonds)).toBeLessThan(ret(agree));
      expect(noBonds.ending!.body.join('')).toContain('交出');
    }
  });
});
