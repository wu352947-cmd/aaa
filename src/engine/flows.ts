import type { Game } from './game';
import { CROWD } from './market';
import type { OrderReq } from './types';

/**
 * 散户群体的额外单向资金：谣言、对倒、喊单引来的跟风盘。
 * 记在 flags 里（字符串），保证存档重放时完全一致；每分钟执行一部分。
 */
export function addCrowdFlow(g: Game, side: 'buy' | 'sell', total: number, minutes: number): void {
  const flows = (g.flags.crowdFlows as string | undefined) ?? '';
  g.flags.crowdFlows = `${flows}${flows ? ';' : ''}${side},${Math.round(total / minutes)},${minutes}`;
}

export function crowdFlowOrders(g: Game): OrderReq[] {
  const raw = g.flags.crowdFlows as string | undefined;
  if (!raw) return [];
  const out: OrderReq[] = [];
  const left: string[] = [];
  for (const f of raw.split(';')) {
    const [side, per, n] = f.split(',');
    out.push({ owner: CROWD, side: side as 'buy' | 'sell', qty: Number(per), type: 'market' });
    if (Number(n) > 1) left.push(`${side},${per},${Number(n) - 1}`);
  }
  g.flags.crowdFlows = left.join(';');
  return out;
}
