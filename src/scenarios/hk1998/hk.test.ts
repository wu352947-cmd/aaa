import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { HK1998 } from './index';
import { FACTIONS_HK, LOCALS } from './data';
import { hibor, pressure, setPressure, SQUEEZE_AT } from './peg';

/** 跑完一整局：决策一律选第一个选项 */
function play(seat: string, seed = 'hk'): Game {
  const g = new Game(HK1998, seed, seat, 'profit');
  for (let i = 0; i < 60000 && !g.ending; i++) {
    if (g.phase === 'night') g.act({ type: 'end-night' });
    else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}

describe('港元保卫战', { timeout: 120_000 }, () => {
  it('三个座位都能开局，跑到结算日', () => {
    for (const f of FACTIONS_HK) {
      const g = play(f.id, `seed-${f.id}`);
      expect(g.ending, `${f.id} 没有结局`).not.toBeNull();
      expect(g.ending!.stats.length).toBeGreaterThan(3);
    }
  });

  it('恒指期货收在结算价附近：历史上是 7,829 点', () => {
    const g = play('fund');
    expect(Math.abs(g.market.last - 782_900)).toBeLessThan(60_000);
  });

  it('压力越高拆息越高，压力一放拆息就下来', () => {
    const g = new Game(HK1998, 'rate', 'fund', 'profit');
    g.tick();
    const low = hibor(g);
    setPressure(g, 90);
    const high = hibor(g);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(SQUEEZE_AT);
    setPressure(g, 5);
    expect(hibor(g)).toBeLessThan(low);
  });

  it('拆息高的时候杠杆盘被强平：本地多头的仓位往下掉', () => {
    const g = new Game(HK1998, 'squeeze', 'fund', 'profit');
    setPressure(g, 95);
    const before = g.market.ex.accounts.get(LOCALS)!.pos;
    expect(before).toBeGreaterThan(0);
    for (let i = 0; i < 60 && g.phase === 'trading'; i++) g.tick();
    expect(g.market.ex.accounts.get(LOCALS)!.pos).toBeLessThan(before);
  });

  it('炒家砸港元：压力上去，拆息跟着上去', () => {
    const g = new Game(HK1998, 'attack', 'fund', 'profit');
    g.tick();
    const p0 = pressure(g);
    const h0 = hibor(g);
    g.act({ type: 'card', id: 'hk-attack' });
    expect(pressure(g)).toBeGreaterThan(p0);
    expect(hibor(g)).toBeGreaterThan(h0);
  });

  it('金管局加息：压力下来，但拆息更高', () => {
    const g = new Game(HK1998, 'hike', 'hkma', 'protect');
    g.tick();
    const p0 = pressure(g);
    const h0 = hibor(g);
    g.act({ type: 'card', id: 'hk-hike' });
    expect(pressure(g)).toBeLessThan(p0);
    expect(hibor(g)).toBeGreaterThan(h0);
  });

  it('同一种子重放，结局一样', () => {
    const a = play('tycoon', 'rep');
    const b = play('tycoon', 'rep');
    expect(a.ending!.id).toBe(b.ending!.id);
    expect(a.market.last).toBe(b.market.last);
  });
});
