import { fmtYi, setUnits, UNITS, type Account, type RuleDeck } from './exchange';
import { Market, SSE_1995, type DayDef, type MarketParams, type Session } from './market';
import { optKey, price as optPrice, quote as optQuote, type OptionSpec, type OptKind, type OptPosition } from './options';
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
  /** 不下单、只监管的座位（交易所官员） */
  observer?: boolean;
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
  /** 读报读出来的看法：+1 看多、−1 看空。按 style 解读同一张报纸（见 STYLE_READ） */
  view?: number;
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
  kind: 'news' | 'rumor' | 'evidence' | 'clue' | 'mentor' | 'system' | 'victim';
  /** 可用于“告发”的证据所指向的 NPC */
  against?: string;
  /** 消息树：这条消息从源头到你经过的每一环；altered 表示在这一环被改动或编造 */
  chain?: { who: string; said: string; altered?: boolean }[];
  read?: boolean;
}

/**
 * 开局条件。生涯模式里，上一章的钱、声望和监管档案带进下一章。
 * 和种子一起进存档与重放：同样的 opts + 同样的种子 + 同样的操作 = 同一局。
 */
export interface GameOpts {
  /** 玩家的起始现金（剧本货币）；只有剧本支持的座位生效 */
  cash?: number;
  reputation?: number;
  /** 监管档案：开局热度，也是热度降不下去的底 */
  heat?: number;
  /** 这一局是生涯里的一章 */
  career?: boolean;
  /** 从第几天开始（跳过前面的章节）；剧本在 setup 里据此调整开局 */
  startDay?: number;
}

export interface Chapter {
  id: string;
  title: string;
  sub: string;
  /** 这一章最后一天在 days 里的下标 */
  until: number;
}

/** 一章开始时的账面：章末小结拿它比 */
export interface ChapterMark {
  eq: number;
  heat: number;
  rep: number;
  lines: number;
  letters: number;
}

/** 一期报纸。tone：这期报纸整体有多看多（+1）或看空（−1）；spun：塞稿的人 */
export interface Paper {
  day: number;
  headline: string;
  sub: string;
  facts: string[];
  tone?: number;
  spun?: string[];
}

/**
 * 不同风格的人怎么读同一张报纸：1 跟着报纸走，−1 反着报纸走，0 不看报纸。
 * 剧本里没列出的风格一律当作不看报纸。
 */
export const STYLE_READ: Record<string, number> = {
  消息驱动: 1,
  机会主义: 1,
  动员: 1,
  消息贩子: 1,
  增长: 0.5,
  经验: 0.3,
  逆向: -1,
  基本面做空: -1,
};

/** 一次黑色操作：黑牌、违规成交、被监察抓到的对倒与虚假申报、剧本里危险的抉择 */
/** 引擎自己认得的轻一档的黑色操作；剧本自定的原因都算重的 */
export const MINOR_DEEDS = ['overdraw', 'wash-trade', 'spoofing', 'marking-close'];

export interface DarkDeed {
  /** 'card' | 'overdraw' | 'wash-trade' | 'spoofing' | 'marking-close' | 剧本自定的 id */
  cause: string;
  /** 给玩家看的名字，例如牌名 */
  label: string;
  day: number;
}

/** 受害者视角：一封信、一条爆仓消息 */
export interface Victim {
  from: string;
  title: string;
  body: string;
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

/**
 * 行动卡：每个座位手里能打出的“手段”。白色合规，灰色游走在边缘，黑色违法。
 * 卡面只写三件事：它做什么、要付出什么、什么时候能用。
 */
export type CardColor = 'white' | 'grey' | 'black';

export interface CardDef {
  id: string;
  name: string;
  /** 分组标题，如“盘中风控”“政策协调” */
  group: string;
  color: CardColor;
  /** 一句话效果 */
  does: string;
  /** 代价（显示用；实际扣除由剧本结算） */
  cost: string;
  when: 'trading' | 'night' | 'any';
  /** 需要选择对象时的选项 */
  targets?: { id: string; label: string }[];
  /** 现在不能用的原因 */
  blocked?: string;
  /** 已生效的状态，如“已提高到 5%” */
  status?: string;
  /** 交易屏上的快捷键（同时显示为快捷按钮） */
  key?: string;
  /** 手牌：不打出，也可以换算成本钱，如“+1 点政治资本” */
  convert?: string;
  /** 对手的牌：自己用不了，换算时触发对手的事件（这里写触发什么） */
  foe?: string;
}

/**
 * 对手的进度钟：人物正在推进的计划。满格时计划落地。
 * 没摸清之前只看得到“有人在准备什么”；打听、稽查之后才知道是什么、怎么拦。
 */
export interface Clock {
  id: string;
  /** 谁的计划（人物 id，用来画头像） */
  who: string;
  name: string;
  segs: number;
  filled: number;
  known: boolean;
  /** 满格时会发生什么 */
  then: string;
  /** 眼下的盘算（摸清之后才显示） */
  now?: string;
  /** 怎么打断、推迟或利用它 */
  counter?: string;
  tone: 'threat' | 'friend' | 'neutral';
  state?: 'running' | 'fired' | 'defused';
}

/** 上级指示：早上下来，收盘或第二天见分晓 */
export interface Directive {
  id: string;
  day: number;
  /** 下指示的人物 id */
  from: string;
  text: string;
  /** 办到与办砸的后果 */
  stakes: string;
  status: 'open' | 'met' | 'failed';
  verdict?: string;
}

/** 案头文书：一张要逐行核对、签字的报表 */
export interface DocSheet {
  id: string;
  title: string;
  from: string;
  note: string;
  cols: string[];
  /** 每一列从哪里来：申报的（可能有假）还是结算部的（可靠） */
  colSource?: ('reported' | 'cleared' | 'label')[];
  rows: { id: string; cells: string[] }[];
  /** 每一行能下的结论；第一项是默认（无误） */
  marks: { id: string; label: string }[];
  /** 签过之后：每行的结论与结算 */
  filed?: { marks: Record<string, string>; result: CardResult };
}

/** 每晚选卡：从这个座位的牌堆里发三张，收下一张进手牌 */
export interface DraftRules {
  /** 这个座位的整副牌（含当前是否被挡住） */
  deck(g: Game): CardDef[];
  /** 今晚能不能发这张 */
  offerable(g: Game, c: CardDef): boolean;
  /** 不打出，换算成本钱 */
  convert(g: Game, id: string): CardResult;
  /** 每晚发几张（默认 3） */
  size?: number;
}

export interface CardResult {
  ok: boolean;
  /** 结算标题，如“临时停市 15 分钟” */
  title: string;
  /** 结算行，如“政治资本 −1”“申江证券 关系 −25” */
  effects: string[];
  /** 一句对方的反应（可选） */
  reply?: { who: string; text: string };
}

/** 顶栏指标：剧本可以为不同座位换上自己的指标 */
export interface Meter {
  id: string;
  label: string;
  /** 文本值；与 pips 二选一 */
  value?: string;
  /** 点数条：on / of */
  pips?: { on: number; of: number; tone?: 'heat' | 'good' };
  tip: string;
  tone?: 'good' | 'bad';
}

export interface Ending {
  id: string;
  title: string;
  archetype: '猎手' | '长青者' | '流星' | '蛀虫' | '出局者' | '守门人' | '旁观者';
  headline: string;
  subhead: string;
  body: string[];
  history: string[];
  deviation: string[];
  stats: [string, string][];
  ruled: string;
}

/**
 * 夜里的推理：对着证据（比如各席位逐日的净买卖）回答几个问题。
 * 每试一次花 1 点精力，只告诉你对了几个，不告诉你哪几个对了。
 */
export interface Puzzle {
  id: string;
  title: string;
  intro: string;
  /** 证据表：表头 + 每行 */
  evidence: { head: string[]; rows: string[][]; note?: string };
  questions: { id: string; label: string; options: { id: string; label: string }[] }[];
  /** 解开之后能拿到什么 */
  reward: string;
  solved: boolean;
}

export interface PuzzleResult {
  right: number;
  total: number;
  solved: boolean;
  text: string[];
}

export interface Scenario {
  /** 夜里可以做的推理（没有就是 null） */
  puzzle?(g: Game): Puzzle | null;
  /** 交卷：返回对了几个；解开时由剧本发放奖励 */
  solvePuzzle?(g: Game, id: string, answers: Record<string, string>): PuzzleResult;
  /** 分章：每章到哪一天（真实下标）为止。章末那一晚有一张小结 */
  chapters?: Chapter[];
  /** 股东名册：控制权之争里谁手里有多少票（持股比例 0–1） */
  holders?(g: Game): { id: string; name: string; pct: number; note?: string; you?: boolean }[];
  /** 今晚过后是第几天（默认明天）；只能往后跳 */
  nextDay?(g: Game): number | undefined;
  /** 受害者视角：每次黑色操作之后，那一头是谁、丢了什么（设计文档 6.4） */
  victim?(g: Game, deed: DarkDeed): Victim | null;
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
  /** 交易标的的称呼，如“327 合约” */
  instrument?: string;
  /** 交易时段（默认 1995 年上交所） */
  session?: Session;
  /** 数量与货币单位（默认“口”“元”） */
  units?: { qty: string; cur: string };
  /** 台词层的年代风格包 id */
  eraId?: string;
  /** 夜间报纸与结局页的报名 */
  paperName?: string;
  /** 结局页报纸的日期 */
  endingDate?: string;
  /** 选阵营页展示的规则卡 */
  setupRules?: string[];
  /** 监管座位能看到的会员账户 */
  members?: string[];
  /** 下单面板里的快捷数量（机构座位） */
  lotPresets?: number[];
  /** 当前座位手里的行动卡 */
  cards?(g: Game): CardDef[];
  /** 打出一张卡。只在 cards() 里出现且未被 blocked 时才会被调用。 */
  playCard?(g: Game, id: string, target?: string): CardResult;
  /** 顶栏指标；不提供时显示权益、监管热度与声望 */
  meters?(g: Game): Meter[] | undefined;
  /** 对手动向：各人物计划的进度钟 */
  clocks?(g: Game): Clock[];
  /** 上级指示（监管座位） */
  directives?(g: Game): Directive[];
  /** 今晚案头要核对的文书 */
  docs?(g: Game): DocSheet[];
  /** 在文书上签字：marks 是每一行的结论 */
  fileDoc?(g: Game, id: string, marks: Record<string, string>): CardResult;
  /** 每晚选卡 */
  draft?: DraftRules;
  /** 场外配资：这个座位能向谁借、借几倍、平仓线在哪 */
  credit?(g: Game): CreditOffer | null;
  /** 场内期权：这个座位能不能交易、交易什么 */
  options?(g: Game): OptionSpec | null;
  /** 卖期权给玩家、并替这些期权做 delta 对冲的做市商账户 */
  optionsDealer?: string;
  /** 玩家账户外的其他资产（例如现券）的市值，计入权益 */
  extraValue?(g: Game): number;
  /** 复盘与逐笔里怎么称呼一个群体或账户 */
  groupName?(g: Game, who: string): string;
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
  /** 同一组里一张触发，其余的撤掉（止损与止盈） */
  oco?: number;
  /** 只平仓：触发时按当时的持仓数量平掉，不会反手开出新仓 */
  closeOnly?: boolean;
  /** 执行中：剩余数量与每分钟数量 */
  remaining?: number;
  perTick?: number;
  done?: boolean;
}

/** 场外配资 / 营业部垫资：钱借给你，平仓线由出借方说了算 */
export interface CreditLine {
  lender: string;
  /** 借来的钱 */
  loan: number;
  /** 平仓线：权益 ≤ 借款 × line 时，出借方立即替你平仓并收回借款 */
  line: number;
  /** 日利率 */
  rate: number;
  /** 一共付了多少利息 */
  paid: number;
}

/** 剧本提供的配资条件 */
export interface CreditOffer {
  lender: string;
  /** 最多借自有资金的几倍：自有资金按当天开盘前的净值算，盘中赚的不算 */
  multiple: number;
  /** 借款总额的上限（出借方自己的额度） */
  cap?: number;
  line: number;
  rate: number;
  color: CardColor;
  note: string;
}

export type PlayerAction =
  | { type: 'order'; req: Omit<OrderReq, 'owner'> }
  | { type: 'cancel-all' }
  | { type: 'cancel'; id: number }
  | { type: 'plan-add'; plan: Omit<Plan, 'id'> }
  | { type: 'plan-remove'; id: number }
  | { type: 'social'; verb: Verb; npc: string; option?: string }
  | { type: 'decision'; id: string; choice: string }
  | { type: 'card'; id: string; target?: string }
  | { type: 'convert'; id: string }
  | { type: 'draft'; id: string | null }
  | { type: 'credit'; op: 'take' | 'repay'; amount: number }
  | { type: 'option'; side: 'buy' | 'sell'; kind: OptKind; strike: Fen; expiry: string; qty: number }
  | { type: 'doc'; id: string; marks: Record<string, string> }
  | { type: 'puzzle'; id: string; answers: Record<string, string> }
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
  kind: 'rule' | 'intel' | 'decision' | 'pause' | 'margin' | 'liquidation' | 'phase' | 'card';
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
  /** 难度只改界面与节奏，不进 stateHash：同一种子在任何难度下都是同一个市场 */
  difficulty = 'standard';
  /** 新手档撤回过几天 */
  undos = 0;
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
  /** 每个推理题交过的卷（界面显示“对了几个”） */
  puzzleTries: Record<string, PuzzleResult[]> = {};
  bankrupt = false;
  tape: { day: number; time: string; seat: string; side: Side; qty: number; price: Fen }[] = [];
  /** 每晚的报纸头条（引擎给事实，台词层负责措辞） */
  papers: Paper[] = [];
  /** 今晚有人往明早的报纸里塞的稿子 */
  private spins: { tone: number; headline: string; by: string }[] = [];
  /** 打过的行动卡与结算结果 */
  /** 所有黑色操作，按发生顺序 */
  darkDeeds: DarkDeed[] = [];
  /** 已经回过音的黑色操作 */
  private lettered = new Set<string>();
  cardLog: { day: number; time: string; id: string; name: string; target?: string; result: CardResult }[] = [];
  /** 手牌：每晚选来的一次性卡 */
  hand: string[] = [];
  /** 今晚发到面前、还没选的牌 */
  offer: string[] | null = null;
  /** 收下过的牌（不会再发） */
  drafted: string[] = [];
  readonly maxHand = 3;
  private readonly rngDraft: Rng;
  /** 场外配资（没有借就是 null） */
  credit: CreditLine | null = null;
  /** 每章开始时的账面（章 id → 账面） */
  chapterMarks: Record<string, ChapterMark> = {};
  /** 今天开盘前的净值：场外配资按它算能借多少 */
  creditBase = 0;
  /** 买入的期权 */
  opts: OptPosition[] = [];
  /** 做市商为玩家的期权持有的对冲股数 */
  dealerHedge = 0;

  constructor(
    readonly scenario: Scenario,
    readonly seed: string,
    readonly factionId: FactionId,
    readonly principleId: string,
    readonly setupOpts: GameOpts = {},
  ) {
    this.rng = new Rng(`${scenario.id}:${seed}`);
    this.rngSocial = this.rng.fork('social');
    this.rngScript = this.rng.fork('script');
    this.rngDraft = this.rng.fork('draft');
    // 规则卡组按局复制：监管者盘中调整保证金只影响这一局
    setUnits(scenario.units ?? { qty: '口', cur: '元' });
    this.market = new Market({ ...scenario.deck }, scenario.params, `${scenario.id}:${seed}:market`, scenario.startPrice, scenario.session ?? SSE_1995);
    for (const d of scenario.npcs) if (d.factionId !== factionId) this.npcs.set(d.id, { ...d, memory: [] });
    this.dayIndex = Math.max(0, Math.min(scenario.days.length - 1, setupOpts.startDay ?? 0));
    scenario.setup(this);
    if (setupOpts.reputation != null) this.reputation = setupOpts.reputation;
    // 旧账带进来：热度只降不清零
    if (setupOpts.heat) this.heat = this.heatPeak = setupOpts.heat;
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
    return this.market.session.label(this.market.t);
  }
  get globalTick(): number {
    return this.dayIndex * (this.market.session.minutes + 1) + this.market.t;
  }
  get isBattleDay(): boolean {
    return this.day.kind === 'battle';
  }
  /** 余波：决战之后不再开盘的日子，只有夜晚 */
  get isAftermath(): boolean {
    return this.day.kind === 'aftermath';
  }
  /** 停牌：剧本中途不开盘的日子，只有夜晚（谈判、董事会、股东大会） */
  get isHalted(): boolean {
    return this.day.kind === 'halt';
  }

  /** 当前能打出的行动卡（含被挡住的，供界面显示原因） */
  cards(): CardDef[] {
    return [...this.handCards(), ...(this.scenario.cards?.(this) ?? [])];
  }

  /** 手牌按收下的顺序排；对手的牌只能换算 */
  handCards(): CardDef[] {
    const deck = this.scenario.draft?.deck(this) ?? [];
    return this.hand
      .map((id) => deck.find((c) => c.id === id))
      .filter((c): c is CardDef => !!c)
      .map((c) => ({ ...c, group: '手牌', blocked: c.foe ? '对手的牌：只能换算' : c.blocked }));
  }

  /** 今晚发到面前的牌 */
  offerCards(): CardDef[] {
    const deck = this.scenario.draft?.deck(this) ?? [];
    return (this.offer ?? []).map((id) => deck.find((c) => c.id === id)).filter((c): c is CardDef => !!c);
  }

  private dealOffer(): void {
    const dr = this.scenario.draft;
    this.offer = null;
    if (!dr || this.ending) return;
    const pool = dr.deck(this).filter((c) => !this.drafted.includes(c.id) && dr.offerable(this, c));
    const out: string[] = [];
    while (out.length < (dr.size ?? 3) && pool.length) out.push(pool.splice(Math.floor(this.rngDraft.next() * pool.length), 1)[0].id);
    if (out.length) this.offer = out;
  }

  /** 这张卡此刻能不能打：时段、是否被挡住、对象是否合法 */
  canPlay(id: string, target?: string): string | null {
    const c = this.cards().find((x) => x.id === id);
    if (!c) return '没有这张卡';
    if (c.blocked) return c.blocked;
    if (this.decision || this.ending) return '现在不能出手';
    if (c.when === 'trading' && (this.phase !== 'trading' || !this.market.ex.open)) return '只能在盘中使用';
    if (c.when === 'night' && this.phase !== 'night') return '只能在收盘后使用';
    if (c.targets && !c.targets.some((t) => t.id === target)) return '先选一个对象';
    return null;
  }

  /** 自己的钱：账户权益减去场外借来的钱 */
  netEquity(p = this.market.last): number {
    return this.market.ex.equity(this.player, p) - (this.credit?.loan ?? 0);
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
        this.market.ex.noteCancelled(this.market.ex.book.cancelWhere((o) => o.owner === this.player.id));
        return null;
      case 'cancel':
        this.market.ex.noteCancelled(this.market.ex.book.cancelWhere((o) => o.owner === this.player.id && o.id === action.id));
        return null;
      case 'plan-add':
        this.plans.push({ ...action.plan, id: this.planSeq++ });
        return null;
      case 'plan-remove':
        this.plans = this.plans.filter((p) => p.id !== action.id);
        return null;
      case 'puzzle': {
        const pz = this.scenario.puzzle?.(this);
        if (this.phase !== 'night' || this.energy <= 0 || !pz || pz.id !== action.id || pz.solved || !this.scenario.solvePuzzle) return null;
        this.energy--;
        const r = this.scenario.solvePuzzle(this, action.id, action.answers);
        this.puzzleTries[action.id] = [...(this.puzzleTries[action.id] ?? []), r];
        this.push({ kind: 'intel', text: r.solved ? `推理：${pz.title}——全对` : `推理：${pz.title}——对了 ${r.right} / ${r.total}` });
        return null;
      }
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
      case 'card': {
        const why = this.canPlay(action.id, action.target);
        const card = this.cards().find((x) => x.id === action.id);
        if (why || !card || !this.scenario.playCard) {
          if (card) this.push({ kind: 'card', text: `${card.name}：${why}` });
          return null;
        }
        const result = this.scenario.playCard(this, action.id, action.target);
        this.hand = this.hand.filter((x) => x !== action.id);
        this.logCard(card, result, action.target);
        if (card.color === 'black' && result.ok) this.darkDeed('card', card.name);
        this.markOptions();
        return null;
      }
      case 'convert': {
        const dr = this.scenario.draft;
        const card = this.handCards().find((x) => x.id === action.id);
        if (!dr || !card || this.decision || this.ending) return null;
        const result = dr.convert(this, action.id);
        this.hand = this.hand.filter((x) => x !== action.id);
        this.logCard(card, result);
        return null;
      }
      case 'draft': {
        if (!this.offer || this.phase !== 'night') return null;
        if (action.id) {
          if (!this.offer.includes(action.id) || this.hand.length >= this.maxHand) return null;
          this.hand.push(action.id);
          this.drafted.push(action.id);
        }
        this.offer = null;
        return null;
      }
      case 'doc': {
        const doc = this.scenario.docs?.(this).find((d) => d.id === action.id);
        if (!doc || doc.filed || !this.scenario.fileDoc) return null;
        const result = this.scenario.fileDoc(this, action.id, action.marks);
        this.logCard({ id: action.id, name: doc.title }, result);
        return null;
      }
      case 'credit': {
        const offer = this.scenario.credit?.(this);
        if (!offer || this.ending) return null;
        const p = this.player;
        if (action.op === 'take') {
          // 出借方按开盘前的账看你的本钱：盘中的浮盈不算，不然越赚越能借、越借越能赚
          const own = Math.min(this.netEquity(), this.creditBase);
          const room = Math.max(0, Math.min(own * offer.multiple, offer.cap ?? Infinity) - (this.credit?.loan ?? 0));
          const amt = Math.min(Math.max(0, action.amount), room);
          if (amt <= 0) return null;
          p.cash += amt;
          this.credit = { lender: offer.lender, loan: (this.credit?.loan ?? 0) + amt, line: offer.line, rate: offer.rate, paid: this.credit?.paid ?? 0 };
          if (offer.color !== 'white') this.addHeat(offer.color === 'black' ? 8 : 2, `向${offer.lender}借钱加杠杆`);
          this.push({ kind: 'intel', text: `${offer.lender}借给你 ${fmtYi(amt)}：权益跌到借款的 ${Math.round(offer.line * 100)}% 时，对方立即平仓收回` });
        } else if (this.credit) {
          const amt = Math.min(Math.max(0, action.amount), this.credit.loan, Math.max(0, p.cash));
          if (amt <= 0) return null;
          p.cash -= amt;
          this.credit.loan -= amt;
          this.push({ kind: 'intel', text: `还给${this.credit.lender} ${fmtYi(amt)}` });
          if (this.credit.loan <= 1) this.credit = { ...this.credit, loan: 0 };
        }
        return null;
      }
      case 'option':
        this.tradeOption(action);
        return null;
      case 'end-night':
        this.endNight();
        return null;
    }
  }

  // ── 期权 ──

  /** 离到期还有多少年：按交易日算，当天收盘到期 */
  optYears(expiry: string): number {
    const e = this.scenario.options?.(this)?.expiries.find((x) => x.id === expiry);
    if (!e) return 0;
    const frac = this.phase === 'trading' ? this.market.t / this.market.session.minutes : 1;
    return Math.max(0, e.day - this.dayIndex + 1 - frac) / 252;
  }

  /** 一个合约的报价（每股美元）与 delta */
  optQuote(kind: OptKind, strike: Fen, expiry: string, s: Fen = this.market.last): { mid: number; bid: number; ask: number; delta: number } {
    const spec = this.scenario.options?.(this);
    if (!spec) return { mid: 0, bid: 0, ask: 0, delta: 0 };
    const p = optPrice(kind, s, strike, this.optYears(expiry), spec.iv(this.dayIndex));
    return { mid: p.value, ...optQuote(p.value, spec.spread), delta: p.delta };
  }

  /** 持有的期权按中间价的市值 */
  optValue(s: Fen = this.market.last): number {
    const spec = this.scenario.options?.(this);
    if (!spec) return 0;
    return this.opts.reduce((a, o) => a + o.qty * spec.size * this.optQuote(o.kind, o.strike, o.expiry, s).mid, 0);
  }

  /** 期权和剧本里的其他资产按市价计入权益 */
  markOptions(): void {
    const other = this.scenario.extraValue?.(this) ?? 0;
    if (this.opts.length || this.player.extra || other) this.player.extra = this.optValue() + other;
  }

  private tradeOption(a: Extract<PlayerAction, { type: 'option' }>): void {
    const spec = this.scenario.options?.(this);
    if (!spec || !this.market.ex.open || this.decision || this.ending || a.qty <= 0) return;
    if (!spec.expiries.some((e) => e.id === a.expiry) || !spec.strikes.includes(a.strike)) return;
    const q = this.optQuote(a.kind, a.strike, a.expiry);
    const key = optKey(a);
    let pos = this.opts.find((o) => optKey(o) === key);
    const p = this.player;
    if (a.side === 'buy') {
      const cost = q.ask * spec.size * a.qty;
      if (cost > Math.max(0, p.cash)) {
        this.push({ kind: 'rule', rule: 'option-cash', blocked: true, text: `买期权要付现金：${fmtYi(cost)}，你只有 ${fmtYi(p.cash)}` });
        return;
      }
      p.cash -= cost;
      if (!pos) this.opts.push((pos = { kind: a.kind, strike: a.strike, expiry: a.expiry, qty: 0, cost: 0 }));
      pos.qty += a.qty;
      pos.cost += cost;
    } else {
      if (!pos || pos.qty <= 0) return;
      const n = Math.min(a.qty, pos.qty);
      p.cash += q.bid * spec.size * n;
      pos.cost -= (pos.cost * n) / pos.qty;
      pos.qty -= n;
      if (!pos.qty) this.opts = this.opts.filter((o) => o !== pos);
    }
    this.markOptions();
  }

  /** 做市商：玩家买了多少期权，它就替这些期权按 delta 对冲多少股票 */
  private dealerOrders(): OrderReq[] {
    const dealer = this.scenario.optionsDealer;
    const spec = this.scenario.options?.(this);
    if (!dealer || !spec || this.market.t % 2 !== 0) return [];
    const target = Math.round(this.opts.reduce((a, o) => a + o.qty * spec.size * this.optQuote(o.kind, o.strike, o.expiry).delta, 0));
    const diff = target - this.dealerHedge;
    const cap = Math.round((this.day.vDay / this.market.session.minutes) * spec.hedgeCap);
    if (Math.abs(diff) < Math.max(100, Math.abs(target) * 0.02)) return [];
    const q = Math.min(Math.abs(diff), cap);
    this.dealerHedge += Math.sign(diff) * q;
    return [{ owner: dealer, side: diff > 0 ? 'buy' : 'sell', qty: q, type: 'market' }];
  }

  /** 收盘时到期的期权按收盘价行权了结 */
  private expireOptions(close: Fen): void {
    const spec = this.scenario.options?.(this);
    if (!spec || !this.opts.length) return;
    const due = spec.expiries.filter((e) => e.day === this.dayIndex).map((e) => e.id);
    for (const o of this.opts.filter((x) => due.includes(x.expiry))) {
      const v = optPrice(o.kind, close, o.strike, 0, 1).value * spec.size * o.qty;
      this.player.cash += v;
      this.push({ kind: 'intel', text: `${o.kind === 'call' ? '看涨' : '看跌'}期权（行权价 ${(o.strike / 100).toFixed(0)}）到期：${v > 0 ? `行权了结 ${fmtYi(v)}` : '一文不值'}` });
    }
    this.opts = this.opts.filter((x) => !due.includes(x.expiry));
  }

  private logCard(card: { id: string; name: string }, result: CardResult, target?: string): void {
    this.cardLog.push({ day: this.dayIndex, time: this.phase === 'night' ? '夜' : this.time, id: card.id, name: card.name, target, result });
    this.push({ kind: 'card', text: `${result.title}${result.effects.length ? '：' + result.effects.join('，') : ''}` });
  }

  onRuleHits(hits: RuleHit[]): void {
    for (const h of hits) {
      if (h.owner !== this.player.id) continue;
      this.push({ kind: 'rule', rule: h.blocked ? h.rule : 'overdraw', blocked: h.blocked, text: (h.blocked ? '委托被挡下：' : '违规成交：') + h.detail });
      if (!h.blocked) {
        this.darkDeed('overdraw', '超额透支下单');
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
    this.energy = this.maxEnergy;
    this.markChapter();
    if (this.isAftermath || this.isHalted) {
      // 余波：市场不再开盘，直接进入夜晚
      this.phase = 'night';
      this.scenario.onDayStart(this);
      this.push({ kind: 'phase', text: `${this.day.date} ${this.day.label}` });
      this.scenario.onNight(this);
      this.dealOffer();
      return;
    }
    this.phase = 'trading';
    this.market.beginDay(this.day, this.dayIndex);
    this.scenario.onDayStart(this);
    this.readPaper();
    // 出借方按开盘时的账看你的本钱
    this.creditBase = this.netEquity();
    this.cureOrLiquidate();
    this.push({ kind: 'phase', text: `${this.day.date} ${this.day.label} 开盘` });
  }

  /** 前一晚收到追保通知、开盘仍未补足的，交易所按缺口比例强平 */
  private cureOrLiquidate(): void {
    if (!this.marginCall) return;
    const ex = this.market.ex;
    const a = this.player;
    const eq = ex.equity(a);
    const need = ex.maintReq(a.pos);
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
    // 停市期间委托与计划都原样留着，复市后再报
    const halted = this.market.t < this.market.haltUntil;
    const orders = halted ? [] : this.pending.splice(0);
    if (!halted) orders.push(...this.runPlans(), ...this.dealerOrders());
    const rep = this.market.step(orders);
    this.onRuleHits(rep.hits);
    if (rep.luld) {
      const l = this.market.deck.luld!;
      this.push({ kind: 'rule', rule: 'luld', blocked: true, text: `${l.window} 分钟内价格波动超过 ${l.band * 100}%，交易暂停 ${l.pause} 分钟` });
    }
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
      this.tape.unshift({ day: this.dayIndex, time: this.market.session.label(this.market.t - 1), seat: acct.seat, side: e.side, qty: e.qty, price: Math.round(e.notional / e.qty) });
    }
    if (this.tape.length > 200) this.tape.length = 200;
    this.markOptions();
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
        if (p.closeOnly) {
          const pos = this.player.pos;
          const closes = pos !== 0 && (p.side === 'sell') === pos > 0;
          if (!closes) {
            p.done = true;
            continue;
          }
          p.qty = Math.min(p.qty, Math.abs(pos));
        }
        if (p.oco != null) for (const o of this.plans) if (o !== p && o.oco === p.oco && o.remaining == null) o.done = true;
        p.remaining = p.qty;
        p.perTick = Math.ceil(p.qty / Math.max(1, p.spread));
        this.push({ kind: 'intel', text: `计划书「${p.label}」开始执行` });
      }
      let q = Math.min(p.remaining, p.perTick!);
      if (p.closeOnly) {
        // 只平仓的计划每分钟都按剩下的持仓算：别的单子已经平掉的部分不再重复买卖
        const pos = this.player.pos + out.reduce((a, o) => a + (o.side === 'buy' ? o.qty : -o.qty), 0);
        const closes = pos !== 0 && (p.side === 'sell') === pos > 0;
        q = closes ? Math.min(q, Math.abs(pos)) : 0;
        if (!q) {
          p.done = true;
          continue;
        }
      }
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
    const c = this.credit;
    if (c && c.loan > 0 && this.player.pos !== 0 && ex.equity(this.player, mark) <= c.loan * c.line) {
      // 出借方不等交易所：权益一碰平仓线，立刻替你平掉全部持仓，把借款拿回去
      const r = ex.liquidate(this.player.id);
      this.player.cash -= c.loan;
      this.push({ kind: 'liquidation', rule: 'otc-liquidation', text: `${c.lender}强制平仓：权益碰到平仓线（借款的 ${Math.round(c.line * 100)}%），卖掉 ${r?.filled.toLocaleString() ?? 0} ${UNITS.qty}，收回借款 ${fmtYi(c.loan)}` });
      this.credit = { ...c, loan: 0 };
      this.flags.otcLiquidated = ((this.flags.otcLiquidated as number) || 0) + 1;
    }
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
    this.surveil();
    this.scenario.onDayEnd(this);
    if (this.ending) return;
    const price = settle ?? (this.flags['settle'] as number | undefined) ?? m.last;
    delete this.flags['settle'];
    m.closeDay(price);
    this.expireOptions(price);
    this.markOptions();
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
    // 今天的黑色操作，对面是谁：最后一天也要写，结局页会列出来
    this.writeLetters();

    const ex = m.ex;
    // 借来的钱按天计息：券商的融资、场外的配资
    const loan = ex.marginLoan(this.player);
    if (loan > 0 && ex.deck.loanRate) {
      const fee = (loan * ex.deck.loanRate) / 252;
      this.player.cash -= fee;
      this.flags.loanInterest = ((this.flags.loanInterest as number) || 0) + fee;
    }
    if (this.credit && this.credit.loan > 0) {
      const fee = this.credit.loan * this.credit.rate;
      this.player.cash -= fee;
      this.credit.paid += fee;
    }
    const eq = ex.equity(this.player);
    this.equityCurve.push(eq);
    if (this.player.pos !== 0 && eq < ex.maintReq(this.player.pos)) {
      this.marginCall = true;
      this.push({
        kind: 'margin',
        rule: 'daily-settlement',
        text: `收盘后权益 ${fmtYi(eq)}，低于维持保证金 ${fmtYi(ex.maintReq(this.player.pos))}：明早开盘前须补足，否则强制平仓`,
      });
    }
    // 布局期就穿仓：故事到此为止；决战日穿仓的人还要面对余波
    const aftermathAhead = this.scenario.days.slice(this.dayIndex + 1).some((d) => d.kind === 'aftermath');
    if (this.dayIndex >= this.scenario.days.length - 1 || (this.bankrupt && !(aftermathAhead && this.isBattleDay))) {
      this.phase = 'reckoning';
      this.ending = this.scenario.reckon(this);
      return;
    }
    this.phase = 'night';
    this.energy = this.maxEnergy;
    this.heat = Math.max(this.heatPeak * 0.3, this.heat - 1);
    this.scenario.onNight(this);
    this.finishPaper();
    this.dealOffer();
  }

  /**
   * 收盘后的交易监察：从玩家当天的交易痕迹里找对倒、虚假申报和尾市拉抬。
   * 抓到就记监管热度，第一次弹出规则卡。
   */
  private surveil(): void {
    const ex = this.market.ex;
    const s = ex.dayStats.get(this.player.id);
    if (!s || this.faction.observer) return;
    const v = this.day.vDay;
    const found: { rule: string; heat: number; text: string; why: string }[] = [];
    if (s.wash > 0)
      found.push({ rule: 'wash-trade', heat: Math.min(25, 4 + Math.round((300 * s.wash) / v)), text: `交易所监察：你的账户与关联账户之间对敲 ${s.wash.toLocaleString()} ${UNITS.qty}`, why: '自买自卖制造成交量' });
    if (s.bigCancelled >= 2)
      found.push({ rule: 'spoofing', heat: Math.min(15, 4 + 2 * s.bigCancelled), text: `交易所监察：${s.bigCancelled} 笔大额申报几乎没成交就撤掉了`, why: '虚假申报' });
    const bars = this.market.bars;
    const win = 10;
    if (bars.length > win + 1) {
      const last = bars.slice(-win);
      const vol = last.reduce((a, b) => a + b.v, 0);
      let mine = 0;
      for (let t = bars.length - win; t < bars.length; t++) mine += s.aggrByMin[t] ?? 0;
      const move = Math.abs(last[last.length - 1].c - bars[bars.length - win - 1].c);
      const sigmaP = this.day.sigma * last[last.length - 1].c;
      if (vol > 0 && mine / vol >= 0.25 && move >= 0.15 * sigmaP)
        found.push({ rule: 'marking-close', heat: 6, text: `交易所监察：收盘前 ${win} 分钟里，你的主动成交占了 ${Math.round((100 * mine) / vol)}%，价格被推动了一截`, why: '尾市拉抬或打压' });
    }
    for (const f of found) {
      this.addHeat(f.heat, f.why);
      this.flags[`surveil-${f.rule}`] = ((this.flags[`surveil-${f.rule}`] as number) || 0) + 1;
      this.push({ kind: 'rule', rule: f.rule, blocked: false, text: f.text });
      this.darkDeed(f.rule, f.why);
      if (this.principleId === 'no-violation' && !this.flags[`line-${f.rule}-${this.dayIndex}`]) {
        this.flags[`line-${f.rule}-${this.dayIndex}`] = true;
        this.crossLine(f.why);
      }
    }
  }

  /**
   * 记下一次黑色操作。盘中的攒到收盘一起写信；夜里打出的黑牌当晚就有回音。
   * 同一天同一种原因只记一次。
   */
  darkDeed(cause: string, label: string): void {
    if (this.faction.observer && cause === 'overdraw') return;
    if (this.darkDeeds.some((d) => d.day === this.dayIndex && d.cause === cause && d.label === label)) return;
    this.darkDeeds.push({ cause, label, day: this.dayIndex });
    if (this.phase === 'night') this.writeLetters();
  }

  /**
   * 把还没回音的黑色操作写成受害者的信。同一种操作一局只回音一次（不同的黑牌各算一种），
   * 每天最多两封；剧本找不到新的人（每个人一局只出现一次）就不写。
   */
  private writeLetters(): void {
    const key = (d: DarkDeed) => (d.cause === 'card' ? `card:${d.label}` : d.cause);
    let sent = this.intel.filter((i) => i.kind === 'victim' && i.day === this.dayIndex).length;
    // 重的先写：剧本里的危险抉择（砸盘、内幕加仓……）在前，黑牌其次，普通的违规成交最后
    const weight = (d: DarkDeed) => (MINOR_DEEDS.includes(d.cause) ? 2 : d.cause === 'card' ? 1 : 0);
    for (const d of [...this.darkDeeds].sort((a, b) => weight(a) - weight(b))) {
      if (sent >= 2) break;
      if (d.day !== this.dayIndex || this.lettered.has(key(d))) continue;
      this.lettered.add(key(d));
      const v = this.scenario.victim?.(this, d);
      if (!v) continue;
      this.addIntel({ id: `victim-${this.dayIndex}-${sent++}`, title: v.title, body: v.body, source: v.from, credibility: 1, kind: 'victim' });
    }
  }

  /**
   * 往明早的报纸里塞一篇稿子：明早它就是头条，散户和各方都会读到。
   * tone 是这篇稿子有多看多（+）或看空（−）。
   */
  spin(tone: number, headline: string, by: string): void {
    // 夜里塞稿：今晚这期还没印完，直接改；盘中塞稿：等收盘付印
    const paper = this.papers[this.papers.length - 1];
    if (this.phase === 'night' && paper?.day === this.dayIndex) this.plant(paper, [{ tone, headline, by }]);
    else this.spins.push({ tone, headline, by });
  }

  private plant(paper: Paper, spins: { tone: number; headline: string; by: string }[]): void {
    paper.tone = Math.max(-1, Math.min(1, (paper.tone ?? 0) + spins.reduce((a, x) => a + x.tone, 0)));
    const top = [...spins].sort((a, b) => Math.abs(b.tone) - Math.abs(a.tone))[0];
    if (!paper.spun) paper.sub = paper.headline;
    paper.headline = top.headline;
    paper.spun = [...(paper.spun ?? []), ...spins.map((x) => x.by)];
  }

  /** 今晚的报纸付印：算出整体基调；有人塞了稿，头条就换成那篇稿子 */
  private finishPaper(): void {
    const paper = this.papers[this.papers.length - 1];
    if (!paper || paper.day !== this.dayIndex) return;
    const rc = this.recaps[this.recaps.length - 1];
    const prev = this.recaps.length > 1 ? this.recaps[this.recaps.length - 2].close : rc ? rc.open : this.market.last;
    // 当天的涨跌本身就是一种基调：涨了一个标准波动，报纸就偏多三成
    const organic = rc ? 0.3 * Math.tanh((rc.close - prev) / Math.max(1, this.day.sigma * rc.close)) : 0;
    paper.tone ??= organic;
    if (this.spins.length) this.plant(paper, this.spins);
    this.spins = [];
  }

  /**
   * 早上开盘：散户和各方读昨晚的报纸。散户情绪跟着基调走；每个人按自己的风格解读，
   * 看法攒在 npc.view 里，剧本里的对手用它决定怎么出手。
   */
  private readPaper(): void {
    const paper = this.papers.find((x) => x.day === this.dayIndex - 1);
    if (!paper?.tone || Math.abs(paper.tone) < 0.05) return;
    const tone = paper.tone;
    this.market.sentiment = Math.max(-1, Math.min(1, this.market.sentiment + 0.4 * tone));
    const lines: string[] = [];
    const word = tone > 0 ? '看多' : '看空';
    for (const n of [...this.npcs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const k = STYLE_READ[n.style] ?? 0;
      if (!k) continue;
      n.view = Math.max(-1, Math.min(1, 0.5 * (n.view ?? 0) + k * tone));
      if (Math.abs(k * tone) < 0.15) continue;
      lines.push(
        k > 0
          ? `${n.name}（${n.style}）读完更笃定了：报纸${word}，他也${word}。`
          : `${n.name}（${n.style}）冷笑：报纸越是一边倒地${word}，他越要站到另一边。`,
      );
    }
    this.addIntel({
      id: `paper-read-${this.dayIndex}`,
      title: `早报「${paper.headline.slice(0, 16)}${paper.headline.length > 16 ? '…' : ''}」${word}`,
      body: [`大户室里人手一份。散户情绪跟着${word}。`, ...lines].join('\n'),
      source: '早报',
      credibility: 1,
      kind: 'news',
    });
  }

  /** 今天属于哪一章 */
  get chapter(): Chapter | undefined {
    return this.scenario.chapters?.find((c) => this.dayIndex <= c.until);
  }

  /** 新的一章第一天：记下账面 */
  private markChapter(): void {
    const c = this.chapter;
    if (!c || this.chapterMarks[c.id]) return;
    this.chapterMarks[c.id] = { eq: this.netEquity(), heat: this.heat, rep: this.reputation, lines: this.linesCrossed, letters: this.intel.filter((i) => i.kind === 'victim').length };
  }

  private endNight(): void {
    if (this.phase !== 'night') return;
    if (this.dayIndex >= this.scenario.days.length - 1) {
      this.phase = 'reckoning';
      this.ending = this.scenario.reckon(this);
      return;
    }
    // 没选的牌不留到明天
    this.offer = null;
    // 剧本可以跳过一些日子（例如公司停牌，后面几个交易日就不开盘了）
    this.dayIndex = Math.max(this.dayIndex + 1, Math.min(this.scenario.days.length - 1, this.scenario.nextDay?.(this) ?? this.dayIndex + 1));
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
    for (const n of [...this.npcs.values()].sort((x, y) => x.id.localeCompare(y.id))) parts.push(n.id, n.relation, Math.round((n.view ?? 0) * 1000));
    parts.push(...this.market.closePrices, ...this.hand, ...this.opts.map((o) => `${optKey(o)}x${o.qty}`), this.dealerHedge);
    let h = 2166136261 >>> 0;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16);
  }
}

/** 按动作日志重放一局：服务端校验排行榜、每日挑战与录像都靠它 */
export function replay(scenario: Scenario, seed: string, faction: FactionId, principle: string, log: LoggedAction[], untilTick = Infinity, opts: GameOpts = {}): Game {
  const g = new Game(scenario, seed, faction, principle, opts);
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

/**
 * 开局仓位拿着不动、一笔不交易，按 price 结算的收益率。
 * 剧本在 setup 里记下 startEq / startPos / startMark。
 */
export function holdReturn(g: Game, price: Fen): number {
  const start = Number(g.flags.startEq) || 1;
  const pos = Number(g.flags.startPos) || 0;
  const mark = Number(g.flags.startMark ?? price);
  return (pos * ((price - mark) / 100) * g.market.ex.deck.multiplier) / Math.abs(start);
}

/**
 * 交易座位的人物类型。猎手不只要赚钱，还要比“拿着开局仓位不动”多赚一截——
 * 否则这一局是历史替你赚的，不是你。
 */
export function traderArchetype(r: number, rHold: number, clean: boolean, canBust = true): Ending['archetype'] {
  if (r >= 0.15 && !clean) return '流星';
  if (r >= 0.15 && r - rHold >= 0.1) return '猎手';
  if (canBust && r <= -0.6) return '出局者';
  return clean ? '长青者' : '蛀虫';
}
