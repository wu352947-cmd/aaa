import { describe, expect, it } from 'vitest';
import { Game, replay } from '../../engine/game';
import { mi, sd } from './common';
import { BATTLE } from './data';
import { S327 } from './index';
import { tipAt } from './room';

/** 一直玩到结局；遇到决策按 pick 选（返回 undefined 就选默认项） */
function play(seat: string, seed: string, pick: (g: Game, id: string) => string | undefined = () => undefined, onTick?: (g: Game) => void): Game {
  const g = new Game(S327, seed, seat, 'no-violation');
  for (let guard = 0; guard < 20000 && !g.ending; guard++) {
    if (g.phase === 'night') g.act({ type: 'end-night' });
    else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: pick(g, g.decision.id) ?? g.decision.choices[0].id });
    else {
      g.tick();
      onTick?.(g);
    }
  }
  return g;
}

describe('大户室：散户座位的决策点', { timeout: 120000 }, () => {
  it('一月和布局期每天都有一句话要赌；其它座位没有', () => {
    const seen: string[] = [];
    play('retail', 'room-1', (g, id) => (seen.push(`${sd(g)}:${id}`), undefined));
    // 一月十天（剧本日 −11 到 −2）和二月第 1—4 天，每天都有一句话
    for (let d = -11; d <= -2; d++) expect(seen).toContain(`${d}:room-tip`);
    for (let d = 1; d < BATTLE; d++) expect(seen).toContain(`${d}:room-tip`);
    expect(seen).toContain(`${BATTLE}:room-news`);
    const other: string[] = [];
    play('short', 'room-1', (_g, id) => (other.push(id), undefined));
    expect(other.filter((x) => x.startsWith('room-'))).toEqual([]);
  });

  it('说对了，价格就往那边走；说错了，往反方向走', () => {
    let hits = 0;
    let n = 0;
    for (const seed of ['t1', 't2', 't3', 't4', 't5']) {
      const at: Record<number, number> = {};
      const g = play('retail', seed, undefined, (g) => {
        const d = sd(g);
        const f = g.flags[`tip-${d}`] as string | undefined;
        if (!f || g.isBattleDay) return;
        if (at[d] == null) at[d] = g.market.last;
        // 跟风盘涌完时比价格
        if (g.market.t === mi(tipAt(d)!) + 36) {
          const [dir, truth] = f.split(':');
          const up = (dir === 'up') === (truth === '1');
          const move = g.market.last - at[d];
          n++;
          if (up ? move > 0 : move < 0) hits++;
        }
      });
      expect(g.ending).toBeTruthy();
    }
    // 五个种子 × 十四个有消息的布局日（一月十天、二月四天）
    expect(n).toBe(70);
    // 历史路径自己也在走，不要求每次都对；但跟风盘应当占上风
    expect(hits / n).toBeGreaterThanOrEqual(0.75);
  });

  it('跟对了赚钱：只跟真话的人比一口不动的人赚得多', () => {
    const truthful = (g: Game) => (g.flags[`tip-${sd(g)}`] as string).endsWith(':1');
    const oracle = play('retail', 'room-2', (g, id) => (id === 'room-tip' ? (truthful(g) ? 'follow' : 'fade') : undefined), (g) => {
      // 三十分钟后平掉
      const d = sd(g);
      if (!g.isBattleDay && g.flags[`tip-${d}`] && g.market.t === mi(tipAt(d)!) + 38 && g.player.pos)
        g.act({ type: 'order', req: { side: g.player.pos > 0 ? 'sell' : 'buy', qty: Math.abs(g.player.pos), type: 'market' } });
    });
    const r = (g: Game) => Number(g.ending!.stats.find(([k]) => k === '收益率')![1].replace('%', ''));
    expect(r(oracle)).toBeGreaterThan(5);
  });

  it('16:15 申江真要砸时一定有人报信；信了就躲过砸盘；可重放', () => {
    for (const seed of ['e1', 'e2', 'e3']) {
      let asked = false;
      const g = play('retail', seed, (g, id) => {
        if (id === 'room-news') return 'chase';
        if (id === 'room-eight') {
          asked = true;
          return g.player.pos ? 'exit' : 'hold';
        }
      });
      const dumped = !!g.flags.npcDump;
      if (dumped) expect(asked).toBe(true);
      if (asked && dumped) expect(g.ending!.body.join('')).toContain('16:16 那通电话');
      const again = replay(S327, seed, 'retail', 'no-violation', g.log);
      expect(again.stateHash()).toBe(g.stateHash());
    }
  });

  it('结局标题跟着自己的战果走', () => {
    const g = play('retail', 'room-3', (g, id) => (id === 'room-news' ? 'chase' : id === 'room-eight' && g.player.pos ? 'exit' : id === 'buy-dip' ? 'buy' : undefined));
    const r = Number(g.ending!.stats.find(([k]) => k === '收益率')![1].replace('%', ''));
    if (r >= 10) expect(g.ending!.headline).toContain('赢家');
  });
});

