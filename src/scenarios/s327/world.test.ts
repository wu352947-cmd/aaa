import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { minuteIndex as mi } from '../../engine/market';
import { LONG, sd, st } from './common';
import { BATTLE, PRE } from './data';
import { S327 } from './index';
import { lobbyMof, mofDecide } from './world';

type P = { night?: (g: Game) => void; day?: (g: Game) => void };
/** 从一月打到结局；记下决战前夜中财的仓位 */
function run(seat: string, seed: string, p: P = {}) {
  const g = new Game(S327, seed, seat, 'no-violation');
  const seen = new Set<number>();
  let eveLong = 0;
  for (let i = 0; i < 40000 && !g.ending; i++) {
    if (g.phase === 'night') {
      if (!seen.has(g.dayIndex)) {
        seen.add(g.dayIndex);
        p.night?.(g);
        if (sd(g) === BATTLE - 1 && g.market.ex.accounts.has(LONG)) eveLong = g.market.ex.acct(LONG).pos;
      }
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else {
      p.day?.(g);
      g.tick();
    }
  }
  return { g, eveLong, hi: Math.max(...g.market.bars.map((b) => b.h)), c1621: g.market.bars[mi('16:21')].c };
}
const card = (g: Game, id: string) => {
  if (!g.canPlay(id)) g.act({ type: 'card', id });
};

describe('这一局的世界：不照搬历史', { timeout: 300000 }, () => {
  it('没人搅局时大致还原历史：足额贴息、辽北倒戈、151 元以上的高点、尾盘砸盘、交易无效', () => {
    for (const seed of ['w1', 'w2', 'w3']) {
      const { g, hi, c1621 } = run('retail', seed);
      expect(st(g).world.verdict).toBe('full');
      expect(g.flags.gaoActed).toBe(true);
      expect(hi).toBeGreaterThan(15150);
      expect(hi).toBeLessThan(15280);
      expect(Math.abs(c1621 - 15130)).toBeLessThan(40);
      expect(g.flags.npcDump).toBe(true);
      expect(g.flags.voided).toBe(true);
    }
  });

  it('空方每晚托人给财政部递材料：贴息打了折，消息一出价格往下走；中财在部里有人，提前少吸了筹；空方不必砸盘', () => {
    const base = run('short', 'w1');
    const { g, eveLong, hi } = run('short', 'w1', { night: (x) => card(x, 'mof-against') });
    expect(st(g).world.verdict).toBe('partial');
    expect(hi).toBeLessThan(14900);
    expect(eveLong).toBeLessThan(base.eveLong - 200_000);
    expect(g.flags.voided).toBeFalsy();
    expect(g.equity()).toBeGreaterThan(base.g.equity());
    expect(st(g).world.factors!.some((f) => f.label === '申江托人递材料')).toBe(true);
  });

  it('不贴息（中财关联被查出 + 交易所反映过热 + 空方游说）：价格跌向 137 元；中财先知道，抢着出货也照样亏钱；辽北不倒戈，申江不必砸盘', () => {
    const g = new Game(S327, 'none', 'retail', 'no-violation', { startDay: PRE });
    st(g).evidence.add('wei');
    lobbyMof(g, '交易所反映市场过热', -0.12);
    for (let i = 0; i < 4; i++) lobbyMof(g, '申江托人递材料', -0.12);
    mofDecide(g);
    expect(st(g).world.verdict).toBe('none');
    const zc0 = g.market.ex.equity(g.market.ex.acct(LONG));
    const zcPos0 = g.market.ex.acct(LONG).pos;
    for (let i = 0; i < 20000 && !g.ending; i++) {
      if (g.phase === 'night') g.act({ type: 'end-night' });
      else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
      else g.tick();
    }
    expect(g.market.closePrices[BATTLE]).toBeLessThan(14000);
    expect(g.market.ex.acct(LONG).pos).toBeLessThan(zcPos0 * 0.3);
    expect(g.market.ex.equity(g.market.ex.acct(LONG))).toBeLessThan(zc0 * 0.9);
    expect(g.flags.npcDump).toBeFalsy();
    expect(g.flags.gaoActed).toBeFalsy();
  });

  it('同一路人反复去游说，效果越来越小，最多挪动 0.2', () => {
    const g = new Game(S327, 'cap', 'short', 'no-violation', { startDay: PRE });
    const effs = Array.from({ length: 10 }, () => lobbyMof(g, 'x', -0.12));
    expect(effs[1]).toBeGreaterThan(effs[0]);
    expect(effs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(-0.2 - 1e-9);
    mofDecide(g);
    expect(lobbyMof(g, 'x', -0.12)).toBe(0);
  });

  it('多方游说只会更稳；被查出关联之后再去跑，反而坏事', () => {
    const g = new Game(S327, 'yes', 'long', 'no-violation', { startDay: PRE });
    while (g.phase === 'trading') g.tick();
    card(g, 'mof-for');
    expect(st(g).world.push['中财加紧游说']).toBeGreaterThan(0);
    st(g).evidence.add('wei');
    g.act({ type: 'end-night' });
    while ((g.phase as string) === 'trading') g.tick();
    card(g, 'mof-for');
    expect(st(g).world.push['中财加紧游说']).toBeLessThan(0.1);
  });

  it('游说过的一局可以原样重放', () => {
    const { g } = run('short', 'w2', { night: (x) => card(x, 'mof-against') });
    const r = replay(S327, 'w2', 'short', 'no-violation', g.log);
    expect(r.stateHash()).toBe(g.stateHash());
    expect(st(r).world.verdict).toBe(st(g).world.verdict);
  });
});
