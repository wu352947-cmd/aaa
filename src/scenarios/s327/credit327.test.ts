import { describe, expect, it } from 'vitest';
import { Game } from '../../engine/game';
import { mi } from './common';
import { S327 } from './index';

/** 决战日消息传开后每分钟借满、买满，16:12 全部卖掉；repay 时在 16:24（违规时段里）把借款还掉 */
function greedy(seed: string, repay: boolean) {
  const g = new Game(S327, seed, 'retail', 'no-violation');
  let maxLoan = 0;
  for (let k = 0; k < 30000 && !g.ending; k++) {
    if (g.phase === 'night') {
      g.act({ type: 'end-night' });
      continue;
    }
    if (g.decision) {
      g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
      continue;
    }
    const t = g.market.t;
    const ex = g.market.ex;
    if (g.isBattleDay && t >= mi('9:59') && t < mi('16:10')) {
      g.act({ type: 'credit', op: 'take', amount: 1e12 });
      const room = Math.floor(g.equity() / (ex.contractValue(ex.last) * ex.deck.marginRate)) - g.player.pos;
      if (room > 0) g.act({ type: 'order', req: { side: 'buy', qty: room, type: 'market' } });
    }
    if (g.isBattleDay && t === mi('16:12') && g.player.pos > 0) g.act({ type: 'order', req: { side: 'sell', qty: g.player.pos, type: 'market' } });
    if (repay && g.isBattleDay && t === mi('16:24') && g.credit) g.act({ type: 'credit', op: 'repay', amount: g.credit.loan });
    maxLoan = Math.max(maxLoan, g.credit?.loan ?? 0);
    g.tick();
  }
  return { g, maxLoan, eq: g.ending!.stats[0][1] };
}

describe('营业部垫资', { timeout: 120000 }, () => {
  it('不会越赚越能借：借款按开盘前的本钱算，总共不超过 30 万元', () => {
    const { maxLoan } = greedy('snow', false);
    expect(maxLoan).toBeLessThanOrEqual(300_000);
  });

  it('违规时段里还掉借款，交易被撤销时借款也退回那一刻：钱不会凭空多出来', () => {
    expect(greedy('void', true).eq).toBe(greedy('void', false).eq);
  });
});
