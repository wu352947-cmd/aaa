import { describe, expect, it } from 'vitest';
import { Game, replay } from '../engine/game';
import { S327 } from '../scenarios/s327';
import { canUndo, tutorialLayer, undoDay } from './tutorial';

function newGame(seat: string, difficulty: string): Game {
  const g = new Game(S327, 'tutor', seat, 'no-violation');
  g.difficulty = difficulty;
  return g;
}
/** 推进 n 分钟；遇到决策选默认项 */
function run(g: Game, n: number) {
  for (let i = 0; i < n; i++) {
    if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    g.tick();
  }
}
function nextDay(g: Game) {
  while (g.phase === 'trading') {
    if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
    else g.tick();
  }
  g.act({ type: 'end-night' });
}

describe('新手教学：界面逐层解锁', () => {
  it('标准档和监管座位一开始就是全部界面', () => {
    expect(tutorialLayer(newGame('retail', 'standard'))).toBe(5);
    expect(tutorialLayer(newGame('official', 'novice'))).toBe(5);
  });

  it('完成小目标就解锁下一层', () => {
    const g = newGame('retail', 'novice');
    expect(tutorialLayer(g)).toBe(1);
    run(g, 5);
    g.act({ type: 'order', req: { side: 'buy', qty: 5, type: 'market' } });
    expect(tutorialLayer(g)).toBe(2);
    nextDay(g);
    expect(tutorialLayer(g)).toBe(3);
    g.act({ type: 'order', req: { side: 'buy', qty: 5, type: 'limit', price: g.market.last - 50 } });
    expect(tutorialLayer(g)).toBe(4);
    g.act({ type: 'credit', op: 'take', amount: 10_000 });
    expect(tutorialLayer(g)).toBe(5);
  });

  it('不去做目标也会按天解锁，决战日全部打开', () => {
    const g = newGame('retail', 'novice');
    nextDay(g);
    expect(tutorialLayer(g)).toBe(2);
    nextDay(g);
    nextDay(g);
    expect(tutorialLayer(g)).toBe(4);
    while (!g.isBattleDay) nextDay(g);
    expect(tutorialLayer(g)).toBe(5);
  });
});

describe('新手档撤回一天', () => {
  it('回到今天开盘：今天的动作撤销，局面与重放到开盘一模一样，只能撤一次', () => {
    const g = newGame('retail', 'novice');
    nextDay(g);
    nextDay(g);
    run(g, 30);
    g.act({ type: 'order', req: { side: 'buy', qty: 20, type: 'market' } });
    run(g, 30);
    expect(g.player.pos).toBe(20);
    expect(canUndo(g)).toBe(true);
    const back = undoDay(g);
    expect(back.dayIndex).toBe(2);
    expect(back.t).toBe(0);
    expect(back.player.pos).toBe(0);
    expect(back.difficulty).toBe('novice');
    expect(back.undos).toBe(1);
    expect(canUndo(back)).toBe(false);
    const fresh = replay(S327, 'tutor', 'retail', 'no-violation', g.log.filter((l) => l.at < back.globalTick), back.globalTick);
    expect(back.stateHash()).toBe(fresh.stateHash());
  });

  it('其它难度不能撤回', () => {
    expect(canUndo(newGame('retail', 'standard'))).toBe(false);
    expect(canUndo(newGame('retail', 'iron'))).toBe(false);
  });
});
