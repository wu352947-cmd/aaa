import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { ALLY, HIDE, LONG, SHORT } from './common';
import { S327 } from './index';

/** 打到第 n 个夜晚 */
function toNight(seat: string, n: number): Game {
  const g = new Game(S327, 'seats', seat, 'no-violation');
  let nights = 0;
  for (let i = 0; i < 20000; i++) {
    if (g.phase === 'night') {
      if (++nights === n) return g;
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}
const RIGHT = { [SHORT]: SHORT, [LONG]: LONG, [ALLY]: ALLY, [HIDE]: HIDE, backer: SHORT };

describe('夜里的推理：认席位', { timeout: 120000 }, () => {
  it('第二个晚上起可以推；交一次卷花 1 点精力，只告诉你对了几个', () => {
    expect(S327.puzzle!(toNight('retail', 1))).toBeNull();
    const g = toNight('retail', 3);
    const pz = S327.puzzle!(g)!;
    expect(pz.questions.map((q) => q.id)).toEqual([SHORT, LONG, ALLY, HIDE, 'backer']);
    expect(pz.evidence.rows.length).toBe(3);
    const e = g.energy;
    g.act({ type: 'puzzle', id: 'seats', answers: { ...RIGHT, [SHORT]: LONG, [LONG]: SHORT } });
    expect(g.energy).toBe(e - 1);
    expect(g.puzzleTries.seats[0]).toMatchObject({ right: 3, total: 5, solved: false });
    expect(g.flags.seatsKnown).toBeFalsy();
  });

  it('全对：逐笔里显示公司名；看穿 305 的人拿到申江借壳超仓的证据', () => {
    const g = toNight('retail', 3);
    g.act({ type: 'puzzle', id: 'seats', answers: RIGHT });
    expect(g.flags.seatsKnown).toBe(true);
    expect(g.intel.some((i) => i.id === 'ev-split')).toBe(true);
    expect(S327.puzzle!(g)!.solved).toBe(true);
    // 解开以后再交卷不花精力
    const e = g.energy;
    g.act({ type: 'puzzle', id: 'seats', answers: RIGHT });
    expect(g.energy).toBe(e);
  });

  it('多方座位不用猜自己；推出 305 之后，举报申江借壳超仓的牌就能打了', () => {
    const g = toNight('long', 3);
    const pz = S327.puzzle!(g)!;
    expect(pz.questions.some((q) => q.id === LONG)).toBe(false);
    expect(g.canPlay('report-split')).toBeTruthy();
    const { [LONG]: _, ...rest } = RIGHT;
    void _;
    g.act({ type: 'puzzle', id: 'seats', answers: rest });
    expect(g.canPlay('report-split')).toBeFalsy();
  });

  it('监管座位和申江座位没有这道题；交卷可以重放', () => {
    expect(S327.puzzle!(toNight('official', 3))).toBeNull();
    expect(S327.puzzle!(toNight('short', 3))).toBeNull();
    const g = toNight('retail', 3);
    g.act({ type: 'puzzle', id: 'seats', answers: RIGHT });
    const r = replay(S327, 'seats', 'retail', 'no-violation', g.log);
    expect(r.flags.seatsKnown).toBe(true);
    expect(r.puzzleTries.seats).toEqual(g.puzzleTries.seats);
    expect(r.intel.some((i) => i.id === 'ev-split')).toBe(true);
  });
});
