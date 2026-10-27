import { OrderBook } from './book';
import type { Fen, OrderReq, RuleHit, Side, SubmitResult, Trade } from './types';

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
  /** 可借券上限（股）：卖空超过它会被挡下；不设表示不限 */
  borrowLimit?: number;
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
    return a.cash + this.unrealized(a, p);
  }

  marginReq(pos: number, p: Fen = this.last): number {
    return Math.abs(pos) * this.contractValue(p) * this.deck.marginRate;
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
    if (newPos < 0 && a.borrowLimit != null && -newPos > a.borrowLimit) {
      hits.push({ rule: 'no-borrow', owner: a.id, blocked: true, detail: `借不到更多的券：最多只能卖空 ${a.borrowLimit.toLocaleString()} ${UNITS.qty}` });
      return hits;
    }
    if (Math.abs(newPos) > this.deck.positionLimit) {
      hits.push({
        rule: 'position-limit',
        owner: a.id,
        blocked: !req.overdraw,
        detail: `成交后持仓 ${Math.abs(newPos).toLocaleString()} ${UNITS.qty}，超过限额 ${this.deck.positionLimit.toLocaleString()} ${UNITS.qty}`,
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

  submit(req: OrderReq, tag = ''): SubmitResult {
    const a = this.acct(req.owner);
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
      limit = req.price!;
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
      this.trades.push(t);
      res.trades.push(t);
      notional += maker.price * q;
      this.last = maker.price;
    });
    res.filled = filled;
    res.avgPrice = filled ? notional / filled : null;

    const rest = req.qty - filled;
    if (rest > 0 && req.type === 'limit') {
      this.book.rest({ owner: a.id, side: req.side, price: limit, qty: rest, tick: this.tick, overdraw: overdrawn || undefined });
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
