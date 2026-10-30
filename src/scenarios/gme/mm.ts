import { fmtYi } from '../../engine/exchange';
import type { CardDef, CardResult, Clock, Decision, Game, Meter } from '../../engine/game';
import type { Actor, Market } from '../../engine/market';
import { BATTLE_2021, NYSE } from './data';

/**
 * 做市商座位：堡垒集团的交易台。
 *
 * 你同时做两门生意：
 * - 买下零佣金券商的散户订单流，在每一笔成交里赚一点价差；
 * - 把看涨期权卖给散户，收权利金。卖出看涨期权等于欠着一笔“价格越涨越大”的债，
 *   所以要按 delta 买进股票对冲：价格往上冲，delta 变大，就得追着买——这就是“伽马逼空”。
 * 对冲做得好，期权的风险被股票抵掉，你赚的是权利金和价差；对冲停了，你就是在赌方向。
 */

export const FT = 'fortress';
/** 隐含波动率（年化）：这一周的期权贵得离谱 */
const SIGMA = 2.5;
/** 1 月 29 日收盘到期：从第 d 天的第 frac 处算，还剩几个交易日 */
const EXPIRY = BATTLE_2021 + 2;
/** 开局的交易台资本（美元） */
export const DESK = 3_000_000_000;
const START_LOT = { strike: 6000, qty: 6_000_000 };
const NEW_LOT = 2_000_000;
/** 散户买看涨期权不看价：卖出价比估值高三成，这是做市商的赚头 */
const RETAIL_EDGE = 1.3;
/** 回购时要付的溢价 */
const BUYBACK_COST = 1.1;
/** 散户订单流里，你买下并成交的份额 */
const FLOW_SHARE = 0.35;
const SPREAD = { normal: 0.03, wide: 0.07, pulled: 0 } as const;
const DEPTH = { normal: 1, wide: 0.6, pulled: 0.25 } as const;

export type Quoting = keyof typeof SPREAD;

interface Lot {
  /** 行权价（美分） */
  k: number;
  qty: number;
  /** 收到的权利金（美元） */
  prem: number;
  day: number;
}

interface MmState {
  lots: Lot[];
  hedge: boolean;
  selling: boolean;
  quoting: Quoting;
  /** 订单流价差收入（美元，已入账） */
  pfof: number;
  /** 对灰狼的注资：本金与注资后灰狼的权益 */
  stake: number;
  stakeBasis: number;
  /** 对冲累计买入 / 卖出的股数 */
  hedgeBought: number;
  hedgeSold: number;
  /** 回购期权一共花了多少 */
  boughtBack?: number;
}

const STATE = new WeakMap<Game, MmState>();
export const mm = (g: Game): MmState => STATE.get(g)!;
export const isMm = (g: Game) => g.factionId === 'mm';
const flag = (g: Game, k: string) => g.flags[k];
const usd = (c: number) => `${(c / 100).toFixed(2)} 美元`;
const shares = (q: number) => (Math.abs(q) >= 10000 ? `${(q / 10000).toFixed(0)} 万股` : `${Math.round(q).toLocaleString()} 股`);

// ───────────── 期权数学 ─────────────

function ncdf(x: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** 剩余年限：盘中按分钟推进，收盘后按当天结束算 */
export function yearsLeft(g: Game): number {
  const frac = g.phase === 'trading' ? g.market.t / NYSE.minutes : 1;
  return Math.max(0.25, EXPIRY - g.dayIndex - frac) / 252;
}

/** 一股看涨期权的价值与 delta（价格用美分，价值用美元） */
export function call(s: number, k: number, T: number): { value: number; delta: number } {
  const S = s / 100;
  const K = k / 100;
  const v = SIGMA * Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * v * v) / v;
  const d2 = d1 - v;
  return { value: S * ncdf(d1) - K * ncdf(d2), delta: ncdf(d1) };
}

/** 卖出去的期权现在值多少（这是你欠的） */
export function liability(g: Game, price = g.market.last): number {
  const T = yearsLeft(g);
  return mm(g).lots.reduce((a, l) => a + l.qty * call(price, l.k, T).value, 0);
}

/** 要完全对冲，手里该有多少股 */
export function hedgeTarget(g: Game, price = g.market.last): number {
  const T = yearsLeft(g);
  return Math.round(mm(g).lots.reduce((a, l) => a + l.qty * call(price, l.k, T).delta, 0));
}

/** 对灰狼的注资现在值多少：跟着灰狼的权益涨跌 */
export function stakeValue(g: Game): number {
  const s = mm(g);
  if (!s.stake) return 0;
  const gw = g.market.ex.equity(g.market.ex.acct('greywolf'));
  return Math.max(0, (s.stake * gw) / s.stakeBasis);
}

/** 交易台的真实权益：股票账户 − 欠着的期权 + 对灰狼的注资 */
export function deskEquity(g: Game, price = g.market.last): number {
  return g.market.ex.equity(g.player, price) - liability(g, price) + stakeValue(g);
}

// ───────────── 开局 ─────────────

export function mmSetup(g: Game): void {
  const ex = g.market.ex;
  const a = ex.acct(FT);
  const T = yearsLeft(g);
  const c = call(ex.last, START_LOT.strike, T);
  const prem = START_LOT.qty * c.value;
  // 开局已经卖出 800 万股的看涨期权，并按 delta 对冲好了
  a.cash = DESK + prem;
  a.pos = Math.round(START_LOT.qty * c.delta);
  a.avg = ex.last;
  STATE.set(g, {
    lots: [{ k: START_LOT.strike, qty: START_LOT.qty, prem, day: 0 }],
    hedge: true,
    selling: true,
    quoting: 'normal',
    pfof: 0,
    stake: 0,
    stakeBasis: 1,
    hedgeBought: 0,
    hedgeSold: 0,
  });
}

export function mmBriefing(g: Game): string {
  const s = mm(g);
  return `堡垒集团交易台：资本 ${fmtYi(DESK)}。你已经卖出 ${shares(s.lots[0].qty)} 的看涨期权（行权价 ${usd(s.lots[0].k)}，29 日到期），并按 delta 买好了 ${shares(g.player.pos)} 股对冲。你还买下了羽毛证券的散户订单流：每一笔成交，你都赚一点价差。自动对冲开着：价格往上冲，它会替你追着买。`;
}

// ───────────── 盘中 ─────────────

/** 自动对冲：每两分钟把持股拉向 delta 目标；一次最多吃掉这一分钟正常成交量的四成 */
export function mmHedgeActor(g: Game): Actor {
  return {
    id: 'mm-hedge',
    onTick(m: Market) {
      const s = mm(g);
      if (!s.hedge || m.t % 2 !== 0 || m.t < m.haltUntil) return [];
      const pos = m.ex.acct(FT).pos;
      const diff = hedgeTarget(g, m.last) - pos;
      if (Math.abs(diff) < Math.max(50_000, Math.abs(pos) * 0.02)) return [];
      const cap = Math.round(((m.day.vDay / NYSE.minutes) * 0.4) * (flag(g, 'mmFastHedge') ? 2 : 1));
      const qty = Math.min(Math.abs(diff), cap);
      if (diff > 0) s.hedgeBought += qty;
      else s.hedgeSold += qty;
      return [{ owner: FT, side: diff > 0 ? 'buy' : 'sell', qty, type: 'market' }];
    },
  };
}

/** 每分钟：按这一分钟的成交量收订单流的价差 */
export function mmTick(g: Game): void {
  const s = mm(g);
  const bar = g.market.bars[g.market.bars.length - 1];
  if (!bar || !bar.v) return;
  const rate = SPREAD[s.quoting] * (flag(g, 'mmPfofBoost') ? 1.3 : 1) * (flag(g, `mmFront-${g.dayIndex}`) ? 3 : 1);
  const income = bar.v * g.market.day.crowdShare * FLOW_SHARE * (bar.c / 100) * rate;
  s.pfof += income;
  g.player.cash += income;
  // 决战日券商限制买入后，你得决定还报不报价
  if (g.isBattleDay && flag(g, 'restrictActive') && !flag(g, 'mmQuoteAsked') && !g.decision) {
    g.flags.mmQuoteAsked = true;
    g.decision = quoteDecision(g);
  }
}

function quoteDecision(g: Game): Decision {
  return {
    id: 'mm-quote',
    title: '只剩卖单了',
    body: `券商限制了买入，散户只能卖。股价 ${usd(g.market.last)}，卖单像潮水一样涌来。你是这只股票最大的做市商：你接不接这些卖单，决定价格跌得多快。`,
    choices: [
      { id: 'keep', label: '照常报价', detail: '按原来的价差接住卖单。你会买进一大堆正在下跌的股票，但市场还有人接盘。' },
      { id: 'wide', label: '加宽价差', detail: '还报价，但每一笔都多赚一点。卖的人拿到的价更差。' },
      { id: 'pull', label: '撤掉报价', detail: '不接了。没有人接盘，价格会断崖式下跌、一再暂停。你一股不沾。', danger: true },
    ],
    countdown: 25,
  };
}

export function mmDayStart(g: Game): void {
  const s = mm(g);
  g.market.depthScale = DEPTH[s.quoting];
  sellOvernight(g);
  // 27 日跳空开盘：一夜之间，你欠的对冲多了一大截
  if (g.dayIndex === 3) {
    const gap = hedgeTarget(g) - g.player.pos;
    if (gap > 500_000)
      g.decision = {
        id: 'mm-gap',
        title: '跳空开盘',
        body: `昨晚一条推文之后，股价跳空开在 ${usd(g.market.last)}。按 delta 你该持有 ${shares(hedgeTarget(g))}，手里只有 ${shares(g.player.pos)}：还差 ${shares(gap)}。每买一股，都在把价格往上推。`,
        choices: [
          { id: 'chase', label: '半小时内补齐', detail: '马上把对冲补上。你的买单会成为这一波上涨的燃料。' },
          { id: 'auto', label: '交给自动对冲慢慢补', detail: '每两分钟补一点。补齐之前，价格每涨一美元你都在亏。' },
          { id: 'bet', label: '停掉对冲，赌它会回落', detail: '一股不买。价格回落你省下一大笔；接着涨，你的期权空头就裸着。', danger: true },
        ],
        countdown: 30,
      };
  }
}

export function mmDecide(g: Game, id: string, choice: string): boolean {
  const s = mm(g);
  switch (`${id}:${choice}`) {
    case 'mm-gap:chase':
      g.addPlanFromScript({ label: '补齐对冲', cond: 'now', price: 0, side: 'buy', qty: Math.max(0, hedgeTarget(g) - g.player.pos), spread: 30 });
      s.hedgeBought += Math.max(0, hedgeTarget(g) - g.player.pos);
      return true;
    case 'mm-gap:auto':
      s.hedge = true;
      return true;
    case 'mm-gap:bet':
      s.hedge = false;
      g.flags.mmBet = true;
      return true;
    case 'mm-quote:keep':
      setQuoting(g, 'normal');
      g.flags.mmQuote = 'keep';
      g.reputation += 5;
      return true;
    case 'mm-quote:wide':
      setQuoting(g, 'wide');
      g.flags.mmQuote = 'wide';
      g.reputation -= 3;
      return true;
    case 'mm-quote:pull':
      setQuoting(g, 'pulled');
      g.flags.mmQuote = 'pull';
      g.darkDeed('pull-quotes', '撤掉报价');
      g.reputation -= 8;
      g.addHeat(10, '在最需要流动性的时候撤掉报价');
      return true;
  }
  return false;
}

function setQuoting(g: Game, q: Quoting): void {
  mm(g).quoting = q;
  g.market.depthScale = DEPTH[q];
}

/** 隔夜散户下的看涨期权买单，开盘前按昨天的收盘价成交：夜里你还来得及决定卖不卖 */
function sellOvernight(g: Game): void {
  const s = mm(g);
  if (!s.selling || g.dayIndex === 0 || g.dayIndex >= BATTLE_2021) return;
  const close = g.market.closePrices[g.market.closePrices.length - 1];
  const k = Math.round((close * 1.3) / 100) * 100;
  const c = call(close, k, yearsLeft(g));
  const prem = NEW_LOT * c.value * RETAIL_EDGE * (flag(g, 'mmPremBoost') ? 1.5 : 1);
  s.lots.push({ k, qty: NEW_LOT, prem, day: g.dayIndex });
  g.player.cash += prem;
  g.push({ kind: 'intel', text: `又卖出 ${shares(NEW_LOT)} 看涨期权（行权价 ${usd(k)}），收权利金 ${fmtYi(prem)}` });
}

// ───────────── 顶栏与动向 ─────────────

export function mmMeters(g: Game): Meter[] {
  const s = mm(g);
  const eq = deskEquity(g);
  const gap = hedgeTarget(g) - g.player.pos;
  const owed = s.lots.reduce((a, l) => a + l.qty, 0);
  return [
    { id: 'desk', label: '交易台权益', value: fmtYi(eq), tone: eq < DESK ? 'bad' : 'good', tip: `股票账户 ${fmtYi(g.equity())} − 欠着的期权 ${fmtYi(liability(g))}${s.stake ? ` + 灰狼的股份 ${fmtYi(stakeValue(g))}` : ''}。开局 ${fmtYi(DESK)}。` },
    {
      id: 'gap',
      label: s.hedge ? 'Delta 缺口 · 自动对冲' : 'Delta 缺口 · 对冲停了',
      value: Math.abs(gap) < 50_000 ? '对冲到位' : `${gap > 0 ? '还要买' : '多出'} ${shares(Math.abs(gap))}`,
      tone: Math.abs(gap) > Math.max(1_000_000, g.player.pos * 0.2) ? 'bad' : undefined,
      tip: `按 delta，你该持有 ${shares(hedgeTarget(g))}，手里 ${shares(g.player.pos)}。缺口越大，价格每动一美元你赔得越多。`,
    },
    { id: 'calls', label: '期权空头', value: shares(owed), tip: `你卖出的看涨期权：${s.lots.map((l) => `${shares(l.qty)} @ ${usd(l.k)}`).join('，')}。现在值 ${fmtYi(liability(g))}——这是你欠的。` },
    { id: 'pfof', label: '订单流价差', value: fmtYi(s.pfof), tip: `买下散户订单流赚的价差，已入账。现在的报价：${s.quoting === 'normal' ? '正常' : s.quoting === 'wide' ? '加宽' : '已撤'}。` },
    { id: 'rep', label: '声望', value: String(g.reputation), tip: '圈内信誉' },
  ];
}

export function mmClock(g: Game): Clock {
  const s = mm(g);
  const gap = hedgeTarget(g) - g.player.pos;
  const d = g.dayIndex;
  return {
    id: 'mm-gamma',
    who: 'jack',
    name: '散户的看涨期权',
    segs: 4,
    filled: Math.max(0, Math.min(4, s.lots.length - 1 + (gap > 1_000_000 ? 1 : 0))),
    known: true,
    then: '价格冲过你卖出的行权价，期权就变成了实打实的债：每涨一美元，你欠的就多一大截。',
    now: `你卖出的看涨期权现在值 ${fmtYi(liability(g))}；按 delta 该持有 ${shares(hedgeTarget(g))}，手里 ${shares(g.player.pos)}。`,
    counter: '对冲跟紧，期权的风险就被股票抵掉；停止卖出新期权，债就不再变大。',
    tone: gap > 1_000_000 ? 'threat' : 'neutral',
    state: d > BATTLE_2021 ? 'fired' : 'running',
  };
}

// ───────────── 手段 ─────────────

export function mmCards(g: Game): CardDef[] {
  const s = mm(g);
  const d = g.dayIndex;
  const battle = g.isBattleDay;
  const decided = !!flag(g, 'mmQuote');
  return [
    {
      id: 'mm-hedge',
      name: s.hedge ? '停掉自动对冲' : '恢复自动对冲',
      group: '对冲',
      color: 'white',
      does: s.hedge ? '不再追着买卖股票。价格回落你省下一笔；价格接着涨，你卖出的期权就裸着。' : '每两分钟把持股拉回 delta 目标。价格往上冲时，你的买单也在推它。',
      cost: s.hedge ? '风险全在你自己身上。' : '追涨买入，回落卖出：这是对冲的成本。',
      when: 'any',
      status: s.hedge ? '自动对冲中' : '对冲停了',
    },
    {
      id: 'mm-calls',
      name: s.selling ? '停止卖出新的看涨期权' : '重新开始卖出看涨期权',
      group: '期权',
      color: 'white',
      does: s.selling ? '散户再想买看涨期权，你不接了。欠的债不再变大，也不再有新的权利金。' : '散户隔夜下的看涨期权买单，明早开盘前按收盘价上浮三成的行权价成交 200 万股，你收一笔权利金。',
      cost: s.selling ? '少赚权利金。' : '债会越滚越大。',
      when: 'night',
      status: s.selling ? '每晚照卖' : '已停卖',
      blocked: d >= BATTLE_2021 - 1 ? '明早就是决战日：不会再有新的期权买单' : undefined,
    },
    {
      id: 'mm-buyback',
      name: '回购看涨期权',
      group: '期权',
      color: 'white',
      does: `按现在的价格从散户手里买回期权，债就此了结。现在全部买回要 ${fmtYi(liability(g) * BUYBACK_COST)}。买回之后，对冲的股票也该卖掉。`,
      cost: '多付一成；价格越高，回购越贵。',
      when: 'night',
      targets: [
        { id: 'half', label: '买回一半' },
        { id: 'all', label: '全部买回' },
      ],
      blocked: !s.lots.length ? '手里没有期权空头' : d >= BATTLE_2021 ? '已经到期前一天了' : undefined,
    },
    {
      id: 'mm-wide',
      name: s.quoting === 'wide' ? '把价差收回正常' : '加宽报价',
      group: '做市',
      color: 'grey',
      does: s.quoting === 'wide' ? '回到正常价差。散户成交得更好，你赚得少一点。' : '每一笔都多赚一点价差（约 2.5 倍）。挂单变薄，价格动得更猛。',
      cost: s.quoting === 'wide' ? '订单流收入回落。' : '声望 −3：散户拿到的价更差，论坛迟早会算出来。',
      when: 'any',
      status: s.quoting === 'wide' ? '已加宽' : undefined,
      blocked: s.quoting === 'pulled' ? '报价已经撤了' : battle && decided ? '决战日的报价已经定了' : undefined,
    },
    {
      id: 'mm-invest',
      name: '向灰狼资本注资 20 亿',
      group: '人情',
      color: 'grey',
      does: '灰狼被逼到墙角，你们老板想救它：拿出 20 亿美元换它的一部分股份。它活下来，你的股份就值钱。',
      cost: '声望 −3；你一边做市、一边持有最大空头的股份——这叫利益冲突，论坛会找上门。',
      when: 'night',
      status: s.stake ? `持有 ${fmtYi(stakeValue(g))}` : undefined,
      blocked: s.stake ? '已经注资' : d < 1 || d >= BATTLE_2021 ? '只能在 25–27 日晚上' : undefined,
    },
    {
      id: 'mm-frontrun',
      name: '抢在订单流前面下单',
      group: '做市',
      color: 'black',
      does: '散户的单子先到你这里，再到市场上。你先看一眼，抢在它们前面买卖：今天剩下的时间里，价差收入翻三倍。',
      cost: '监管热度 +25；这叫“抢先交易”，每一笔都留在系统日志里。',
      when: 'trading',
      status: flag(g, `mmFront-${d}`) ? '今天正在抢跑' : undefined,
      blocked: flag(g, `mmFront-${d}`) ? '今天已经在抢跑了' : undefined,
    },
  ];
}

export function mmPlay(g: Game, id: string, target?: string): CardResult | null {
  const s = mm(g);
  const R = (title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok: true, title, effects, reply });
  switch (id) {
    case 'mm-hedge':
      s.hedge = !s.hedge;
      return R(s.hedge ? '自动对冲恢复' : '自动对冲停了', s.hedge ? [`目标持股 ${shares(hedgeTarget(g))}`] : ['期权的风险现在全在你身上']);
    case 'mm-calls':
      s.selling = !s.selling;
      return R(s.selling ? '重新开始卖看涨期权' : '不再卖新的看涨期权', s.selling ? ['每晚收一笔权利金'] : ['欠的债不再变大']);
    case 'mm-buyback': {
      const part = target === 'half' ? 0.5 : 1;
      const cost = liability(g) * BUYBACK_COST * part;
      const qty = s.lots.reduce((a, l) => a + l.qty, 0) * part;
      const p = g.player;
      p.cash -= cost;
      s.lots = part === 1 ? [] : s.lots.map((l) => ({ ...l, qty: Math.round(l.qty / 2), prem: l.prem / 2 }));
      s.boughtBack = (s.boughtBack ?? 0) + cost;
      // 对冲用的股票同一晚在盘后大宗交易里按收盘价卖掉：不然你就是裸着一大堆多头过夜
      const sell = Math.max(0, Math.min(p.pos, p.pos - hedgeTarget(g)));
      const last = g.market.last;
      p.cash += ((last - p.avg) / 100) * sell;
      p.pos -= sell;
      if (p.pos === 0) p.avg = 0;
      s.hedgeSold += sell;
      return R(`买回了 ${shares(qty)} 看涨期权`, [`付 ${fmtYi(cost)}`, `盘后按 ${usd(last)} 卖掉 ${shares(sell)} 对冲股票`, `还持有 ${shares(p.pos)}`]);
    }
    case 'mm-wide':
      if (s.quoting === 'wide') {
        setQuoting(g, 'normal');
        return R('价差收回正常', ['订单流收入回落']);
      }
      setQuoting(g, 'wide');
      g.reputation -= 3;
      return R('报价加宽了', ['每一笔多赚约 1.5 倍', '挂单变薄', '声望 −3']);
    case 'mm-invest': {
      const ex = g.market.ex;
      const gw = ex.acct('greywolf');
      g.player.cash -= 2_000_000_000;
      gw.cash += 2_000_000_000;
      s.stake = 2_000_000_000;
      s.stakeBasis = ex.equity(gw);
      g.reputation -= 3;
      g.flags.mmConflict = true;
      return R('20 亿美元打给了灰狼资本', ['你持有灰狼的一部分股份', '声望 −3'], { who: '罗文', text: '我不会忘记这件事。' });
    }
    case 'mm-frontrun':
      g.flags[`mmFront-${g.dayIndex}`] = true;
      g.flags.mmFrontDays = ((g.flags.mmFrontDays as number) || 0) + 1;
      g.addHeat(25, '抢在客户订单前面交易');
      if (g.principleId === 'no-violation') g.crossLine('利用订单流抢先交易');
      return R('你开始抢在订单流前面下单', ['今天剩下的时间里价差收入 ×3', '监管热度 +25']);
  }
  return null;
}

// ───────────── 结局 ─────────────

export function mmEnding(g: Game, close: number): { id: string; title: string; headline: string; subhead: string; body: string[]; r: number; eq: number; stats: [string, string][] } {
  const s = mm(g);
  const eq = deskEquity(g, close);
  const r = (eq - DESK) / DESK;
  const body: string[] = [];
  const owed = liability(g, close);
  const prem = s.lots.reduce((a, l) => a + l.prem, 0);
  const quote = flag(g, 'mmQuote') as string | undefined;
  let id: string;
  let title: string;
  let headline: string;
  let subhead: string;
  if (eq <= 0) {
    id = 'mm-bust';
    title = '被期权压垮';
    headline = '堡垒集团交易台巨亏 母公司紧急注资';
    subhead = '卖出的看涨期权在逼空中变成了天文数字的债';
    body.push('你卖给散户的看涨期权，在价格冲上去的时候变成了你还不起的债。对冲没跟上的每一美元，都记在了你的账上。');
  } else if (flag(g, 'mmFrontDays')) {
    id = 'mm-frontrun';
    title = '抢跑';
    headline = '证交会调查：做市商涉嫌利用散户订单流抢先交易';
    subhead = '系统日志显示，客户的单子到达之前，交易台已经先下了单';
    body.push(`你抢在客户的单子前面交易了 ${g.flags.mmFrontDays} 天。价差收入翻了几倍，系统日志也一笔不落地记下了每一次。`);
  } else if (quote === 'pull') {
    id = 'mm-pulled';
    title = '撤单';
    headline = '最大做市商在暴跌中撤单 股价断崖式下跌';
    subhead = '没有人接盘的那一个小时里，暂停一次接一次';
    body.push('你没有接住那些卖单。你一股都没沾，可市场在最需要接盘的时候，找不到接盘的人。');
  } else if (quote === 'keep') {
    id = 'mm-kept';
    title = '接住了';
    headline = '做市商照常报价 暴跌中仍有人接盘';
    subhead = `股价收于 ${usd(close)}`;
    body.push('卖单涌来的时候，你还在报价。你买进了一大堆正在下跌的股票——这是做市商的本分，也是你的风险。');
  } else {
    id = 'mm-desk';
    title = quote === 'wide' ? '加宽价差' : '收工';
    headline = quote === 'wide' ? '做市商在暴跌中加宽价差 卖出的散户拿到更差的价' : `游戏零售股收于 ${usd(close)} 做市商平稳度过这一周`;
    subhead = `股价收于 ${usd(close)}`;
    body.push(quote === 'wide' ? '你还在接盘，只是每一笔都多收了一点。论坛后来把那一个小时的成交价截了图。' : '这一周你没有站在任何一边：你卖期权、对冲、赚价差。');
  }
  body.push(`你一共卖出 ${shares(s.lots.reduce((a, l) => a + l.qty, 0))} 的看涨期权，收了 ${fmtYi(prem)} 权利金；到收盘，它们值 ${fmtYi(owed)}。`);
  body.push(`对冲一共买进 ${shares(s.hedgeBought)}、卖出 ${shares(s.hedgeSold)}。${s.hedgeBought > 10_000_000 ? '价格往上冲的那几天，你的对冲买单也是燃料的一部分。' : ''}`);
  if (s.boughtBack) body.push(`你花 ${fmtYi(s.boughtBack)} 从散户手里买回了期权。`);
  if (flag(g, 'mmBet')) body.push('27 日开盘，你停掉对冲去赌它回落。');
  body.push(`订单流价差一共赚了 ${fmtYi(s.pfof)}。`);
  if (s.stake) body.push(`你注资灰狼的 20 亿美元，现在值 ${fmtYi(stakeValue(g))}。论坛说你一边做市一边救空头；证交会后来的报告没有找到你们串通的证据，可这件事你解释了很久。`);
  const stats: [string, string][] = [
    ['交易台权益', fmtYi(eq)],
    ['收益率', `${(r * 100).toFixed(1)}%`],
    ['卖出的看涨期权', `${shares(s.lots.reduce((a, l) => a + l.qty, 0))}，收盘值 ${fmtYi(owed)}`],
    ['订单流价差', fmtYi(s.pfof)],
    ['声望', String(g.reputation)],
    ['越过底线', `${g.linesCrossed} 次`],
  ];
  return { id, title, headline, subhead, body, r, eq, stats };
}
