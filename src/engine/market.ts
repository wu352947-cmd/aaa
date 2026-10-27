import { Exchange, newAccount, type RuleDeck } from './exchange';
import { Rng } from './rng';
import type { Bar, Fen, OrderReq, RuleHit, Trade } from './types';

/** 一个交易日的设定。hist 是逐分钟的真实历史价格（实测或重建），base 是做市商估值中枢。 */
export interface DayDef {
  date: string;
  label: string;
  kind: 'layout' | 'battle';
  /** 每分钟真实历史价（分），长度 = 交易分钟数 */
  hist: Fen[];
  /** 做市商的估值中枢（“历史引力”指向的位置）；为空时等于 hist */
  base?: Fen[];
  /** 冲击校准用的当日成交量（口） */
  vDay: number;
  /** 日波动率 */
  sigma: number;
  /** 偏离回归半衰期（分钟）：流动性越好越短 */
  halfLife: number;
  /** 散户群体成交量占 vDay 的比例 */
  crowdShare: number;
  /** 这一天的数据是实测还是重建 */
  provenance: 'measured' | 'reconstructed';
}

export interface MarketParams {
  /** 平方根律常数 Y */
  Y: number;
  /** 价格冲击中被做市商“相信”的比例 */
  kappa: number;
  /** 趋势资金开始追涨杀跌的偏离阈值（以日波动的倍数计） */
  trendThreshold: number;
  trendScale: number;
}

export interface Actor {
  id: string;
  onTick(m: Market): OrderReq[];
}

export interface TickReport {
  hits: RuleHit[];
  trades: Trade[];
  /** 本分钟触发了涨跌幅区间暂停（LULD） */
  luld?: boolean;
}

/** 交易时段：由若干连续时段组成，每分钟一个 tick */
export interface Session {
  minutes: number;
  label(i: number): string;
  index(label: string): number;
  /** 时间轴刻度 */
  marks: [number, string][];
  /** 午休等时段分界（tick 序号） */
  breaks: number[];
}

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
const fmtMin = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function makeSession(segments: [string, string][]): Session {
  const parts = segments.map(([a, b]) => [toMin(a), toMin(b)] as const);
  const offsets: number[] = [];
  let minutes = 0;
  for (const [a, b] of parts) {
    offsets.push(minutes);
    minutes += b - a;
  }
  const marks: [number, string][] = [];
  const breaks: number[] = [];
  parts.forEach(([a, b], k) => {
    const off = offsets[k];
    if (k === 0) marks.push([0, fmtMin(a)]);
    else {
      breaks.push(off);
      marks.push([off, `${fmtMin(parts[k - 1][1])}/${fmtMin(a)}`]);
    }
    for (let m = Math.ceil((a + 1) / 60) * 60; m < b; m += 60) marks.push([off + m - a, fmtMin(m)]);
  });
  return {
    minutes,
    marks,
    breaks,
    label(i) {
      const j = Math.max(0, Math.min(i, minutes - 1));
      for (let k = parts.length - 1; k >= 0; k--) if (j >= offsets[k]) return fmtMin(parts[k][0] + j - offsets[k]);
      return fmtMin(parts[0][0]);
    },
    index(label) {
      const m = toMin(label);
      for (let k = 0; k < parts.length; k++) {
        const [a, b] = parts[k];
        if (m < a) return offsets[k];
        if (m < b) return offsets[k] + m - a;
      }
      return minutes;
    },
  };
}

/** 1995 年上交所国债期货：上午 9:30–11:30，下午 13:00–16:30 */
export const SSE_1995 = makeSession([
  ['9:30', '11:30'],
  ['13:00', '16:30'],
]);
export const MINUTES_PER_DAY = SSE_1995.minutes;
export const minuteLabel = SSE_1995.label;
export const minuteIndex = SSE_1995.index;

// 做市商挂单档位（相对中枢的偏移，单位：分）。近处逐档、远处稀疏，覆盖 ±8 元。
const LADDER: number[] = (() => {
  const out: number[] = [];
  for (let d = 1; d <= 20; d++) out.push(d);
  for (let d = 22; d <= 60; d += 2) out.push(d);
  for (let d = 65; d <= 200; d += 5) out.push(d);
  for (let d = 210; d <= 800; d += 10) out.push(d);
  return out;
})();

export const MM = 'mm';
export const CROWD = 'crowd';
export const TREND = 'trend';

/**
 * 市场：订单簿 + 三类背景智能体（做市商、散户群体、趋势资金）+ 剧本角色。
 *
 * 做市商的挂单深度按平方根律铺设：距中枢 d 元以内的累计挂单量
 *   C(d) = V · (d / (Y·σ·P))²
 * 因此一张吃掉 Q 口的市价单在当分钟把价格推动 Y·σ·P·√(Q/V)（临时冲击）。
 *
 * 做市商记住一段时间内的累计净主动买卖量 I（按半衰期遗忘，即“历史引力”），
 * 并据此把中枢挪到 base + κ·Y·σ·P·sign(I)·√(|I|/V)（永久冲击）。
 * 因为永久冲击取决于累计量的平方根，把大单拆成小单并不能更便宜地推动价格。
 */
export class Market {
  ex: Exchange;
  day!: DayDef;
  dayIndex = -1;
  t = 0;
  /** 做市商记忆中的累计净主动成交量（口，买为正） */
  flow = 0;
  bars: Bar[] = [];
  /** 每个交易日的 K 线（日线），收盘后追加 */
  dailyBars: Bar[] = [];
  sentiment = 0;
  actors: Actor[] = [];
  /** 临时停市：当日第几分钟之前不撮合（-1 表示正常交易） */
  haltUntil = -1;
  /** 券商限制买入时，散户群体只能卖出 */
  crowdSellOnly = false;
  private rngCrowd: Rng;
  private rngTrend: Rng;
  closePrices: Fen[] = [];

  constructor(
    public deck: RuleDeck,
    public params: MarketParams,
    seed: string,
    startPrice: Fen,
    public session: Session = SSE_1995,
  ) {
    this.ex = new Exchange(deck, startPrice);
    this.ex.add(newAccount({ id: MM, name: '做市与套利资金', group: 'gravity', exempt: true }));
    this.ex.add(newAccount({ id: CROWD, name: '散户大军', group: 'crowd', exempt: true }));
    this.ex.add(newAccount({ id: TREND, name: '趋势资金', group: 'trend', exempt: true }));
    const rng = new Rng(seed);
    this.rngCrowd = rng.fork('crowd');
    this.rngTrend = rng.fork('trend');
  }

  get last(): Fen {
    return this.ex.last;
  }

  base(t = this.t): Fen {
    const arr = this.day.base ?? this.day.hist;
    return arr[Math.min(t, arr.length - 1)];
  }

  hist(t = this.t): Fen {
    return this.day.hist[Math.min(t, this.day.hist.length - 1)];
  }

  /** 冲击尺度 Y·σ·P（分） */
  private scale(p = this.base()): number {
    return this.params.Y * this.day.sigma * p;
  }

  /** 累计净流量造成的永久偏离（分） */
  get dev(): number {
    return this.params.kappa * this.scale() * Math.sign(this.flow) * Math.sqrt(Math.abs(this.flow) / this.day.vDay);
  }

  /** 做市商当前的估值中枢（分） */
  get reference(): number {
    return this.base() + this.dev;
  }

  beginDay(day: DayDef, index: number): void {
    this.day = day;
    this.dayIndex = index;
    this.t = 0;
    this.bars = [];
    this.haltUntil = -1;
    this.ex.contributions = new Map();
    this.ex.book.clear();
    this.ex.open = true;
    // 开盘：隔夜消化掉一大半前一日的净流量
    this.flow *= 0.25;
    this.ex.last = Math.round(this.reference);
  }

  /** 要让中枢到达 target（分），累计净流量还需要再加多少（口，买为正） */
  flowToReach(target: Fen): number {
    const d = target - this.base();
    const need = Math.sign(d) * this.day.vDay * Math.pow(d / (this.params.kappa * this.scale()), 2);
    return need - this.flow;
  }

  /** 以平方根律估算 Q 口的临时价格冲击（分） */
  impactOf(qty: number): number {
    return this.scale() * Math.sqrt(qty / this.day.vDay);
  }

  private postLiquidity(center: number = this.reference): void {
    const ex = this.ex;
    ex.book.cancelOwner(MM);
    const c = Math.round(center);
    const s = this.scale(center) / 100;
    const V = this.day.vDay;
    // 档位步长随冲击尺度放大：327 合约每档 1 分，三百美元的股票每档约 25 美分
    const unit = Math.max(1, Math.round((s * 100) / 600));
    let prevC = 0;
    for (const base of LADDER) {
      const off = base * unit;
      const cum = V * Math.pow(off / 100 / s, 2);
      const size = Math.max(1, Math.round(cum - prevC));
      prevC = cum;
      ex.book.rest({ owner: MM, side: 'buy', price: c - off, qty: size, tick: ex.tick });
      ex.book.rest({ owner: MM, side: 'sell', price: c + off, qty: size, tick: ex.tick });
    }
  }

  private crowdOrders(): OrderReq[] {
    const r = this.rngCrowd;
    const perTick = (this.day.crowdShare * this.day.vDay) / this.session.minutes;
    const n = 4 + r.int(0, 4);
    const out: OrderReq[] = [];
    const bias = 0.18 * this.sentiment;
    for (let i = 0; i < n; i++) {
      const qty = Math.max(1, Math.round((perTick / n) * Math.exp(r.normal() * 0.6 - 0.18)));
      const side = this.crowdSellOnly || !r.chance(0.5 + bias) ? 'sell' : 'buy';
      if (r.chance(0.65)) out.push({ owner: CROWD, side, qty, type: 'market' });
      else {
        const off = r.int(0, 4);
        const ref = Math.round(this.reference);
        out.push({ owner: CROWD, side, qty, type: 'limit', price: side === 'buy' ? ref - off : ref + off });
      }
    }
    return out;
  }

  private trendOrders(): OrderReq[] {
    if (this.bars.length < 6) return [];
    const p = this.params;
    const dayVol = this.day.sigma * this.reference;
    const devRatio = (this.last - this.base()) / dayVol;
    const mom = this.last - this.bars[this.bars.length - 6].o;
    if (Math.abs(devRatio) < p.trendThreshold || Math.sign(mom) !== Math.sign(devRatio)) return [];
    const strength = Math.min(2, Math.abs(devRatio) - p.trendThreshold);
    const qty = Math.round(((p.trendScale * this.day.vDay) / this.session.minutes) * strength * (0.7 + 0.6 * this.rngTrend.next()));
    if (qty <= 0) return [];
    return [{ owner: TREND, side: devRatio > 0 ? 'buy' : 'sell', qty, type: 'market' }];
  }

  /** 推进一分钟。playerOrders 先于其他人提交（玩家的委托在本分钟开盘时到达）。 */
  step(playerOrders: OrderReq[]): TickReport {
    const ex = this.ex;
    ex.tick++;
    const report: TickReport = { hits: [], trades: [] };
    if (this.t < this.haltUntil) {
      // 停市：时间照走，没有成交；做市商的记忆照常衰减
      this.bars.push({ tick: this.t, o: ex.last, h: ex.last, l: ex.last, c: ex.last, v: 0, hist: this.hist() });
      this.flow *= Math.pow(0.5, 2 / this.day.halfLife);
      this.t++;
      return report;
    }
    const midBefore = ex.book.mid();
    this.postLiquidity();
    const midAfterRepost = ex.book.mid();
    if (midBefore != null && midAfterRepost != null) ex.contribute('gravity', midAfterRepost - midBefore);
    // 散户限价单 10 分钟未成交即撤
    ex.book.cancelWhere((o) => o.owner === CROWD && ex.tick - o.tick > 10);

    const open = ex.last;
    const tradesStart = ex.trades.length;
    let center = this.reference;
    let net = 0;
    const submit = (o: OrderReq) => {
      const r = ex.submit(o);
      report.hits.push(...r.hits);
      if (!r.filled) return;
      net += o.side === 'buy' ? r.filled : -r.filled;
      // 大单扫过之后，做市商当分钟就在新价位重新报价（临时冲击在本分钟内持续）
      if (Math.abs(ex.last - center) >= 3) {
        const before = ex.book.mid();
        center = ex.last;
        this.postLiquidity(center);
        const after = ex.book.mid();
        if (before != null && after != null) ex.contribute(ex.acct(o.owner).group, after - before);
      }
    };
    for (const o of playerOrders) submit(o);
    const npc: OrderReq[] = [...this.crowdOrders(), ...this.trendOrders()];
    for (const a of this.actors) npc.push(...a.onTick(this));
    // NPC 委托到达顺序由散户随机流决定，保证可复现
    for (let i = npc.length - 1; i > 0; i--) {
      const j = Math.floor(this.rngCrowd.next() * (i + 1));
      [npc[i], npc[j]] = [npc[j], npc[i]];
    }
    for (const o of npc) submit(o);

    const newTrades = ex.trades.slice(tradesStart);
    report.trades = newTrades;
    let h = open,
      l = open,
      v = 0;
    for (const t of newTrades) {
      h = Math.max(h, t.price);
      l = Math.min(l, t.price);
      v += t.qty;
    }
    this.bars.push({ tick: this.t, o: open, h, l, c: ex.last, v, hist: this.hist() });

    // 中枢更新：累计净流量按半衰期遗忘（偏离 ∝ √流量，所以流量半衰期取偏离半衰期的一半）
    this.flow = (this.flow + net) * Math.pow(0.5, 2 / this.day.halfLife);
    // 散户情绪：追随最近的涨跌，缓慢遗忘
    const move = (ex.last - open) / Math.max(1, this.day.sigma * this.reference * 0.05);
    this.sentiment = clamp(this.sentiment * 0.97 + 0.03 * Math.tanh(move), -1, 1);
    this.t++;
    // 涨跌幅区间暂停（LULD）：价格在窗口内偏离超过区间，暂停若干分钟
    const luld = this.deck.luld;
    // 复牌后的一个窗口内不再检查，避免价格回到中枢时连环暂停
    if (luld && this.bars.length > luld.window && this.t >= this.haltUntil + luld.window) {
      const ref = this.bars[this.bars.length - 1 - luld.window].c;
      if (Math.abs(ex.last - ref) / ref > luld.band) {
        this.haltUntil = this.t + luld.pause;
        report.luld = true;
      }
    }
    return report;
  }

  get dayOver(): boolean {
    return this.t >= this.session.minutes;
  }

  /** 收盘：生成日线，撤掉所有挂单，并以 settlePrice 逐日盯市 */
  closeDay(settlePrice: Fen = this.ex.last): Bar {
    const bars = this.bars;
    const bar: Bar = {
      tick: this.dayIndex,
      o: bars[0]?.o ?? settlePrice,
      h: Math.max(...bars.map((b) => b.h)),
      l: Math.min(...bars.map((b) => b.l)),
      c: settlePrice,
      v: bars.reduce((a, b) => a + b.v, 0),
      hist: this.day.hist[this.day.hist.length - 1],
    };
    this.dailyBars.push(bar);
    this.closePrices.push(settlePrice);
    this.ex.open = false;
    this.ex.book.clear();
    // 结算价即官方收盘价；被宣布无效的成交不再影响估值
    this.ex.last = settlePrice;
    this.ex.settle(settlePrice);
    return bar;
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * 受约束的重建路径：给定若干 (分钟, 价格) 锚点，用带种子的布朗桥连接，
 * 保证路径精确经过每个锚点。用于历史上不存在分钟级数据的日子。
 */
export function bridgePath(points: [number, Fen][], length: number, volPerMin: number, seed: string): Fen[] {
  const rng = new Rng(seed);
  const out: Fen[] = new Array(length);
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < pts.length - 1; k++) {
    const [t0, p0] = pts[k];
    const [t1, p1] = pts[k + 1];
    const n = t1 - t0;
    // 先生成随机游走，再线性修正使终点精确命中
    const walk = [0];
    for (let i = 1; i <= n; i++) walk.push(walk[i - 1] + rng.normal() * volPerMin);
    for (let i = 0; i <= n; i++) {
      const frac = n ? i / n : 0;
      const v = p0 + (p1 - p0) * frac + (walk[i] - frac * walk[n]);
      out[t0 + i] = Math.round(v);
    }
  }
  const lastPt = pts[pts.length - 1];
  for (let i = 0; i < length; i++) if (out[i] == null) out[i] = i < pts[0][0] ? pts[0][1] : lastPt[1];
  return out;
}
