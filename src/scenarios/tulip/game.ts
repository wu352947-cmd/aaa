import { Rng } from '../../engine/rng';
import { APRIL_VALUE, EVENINGS, OPTION_FEE, TULIP_NPCS, WINE_MONEY, type Evening } from './data';

/**
 * 酒馆里的花：新手教程剧本的引擎。
 *
 * 没有订单簿和 K 线。每晚桌边坐着六个人，各自在石板上写一个买价或卖价；
 * 他们心里还有一个不说出口的底价。你可以直接接受，也可以还价——
 * 价格是人谈出来的。你买得多，下一晚大家心里的价就会被你抬高一点。
 * 同一种子 + 同一串操作必然得到同一局。
 */

export type TulipFaction = 'speculator' | 'grower' | 'council';
export type TulipRule = 'forward' | 'option' | 'void';

/** 桌边 NPC 之间签下的约定（行会议员要裁决的就是它们） */
export interface NpcDeal {
  evening: number;
  buyer: string;
  seller: string;
  price: number;
}
export type Side = 'buy' | 'sell';

export interface Quote {
  npc: string;
  /** NPC 的方向：buy = 他想买（你可以卖给他） */
  side: Side;
  price: number;
  /** 心里的底价，玩家看不到 */
  reservation: number;
  counters: number;
  done: boolean;
}

export interface Contract {
  id: number;
  evening: number;
  npc: string;
  /** 玩家的方向 */
  side: Side;
  price: number;
}

export type TalkKind = 'accept' | 'counter' | 'refuse' | 'deal' | 'absent';

export interface Talk {
  npc: string;
  kind: TalkKind;
  /** 这次对话里出现的价格（给台词层与校验器用） */
  prices: number[];
}

export type TulipAction = { type: 'accept'; npc: string } | { type: 'counter'; npc: string; price: number } | { type: 'leave' } | { type: 'rule'; rule: TulipRule };

export interface Settlement {
  rule: TulipRule;
  /** 每份合约在该规则下给玩家带来的现金流（正 = 收到） */
  lines: { contract: Contract; amount: number; note: string }[];
  /** 种植者剩下的球茎按四月价值计 */
  bulbsValue: number;
  total: number;
}

export class TulipGame {
  readonly rng: Rng;
  evening = 0;
  quotes: Quote[] = [];
  contracts: Contract[] = [];
  cash: number;
  /** 种植者花田里的球茎（份） */
  bulbs: number;
  /** 玩家买卖对共识价的累积推动（比例） */
  impact = 0;
  phase: 'table' | 'ruling' | 'ending' = 'table';
  /** 2 月 24 日实际采用的规则：历史上是改作期权；扮演行会议员时由玩家决定 */
  rule: TulipRule = 'option';
  npcBook: NpcDeal[] = [];
  log: TulipAction[] = [];
  /** 每晚实际成交价，用于“价格记事” */
  prints: number[][] = [];
  private nextId = 1;
  private netTonight = 0;

  constructor(
    readonly seed: string,
    readonly faction: TulipFaction,
  ) {
    this.rng = new Rng(`tulip:${seed}`);
    this.cash = faction === 'grower' ? 60 : faction === 'council' ? 0 : 100;
    this.bulbs = faction === 'grower' ? 6 : 0;
    this.openEvening();
  }

  get night(): Evening {
    return EVENINGS[this.evening];
  }

  /** 今晚的共识价：史料重建价 × 玩家的累积推动 */
  get price(): number {
    return Math.round(this.night.anchor * (1 + this.impact));
  }

  private openEvening(): void {
    const ev = this.night;
    const r = this.rng;
    const base = this.price;
    this.prints.push([]);
    this.netTonight = 0;
    this.quotes = TULIP_NPCS.map((n) => {
      let side: Side;
      if (ev.kind === 'crash') side = n.id === 'dirck' ? 'buy' : 'sell';
      else if (ev.kind === 'after') side = n.id === 'maritje' ? 'buy' : 'sell';
      else if (n.id === 'cornelis') side = 'sell';
      else if (n.id === 'jan') side = 'buy';
      else side = r.chance(0.5 + ev.mood * 0.6) ? 'buy' : 'sell';
      // 买家多的晚上，大家心里的价都偏高
      const skew = 1 + ev.mood * 0.12 + r.normal() * 0.07;
      let reservation = base * skew;
      if (ev.kind === 'crash') reservation = side === 'buy' ? base * 0.2 : base * (0.55 + r.next() * 0.3);
      if (ev.kind === 'after') reservation = side === 'buy' ? base * 0.75 : base * (0.9 + r.next() * 0.3);
      const spread = 0.08 + r.next() * 0.08;
      const price = side === 'buy' ? reservation * (1 - spread) : reservation * (1 + spread);
      return { npc: n.id, side, price: Math.max(1, Math.round(price)), reservation: Math.max(1, Math.round(reservation)), counters: 0, done: false };
    });
    // 桌边的人彼此之间也在成交：出价最高的买家配要价最低的卖家，谈得拢就签
    const buyers = this.quotes.filter((q) => q.side === 'buy').sort((a, b) => b.reservation - a.reservation);
    const sellers = this.quotes.filter((q) => q.side === 'sell').sort((a, b) => a.reservation - b.reservation);
    for (let i = 0; i < Math.min(buyers.length, sellers.length); i++) {
      if (buyers[i].reservation < sellers[i].reservation) break;
      this.npcBook.push({ evening: this.evening, buyer: buyers[i].npc, seller: sellers[i].npc, price: Math.round((buyers[i].reservation + sellers[i].reservation) / 2) });
    }
  }

  quote(npc: string): Quote | undefined {
    return this.quotes.find((q) => q.npc === npc);
  }

  act(a: TulipAction): Talk | null {
    if (a.type === 'rule') {
      if (this.phase !== 'ruling' || this.faction !== 'council') return null;
      this.log.push(a);
      this.rule = a.rule;
      return null;
    }
    if (this.phase !== 'table') return null;
    if (this.faction === 'council' && a.type !== 'leave') return null;
    this.log.push(a);
    if (a.type === 'leave') {
      this.leave();
      return null;
    }
    const q = this.quote(a.npc);
    if (!q || q.done) return { npc: a.npc, kind: 'absent', prices: [] };
    if (a.type === 'accept') return this.trade(q, q.price);

    const p = Math.round(a.price);
    const ok = q.side === 'sell' ? p >= q.reservation : p <= q.reservation;
    if (ok) return this.trade(q, p);
    if (q.counters >= 2) {
      q.done = true;
      return { npc: q.npc, kind: 'refuse', prices: [p, q.price] };
    }
    q.counters++;
    // 对方让一半，但不会越过心里的底价
    const mid = (q.price + p) / 2;
    q.price = Math.round(q.side === 'sell' ? Math.max(q.reservation, mid) : Math.min(q.reservation, mid));
    return { npc: q.npc, kind: 'counter', prices: [p, q.price] };
  }

  private trade(q: Quote, price: number): Talk {
    const side: Side = q.side === 'sell' ? 'buy' : 'sell';
    this.contracts.push({ id: this.nextId++, evening: this.evening, npc: q.npc, side, price });
    this.cash += side === 'buy' ? -WINE_MONEY : WINE_MONEY;
    this.netTonight += side === 'buy' ? 1 : -1;
    this.prints[this.evening].push(price);
    q.done = true;
    return { npc: q.npc, kind: 'deal', prices: [price] };
  }

  private leave(): void {
    // 你的净买卖会抬高或压低下一晚大家心里的价，影响逐晚减半
    this.impact = this.impact * 0.5 + 0.04 * this.netTonight;
    if (this.evening >= EVENINGS.length - 1) {
      this.phase = 'ruling';
      return;
    }
    this.evening++;
    if (this.night.kind !== 'normal') this.impact = 0; // 崩盘之后，你一个人的买卖已经无关紧要
    this.openEvening();
  }

  /** 合约按今晚的共识价算的纸面盈亏 */
  paper(c: Contract, price = this.price): number {
    return c.side === 'buy' ? price - c.price : c.price - price;
  }

  /** 合约总额 ÷ 现金：教学卡“合约比口袋大”的触发条件 */
  leverage(): number {
    const notional = this.contracts.reduce((a, c) => a + c.price, 0);
    return notional / Math.max(1, this.cash);
  }

  /**
   * 四月交货时的结算。
   * forward：原本的约定，买方付合约价、拿到只值四月价的球茎；卖方没有球茎就得按四月价买来交货。
   * option：行会裁决后，买方在球茎不值合约价时付 3.5% 走人，卖方只拿到这 3.5%。
   */
  settle(rule: TulipRule): Settlement {
    let bulbs = this.bulbs;
    const lines = this.contracts.map((c) => {
      if (rule === 'void') return { contract: c, amount: 0, note: '合约作废，各自走开' };
      const walk = rule === 'option' && APRIL_VALUE < c.price;
      if (c.side === 'buy') {
        if (walk) return { contract: c, amount: -c.price * OPTION_FEE, note: '付 3.5% 解约' };
        return { contract: c, amount: APRIL_VALUE - c.price, note: '付清合约价，收下球茎' };
      }
      if (walk) return { contract: c, amount: c.price * OPTION_FEE, note: '买方解约，只收到 3.5%' };
      if (bulbs > 0) {
        bulbs--;
        return { contract: c, amount: c.price, note: '收到合约价，交出自家球茎' };
      }
      return { contract: c, amount: c.price - APRIL_VALUE, note: '收到合约价，按四月价买来球茎交货' };
    });
    const bulbsValue = bulbs * APRIL_VALUE;
    const total = this.cash + bulbsValue + lines.reduce((a, l) => a + l.amount, 0);
    return { rule, lines: lines.map((l) => ({ ...l, amount: Math.round(l.amount * 100) / 100 })), bulbsValue, total: Math.round(total * 100) / 100 };
  }

  /**
   * 每个桌边 NPC 在某条规则下的结算净额（含与玩家签的约）。
   * 卖方按四月价值交出球茎；期权规则下球茎不值合约价时买方付 3.5% 走人。
   */
  npcOutcome(rule: TulipRule): Map<string, number> {
    const out = new Map<string, number>();
    const add = (id: string, v: number) => out.set(id, (out.get(id) ?? 0) + v);
    const deal = (buyer: string | null, seller: string | null, k: number) => {
      if (rule === 'void') return;
      const walk = rule === 'option' && APRIL_VALUE < k;
      const toBuyer = walk ? -k * OPTION_FEE : APRIL_VALUE - k;
      if (buyer) add(buyer, toBuyer);
      if (seller) add(seller, -toBuyer);
    };
    for (const d of this.npcBook) deal(d.buyer, d.seller, d.price);
    for (const c of this.contracts) deal(c.side === 'sell' ? c.npc : null, c.side === 'buy' ? c.npc : null, c.price);
    for (const [k, v] of out) out.set(k, Math.round(v));
    return out;
  }

  /** 开局身家：种植者的球茎按四月实际价值估 */
  get startWealth(): number {
    return this.faction === 'grower' ? 60 + 6 * APRIL_VALUE : this.faction === 'council' ? 0 : 100;
  }

  finish(): void {
    this.phase = 'ending';
  }
}

export function replayTulip(seed: string, faction: TulipFaction, log: TulipAction[]): TulipGame {
  const g = new TulipGame(seed, faction);
  for (const a of log) g.act(a);
  return g;
}
