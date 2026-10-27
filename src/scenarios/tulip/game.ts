import type { CardDef, CardResult, Clock, Directive } from '../../engine/game';
import { Rng } from '../../engine/rng';
import { APRIL_VALUE, COUNCIL, EVENINGS, MEANS, OPTION_FEE, TULIP_NPCS, WINE_MONEY, type Councillor, type Evening } from './data';
import { breakTulipDirective, tulipClocks, tulipConvert, tulipDeck, tulipDirectives, tulipDirectivesOpen, tulipDirectivesVote, tulipDraftPlay, tulipOfferable } from './plans';

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
  /** 议员有没有听说这一笔（登记之后全都知道） */
  heard?: boolean;
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

export type TulipAction =
  | { type: 'accept'; npc: string }
  | { type: 'counter'; npc: string; price: number }
  | { type: 'leave' }
  | { type: 'rule'; rule: TulipRule }
  | { type: 'card'; id: string; target?: string }
  | { type: 'convert'; id: string }
  | { type: 'draft'; id: string | null };

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
  /** 放风带来的下一晚额外推动 */
  boost = 0;

  // ── 行会议员 ──
  /** 每晚的影响力：做一件事花 1–2 点，不留到明天 */
  influence = 0;
  /** 告示、定金、税让价格降温的累积比例 */
  cool = 0;
  registered = false;
  deposit = false;
  tax = false;
  relief = false;
  /** 城里的税款（盾） */
  treasury = 0;
  assembled = false;
  /** 收过哪一边的礼 */
  gifts: ('grower' | 'speculator')[] = [];
  /** 游说：议员 → 规则 → 加分 */
  lobby: Record<string, Partial<Record<TulipRule, number>>> = {};
  /** 你提交表决的规则；rule 是大会实际通过的 */
  proposal: TulipRule | null = null;
  votes: Record<string, TulipRule> = {};
  /** 酒馆老板透露过的底价：npc → 底价 */
  revealed: Record<string, number> = {};
  cardLog: { evening: number; id: string; result: CardResult }[] = [];
  /** 登门拜访过几位议员 */
  lobbyVisits = 0;
  /** 市政官的交代 */
  dirs: Directive[] = [];
  /** 摸清了谁的盘算 */
  know = new Set<string>();
  /** 赊来的钱：四月结账时还 */
  debt = 0;
  // ── 每晚选卡 ──
  hand: string[] = [];
  offer: string[] | null = null;
  drafted: string[] = [];
  readonly maxHand = 3;
  private readonly rngDraft: Rng;

  constructor(
    readonly seed: string,
    readonly faction: TulipFaction,
  ) {
    this.rng = new Rng(`tulip:${seed}`);
    this.rngDraft = new Rng(`tulip:${seed}:draft`);
    this.cash = faction === 'grower' ? 60 : faction === 'council' ? 20 : 100;
    this.bulbs = faction === 'grower' ? 6 : 0;
    this.openEvening();
  }

  get night(): Evening {
    return EVENINGS[this.evening];
  }

  /** 今晚的共识价：史料重建价 × 玩家的累积推动 */
  get price(): number {
    return Math.round(this.night.anchor * (1 + this.impact) * (1 - this.cool));
  }

  private openEvening(): void {
    const ev = this.night;
    const r = this.rng;
    const base = this.price;
    this.prints.push([]);
    this.netTonight = 0;
    this.revealed = {};
    this.influence = this.faction === 'council' ? 2 : 0;
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
      const price = Math.round((buyers[i].reservation + sellers[i].reservation) / 2);
      let heard: boolean | undefined;
      if (this.faction === 'council') {
        // 要登记的约，有人宁可不签；要付一成定金的，付不起的人签不了
        if (this.registered && r.chance(0.2)) continue;
        if (this.deposit && r.chance(0.5)) continue;
        heard = this.registered || r.chance(0.6);
        if (this.tax) this.treasury += price * 0.02;
      }
      this.npcBook.push({ evening: this.evening, buyer: buyers[i].npc, seller: sellers[i].npc, price, heard });
    }
    tulipDirectivesOpen(this);
    this.dealOffer();
  }

  private dealOffer(): void {
    this.offer = null;
    const pool = tulipDeck(this).filter((c) => !this.drafted.includes(c.id) && tulipOfferable(this, c));
    const out: string[] = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(this.rngDraft.next() * pool.length), 1)[0].id);
    if (out.length) this.offer = out;
  }

  handCards(): CardDef[] {
    const deck = tulipDeck(this);
    return this.hand
      .map((id) => deck.find((c) => c.id === id))
      .filter((c): c is CardDef => !!c)
      .map((c) => ({ ...c, blocked: c.foe ? '对手的牌：只能换算' : c.blocked }));
  }

  offerCards(): CardDef[] {
    const deck = tulipDeck(this);
    return (this.offer ?? []).map((id) => deck.find((c) => c.id === id)).filter((c): c is CardDef => !!c);
  }

  clocks(): Clock[] {
    return tulipClocks(this);
  }

  directives(): Directive[] {
    return tulipDirectives(this);
  }

  addContract(npc: string, side: Side, price: number): void {
    this.contracts.push({ id: this.nextId++, evening: this.evening, npc, side, price });
  }

  lobbyAdd(id: string, rule: TulipRule, n: number) {
    const l = (this.lobby[id] ??= {});
    l[rule] = (l[rule] ?? 0) + n;
  }

  quote(npc: string): Quote | undefined {
    return this.quotes.find((q) => q.npc === npc);
  }

  act(a: TulipAction): Talk | null {
    if (a.type === 'rule') {
      if (this.phase !== 'ruling' || this.faction !== 'council') return null;
      this.log.push(a);
      this.vote(a.rule);
      return null;
    }
    if (a.type === 'card') {
      const c = this.cards().find((x) => x.id === a.id);
      if (!c || c.blocked || (c.targets && !c.targets.some((t) => t.id === a.target))) return null;
      this.log.push(a);
      const result = a.id.startsWith('x-') ? tulipDraftPlay(this, a.id, a.target) : this.playCard(a.id, a.target);
      this.hand = this.hand.filter((x) => x !== a.id);
      this.cardLog.push({ evening: this.evening, id: a.id, result });
      return null;
    }
    if (a.type === 'convert') {
      if (!this.hand.includes(a.id) || this.phase === 'ending') return null;
      this.log.push(a);
      const result = tulipConvert(this, a.id);
      this.hand = this.hand.filter((x) => x !== a.id);
      this.cardLog.push({ evening: this.evening, id: a.id, result });
      return null;
    }
    if (a.type === 'draft') {
      if (!this.offer || (a.id && (!this.offer.includes(a.id) || this.hand.length >= this.maxHand))) return null;
      this.log.push(a);
      if (a.id) {
        this.hand.push(a.id);
        this.drafted.push(a.id);
      }
      this.offer = null;
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
    this.impact = this.impact * 0.5 + 0.04 * this.netTonight + this.boost;
    this.boost = 0;
    if (this.evening >= EVENINGS.length - 1) {
      this.phase = 'ruling';
      this.offer = null;
      // 表决前还有一天可以奔走
      if (this.faction === 'council') this.influence = 2;
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
    // 赊来的钱四月结账时还掉
    const total = this.cash - this.debt + bulbsValue + lines.reduce((a, l) => a + l.amount, 0);
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

  // ───────────── 手段 ─────────────

  cards(): CardDef[] {
    if (this.phase !== 'table' && !(this.phase === 'ruling' && this.faction === 'council')) return [];
    return [...this.handCards(), ...(this.faction === 'council' ? this.councilCards() : this.traderCards())];
  }

  private traderCards(): CardDef[] {
    const used = (id: string) => this.cardLog.some((x) => x.evening === this.evening && x.id === id);
    const open = this.quotes.filter((q) => !q.done && this.revealed[q.npc] == null);
    return [
      {
        id: 'ask-host',
        name: '请老板透个底',
        group: '打听',
        color: 'white',
        does: '赫里特在桌边转了一晚上，谁心里的底价是多少，他大概有数。',
        cost: '2 盾酒钱。',
        when: 'any',
        targets: open.map((q) => ({ id: q.npc, label: TULIP_NPCS.find((n) => n.id === q.npc)!.name })),
        blocked: this.cash < 2 ? '口袋里不够 2 盾' : open.length === 0 ? '桌上没有可打听的人了' : undefined,
      },
      {
        id: 'rumor',
        name: '放风：阿姆斯特丹来了大买家',
        group: '放风',
        color: 'grey',
        does: '请几轮酒，让这句话在酒馆里传开。下一晚大家心里的价会高一截。',
        cost: '3 盾酒钱；假消息迟早会被戳穿。',
        when: 'any',
        blocked: this.night.kind !== 'normal' ? '这时候没人信了' : used('rumor') ? '今晚已经放过' : this.cash < 3 ? '口袋里不够 3 盾' : undefined,
      },
    ];
  }

  private councilCards(): CardDef[] {
    const inf = this.influence;
    const need = (n: number) => (inf < n ? `今晚的影响力不够（需 ${n} 点）` : undefined);
    const ruling = this.phase === 'ruling';
    const late = this.night.kind !== 'normal';
    const cs = COUNCIL.map((c) => ({ id: c.id, label: `${c.name}（${c.title}）` }));
    const out: CardDef[] = [];
    if (!ruling) {
      out.push(
        {
          id: 'notice',
          name: '张贴告示：警惕风中交易',
          group: '酒馆规矩',
          color: 'white',
          does: '以行会名义提醒：没有球茎的买卖，风险自负。之后每晚的价会低一截。',
          cost: '1 点影响力；花农不高兴。',
          when: 'any',
          blocked: late ? '已经来不及了' : need(1),
        },
        {
          id: 'register',
          name: '约定须到行会登记',
          group: '酒馆规矩',
          color: 'white',
          does: '之后每一份约都要登记：你能看到全部约定。有人宁可不签。',
          cost: '1 点影响力。',
          when: 'any',
          status: this.registered ? '已实行' : undefined,
          blocked: this.registered ? '已经实行' : late ? '已经来不及了' : need(1),
        },
        {
          id: 'deposit',
          name: '签约须付一成定金',
          group: '酒馆规矩',
          color: 'white',
          does: '付不起定金的人签不了约：约定少一半，价也降温。',
          cost: '2 点影响力；投机客和花农都不高兴。',
          when: 'any',
          status: this.deposit ? '已实行' : undefined,
          blocked: this.deposit ? '已经实行' : late ? '已经来不及了' : need(2),
        },
        {
          id: 'tax',
          name: '每份约收 2% 印花钱',
          group: '酒馆规矩',
          color: 'white',
          does: '钱进城里的钱箱。崩盘之后，可以拿它救济倾家荡产的人。',
          cost: '1 点影响力。',
          when: 'any',
          status: this.tax ? `钱箱 ${Math.round(this.treasury)} 盾` : undefined,
          blocked: this.tax ? '已经实行' : late ? '已经来不及了' : need(1),
        },
        {
          id: 'assembly',
          name: '召集花商集会',
          group: '议会',
          color: 'white',
          does: '把桌边的人叫到行会，问清楚每个人签了多少、欠了多少。',
          cost: '1 点影响力。',
          when: 'any',
          blocked: this.assembled ? '已经召集过' : need(1),
        },
        {
          id: 'relief',
          name: '拿钱箱设救济金',
          group: '善后',
          color: 'white',
          does: '崩盘之后，用印花钱替倾家荡产的人还一部分债。',
          cost: '1 点影响力。',
          when: 'any',
          status: this.relief ? '已设立' : undefined,
          blocked: this.relief ? '已经设立' : !this.tax ? '钱箱是空的（先收印花钱）' : !late ? '崩盘之前用不上' : need(1),
        },
      );
    }
    for (const r of ['forward', 'option', 'void'] as TulipRule[]) {
      out.push({
        id: `lobby-${r}`,
        name: `游说：${RULE_NAME[r]}`,
        group: '议会',
        color: 'white',
        does: `登门拜访一位议员，劝他在二月底投“${RULE_NAME[r]}”。`,
        cost: ruling ? '表决前最后一次机会：1 点影响力。' : '1 点影响力。',
        when: 'any',
        targets: cs,
        blocked: need(1),
      });
    }
    if (!ruling) {
      out.push(
        {
          id: 'gift-grower',
          name: '收下花农的礼',
          group: '人情',
          color: 'black',
          does: '范·德·梅尔送来一箱好酒和 30 盾：花农那一派会更信你——前提是你替他们说话。',
          cost: '收了不替他们投，他们会翻脸；被人知道，你就完了。',
          when: 'any',
          blocked: this.gifts.includes('grower') ? '已经收过' : undefined,
        },
        {
          id: 'gift-spec',
          name: '收下酒商的礼',
          group: '人情',
          color: 'black',
          does: '布洛克替酒馆的熟客们送来 30 盾：他们要的是“付一点钱就能走开”。',
          cost: '收了不替他们投，他们会翻脸；被人知道，你就完了。',
          when: 'any',
          blocked: this.gifts.includes('speculator') ? '已经收过' : undefined,
        },
      );
    }
    return out;
  }

  private playCard(id: string, target?: string): CardResult {
    const R = (title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok: true, title, effects, reply });
    const name = (npc: string) => TULIP_NPCS.find((n) => n.id === npc)?.name ?? npc;
    switch (id) {
      case 'ask-host': {
        this.cash -= 2;
        const q = this.quote(target!)!;
        if (q.npc === 'cornelis') this.know.add('cornelis');
        // 老板只知道个大概：误差一成以内
        const guess = Math.round(q.reservation * (0.95 + this.rng.next() * 0.1));
        this.revealed[q.npc] = guess;
        return R(`${name(q.npc)}心里的价，大约 ${guess} 盾`, ['付 2 盾'], { who: '赫里特', text: `${name(q.npc)}啊……${q.side === 'buy' ? '再高' : '再低'}他就不干了，大概 ${guess} 盾上下。` });
      }
      case 'rumor':
        this.cash -= 3;
        this.boost = 0.08;
        return R('风放出去了', ['付 3 盾酒钱', '下一晚大家心里的价 +8%']);
    }
    this.influence -= id === 'deposit' ? 2 : id.startsWith('gift') ? 0 : 1;
    switch (id) {
      case 'notice':
        breakTulipDirective(this, 'hands-off', '贴了告示');
        this.cool += this.cool > 0 ? 0.04 : 0.08;
        return R('告示贴在了酒馆门口', ['之后每晚的价低一截', '影响力 −1'], { who: '范·德·梅尔', text: '你这是砸大家的饭碗。' });
      case 'register':
        this.registered = true;
        return R('从今晚起，约定要到行会登记', ['你能看到之后的全部约定', '影响力 −1']);
      case 'deposit':
        breakTulipDirective(this, 'hands-off', '收了定金');
        this.deposit = true;
        this.cool += 0.1;
        return R('签约须付一成定金', ['约定会少一半', '价降温', '影响力 −2'], { who: '布洛克', text: '一成定金？那还有几个人签得起！' });
      case 'tax':
        this.tax = true;
        return R('每份约收 2% 印花钱', ['钱进城里的钱箱', '影响力 −1']);
      case 'assembly':
        this.assembled = true;
        return R('花商们被叫到了行会', ['你知道了每个人欠下多少', '影响力 −1']);
      case 'relief':
        this.relief = true;
        return R(`救济金设立：钱箱里有 ${Math.round(this.treasury)} 盾`, ['倾家荡产的人能少欠一些', '影响力 −1']);
      case 'gift-grower':
      case 'gift-spec': {
        const side = id === 'gift-grower' ? 'grower' : 'speculator';
        this.gifts.push(side);
        this.cash += 30;
        return R('礼收下了', ['口袋里 +30 盾', side === 'grower' ? '花农一派会更信你' : '酒商一派会更信你'], {
          who: side === 'grower' ? '范·德·梅尔' : '布洛克',
          text: side === 'grower' ? '议员先生，二月底的会上，花农们就指望你了。' : '议员先生，酒馆里的老客人都记着你的好。',
        });
      }
    }
    if (id.startsWith('lobby-')) {
      const rule = id.slice(6) as TulipRule;
      const c = COUNCIL.find((x) => x.id === target)!;
      // 劝人违背自己的利益更难
      const add = c.pref[rule] < 0 ? 1 : 2;
      this.lobbyAdd(c.id, rule, add);
      this.lobbyVisits++;
      const now = this.voteOf(c, this.proposal ?? rule);
      return R(`拜访了${c.name}`, [`他对“${RULE_NAME[rule]}”的倾向 +${add}`, `他现在倾向：${RULE_NAME[now]}`, '影响力 −1'], { who: c.name, text: c.stance });
    }
    return R('没有效果', []);
  }


  // ───────────── 表决 ─────────────

  /** 在某条规则下倾家荡产的桌边人（亏损超过家底） */
  ruined(rule: TulipRule): string[] {
    const o = this.npcOutcome(rule);
    return TULIP_NPCS.filter((n) => (o.get(n.id) ?? 0) + this.reliefFor(rule, n.id) < -MEANS[n.id]).map((n) => n.id);
  }

  /** 救济金按亏损从大到小分给倾家荡产的人 */
  reliefFor(rule: TulipRule, npc: string): number {
    if (!this.relief || this.treasury <= 0) return 0;
    const o = this.npcOutcome(rule);
    let left = this.treasury;
    const deep = TULIP_NPCS.map((n) => ({ id: n.id, gap: -(o.get(n.id) ?? 0) - MEANS[n.id] })).filter((x) => x.gap > 0).sort((a, b) => a.gap - b.gap);
    for (const d of deep) {
      const give = Math.min(left, d.gap + 1);
      left -= give;
      if (d.id === npc) return give;
    }
    return 0;
  }

  /** 一位议员会投哪条规则；proposal 是你提交的那条（收过礼的一派会更信你） */
  voteOf(c: Councillor, proposal: TulipRule): TulipRule {
    const score: Record<TulipRule, number> = { ...c.pref };
    for (const [r, v] of Object.entries(this.lobby[c.id] ?? {})) score[r as TulipRule] += v ?? 0;
    if (c.id === 'witt') for (const r of ['forward', 'option', 'void'] as TulipRule[]) score[r] -= 0.8 * this.ruined(r).length;
    if (c.side && this.gifts.includes(c.side)) score[proposal] += 1;
    return (['option', 'forward', 'void'] as TulipRule[]).reduce((best, r) => (score[r] > score[best] ? r : best), 'option');
  }

  /** 预计票数：你的一票投给 proposal */
  tally(proposal: TulipRule): { votes: Record<string, TulipRule>; count: Record<TulipRule, number>; winner: TulipRule } {
    const votes: Record<string, TulipRule> = { you: proposal };
    for (const c of COUNCIL) votes[c.id] = this.voteOf(c, proposal);
    const count: Record<TulipRule, number> = { forward: 0, option: 0, void: 0 };
    for (const v of Object.values(votes)) count[v]++;
    const top = Math.max(...Object.values(count));
    const tied = (Object.keys(count) as TulipRule[]).filter((r) => count[r] === top);
    // 平票时市政官拍板
    const winner = tied.length === 1 ? tied[0] : tied.includes(votes.witt) ? votes.witt : tied.includes('option') ? 'option' : tied[0];
    return { votes, count, winner };
  }

  private vote(proposal: TulipRule): void {
    const t = this.tally(proposal);
    this.proposal = proposal;
    this.votes = t.votes;
    this.rule = t.winner;
    tulipDirectivesVote(this);
  }

  /** 议员的结局：威望与廉洁 */
  councilVerdict(): { standing: number; exposed: boolean; betrayed: ('grower' | 'speculator')[]; lines: string[] } {
    const lines: string[] = [];
    let standing = 50;
    const ruined = this.ruined(this.rule).length;
    if (this.proposal === this.rule) {
      standing += 10;
      lines.push('大会通过了你提交的规则。');
    } else if (this.proposal) {
      standing -= 5;
      lines.push(`你提交的是“${RULE_NAME[this.proposal]}”，大会通过的却是“${RULE_NAME[this.rule]}”。`);
    }
    standing -= 5 * ruined;
    if (this.registered) standing += 5;
    const met = this.dirs.filter((x) => x.status === 'met').length;
    const failed = this.dirs.filter((x) => x.status === 'failed').length;
    standing += 3 * met - 3 * failed;
    if (this.dirs.length) lines.push(`市政官交代的 ${this.dirs.length} 件事，你办到了 ${met} 件。`);
    if (this.relief) {
      standing += 5;
      lines.push(`钱箱里的 ${Math.round(this.treasury)} 盾救济了倾家荡产的人。`);
    }
    const wants: Record<'grower' | 'speculator', TulipRule> = { grower: 'forward', speculator: 'option' };
    const betrayed = this.gifts.filter((s) => wants[s] !== this.proposal);
    for (const s of betrayed) {
      standing -= 15;
      lines.push(s === 'grower' ? '你收了花农的礼，却没替他们说话。范·德·梅尔逢人便讲。' : '你收了酒商的礼，却没替他们说话。布洛克在酒馆里骂了你一晚上。');
    }
    // 收礼迟早会被人知道：种子决定是哪一种结局
    const exposed = this.gifts.length > 0 && new Rng(`tulip:${this.seed}:gift`).chance(0.4 + 0.2 * betrayed.length);
    if (exposed) {
      standing -= 25;
      lines.push('收礼的事传开了。小册子上印着你的名字。');
    }
    return { standing: Math.max(0, Math.min(100, standing)), exposed, betrayed, lines };
  }
}

export const RULE_NAME: Record<TulipRule, string> = { forward: '照约履行', option: '改作期权', void: '一律作废' };

export function replayTulip(seed: string, faction: TulipFaction, log: TulipAction[]): TulipGame {
  const g = new TulipGame(seed, faction);
  for (const a of log) g.act(a);
  return g;
}
