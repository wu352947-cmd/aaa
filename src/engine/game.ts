import { fmtYi, type Account, type RuleDeck } from './exchange';
import { Market, MINUTES_PER_DAY, minuteLabel, type DayDef, type MarketParams } from './market';
import { Rng } from './rng';
import type { Fen, OrderReq, RuleHit, Side } from './types';

// ───────────────────────────── 剧本接口 ─────────────────────────────

export type FactionId = string;
export type Verb = 'probe' | 'exchange' | 'ally' | 'betray' | 'report';

export interface Faction {
  id: FactionId;
  name: string;
  role: string;
  blurb: string;
  secretGoal: string;
  accountId: string;
  locked?: string;
}

export interface Principle {
  id: string;
  label: string;
  desc: string;
}

export interface RuleCardDef {
  id: string;
  title: string;
  plain: string;
  why: string;
  source: string;
}

export interface SourceCard {
  id: string;
  title: string;
  body: string;
  cite: string;
  url?: string;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  org: string;
  seat?: string;
  style: string;
  /** 给 LLM 的人设卡：说话方式、口头禅、身份背景（不含任何秘密） */
  persona: string;
  /** 秘密目标：玩家看不到，LLM 也看不到 */
  secretGoal: string;
  /** 底线：会拒绝越过的事 */
  bottomLine: string;
  honesty: number;
  relation: number;
  avatar: string;
  /** 该角色由玩家扮演时隐藏 */
  factionId?: FactionId;
}

export interface Npc extends NpcDef {
  memory: string[];
  /** 今晚已经交谈过的次数 */
  unreachable?: boolean;
}

export interface Intel {
  id: string;
  day: number;
  time: string;
  title: string;
  body: string;
  source: string;
  /** 隐藏可信度 0–1，玩家看不到 */
  credibility: number;
  kind: 'news' | 'rumor' | 'evidence' | 'clue' | 'mentor' | 'system';
  /** 可用于“告发”的证据所指向的 NPC */
  against?: string;
  read?: boolean;
}

export interface Alliance {
  id: string;
  npc: string;
  terms: string;
  /** 锁仓截止：第几个交易日（含） */
  lockUntilDay: number;
  /** 违约金（元） */
  penalty: number;
  brokenBy?: 'player' | string;
  brokenDay?: number;
}

/** 社交动作的引擎结算结果。dialogue 字段是交给台词层（模板或 LLM）的意图包。 */
export interface SocialOutcome {
  npc: string;
  verb: Verb;
  ok: boolean;
  /** 显示给玩家的系统结算行，如“关系 +10”“获得情报” */
  effects: string[];
  dialogue: DialogueIntent;
}

/** 台词意图包：引擎决定“说什么”，台词层只决定“怎么说” */
export interface DialogueIntent {
  npcId: string;
  verb: Verb | 'chat' | 'decision';
  /** 玩家这一句在做什么（引擎生成的白话描述） */
  playerMove: string;
  /** NPC 这次要传达的内容（可能是谎话——但这是引擎决定的） */
  convey: string[];
  tone: 'warm' | 'neutral' | 'cold' | 'evasive' | 'hostile' | 'panicked' | 'smug';
  /** 台词里允许出现的数字（价格、数量等），其他数字一律视为编造 */
  numbers: number[];
  /** 当前游戏日期时间，用来防止“说出未来” */
  date: string;
  /** 模板兜底台词 */
  fallback: string[];
}

export interface ExchangeOffer {
  id: string;
  label: string;
  cost: string;
}

export interface DecisionChoice {
  id: string;
  label: string;
  detail: string;
  danger?: boolean;
}

export interface Decision {
  id: string;
  title: string;
  body: string;
  choices: DecisionChoice[];
  /** 倒计时（秒，现实时间），到时自动选择第一个选项 */
  countdown?: number;
}

export interface Ending {
  id: string;
  title: string;
  archetype: '猎手' | '长青者' | '流星' | '蛀虫' | '出局者';
  headline: string;
  subhead: string;
  body: string[];
  history: string[];
  deviation: string[];
  stats: [string, string][];
  ruled: string;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  era: string;
  deck: RuleDeck;
  params: MarketParams;
  days: DayDef[];
  startPrice: Fen;
  factions: Faction[];
  principles: Principle[];
  npcs: NpcDef[];
  ruleCards: RuleCardDef[];
  sources: SourceCard[];
  prologue: string[];
  setup(g: Game): void;
  onDayStart(g: Game): void;
  onTick(g: Game): void;
  onDayEnd(g: Game): void;
  onNight(g: Game): void;
  offers(g: Game, npcId: string): ExchangeOffer[];
  social(g: Game, verb: Verb, npcId: string, option?: string): SocialOutcome;
  decide(g: Game, decisionId: string, choiceId: string): void;
  chatIntent(g: Game, npcId: string): DialogueIntent;
  reckon(g: Game): Ending;
}

// ───────────────────────────── 游戏状态 ─────────────────────────────

export interface Plan {
  id: number;
  label: string;
  /** 触发条件：价格 ≥ price（gte）或 ≤ price（lte）；'now' 立即执行；'at' 在当日第 price 分钟执行 */
  cond: 'gte' | 'lte' | 'now' | 'at';
  price: Fen;
  side: Side;
  qty: number;
  /** 分几分钟执行完 */
  spread: number;
  overdraw?: boolean;
  /** 执行中：剩余数量与每分钟数量 */
  remaining?: number;
  perTick?: number;
  done?: boolean;
}

export type PlayerAction =
  | { type: 'order'; req: Omit<OrderReq, 'owner'> }
  | { type: 'cancel-all' }
  | { type: 'plan-add'; plan: Omit<Plan, 'id'> }
  | { type: 'plan-remove'; id: number }
  | { type: 'social'; verb: Verb; npc: string; option?: string }
  | { type: 'decision'; id: string; choice: string }
  | { type: 'end-night' };

export interface LoggedAction {
  /** 全局分钟序号 */
  at: number;
  action: PlayerAction;
}

export interface DayRecap {
  day: number;
  date: string;
  open: Fen;
  close: Fen;
  hist: Fen;
  /** 每个群体对价格的推动（分） */
  parts: { who: string; move: number; net: number }[];
  notes: string[];
}

export type Phase = 'trading' | 'night' | 'reckoning';

export interface GameEvent {
  kind: 'rule' | 'intel' | 'decision' | 'pause' | 'margin' | 'liquidation' | 'phase';
  text: string;
  rule?: string;
  /** 规则事件：委托被挡下（true）还是违规放行（false） */
  blocked?: boolean;
}

export class Game {
  readonly market: Market;
  readonly rng: Rng;
  readonly rngSocial: Rng;
  readonly rngScript: Rng;
  phase: Phase = 'trading';
  dayIndex = 0;
  energy = 3;
  readonly maxEnergy = 3;
  npcs = new Map<string, Npc>();
  intel: Intel[] = [];
  alliances: Alliance[] = [];
  plans: Plan[] = [];
  private planSeq = 1;
  pending: OrderReq[] = [];
  log: LoggedAction[] = [];
  events: GameEvent[] = [];
  decision: Decision | null = null;
  recaps: DayRecap[] = [];
  ending: Ending | null = null;
  /** 剧本自由使用的状态 */
  flags: Record<string, number | string | boolean> = {};
  heat = 0;
  heatPeak = 0;
  reputation = 10;
  linesCrossed = 0;
  seenRules = new Set<string>();
  /** 收盘时的权益曲线（元） */
  equityCurve: number[] = [];
  marginCall = false;
  bankrupt = false;
  tape: { day: number; time: string; seat: string; side: Side; qty: number; price: Fen }[] = [];
  /** 每晚的报纸头条（引擎给事实，台词层负责措辞） */
  papers: { day: number; headline: string; sub: string; facts: string[] }[] = [];

  constructor(
    readonly scenario: Scenario,
    readonly seed: string,
    readonly factionId: FactionId,
    readonly principleId: string,
  ) {
    this.rng = new Rng(`${scenario.id}:${seed}`);
    this.rngSocial = this.rng.fork('social');
    this.rngScript = this.rng.fork('script');
    this.market = new Market(scenario.deck, scenario.params, `${scenario.id}:${seed}:market`, scenario.startPrice);
    for (const d of scenario.npcs) if (d.factionId !== factionId) this.npcs.set(d.id, { ...d, memory: [] });
    scenario.setup(this);
    this.startDay();
  }

  get faction(): Faction {
    return this.scenario.factions.find((f) => f.id === this.factionId)!;
  }
  get principle(): Principle {
    return this.scenario.principles.find((p) => p.id === this.principleId)!;
  }
  get player(): Account {
    return this.market.ex.acct(this.faction.accountId);
  }
  get day(): DayDef {
    return this.scenario.days[this.dayIndex];
  }
  get t(): number {
    return this.market.t;
  }
  get time(): string {
    return minuteLabel(Math.min(this.market.t, MINUTES_PER_DAY - 1));
  }
  get globalTick(): number {
    return this.dayIndex * (MINUTES_PER_DAY + 1) + this.market.t;
  }
  get isBattleDay(): boolean {
    return this.day.kind === 'battle';
  }

  equity(): number {
    return this.market.ex.equity(this.player);
  }
  marginNeed(): number {
    return this.market.ex.marginReq(this.player.pos);
  }

  heatTier(): number {
    return this.heat >= 80 ? 5 : this.heat >= 60 ? 4 : this.heat >= 40 ? 3 : this.heat >= 20 ? 2 : this.heat > 0 ? 1 : 0;
  }

  addHeat(n: number, why: string): void {
    const before = this.heatTier();
    this.heat = Math.min(100, this.heat + n);
    this.heatPeak = Math.max(this.heatPeak, this.heat);
    if (this.heatTier() > before) this.push({ kind: 'intel', text: `监管热度升至第 ${this.heatTier()} 级：${why}` });
  }

  crossLine(why: string): void {
    this.linesCrossed++;
    this.push({ kind: 'intel', text: `你越过了自己的底线「${this.principle.label}」：${why}` });
  }

  push(e: GameEvent): void {
    this.events.push(e);
  }

  addIntel(i: Omit<Intel, 'day' | 'time'> & { time?: string }): Intel {
    const item: Intel = { day: this.dayIndex, time: this.phase === 'night' ? '夜' : this.time, ...i };
    this.intel.unshift(item);
    this.push({ kind: 'intel', text: `${item.source}：${item.title}` });
    return item;
  }

  npc(id: string): Npc | undefined {
    return this.npcs.get(id);
  }

  relate(id: string, d: number, memory?: string): void {
    const n = this.npcs.get(id);
    if (!n) return;
    n.relation = Math.max(-100, Math.min(100, n.relation + d));
    if (memory) n.memory.push(`第${this.dayIndex + 1}天：${memory}`);
  }

  // ── 玩家动作：全部先写入动作日志，再执行，保证可以逐条重放 ──

  act(action: PlayerAction): SocialOutcome | null {
    this.log.push({ at: this.globalTick, action });
    return this.apply(action);
  }

  private apply(action: PlayerAction): SocialOutcome | null {
    switch (action.type) {
      case 'order': {
        const req = { ...action.req, owner: this.player.id } as OrderReq;
        const hits = this.market.ex.open ? [] : this.market.ex.check(req, this.player);
        if (hits.length) this.onRuleHits(hits);
        else this.pending.push(req);
        return null;
      }
      case 'cancel-all':
        this.market.ex.book.cancelWhere((o) => o.owner === this.player.id);
        return null;
      case 'plan-add':
        this.plans.push({ ...action.plan, id: this.planSeq++ });
        return null;
      case 'plan-remove':
        this.plans = this.plans.filter((p) => p.id !== action.id);
        return null;
      case 'social': {
        if (this.energy <= 0) return null;
        this.energy--;
        return this.scenario.social(this, action.verb, action.npc, action.option);
      }
      case 'decision': {
        this.decision = null;
        this.scenario.decide(this, action.id, action.choice);
        return null;
      }
      case 'end-night':
        this.endNight();
        return null;
    }
  }

  onRuleHits(hits: RuleHit[]): void {
    for (const h of hits) {
      if (h.owner !== this.player.id) continue;
      this.push({ kind: 'rule', rule: h.blocked ? h.rule : 'overdraw', blocked: h.blocked, text: (h.blocked ? '委托被挡下：' : '违规成交：') + h.detail });
      if (!h.blocked) {
        if (h.rule === 'margin') this.addHeat(6, '超额透支下单');
        if (h.rule === 'position-limit') this.addHeat(5, '超出持仓限额');
        if (this.principleId === 'no-violation' && !this.flags['line-violation-' + this.dayIndex]) {
          this.flags['line-violation-' + this.dayIndex] = true;
          this.crossLine('明知违规仍然下单');
        }
      }
    }
  }

  // ── 时间推进 ──

  private startDay(): void {
    this.phase = 'trading';
    this.energy = this.maxEnergy;
    this.market.beginDay(this.day, this.dayIndex);
    this.scenario.onDayStart(this);
    this.cureOrLiquidate();
    this.push({ kind: 'phase', text: `${this.day.date} ${this.day.label} 开盘` });
  }

  /** 前一晚收到追保通知、开盘仍未补足的，交易所按缺口比例强平 */
  private cureOrLiquidate(): void {
    if (!this.marginCall) return;
    const ex = this.market.ex;
    const a = this.player;
    const eq = ex.equity(a);
    const need = ex.marginReq(a.pos);
    if (eq >= need) {
      this.marginCall = false;
      return;
    }
    const frac = Math.min(1, eq <= 0 ? 1 : 1 - eq / need);
    const r = ex.liquidate(a.id, frac);
    this.marginCall = false;
    this.push({ kind: 'liquidation', rule: 'forced-liquidation', text: `追保未到位，交易所开盘强制平仓 ${r?.filled.toLocaleString() ?? 0} 口` });
  }

  /** 推进一分钟。返回 false 表示当天已收盘。 */
  tick(): boolean {
    if (this.phase !== 'trading' || this.decision || this.ending) return false;
    if (this.market.dayOver) {
      this.closeDay();
      return false;
    }
    const orders = this.pending.splice(0);
    orders.push(...this.runPlans());
    const rep = this.market.step(orders);
    this.onRuleHits(rep.hits);
    // 逐笔成交：同一主动方在同一分钟的成交合并为一笔，大单才显示席位号
    const agg = new Map<string, { side: Side; qty: number; notional: number }>();
    for (const tr of rep.trades) {
      const owner = tr.aggressor === 'buy' ? tr.buyer : tr.seller;
      const key = owner + tr.aggressor;
      const e = agg.get(key) ?? { side: tr.aggressor, qty: 0, notional: 0 };
      e.qty += tr.qty;
      e.notional += tr.qty * tr.price;
      agg.set(key, e);
    }
    for (const [key, e] of agg) {
      if (e.qty < this.tapeThreshold()) continue;
      const acct = this.market.ex.accounts.get(key.slice(0, -e.side.length));
      if (!acct?.seat) continue;
      this.tape.unshift({ day: this.dayIndex, time: minuteLabel(this.market.t - 1), seat: acct.seat, side: e.side, qty: e.qty, price: Math.round(e.notional / e.qty) });
    }
    if (this.tape.length > 200) this.tape.length = 200;
    this.intradayRisk();
    this.scenario.onTick(this);
    if (this.market.dayOver && !this.decision) this.closeDay();
    return true;
  }

  tapeThreshold(): number {
    return Math.round(this.day.vDay * 0.004);
  }

  private runPlans(): OrderReq[] {
    const out: OrderReq[] = [];
    const last = this.market.last;
    for (const p of this.plans) {
      if (p.done) continue;
      if (p.remaining == null) {
        const hit =
          p.cond === 'now' ||
          (p.cond === 'at' ? this.market.t >= p.price : p.cond === 'gte' ? last >= p.price : last <= p.price);
        if (!hit) continue;
        p.remaining = p.qty;
        p.perTick = Math.ceil(p.qty / Math.max(1, p.spread));
        this.push({ kind: 'intel', text: `计划书「${p.label}」开始执行` });
      }
      const q = Math.min(p.remaining, p.perTick!);
      out.push({ owner: this.player.id, side: p.side, qty: q, type: 'market', overdraw: p.overdraw });
      p.remaining -= q;
      if (p.remaining <= 0) p.done = true;
    }
    return out;
  }

  /** 盘中风控：按做市中枢估值（避免被单笔跳价误伤），权益跌穿零即穿仓，交易所立即强平 */
  private intradayRisk(): void {
    const ex = this.market.ex;
    const mark = Math.round(this.market.reference);
    for (const a of ex.accounts.values()) {
      if (a.exempt || a.pos === 0) continue;
      if (ex.equity(a, mark) < 0) {
        const r = ex.liquidate(a.id);
        if (a.id === this.player.id) {
          this.bankrupt = true;
          this.push({ kind: 'liquidation', rule: 'forced-liquidation', text: `权益跌穿零，交易所强制平仓 ${r?.filled.toLocaleString()} 口` });
        } else {
          this.flags[`bust-${a.id}`] = this.time;
        }
      }
    }
  }

  /** 收盘：剧本可以先改写结算价（例如交易所宣布部分交易无效） */
  closeDay(settle?: Fen): void {
    const m = this.market;
    if (this.phase !== 'trading') return;
    const open = m.bars[0]?.o ?? m.last;
    const contributions = new Map(m.ex.contributions);
    const netByOwner = new Map<string, number>();
    for (const tr of m.ex.trades) {
      if (tr.tick <= m.ex.tick - m.bars.length) continue;
      netByOwner.set(tr.buyer, (netByOwner.get(tr.buyer) ?? 0) + tr.qty);
      netByOwner.set(tr.seller, (netByOwner.get(tr.seller) ?? 0) - tr.qty);
    }
    this.scenario.onDayEnd(this);
    if (this.ending) return;
    const price = settle ?? (this.flags['settle'] as number | undefined) ?? m.last;
    delete this.flags['settle'];
    m.closeDay(price);
    this.pending = [];
    this.plans = this.plans.filter((p) => !p.done && p.remaining == null);

    const groups = new Map<string, { move: number; net: number }>();
    for (const [g, mv] of contributions) groups.set(g, { move: mv, net: 0 });
    for (const [owner, net] of netByOwner) {
      const g = m.ex.accounts.get(owner)?.group ?? owner;
      const e = groups.get(g) ?? { move: 0, net: 0 };
      e.net += net;
      groups.set(g, e);
    }
    this.recaps.push({
      day: this.dayIndex,
      date: this.day.date,
      open,
      close: price,
      hist: this.day.hist[this.day.hist.length - 1],
      parts: [...groups.entries()].map(([who, v]) => ({ who, ...v })).sort((a, b) => Math.abs(b.move) - Math.abs(a.move)),
      notes: [],
    });

    const ex = m.ex;
    const eq = ex.equity(this.player);
    this.equityCurve.push(eq);
    if (this.player.pos !== 0 && eq < ex.marginReq(this.player.pos)) {
      this.marginCall = true;
      this.push({
        kind: 'margin',
        rule: 'daily-settlement',
        text: `逐日盯市后权益 ${fmtYi(eq)}，低于所需保证金 ${fmtYi(ex.marginReq(this.player.pos))}：明早开盘前须补足，否则强制平仓`,
      });
    }
    if (this.dayIndex >= this.scenario.days.length - 1 || this.bankrupt) {
      this.phase = 'reckoning';
      this.ending = this.scenario.reckon(this);
      return;
    }
    this.phase = 'night';
    this.energy = this.maxEnergy;
    this.heat = Math.max(this.heatPeak * 0.3, this.heat - 1);
    this.scenario.onNight(this);
  }

  private endNight(): void {
    if (this.phase !== 'night') return;
    this.dayIndex++;
    this.startDay();
  }

  // ── 便捷方法 ──

  addPlanFromScript(plan: Omit<Plan, 'id'>): void {
    this.plans.push({ ...plan, id: this.planSeq++ });
  }

  /** 状态摘要哈希：同一种子 + 同一串动作必须得到同一个值 */
  stateHash(): string {
    const ex = this.market.ex;
    const parts: (string | number)[] = [this.dayIndex, this.market.t, ex.last, ex.trades.length, this.heat.toFixed(4), this.reputation];
    for (const a of [...ex.accounts.values()].sort((x, y) => x.id.localeCompare(y.id))) parts.push(a.id, a.pos, a.cash.toFixed(2));
    for (const n of [...this.npcs.values()].sort((x, y) => x.id.localeCompare(y.id))) parts.push(n.id, n.relation);
    parts.push(...this.market.closePrices);
    let h = 2166136261 >>> 0;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16);
  }
}

/** 按动作日志重放一局：服务端校验排行榜、每日挑战与录像都靠它 */
export function replay(scenario: Scenario, seed: string, faction: FactionId, principle: string, log: LoggedAction[], untilTick = Infinity): Game {
  const g = new Game(scenario, seed, faction, principle);
  let i = 0;
  const flush = () => {
    while (i < log.length && log[i].at <= g.globalTick) g.act(log[i++].action);
  };
  for (let guard = 0; guard < 100000; guard++) {
    flush();
    if (g.ending || g.globalTick >= untilTick) break;
    if (g.phase === 'trading') {
      if (g.decision) {
        // 日志里应当有决策动作；若没有，按默认选项继续，避免死循环
        if (i < log.length) g.act(log[i++].action);
        else g.act({ type: 'decision', id: g.decision.id, choice: g.decision.choices[0].id });
        continue;
      }
      g.tick();
    } else if (g.phase === 'night') {
      if (i < log.length) g.act(log[i++].action);
      else g.act({ type: 'end-night' });
    } else break;
  }
  return g;
}
