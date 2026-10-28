import { describe, expect, it } from 'vitest';
import { Game, type Scenario } from '../engine/game';
import { GME } from '../scenarios/gme';
import { S327 } from '../scenarios/s327';
import { biography, chapter1, chapter2, choose, currentTurn, newCareer, recordChapter, TURN_COUNT, type Career } from './career';

const SC: Record<string, Scenario> = { s327: S327, gme2021: GME };

/** 按默认选项打完一章 */
function playChapter(c: Career, ch: { scenario: string; seat: string; opts: object }): Game {
  const g = new Game(SC[ch.scenario], c.seed, ch.seat, c.principle, ch.opts);
  for (let guard = 0; guard < 30000 && !g.ending; guard++) {
    if (g.phase === 'night') g.act({ type: 'end-night' });
    else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  return g;
}
/** 那些年里按 pick 选（默认第一个） */
function live(c: Career, pick: (id: string) => string | undefined = () => undefined): Career {
  let t = currentTurn(c);
  while (t) {
    c = choose(c, pick(t.id) ?? t.choices[0].id);
    t = currentTurn(c);
  }
  return c;
}

describe('生涯：从 1995 年的大户室到 2021 年', { timeout: 120000 }, () => {
  it('一段干净的人生：两章剧本加那些年，身家、声望一路带下去，最后是头版', () => {
    let c = newCareer('life', 'no-violation', 'standard');
    expect(c.step).toBe('ch1');
    c = recordChapter(c, playChapter(c, chapter1()));
    expect(c.step).toBe('interlude');
    c = live(c, (id) => ({ '1996': 'broker', '1999': 'half', '2001': 'cut', '2007': 'trim', '2008': 'stop', '2013': 'retail', '2015': 'cut', '2020': 'buy' })[id]);
    expect(c.events).toHaveLength(TURN_COUNT);
    expect(c.step).toBe('ch2');
    expect(c.path).toBe('retail');
    const ch = chapter2(c);
    const g = playChapter(c, ch);
    // 带进 2021 年的钱：开局那 50 股照旧，其余是现金
    expect(g.player.cash).toBe(Math.max(5000, Math.round(c.wealth / 6.5) - 900));
    expect(g.reputation).toBeGreaterThanOrEqual(0);
    c = recordChapter(c, g);
    expect(c.step).toBe('done');
    const b = biography(c);
    expect(b.kind).toBe('front');
    expect(c.dirty).toEqual([]);
    expect(b.paragraphs[0]).toContain('1995 年');
    expect(b.curve[0].wealth).toBe(80_000);
    expect(b.curve[b.curve.length - 1].year).toBe('2021');
  });

  it('同一个种子、同样的选择，就是同一段人生', () => {
    const a = live(recordChapter(newCareer('same', 'no-violation', 'standard'), playChapter(newCareer('same', 'no-violation', 'standard'), chapter1())));
    const b = live(recordChapter(newCareer('same', 'no-violation', 'standard'), playChapter(newCareer('same', 'no-violation', 'standard'), chapter1())));
    expect(a.wealth).toBe(b.wealth);
    expect(a.events.map((e) => e.note)).toEqual(b.events.map((e) => e.note));
  });

  it('坐庄、转移、配资：旧账在 2015 年被翻出来，档案带进 2021 年', () => {
    let c = newCareer('dirty', 'no-violation', 'standard');
    c = recordChapter(c, playChapter(c, chapter1()));
    c = live(c, (id) => {
      if (id === '2015') {
        // 档案够厚，2015 年那一关变成了稽查约谈
        expect(currentTurn(c)?.title ?? '').toBeTruthy();
      }
      return ({ '1996': 'south', '1999': 'pump', '2001': 'hide', '2007': 'lever', '2008': 'hold', '2013': 'short', '2015': 'fix', '2020': 'wait' })[id];
    });
    expect(c.events.find((e) => e.id === '2015')!.title).toBe('查场外配资，也查旧账');
    expect(c.dirty.map((d) => d.year)).toEqual(['1996', '1999', '2001', '2015']);
    expect(c.lines).toBeGreaterThanOrEqual(3); // 跟庄、转移、找关系
    // 配资硬扛 2008：被强平
    expect(c.events.find((e) => e.id === '2008')!.note).toContain('强平');
    const ch = chapter2(c);
    expect(ch.seat).toBe('short');
    expect(ch.opts.heat).toBeGreaterThan(0);
    const g = new Game(GME, c.seed, ch.seat, c.principle, ch.opts);
    expect(g.heat).toBe(ch.opts.heat);
    c = recordChapter(c, playChapter(c, ch));
    const b = biography(c);
    expect(['蛀虫', '流星', '出局者']).toContain(b.archetype);
    expect(b.paragraphs.join('')).toContain('所有交易都留痕');
  });

  it('第一章输光了：家里凑两万，从头来过', () => {
    let c = newCareer('broke', 'no-violation', 'standard');
    const g = playChapter(c, chapter1());
    // 模拟一个输光的结局
    g.ending = { ...g.ending!, stats: [['收益率', '-100.0%']] };
    c = recordChapter(c, g);
    expect(c.wealth).toBe(20_000);
    expect(c.events[0].id).toBe('restart');
    expect(currentTurn(c)!.year).toBe('1996');
  });
});
