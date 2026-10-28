import type { Fen, RestingOrder, Side } from './types';

/** 价格优先、时间优先的限价订单簿。只负责排队与配对，不做任何规则判断。 */
export class OrderBook {
  private bids = new Map<Fen, RestingOrder[]>();
  private asks = new Map<Fen, RestingOrder[]>();
  private bidPrices: Fen[] = [];
  private askPrices: Fen[] = [];
  private bidDirty = false;
  private askDirty = false;
  private nextId = 1;

  private side(s: Side) {
    return s === 'buy' ? this.bids : this.asks;
  }

  private sortedPrices(s: Side): Fen[] {
    if (s === 'buy') {
      if (this.bidDirty) {
        this.bidPrices = [...this.bids.keys()].sort((a, b) => b - a);
        this.bidDirty = false;
      }
      return this.bidPrices;
    }
    if (this.askDirty) {
      this.askPrices = [...this.asks.keys()].sort((a, b) => a - b);
      this.askDirty = false;
    }
    return this.askPrices;
  }

  rest(o: Omit<RestingOrder, 'id'>): RestingOrder {
    const order = { ...o, id: this.nextId++ };
    const map = this.side(o.side);
    const level = map.get(o.price);
    if (level) level.push(order);
    else {
      map.set(o.price, [order]);
      if (o.side === 'buy') this.bidDirty = true;
      else this.askDirty = true;
    }
    return order;
  }

  best(s: Side): Fen | null {
    const prices = this.sortedPrices(s);
    return prices.length ? prices[0] : null;
  }

  mid(): Fen | null {
    const b = this.best('buy');
    const a = this.best('sell');
    if (b == null || a == null) return b ?? a;
    return (a + b) / 2;
  }

  /**
   * 取出与主动方配对的对手单。taker 为买时遍历卖盘，反之亦然。
   * limit 为主动方能接受的最差价格。回调返回本次成交量。
   */
  match(
    takerSide: Side,
    qty: number,
    limit: Fen,
    onFill: (maker: RestingOrder, qty: number) => void,
  ): number {
    const makerSide: Side = takerSide === 'buy' ? 'sell' : 'buy';
    const map = this.side(makerSide);
    let remaining = qty;
    while (remaining > 0) {
      const prices = this.sortedPrices(makerSide);
      if (!prices.length) break;
      const p = prices[0];
      if (takerSide === 'buy' ? p > limit : p < limit) break;
      const level = map.get(p)!;
      while (remaining > 0 && level.length) {
        const maker = level[0];
        const q = Math.min(remaining, maker.qty);
        maker.qty -= q;
        remaining -= q;
        onFill(maker, q);
        if (maker.qty <= 0) level.shift();
      }
      if (!level.length) {
        map.delete(p);
        prices.shift();
      }
    }
    return qty - remaining;
  }

  /** 撤掉某个参与者的全部挂单（做市商每分钟重挂时使用） */
  cancelOwner(owner: string): void {
    for (const s of ['buy', 'sell'] as const) {
      const map = this.side(s);
      for (const [p, level] of map) {
        const kept = level.filter((o) => o.owner !== owner);
        if (kept.length === level.length) continue;
        if (kept.length) map.set(p, kept);
        else {
          map.delete(p);
          if (s === 'buy') this.bidDirty = true;
          else this.askDirty = true;
        }
      }
    }
  }

  cancelWhere(pred: (o: RestingOrder) => boolean): RestingOrder[] {
    const removed: RestingOrder[] = [];
    for (const s of ['buy', 'sell'] as const) {
      const map = this.side(s);
      for (const [p, level] of map) {
        const kept: RestingOrder[] = [];
        for (const o of level) (pred(o) ? removed : kept).push(o);
        if (kept.length === level.length) continue;
        if (kept.length) map.set(p, kept);
        else {
          map.delete(p);
          if (s === 'buy') this.bidDirty = true;
          else this.askDirty = true;
        }
      }
    }
    return removed;
  }

  ordersOf(owner: string): RestingOrder[] {
    const out: RestingOrder[] = [];
    for (const map of [this.bids, this.asks]) for (const level of map.values()) for (const o of level) if (o.owner === owner) out.push(o);
    return out;
  }

  /** 逐一看所有挂单（只读） */
  each(fn: (o: RestingOrder) => void): void {
    for (const map of [this.bids, this.asks]) for (const level of map.values()) for (const o of level) fn(o);
  }

  /** 盘口快照：每侧前 n 档的价格与露出来的量（冰山单只算露出的那部分） */
  depth(n: number): { bids: [Fen, number][]; asks: [Fen, number][] } {
    const take = (s: Side) =>
      this.sortedPrices(s)
        .slice(0, n)
        .map((p) => [p, this.side(s).get(p)!.reduce((a, o) => a + visible(o), 0)] as [Fen, number]);
    return { bids: take('buy'), asks: take('sell') };
  }

  clear(): void {
    this.bids.clear();
    this.asks.clear();
    this.bidPrices = [];
    this.askPrices = [];
  }
}

/** 一张挂单在盘口上露出来的量 */
export function visible(o: RestingOrder): number {
  return o.display != null ? Math.min(o.qty, o.display) : o.qty;
}
