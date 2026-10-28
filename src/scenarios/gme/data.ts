import type { RuleDeck } from '../../engine/exchange';
import type { Faction, NpcDef, Principle, RuleCardDef, SourceCard } from '../../engine/game';
import { bridgePath, makeSession, type DayDef, type MarketParams } from '../../engine/market';

// ───────────── 散户起义：2021 年 1 月，纽约 ─────────────
// 价格单位：美分（引擎的最小价位），显示为美元。股价为 2022 年拆股前的价格。
// 每日开高低收取自公开行情报道；分钟走势在这些点的约束下重建。

export const NYSE = makeSession([['9:30', '16:00']]);
const L = NYSE.minutes;
const m = NYSE.index;

export const DECK_2021: RuleDeck = {
  id: 'us-equities-2021',
  multiplier: 1, // 股价每动 1 美元，每股赚赔 1 美元
  marginRate: 0.5, // T 条例：初始保证金 50%
  positionLimit: 1e12, // 个股没有持仓限额
  priceLimit: null, // 没有涨跌停
  marketProtect: 0.3,
  luld: { band: 0.1, window: 5, pause: 5 },
  // 零佣金券商不收佣金，但交易所规费和监管费按成交额收一点
  feeRate: 0.00003,
};

export const PARAMS_2021: MarketParams = { Y: 1, kappa: 0.5, trendThreshold: 0.8, trendScale: 0.4 };

function day(date: string, label: string, kind: DayDef['kind'], pts: [string, number][], vDay: number, sigma: number, noise: number, base?: number[]): DayDef {
  return {
    date,
    label,
    kind,
    hist: bridgePath(
      pts.map(([t, p]) => [m(t) >= L ? L - 1 : m(t), p]),
      L,
      noise,
      `gme-${date}`,
    ),
    base,
    vDay,
    sigma,
    halfLife: 40,
    crowdShare: 0.45,
    provenance: 'reconstructed',
  };
}

const jan28: [string, number][] = [
  ['9:30', 26500],
  ['9:45', 42000],
  ['10:00', 48300],
  ['10:15', 38000],
  ['10:45', 20000],
  ['11:30', 11225],
  ['12:30', 16000],
  ['14:30', 17500],
  ['15:59', 19360],
];

export const DAYS_2021: DayDef[] = [
  day('2021-01-22', '星期五', 'layout', [['9:30', 4259], ['9:35', 4232], ['10:30', 5500], ['12:00', 7676], ['13:30', 6200], ['15:00', 6800], ['15:59', 6501]], 150_000_000, 0.4, 35),
  day('2021-01-25', '星期一', 'layout', [['9:30', 9673], ['9:50', 12000], ['10:50', 15918], ['12:00', 9000], ['13:00', 6113], ['14:30', 8800], ['15:59', 7679]], 150_000_000, 0.5, 70),
  day('2021-01-26', '星期二', 'layout', [['9:30', 8856], ['9:45', 8020], ['11:30', 11000], ['13:30', 13000], ['15:30', 15000], ['15:59', 14798]], 150_000_000, 0.45, 60),
  day('2021-01-27', '星期三', 'layout', [['9:30', 35483], ['9:50', 38000], ['11:30', 26000], ['12:30', 24900], ['14:30', 31000], ['15:59', 34751]], 90_000_000, 0.5, 160),
  (() => {
    const d = day('2021-01-28', '星期四 · 决战日', 'battle', jan28, 60_000_000, 0.6, 220);
    // 做市商的估值中枢：10:00 之前就是史料走势；之后是“没有人被限制买入”时的世界——
    // 高位缓慢回落。史料里的暴跌要靠被限制只能卖出的散户砸出来。
    const t10 = m('10:00');
    d.base = d.hist.map((p, i) => (i <= t10 ? p : Math.round(48300 - ((48300 - 33000) * (i - t10)) / (L - 1 - t10))));
    return d;
  })(),
];

export const BATTLE_2021 = DAYS_2021.length - 1;
export const START_2021 = 4259;

export const FACTIONS_2021: Faction[] = [
  {
    id: 'retail',
    name: '论坛散户',
    role: '投资论坛上的一个 ID',
    blurb: '你半年前在论坛上看到一个帖子，跟着买了 50 股，成本 18 美元。你的账户里还有 5,000 美元。论坛上所有人都在喊：钻石手，别卖。',
    secretGoal: '带着真钱离开——或者证明“我们”能赢。两者不一定是一回事。',
    accountId: 'you',
  },
  {
    id: 'short',
    name: '做空基金经理',
    role: '灰狼资本 · 创始人',
    blurb: '你判断这家实体游戏零售商会被网络时代淘汰，重仓做空了 1,000 万股，成本 40 美元。你管着 40 亿美元。',
    secretGoal: '活下来。空单要平，可是每买一股，都在帮对手推高价格。',
    accountId: 'greywolf',
  },
  {
    id: 'broker',
    name: '零佣金券商 CEO',
    role: '羽毛证券 · 联合创始人',
    blurb: '几百万年轻人用你的手机应用免费炒股。今天这只股票的交易量把你的系统和资金都推到了极限。',
    secretGoal: '让公司活过这一周。凌晨五点，清算所的电话会打来。',
    accountId: 'feather',
    observer: true,
  },
  {
    id: 'mm',
    name: '做市商',
    role: '堡垒集团 · 交易台',
    blurb: '你买下了零佣金券商的散户订单流，每一笔成交赚一点价差；你还把大量看涨期权卖给了散户，得按 delta 不停地买股票对冲。价格越涨，你要买的越多。',
    secretGoal: '赚价差和权利金，别被自己卖出的期权逼到墙角。',
    accountId: 'fortress',
  },
];

export const PRINCIPLES_2021: Principle[] = [
  { id: 'no-violation', label: '绝不碰灰色手段', desc: '借券之外的裸卖空、散布未经证实的消息，都算越线。' },
  { id: 'no-betrayal', label: '绝不背弃同伴', desc: '违背对社区或盟友的承诺、在他们之前偷偷离场，都算越线。' },
  { id: 'no-allin', label: '绝不押上全部身家', desc: '保证金占用超过九成，或在亏损时继续加仓，都算越线。' },
];

export const NPCS_2021: NpcDef[] = [
  {
    id: 'cat',
    name: '老猫',
    title: '论坛博主',
    org: '投资论坛',
    style: '价值',
    persona: '三十多岁的业余投资者，戴头巾、喝啤酒、对着摄像头一张张翻财报。说话平和、自嘲，不喊口号，反复说“我就是喜欢这只股票”，从不叫别人买。',
    secretGoal: '证明自己的分析是对的。',
    bottomLine: '不给别人投资建议。',
    honesty: 0.9,
    relation: 20,
    avatar: '猫',
  },
  {
    id: 'jack',
    name: '杰克',
    title: '论坛版主',
    org: '投资论坛',
    style: '动员',
    persona: '二十出头，满嘴网络梗，喜欢用火箭和钻石的表情，口头禅是“钻石手！”“我们还在！”，把卖出的人叫“纸手”。',
    secretGoal: '让这件事变成一场运动。',
    bottomLine: '不当叛徒。',
    honesty: 0.6,
    relation: 30,
    avatar: '杰',
  },
  {
    id: 'rowan',
    name: '罗文',
    title: '创始人',
    org: '灰狼资本',
    seat: 'GW',
    style: '基本面做空',
    persona: '四十多岁的基金经理，做空出身，说话克制、讲逻辑，私下却越来越焦躁；习惯说“基本面不会说谎”。',
    secretGoal: '在不被逼死的前提下平掉空单。',
    bottomLine: '不认输——直到不得不认。',
    honesty: 0.5,
    relation: 0,
    avatar: '罗',
    factionId: 'short',
  },
  {
    id: 'stone',
    name: '斯通',
    title: '交易台负责人',
    org: '堡垒集团',
    seat: 'FT',
    style: '做市',
    persona: '五十岁，做市商和对冲基金的掌舵人之一，说话像在念风控报告，永远在算概率，从不站队。',
    secretGoal: '赚价差，并保住他在灰狼资本的投资。',
    bottomLine: '不做亏本买卖。',
    honesty: 0.55,
    relation: 0,
    avatar: '斯',
    factionId: 'mm',
  },
  {
    id: 'tom',
    name: '汤姆',
    title: 'CEO',
    org: '羽毛证券',
    style: '增长',
    persona: '三十多岁的科技公司创始人，讲话热情、爱说“让金融民主化”，被逼急了会变得非常官方。',
    secretGoal: '让公司活下去，别让用户跑掉。',
    bottomLine: '不能让公司倒闭。',
    honesty: 0.6,
    relation: 10,
    avatar: '汤',
    factionId: 'broker',
  },
  {
    id: 'susan',
    name: '苏珊',
    title: '主播',
    org: '财经电视台',
    style: '报道',
    persona: '四十岁的资深财经主播，语速快，爱用“这是前所未有的”，追问时毫不客气。',
    secretGoal: '拿到独家。',
    bottomLine: '不报道没核实的消息。',
    honesty: 0.8,
    relation: 10,
    avatar: '苏',
  },
  {
    id: 'bill',
    name: '比尔',
    title: '退休交易员',
    org: '华尔街老兵',
    style: '经验',
    persona: '七十岁的退休场内交易员，经历过 1987 年的黑色星期一，说话慢、爱讲老故事，提醒年轻人“记住你的止损”。',
    secretGoal: '自己也偷偷买了一点，想看看年轻人能走多远。',
    bottomLine: '不坑新手。',
    honesty: 0.8,
    relation: 30,
    avatar: '比',
  },
];

export const RULES_2021: RuleCardDef[] = [
  {
    id: 'wash-trade',
    title: '对敲交易（wash trade）',
    plain: '你在自己控制的两个账户之间买卖：持仓没变，可行情上多出了成交量和一个你定的成交价。别人看到的是“放量”，跟风盘会追进来。',
    why: '成交量和成交价是所有人判断行情的依据。不转移所有权的成交是在制造假象。',
    source: '美国《1934 年证券交易法》第 9(a)(1) 条：禁止为制造交易活跃的假象而进行不改变实际所有权的交易。',
  },
  {
    id: 'spoofing',
    title: '幌骗（spoofing）',
    plain: '你挂出大单却不打算成交：它摆在盘口上让别人以为有大资金在买（或卖），价格被吓动之后，你撤单、再反向成交。',
    why: '盘口挂单本该是真实的买卖意愿。算法和散户都在看盘口，虚假的大单会误导所有人。',
    source: '2010 年《多德-弗兰克法案》第 747 条把“意图在成交前撤销的出价或报价”列为违法（期货市场）；股票市场按 SEC 规则 10b-5 与《证券交易法》第 9(a)(2) 条追究操纵。',
  },
  {
    id: 'marking-close',
    title: '操纵收盘价（marking the close）',
    plain: '收盘前几分钟集中下单，把收盘价推高或压低：保证金、期权估值、基金净值都按收盘价算。',
    why: '收盘价是一整天的结算基准。集中在最后几分钟推动它，是在用规则做武器。',
    source: 'SEC 与 FINRA 把“操纵收盘价”列为典型的操纵行为，依据《证券交易法》第 9(a)(2) 条与规则 10b-5。',
  },
  {
    id: 'short-squeeze',
    title: '逼空',
    plain: '卖空的人迟早要把股票买回来还掉。价格越涨，他们亏得越多，越可能被迫买回——而他们的买单又会把价格推得更高。',
    why: '当时被卖空的股数据报道超过了可流通股数，这意味着空头想全部平仓时，市场上可能根本没有那么多股票。',
    source: 'SEC 员工报告《2021 年初股票与期权市场结构状况》（2021 年 10 月）。',
  },
  {
    id: 'luld',
    title: '涨跌幅区间暂停',
    plain: '美国股票没有涨跌停。但价格在几分钟内偏离太多时，交易会自动暂停 5 分钟，让所有人冷静一下。',
    why: '2010 年“闪电崩盘”之后引入，用暂停代替涨跌停，防止价格在没有买家或卖家的真空里乱跳。',
    source: '美国股票“涨跌幅区间（LULD）”机制，2012 年起实施。游戏简化为：5 分钟内偏离超过 10% 即暂停 5 分钟。',
  },
  {
    id: 'no-borrow',
    title: '借不到券',
    plain: '卖空之前必须先借到股票。这只股票能借的券已经被借光了，再卖空就会被拦下。',
    why: '“先借后卖”是为了防止卖出根本不存在的股票。借券越难，借券费越贵——当时这只股票的借券年费率一度极高。',
    source: '美国 SHO 条例的“借券定位”要求。',
  },
  {
    id: 'close-only',
    title: '券商只允许卖出',
    plain: '你的券商暂停了这只股票的买入：你可以卖出手里的股票，但不能再买。',
    why: '股票成交后要两个交易日才完成交收（T+2）。交收前，清算所要求券商按风险缴纳押金；这只股票波动太大，押金要求暴涨，券商一时拿不出钱，只好限制买入来降低风险。',
    source: '2021 年 1 月 28 日，多家券商限制了这只股票的买入；其中一家在国会听证中说明，清算所当天凌晨要求其追加约 30 亿美元押金。',
  },
  {
    id: 'margin',
    title: '保证金',
    plain: '在保证金账户里买股票，可以有一半是借来的；卖空则要按股票市值交押金。押金不够，新的委托会被拦下。',
    why: '借来的钱放大收益，也放大亏损。押金是券商防止你亏到还不起的护栏。',
    source: '美联储 T 条例：初始保证金 50%。',
  },
  {
    id: 'daily-settlement',
    title: '追加保证金通知',
    plain: '收盘后按收盘价重新计算你的账户。亏到押金不够时，你会收到追保通知：明天开盘前补上，否则券商会替你平仓。',
    why: '把风险留在当天解决，而不是等到亏损大到收不回来。',
    source: '券商保证金账户的维持保证金制度。',
  },
  {
    id: 'forced-liquidation',
    title: '强制平仓',
    plain: '追保没补上、或者账户已经亏穿，券商会替你按市价平仓——价格多差都得认。',
    why: '一个账户的亏损不能拖垮券商和其他客户。',
    source: '券商保证金协议。',
  },
  {
    id: 'session',
    title: '休市中',
    plain: '美股常规交易时间是 9:30–16:00（美东时间），现在不接受委托。',
    why: '收盘后的时间留给结算与消息消化。',
    source: '纽约证券交易所常规交易时段。',
  },
];

export const SOURCES_2021: SourceCard[] = [
  {
    id: 'gme-sec',
    title: 'SEC 员工报告',
    body: '2021 年 10 月，美国证交会员工报告回顾了这次事件：价格的暴涨主要来自看多的买盘，空头回补只占一小部分；券商限制买入，是因为清算所的押金要求在 T+2 交收制度下急剧上升。',
    cite: 'The TRADE 对 SEC 员工报告的报道',
    url: 'https://www.thetradenews.com/trading-in-meme-stocks-tested-the-resiliency-and-capacity-of-markets-sec-report-concludes/',
  },
  {
    id: 'gme-day',
    title: '2021 年 1 月 28 日',
    body: '开盘 265 美元，上午一度冲到 483 美元。多家券商随后限制买入，只允许卖出，股价在一个多小时里跌到 112.25 美元，收于 193.60 美元。次日收于 325 美元，2 月 2 日收于 90 美元。',
    cite: '公开行情报道（拆股前价格）',
  },
  {
    id: 'reconstruction',
    title: '本剧本的数据是怎么来的',
    body: '每日开盘、最高、最低、收盘价取自公开行情报道（拆股前价格），分钟走势在这些点的约束下重建，因此图表角落标注“重建”。原型阶段使用；正式版须按设计文档第十二章采购带展示授权的行情数据。人物与机构均为化名合成，仓位按比例缩放。',
    cite: '《筹码》设计文档 第十二章',
  },
];

export const PROLOGUE_2021: string[] = [
  '2021 年 1 月，疫情中的美国。数百万人第一次在手机上开了证券账户，买股票不要佣金。',
  '一家实体游戏零售商的股票，被几家对冲基金大举做空，空单据报道超过了流通的股数。一个投资论坛上的博主却说：这家公司被低估了。',
  '论坛上的人越聚越多。他们发现：只要大家一起买，就能让空头无路可退。',
  '1 月 28 日星期四，所有人都会在同一个早上醒来。',
];
