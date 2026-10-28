import type { Game } from '../../engine/game';
import type { Actor, Market } from '../../engine/market';
import { NYSE } from './data';

/**
 * 这一局的世界：不照搬历史。
 *
 * - 灰狼资本按自己亏了多少决定回补多快、要不要接受注资（不再是“26 日下午开始、27 日开盘平完”的剧本）。
 * - 价格里“空头回补推上去”的那一截，跟着灰狼这一局实际回补了多少走：回补得比历史少，逼空就没那么猛；回补得早，价格也涨得早。
 * - 清算所的押金按这一局决战前夜的价格和波动重新计算；电脑扮演的券商看缺口决定照常开放、限购还是只许卖出。
 *
 * 没有人搅局时大致还原历史。
 */

const mi = NYSE.index;
export const GW = 'greywolf';
export const GW_POS = 10_000_000;
/** 灰狼开局的权益（美元）：亏损比例按它算 */
const GW_EQ0 = 4_000_000_000 - GW_POS * 40;

/** 历史上灰狼到某个时刻已经回补了多少股：26 日 14:00 起约 300 万股，27 日开盘半小时内平完 */
export function histCovered(d: number, t: number): number {
  if (d < 2 || (d === 2 && t < mi('14:00'))) return 0;
  if (d === 2) return Math.min(3_000_000, (t - mi('14:00')) * 100_000);
  if (d === 3 && t < mi('10:00')) return 3_000_000 + Math.min(7_000_000, t * 250_000);
  return GW_POS;
}

/** 灰狼这一局的亏损比例：还开着的空单在 price 上的浮亏 ÷ 开局权益（注资不算，那是别人的钱） */
export function gwPain(g: Game, price = g.market.last): number {
  const open = Math.max(0, -g.market.ex.acct(GW).pos);
  return (open * (price - 4000)) / 100 / GW_EQ0;
}

/** 回补的门槛：按风控委员会看的“这一阵子的价格”算，亏 22% 开始回补，亏到一半全部平掉 */
export const PAIN_FROM = 0.22;
export const PAIN_ALL = 0.5;

/** 灰狼（电脑扮演时）：按疼的程度回补；罗文反着读报，报纸越喊逼空他越扛 */
export function greywolfActor(g: Game): Actor {
  let peak = 0;
  let ema = 0;
  return {
    id: GW,
    onTick(m: Market) {
      const a = m.ex.acct(GW);
      // 风控看的是一阵子的价格，不是一分钟的尖刺
      ema = ema ? ema + (m.last - ema) / 90 : m.last;
      if (a.pos >= 0) return [];
      const covered = GW_POS + a.pos;
      // 按整笔 1000 万股算疼不疼：已经平掉的那部分，亏损也是真金白银
      const whole = (p: number) => (GW_POS * (p - 4000)) / 100 / GW_EQ0;
      const spot = whole(m.last);
      // 跳空到那个地步，就顾不上平均价了
      const pain = spot > 0.6 ? spot : whole(ema);
      const f = Math.max(0, Math.min(1, (pain - PAIN_FROM) / (PAIN_ALL - PAIN_FROM)));
      // 疼过的不会忘：价格回落时它也不会重新加空
      peak = Math.max(peak, Math.round(GW_POS * f));
      const need = peak - covered;
      if (need <= 0) return [];
      const pace = Math.max(0.4, 1 + 0.6 * (g.npc('rowan')?.view ?? 0));
      const cap = (spot > 0.6 ? 250_000 : 100_000) * pace;
      return [{ owner: GW, side: 'buy', qty: Math.round(Math.min(need, cap)), type: 'market' }];
    },
  };
}

/** 逼空的那一截：灰狼回补得比历史少（或多）多少，价格中枢就低（或高）多少——每 100 万股约 1.5%（逼空主要是散户和期权对冲推起来的，灰狼只是其中一截） */
export function squeezeShift(g: Game): void {
  const m = g.market;
  const covered = GW_POS + Math.min(0, m.ex.acct(GW).pos);
  const gap = covered - histCovered(g.dayIndex, m.t);
  const k = Math.max(-0.15, Math.min(0.15, 0.015 * (gap / 1_000_000)));
  m.shift = Math.round(m.base() * k);
}

/** 25 日晚：灰狼要不要接受注资——只有亏得够疼才接 */
export function gwNeedsBailout(g: Game): boolean {
  return gwPain(g) >= 0.07;
}

/** 清算所的押金：按决战前夜的收盘价和这几天的波动重算（历史上是 37 亿美元） */
export function nsccBase(g: Game): number {
  const closes = g.market.closePrices;
  const eve = closes[closes.length - 1] ?? 34751;
  const prev = closes[closes.length - 2] ?? 14798;
  const swing = Math.abs(Math.log(eve / prev)) / Math.log(34751 / 14798);
  return Math.round(3_700_000_000 * Math.pow(eve / 34751, 0.8) * Math.pow(Math.max(0.2, swing), 0.3));
}

/** 电脑扮演的券商在凌晨的决定：缺口够小就照常开放或限购，缺太多只能只许卖出 */
export function npcBrokerChoice(req: number): 'open' | 'cap' | 'restrict' {
  // 羽毛证券账上 7 亿美元，连夜还能借到 10 亿
  const gap = req - 1_700_000_000;
  if (gap <= 0) return 'open';
  if (gap <= 1_500_000_000) return 'cap';
  return 'restrict';
}
