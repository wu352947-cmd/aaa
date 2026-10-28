import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { sd, st } from './common';
import { PRE } from './data';
import { weiFloor } from './deals';
import { S327 } from './index';
import { lobbyMof } from './world';

/** 从第二章开始，打到剧本日 d 的夜里 */
function nightOf(seat: string, d: number, seed = 'deal'): Game {
  const g = new Game(S327, seed, seat, 'no-violation', { startDay: PRE });
  for (let i = 0; i < 20000; i++) {
    if (g.phase === 'night') {
      if (sd(g) === d) return g;
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}

describe('多轮谈判', { timeout: 120000 }, () => {
  it('申江找中财协议平仓：出价太低被还价，抬到他的底价就成交；空单真的少了', () => {
    const g = nightOf('short', 3);
    g.act({ type: 'card', id: 'mediate-req' });
    const n = g.negotiations[0];
    expect(n.status).toBe('open');
    const floor = weiFloor(g, 800_000);
    expect(floor).toBeGreaterThan(50);
    g.act({ type: 'negotiate', id: n.id, offer: { qty: 800_000, prem: 0 } });
    expect(n.status).toBe('open');
    expect(n.ask!.prem).toBeGreaterThanOrEqual(floor);
    const pos = g.player.pos;
    g.act({ type: 'negotiate', id: n.id, offer: { qty: 800_000, prem: n.ask!.prem } });
    expect(n.status).toBe('deal');
    expect(g.player.pos).toBe(pos + 800_000);
    expect(g.flags.mediated).toBe(true);
  });

  it('魏国梁的要价看他心里的账：部里风向对他不利时，他几乎不要溢价', () => {
    const g = nightOf('short', 3);
    const high = weiFloor(g, 800_000);
    for (let i = 0; i < 6; i++) lobbyMof(g, `x${i}`, -0.2);
    expect(weiFloor(g, 800_000)).toBeLessThan(high / 3);
  });

  it('出价太难看，第二轮以后他会直接走人，关系变差；天亮了没谈完的也作废', () => {
    const g = nightOf('short', 3);
    g.act({ type: 'card', id: 'mediate-req' });
    const n = g.negotiations[0];
    const rel = g.npc('wei')!.relation;
    for (let i = 0; i < 3 && n.status === 'open'; i++) g.act({ type: 'negotiate', id: n.id, offer: { qty: 1_200_000, prem: 0 } });
    expect(n.status).toBe('walked');
    expect(g.npc('wei')!.relation).toBeLessThan(rel);
    const h = nightOf('short', 2);
    h.act({ type: 'card', id: 'mediate-req' });
    h.act({ type: 'end-night' });
    expect(h.negotiations[0].status).toBe('walked');
  });

  it('多方给辽北递好处费：给得越多他越坚决；谈判可以重放', () => {
    const g = nightOf('long', 2, 'fee');
    g.act({ type: 'card', id: 'tip-gao' });
    const n = g.negotiations[0];
    g.act({ type: 'negotiate', id: n.id, offer: { fee: 120_000_000 } });
    expect(n.status).toBe('deal');
    expect(g.flags.gaoBribed).toBe(true);
    expect(st(g).used.has('tip-gao')).toBe(true);
    const r = replay(S327, 'fee', 'long', 'no-violation', g.log, Infinity, { startDay: PRE });
    expect(r.negotiations[0].status).toBe('deal');
    expect(r.flags.gaoFee).toBe(120_000_000);
  });
});
