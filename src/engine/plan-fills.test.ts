import { describe, expect, it } from 'vitest';
import { S327 } from '../scenarios/s327';
import { Game } from './game';

describe('计划单按成交回填，不再空转', () => {
  it('被保证金挡下的计划不会被扣成“执行完毕”', () => {
    const g = new Game(S327, 'plan-blocked', 'retail', 'no-violation');
    for (let i = 0; i < 5; i++) g.tick();
    const pos = g.player.pos;
    g.act({ type: 'plan-add', plan: { label: '买不起的巨单', cond: 'now', price: 0, side: 'buy', qty: 4_000_000, spread: 3 } });
    const id = g.plans[0].id;
    for (let i = 0; i < 4; i++) g.tick();
    const p = g.plans.find((x) => x.id === id)!;
    expect(g.player.pos).toBe(pos); // 一口都没成交
    expect(p.done).toBe(true); // 停下了，而不是一直重试
    expect(p.remaining).toBe(4_000_000); // 剩余量没被扣掉
    expect(g.events.some((e) => e.text.includes('被规则挡下'))).toBe(true);
  });

  it('能成交的计划：成交多少扣多少，走完就结束', () => {
    const g = new Game(S327, 'plan-ok', 'retail', 'no-violation');
    for (let i = 0; i < 5; i++) g.tick();
    const pos = g.player.pos;
    g.act({ type: 'plan-add', plan: { label: '小单', cond: 'now', price: 0, side: 'buy', qty: 100, spread: 2 } });
    const id = g.plans[0].id;
    for (let i = 0; i < 6; i++) g.tick();
    const p = g.plans.find((x) => x.id === id)!;
    expect(g.player.pos - pos).toBeGreaterThan(0);
    expect(p.done).toBe(true);
    expect(p.remaining).toBe(0);
  });
});

