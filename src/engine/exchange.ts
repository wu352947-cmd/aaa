import { OrderBook } from './book';
import type { DayStats, Fen, OrderReq, RestingOrder, RuleHit, Side, SubmitResult, Trade } from './types';

/**
 * 规则卡组：一个市场在某个年代的交易规则。
 * 规则只在这里（撮合层）执行一次，界面层只读取 RuleHit 并展示规则卡。
 */
export interface RuleDeck {
  id: string;
  /** 每 1 元价格变动、每手（口）合约的盈亏，单位元 */
  multiplier: number;
  /** 交易所最低保证金比例 */
  marginRate: number;
  /** 单一会员持仓限额（口） */
  positionLimit: number;
  /** 涨跌停幅度，null 表示没有涨跌停 */
  priceLimit: number | null;
  /** 市价单最多吃到偏离最新价多少比例（防止扫空整本订单簿） */
  marketProtect: number;
  /** 期货式逐日盯市：收盘把浮动盈亏结转进现金、持仓均价重置为结算价 */
  markToMarket?: boolean;
  /** 下单界面是否提供“超额透支”选项（当年的系统拦不住违规下单） */
  overdraw?: boolean;
  /** 涨跌幅区间暂停：window 分钟内偏离超过 band 即暂停 pause 分钟 */
  luld?: { band: number; window: number; pause: number };
  /** 佣金与规费（按成交额的比例，双边各收） */
  feeRate?: number;
  /** 维持保证金比例：收盘权益低于它才追保（不设则等于 marginRate） */
  maintRate?: number;
  /** 融资年利率：股票账户里超出自有资金的那部分持仓按它计息（不设表示不计息） */
  loanRate?: number;
}

/** 数量与货币单位（只影响文字） */
export const UNITS = { qty: '口', cur: '元' };
export function setUnits(u: { qty: string; cur: string }): void {
  UNITS.qty = u.qty;
  UNITS.cur = u.cur;
}

export interface Account {
  id: string;
  name: string;
  /** 席位号，大单会以席位号出现在逐笔成交里 */
  seat: string;
  group: string;
  cash: number;
  pos: number;
  /** 持仓均价（分，可带小数） */
  avg: number;
  /** 免检账户：做市商与散户群体智能体不受保证金与限额约束 */
  exempt: boolean;
  violations: number;
  /** 券商限制：只允许平仓 */
  closeOnly?: boolean;
  /** 剧本规定的暂停加仓（例如举牌后的冷静期）：只许减仓，挡下时用这里的规则与说明 */
  freeze?: { rule: string; detail: string };
  /** 可借券上限（股）：卖空超过它会被挡下；不设表示不限 */
  borrowLimit?: number;
  /** 本账户的持仓限额（借壳分仓、监管限仓时与卡组不同）；不设表示按卡组 */
  limit?: number;
  /** 账户里其他资产的市值（例如买入的期权），计入权益 */
  extra?: number;
}

export function newAccount(p: Partial<Account> & Pick<Account, 'id' | 'name' | 'group'>): Account {
  return { seat: '', cash: 0, pos: 0, avg: 0, exempt: false, violations: 0, ...p };
}

export class Exchange {
  readonly book = new OrderBook();
  readonly accounts = new Map<string, Account>();
  trades: Trade[] = [];
  /** 每个群体对盘口中间价的累计推动（分），供收盘复盘拆解“谁把价格推到了这里” */
  contributions = new Map<string, number>();
  last: Fen;
  open = false;
  /** 涨跌停基准价（前收盘） */
  refClose: Fen;
  tick = 0;
  /** 当日第几分钟（由市场每分钟写入，用来按分钟记交易痕迹） */
  minute = 0;
  /** 多大的挂单算“大单”：由市场按当日成交量设定 */
  bigOrder = Infinity;
  /** 每个账户当天的交易痕迹（开盘清零） */
  dayStats = new Map<string, DayStats>();

  constructor(
    public deck: RuleDeck,
    startPrice: Fen,
  ) {
    this.last = startPrice;
    this.refClose = startPrice;
  }

  add(a: Account): Account {
    this.accounts.set(a.id, a);
    return a;
  }

  acct(id: string): Account {
    const a = this.accounts.get(id);
    if (!a) throw new Error(`unknown account ${id}`);
    return a;
  }

  /** 每口合约在价格 p 下的合约价值（元） */
  contractValue(p: Fen): number {
    return (p / 100) * this.deck.multiplier;
  }

  unrealized(a: Account, p: Fen = this.last): number {
    return ((p - a.avg) / 100) * this.deck.multiplier * a.pos;
  }

  equity(a: Account, p: Fen = this.last): number {
    return a.cash + this.unrealized(a, p) + (a.extra ?? 0);
  }

  marginReq(pos: number, p: Fen = this.last): number {
    return Math.abs(pos) * this.contractValue(p) * this.deck.marginRate;
  }

  /** 维持保证金：低于它，收盘就会收到追保通知 */
  maintReq(pos: number, p: Fen = this.last): number {
    return Math.abs(pos) * this.contractValue(p) * (this.deck.maintRate ?? this.deck.marginRate);
  }

  /** 融资额：多头市值超出权益的部分，就是向券商借的钱 */
  marginLoan(a: Account, p: Fen = this.last): number {
    if (a.pos <= 0 || this.deck.markToMarket) return 0;
    return Math.max(0, a.pos * this.contractValue(p) - this.equity(a, p));
  }

  limitOf(a: Account): number {
    return a.limit ?? this.deck.positionLimit;
  }

  priceBand(): [Fen, Fen] {
    if (this.deck.priceLimit == null) return [1, Number.MAX_SAFE_INTEGER];
    const d = Math.round(this.refClose * this.deck.priceLimit);
    return [this.refClose - d, this.refClose + d];
  }

  /** 撮合前的规则检查。返回规则事件；blocked 的事件会挡下订单。 */
  check(req: OrderReq, a: Account): RuleHit[] {
    const hits: RuleHit[] = [];
    if (!this.open) {
      hits.push({ rule: 'session', owner: a.id, blocked: true, detail: '当前不在交易时段' });
      return hits;
    }
    if (a.exempt) return hits;
    if (req.type === 'limit' && req.price != null) {
      const [lo, hi] = this.priceBand();
      if (req.price < lo || req.price > hi) {
        hits.push({ rule: 'price-limit', owner: a.id, blocked: true, detail: `委托价超出涨跌停区间` });
        return hits;
      }
    }
    const dir = req.side === 'buy' ? 1 : -1;
    const newPos = a.pos + dir * req.qty;
    const increases = Math.abs(newPos) > Math.abs(a.pos);
    if (!increases) return hits;
    if (a.closeOnly) {
      hits.push({ rule: 'close-only', owner: a.id, blocked: true, detail: '券商暂停了这只股票的买入，只允许卖出已有持仓' });
      return hits;
    }
    if (a.freeze) {
      hits.push({ rule: a.freeze.rule, owner: a.id, blocked: true, detail: a.freeze.detail });
      return hits;
    }
    if (newPos < 0 && a.borrowLimit != null && -newPos > a.borrowLimit) {
      hits.push({ rule: 'no-borrow', owner: a.id, blocked: true, detail: `借不到更多的券：借到的券一共 ${a.borrowLimit.toLocaleString()} ${UNITS.qty}，已经卖空 ${Math.max(0, -a.pos).toLocaleString()} ${UNITS.qty}，最多还能再卖空 ${Math.max(0, a.borrowLimit - Math.max(0, -a.pos)).toLocaleString()} ${UNITS.qty}` });
      return hits;
    }
    const limit = this.limitOf(a);
    if (Math.abs(newPos) > limit) {
      hits.push({
        rule: 'position-limit',
        owner: a.id,
        blocked: !req.overdraw,
        detail: `成交后持仓 ${Math.abs(newPos).toLocaleString()} ${UNITS.qty}，超过限额 ${limit.toLocaleString()} ${UNITS.qty}`,
      });
    }
    const ref = req.type === 'limit' && req.price != null ? req.price : this.last;
    const need = this.marginReq(newPos, ref);
    const eq = this.equity(a, ref);
    if (need > eq) {
      hits.push({
        rule: 'margin',
        owner: a.id,
        blocked: !req.overdraw,
        detail: `需要保证金 ${fmtYi(need)}，可用权益仅 ${fmtYi(eq)}`,
      });
    }
    return hits;
  }

  stats(id: string): DayStats {
    let s = this.dayStats.get(id);
    if (!s) this.dayStats.set(id, (s = { wash: 0, bigPlaced: 0, bigCancelled: 0, bigCancelledQty: 0, aggrByMin: {} }));
    return s;
  }

  /**
   * 对倒：自己的主账户和关联账户之间按 price 对敲 qty。
   * 持仓不变，只留下一笔成交和一个成交价——还有双边的佣金。
   * 价格不能穿过盘口：高过卖一、低过买一的部分会先吃掉别人的挂单，那就不是对倒了。
   */
  private wash(req: OrderReq, a: Account): SubmitResult {
    const res: SubmitResult = { filled: 0, avgPrice: null, rested: 0, rejected: false, hits: [], trades: [] };
    const bid = this.book.best('buy') ?? this.last;
    const ask = this.book.best('sell') ?? this.last;
    const p = Math.max(bid, Math.min(ask, req.price ?? this.last));
    // 对倒不转移持仓，所以保证金与持仓限额本来就不适用；但双边佣金是真的要付。
    // 以前这里不看账户有没有钱，一笔巨额对倒能把现金直接打成负数、还绕开穿仓判定。
    const fee = this.feeOf(p, req.qty) * 2;
    if (fee > Math.max(0, a.cash)) {
      res.rejected = true;
      res.hits.push({ rule: 'wash-cash', owner: a.id, blocked: true, detail: `对倒要付双边佣金 ${fmtYi(fee)}，账上只有 ${fmtYi(Math.max(0, a.cash))}` });
      return res;
    }
    const before = this.last;
    const t: Trade = { tick: this.tick, price: p, qty: req.qty, buyer: a.id, seller: a.id, aggressor: req.side, wash: true };
    this.trades.push(t);
    res.trades.push(t);
    res.filled = req.qty;
    res.avgPrice = p;
    this.last = p;
    a.cash -= fee;
    this.stats(a.id).wash += req.qty;
    this.contribute(a.group, p - before);
    return res;
  }

  /** 撤单：大单几乎没成交就撤掉，记一笔 */
  noteCancelled(orders: RestingOrder[]): void {
    for (const o of orders) {
      const placed = o.placed ?? o.qty;
      if (placed < this.bigOrder || o.qty < placed * 0.8) continue;
      const s = this.stats(o.owner);
      s.bigCancelled++;
      s.bigCancelledQty += o.qty;
    }
  }

  /** 挂单时限到了：撤掉没成交的部分 */
  cancelExpired(): RestingOrder[] {
    const gone = this.book.cancelWhere((o) => o.expires != null && o.expires <= this.tick);
    this.noteCancelled(gone);
    return gone;
  }

  /** 一笔成交（一个方向）按成交额收的佣金与规费；免检账户不建模成本 */
  feeOf(p: Fen, qty: number): number {
    return this.contractValue(p) * qty * (this.deck.feeRate ?? 0);
  }

  /** 成交双方各自付自己的佣金。免检账户（做市、散户群体、趋势资金）不收，避免污染背景撮合 */
  private chargeFee(a: Account, p: Fen, qty: number): number {
    if (a.exempt) return 0;
    const fee = this.feeOf(p, qty);
    if (!fee) return 0;
    a.cash -= fee;
    return fee;
  }

  submit(req: OrderReq, tag = ''): SubmitResult {
    const a = this.acct(req.owner);
    if (req.wash) {
      if (!this.open) return { filled: 0, avgPrice: null, rested: 0, rejected: true, hits: [{ rule: 'session', owner: a.id, blocked: true, detail: '当前不在交易时段' }], trades: [] };
      return this.wash(req, a);
    }
    const hits = this.check(req, a);
    const res: SubmitResult = { filled: 0, avgPrice: null, rested: 0, rejected: false, hits, trades: [] };
    if (hits.some((h) => h.blocked) || req.qty <= 0) {
      res.rejected = hits.some((h) => h.blocked);
      return res;
    }
    const overdrawn = hits.length > 0;
    if (overdrawn) a.violations++;

    const [lo, hi] = this.priceBand();
    let limit: Fen;
    if (req.type === 'market') {
      const prot = Math.round(this.last * this.deck.marketProtect);
      limit = req.side === 'buy' ? Math.min(hi, this.last + prot) : Math.max(lo, this.last - prot);
    } else {
      // 停板之外的价位一律成交不了（免检的做市与散户群体也一样）
      limit = req.side === 'buy' ? Math.min(hi, req.price!) : Math.max(lo, req.price!);
    }

    const midBefore = this.book.mid() ?? this.last;
    let notional = 0;
    const filled = this.book.match(req.side, req.qty, limit, (maker, q) => {
      const t: Trade = {
        tick: this.tick,
        price: maker.price,
        qty: q,
        buyer: req.side === 'buy' ? a.id : maker.owner,
        seller: req.side === 'sell' ? a.id : maker.owner,
        aggressor: req.side,
        overdrawn: overdrawn || undefined,
      };
      this.applyFill(a, req.side, q, maker.price);
      this.applyFill(this.acct(maker.owner), opposite(req.side), q, maker.price);
      // 买卖双方各付各的佣金：这笔成本要真的从现金里出去
      this.chargeFee(a, maker.price, q);
      this.chargeFee(this.acct(maker.owner), maker.price, q);
      this.trades.push(t);
      res.trades.push(t);
      notional += maker.price * q;
      this.last = maker.price;
    });
    res.filled = filled;
    res.avgPrice = filled ? notional / filled : null;
    if (filled && !a.exempt) {
      const s = this.stats(a.id);
      s.aggrByMin[this.minute] = (s.aggrByMin[this.minute] ?? 0) + filled;
    }

    const rest = req.qty - filled;
    if (rest > 0 && req.type === 'limit') {
      this.book.rest({
        owner: a.id,
        side: req.side,
        price: limit,
        qty: rest,
        tick: this.tick,
        overdraw: overdrawn || undefined,
        display: req.display,
        expires: req.ttl ? this.tick + req.ttl : undefined,
        placed: rest,
      });
      if (rest >= this.bigOrder && !a.exempt) this.stats(a.id).bigPlaced++;
      res.rested = rest;
    }
    const midAfter = this.book.mid() ?? this.last;
    this.contribute(a.group, midAfter - midBefore);
    void tag;
    return res;
  }

  contribute(group: string, d: number): void {
    if (!d) return;
    this.contributions.set(group, (this.contributions.get(group) ?? 0) + d);
  }

  /** 把一笔已经发生的成交重新记到双方账上（交易所撤销部分成交后重算账户时用） */
  rebook(t: Trade): void {
    this.applyFill(this.acct(t.buyer), 'buy', t.qty, t.price);
    this.applyFill(this.acct(t.seller), 'sell', t.qty, t.price);
  }

  private applyFill(a: Account, side: Side, q: number, p: Fen): void {
    const dir = side === 'buy' ? 1 : -1;
    const pos = a.pos;
    if (pos === 0 || Math.sign(pos) === dir) {
      a.avg = (a.avg * Math.abs(pos) + p * q) / (Math.abs(pos) + q);
      a.pos = pos + dir * q;
      return;
    }
    // 平仓部分：实现盈亏进入现金
    const close = Math.min(q, Math.abs(pos));
    a.cash += ((p - a.avg) / 100) * this.deck.multiplier * close * Math.sign(pos);
    a.pos = pos + dir * close;
    const rest = q - close;
    if (a.pos === 0) a.avg = 0;
    if (rest > 0) {
      a.pos = dir * rest;
      a.avg = p;
    }
  }

  /** 强制平仓：交易所代为以市价了结（不受保证金检查，但仍受市价保护） */
  liquidate(id: string, fraction = 1): SubmitResult | null {
    const a = this.acct(id);
    const qty = Math.ceil(Math.abs(a.pos) * fraction);
    if (!qty) return null;
    const wasExempt = a.exempt;
    a.exempt = true;
    const r = this.submit({ owner: id, side: a.pos > 0 ? 'sell' : 'buy', qty, type: 'market' }, 'forced');
    a.exempt = wasExempt;
    return r;
  }

  /** 逐日盯市：把浮动盈亏按结算价结转进现金，持仓均价重置为结算价 */
  settle(price: Fen): void {
    this.refClose = price;
    // 股票不做逐日盯市结转：持仓成本保持买入价，盈亏留在浮动盈亏里
    if (!this.deck.markToMarket) return;
    for (const a of this.accounts.values()) {
      a.cash += this.unrealized(a, price);
      if (a.pos !== 0) a.avg = price;
    }
  }

  snapshot(): Map<string, Account> {
    const m = new Map<string, Account>();
    for (const [k, v] of this.accounts) m.set(k, { ...v });
    return m;
  }

  restore(s: Map<string, Account>): void {
    for (const [k, v] of s) Object.assign(this.acct(k), v);
  }
}

export function opposite(s: Side): Side {
  return s === 'buy' ? 'sell' : 'buy';
}

export function fmtYi(yuan: number): string {
  const abs = Math.abs(yuan);
  if (abs >= 1e8) return `${(yuan / 1e8).toFixed(2)} 亿${UNITS.cur}`;
  if (abs >= 1e4) return `${(yuan / 1e4).toFixed(1)} 万${UNITS.cur}`;
  return `${yuan.toFixed(0)} ${UNITS.cur}`;
}
