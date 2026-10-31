import type { CardDef, CardResult, Game } from '../../engine/game';
import { spot, spotPrice } from './delivery';

/**
 * 国债回购：拿手里的 92(3) 现券做抵押，向市场借现金。
 *
 * 1995 年的回购市场已经很大。它比场外配资便宜得多（日息万分之三点五，
 * 配资是万分之六），但期限只有七个交易日：到期要么还钱，要么券被卖掉。
 *
 * 这条腿让「做多基差」真正做起来：现券全额付款，本来很吃现金；
 * 押出去换成钱，同一笔钱能建更大的期现组合——这就是杠杆，而且是有抵押的杠杆。
 */

/** 现券市值最多押八成，留两成垫头 */
const HAIRCUT = 0.8;
/** 日息万分之三点五 */
const RATE = 0.00035;
/** 期限：七个交易日 */
const TERM = 7;

interface Repo {
  /** 借来的钱 */
  loan: number;
  /** 到期日（绝对日序） */
  due: number;
  /** 累计付掉的利息 */
  paid: number;
}

const STATE = new WeakMap<Game, Repo>();
export function repo(g: Game): Repo {
  let r = STATE.get(g);
  if (!r) STATE.set(g, (r = { loan: 0, due: 0, paid: 0 }));
  return r;
}

/** 现券市值 */
const spotMarket = (g: Game) => spot(g).held * spotPrice(g) * 2;

/** 还能借多少 */
export function repoLimit(g: Game): number {
  return Math.max(0, Math.round(spotMarket(g) * HAIRCUT - repo(g).loan));
}

/** 还欠多少天到期 */
export function repoDaysLeft(g: Game): number {
  const r = repo(g);
  return r.loan > 0 ? r.due - g.dayIndex : 0;
}

const wan = (x: number) => (x >= 1e8 ? `${(x / 1e8).toFixed(2)} 亿` : `${Math.round(x / 1e4).toLocaleString()} 万`);

export function repoCards(g: Game): CardDef[] {
  const r = repo(g);
  const lim = repoLimit(g);
  const steps = [lim * 0.25, lim * 0.5, lim].filter((x) => x >= 10_000).map((x) => Math.round(x / 10_000) * 10_000);
  const uniq = [...new Set(steps)];
  const out: CardDef[] = [
    {
      id: 'repo-take',
      name: '做回购：押现券借钱',
      group: '资金',
      color: 'white',
      does: `把手里的 92(3) 现券押出去，按市值的八成借现金。日息万分之三点五，七个交易日后到期。押着的券还在你名下，市值照算，只是到期得还钱。`,
      cost: r.loan > 0 ? `已借 ${wan(r.loan)}，${repoDaysLeft(g)} 个交易日后到期` : '到期还不上，券会被卖掉抵债。',
      when: 'any',
      targets: uniq.map((x) => ({ id: String(x), label: `借 ${wan(x)}` })),
      status: r.loan > 0 ? `已借 ${wan(r.loan)}` : undefined,
      blocked: !spot(g).held ? '手里没有现券可以押' : !uniq.length ? '可借的额度不够' : undefined,
    },
  ];
  if (r.loan > 0) {
    out.push({
      id: 'repo-repay',
      name: '还回购',
      group: '资金',
      color: 'white',
      does: `把 ${wan(r.loan)} 还上，现券的抵押解除。`,
      cost: '现金不够就还不了。',
      when: 'any',
      blocked: g.player.cash < r.loan ? `现金只有 ${wan(g.player.cash)}` : undefined,
    });
  }
  return out;
}

export function repoPlay(g: Game, id: string, target?: string): CardResult {
  const R = (title: string, effects: string[]): CardResult => ({ ok: true, title, effects });
  const r = repo(g);
  switch (id) {
    case 'repo-take': {
      const want = Number(target) || 0;
      const amt = Math.min(want, repoLimit(g));
      if (amt < 10_000) return R('借不到', ['可借的额度不够']);
      const first = r.loan === 0;
      r.loan += amt;
      if (first) r.due = g.dayIndex + TERM;
      g.player.cash += amt;
      return R(`回购借入 ${wan(amt)}`, [
        `日息万分之三点五，${TERM} 个交易日后到期`,
        `押着的现券市值 ${wan(spotMarket(g))}，还能再借 ${wan(repoLimit(g))}`,
      ]);
    }
    case 'repo-repay': {
      if (!r.loan) return R('没有欠款', []);
      if (g.player.cash < r.loan) return R('现金不够', [`要还 ${wan(r.loan)}，账上只有 ${wan(g.player.cash)}`]);
      g.player.cash -= r.loan;
      const done = r.loan;
      r.loan = 0;
      r.due = 0;
      return R('回购还清', [`还了 ${wan(done)}，抵押解除`]);
    }
  }
  return R('没有效果', []);
}

/** 每晚：计息；到期不还就卖券抵债 */
export function repoNight(g: Game): void {
  const r = repo(g);
  if (!r.loan) return;
  const fee = r.loan * RATE;
  g.player.cash -= fee;
  r.paid += fee;
  if (g.dayIndex < r.due) return;
  // 到期：先拿现金还，不够就卖现券
  if (g.player.cash >= r.loan) {
    g.player.cash -= r.loan;
    g.push({ kind: 'intel', text: `回购到期，还了 ${wan(r.loan)}` });
    r.loan = 0;
    r.due = 0;
    return;
  }
  const s = spot(g);
  const need = r.loan - Math.max(0, g.player.cash);
  const qty = Math.min(s.held, Math.ceil(need / (spotPrice(g) * 2)));
  if (qty > 0) {
    const got = qty * spotPrice(g) * 2;
    s.held -= qty;
    g.player.cash += got;
    g.push({ kind: 'intel', text: `回购到期还不上，卖掉 ${qty} 口现券抵债，收回 ${wan(got)}` });
  }
  const short = Math.max(0, r.loan - Math.max(0, g.player.cash));
  if (short > 0) {
    g.addHeat(10, '回购违约');
    g.push({ kind: 'liquidation', rule: 'forced-liquidation', text: `回购到期还差 ${wan(short)}，违约记一笔` });
  }
  g.player.cash = Math.max(0, g.player.cash - r.loan);
  r.loan = 0;
  r.due = 0;
}
