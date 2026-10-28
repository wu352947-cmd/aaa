import type { RuleDeck } from '../../engine/exchange';
import type { Faction, NpcDef, Principle, RuleCardDef, SourceCard } from '../../engine/game';
import { bridgePath, makeSession, type DayDef, type MarketParams } from '../../engine/market';

// ───────────── 门口的野蛮人：2015—2016 年，深圳 ─────────────
// 原型是 2015—2017 年一家深圳地产公司的控制权之争。人物与机构均为化名合成。
// 价格单位：分，显示为元。几个关键收盘价取自公开报道（停牌前 24.43 元、复牌首日跌停 21.99 元），
// 其余日内走势为重建。

export const SZSE = makeSession([
  ['9:30', '11:30'],
  ['13:00', '15:00'],
]);
const L = SZSE.minutes;
export const mi = SZSE.index;

/** 万川地产总股本（股）：A 股加 H 股，约 110 亿股 */
export const SHARES = 11_039_000_000;

export const DECK_2015: RuleDeck = {
  id: 'cn-equities-2015',
  multiplier: 1, // 股价每动 1 元，每股赚赔 1 元
  marginRate: 1, // 现货股票全额付款；加杠杆要靠资管计划和股权质押（见“垫资”）
  positionLimit: 1e12,
  priceLimit: 0.1, // 涨跌停 10%
  marketProtect: 0.05,
  // 佣金加卖出印花税，平摊到双边约万分之五
  feeRate: 0.0005,
};

export const PARAMS_2015: MarketParams = { Y: 1, kappa: 0.5, trendThreshold: 0.8, trendScale: 0.35 };

function day(date: string, label: string, kind: DayDef['kind'], pts: [string, number][], vDay: number, sigma: number, noise: number): DayDef {
  return {
    date,
    label,
    kind,
    hist: bridgePath(
      pts.map(([t, p]) => [Math.min(L - 1, mi(t)), p]),
      L,
      noise,
      `takeover-${date}`,
    ),
    vDay,
    sigma,
    halfLife: 45,
    crowdShare: 0.45,
    provenance: 'reconstructed',
  };
}

/** 会议室里的日子：剧本跳过盘面，只有夜里的谈判、董事会和股东大会（公司停了牌，就是停牌期） */
function halt(date: string, label: string): DayDef {
  return { date, label, kind: 'halt', hist: [2443], vDay: 1, sigma: 0.01, halfLife: 1, crowdShare: 0, provenance: 'reconstructed' };
}
function after(date: string, label: string): DayDef {
  return { date, label, kind: 'aftermath', hist: [1979], vDay: 1, sigma: 0.01, halfLife: 1, crowdShare: 0, provenance: 'reconstructed' };
}

export const DAYS_2015: DayDef[] = [
  day('2015-07-10', '星期五 · 第一次举牌', 'layout', [['9:30', 1380], ['10:30', 1420], ['13:30', 1445], ['15:00', 1460]], 260_000_000, 0.035, 6),
  day('2015-08-26', '星期三', 'layout', [['9:30', 1330], ['10:00', 1268], ['13:30', 1290], ['15:00', 1300]], 220_000_000, 0.035, 6),
  day('2015-11-27', '星期五', 'layout', [['9:30', 1442], ['11:00', 1455], ['14:00', 1430], ['15:00', 1425]], 200_000_000, 0.03, 5),
  day('2015-12-04', '星期五 · 第一大股东', 'layout', [['9:30', 1950], ['10:30', 2080], ['13:30', 1990], ['15:00', 2040]], 700_000_000, 0.05, 12),
  day('2015-12-17', '星期四 · 停牌前最后一天', 'layout', [['9:30', 2290], ['10:30', 2380], ['14:00', 2420], ['15:00', 2443]], 600_000_000, 0.05, 10),
  halt('2016-03-12', '星期六 · 会议室里'),
  halt('2016-06-26', '星期日 · 股东大会'),
  // 复牌首日：开盘即跌停，封单如山；托不托，看你
  day('2016-07-04', '星期一 · 复牌', 'battle', [['9:30', 2199], ['10:00', 2199], ['11:00', 2210], ['13:30', 2199], ['15:00', 2199]], 180_000_000, 0.05, 3),
  after('2016-12-05', '星期一 · 余波'),
  after('2017-03-16', '星期四 · 清算'),
];

export const BATTLE_2015 = DAYS_2015.findIndex((d) => d.kind === 'battle');
export const START_2015 = 1380;
/** 停牌前最后的收盘价 */
export const PRE_HALT = 2443;

export const FACTIONS_2015: Faction[] = [
  {
    id: 'raider',
    name: '险资掌门',
    role: '恒利人寿 · 鼎华系',
    blurb: '你手里有一家保险公司，卖高收益万能险收来的钱有几百亿，正在找一只便宜的大盘股。万川地产股权分散，第一大股东华岳集团只有 15%。',
    secretGoal: '成为第一大股东，改组董事会，拿下万川。',
    accountId: 'dinghua',
  },
  {
    id: 'defender',
    name: '万川董事长',
    role: '万川地产 · 创始人',
    blurb: '你把万川从一家倒腾录像机的小公司做成了全国最大的地产商。你和管理层合计只有不到 5% 的股份。现在有人在二级市场一口一口地买你的公司。',
    secretGoal: '守住管理层对公司的控制，不让万川变成险资的提款机。',
    accountId: 'yingan',
    observer: true,
  },
];

export const PRINCIPLES_2015: Principle[] = [
  { id: 'no-violation', label: '绝不违规', desc: '隐瞒一致行动人、虚假申报、为停牌而停牌，都算越线。' },
  { id: 'no-betrayal', label: '绝不背弃盟友', desc: '和谁站在一起，就站到最后。' },
  { id: 'no-allin', label: '绝不押上全部身家', desc: '加杠杆到平仓线边上，或者在亏损时继续加码，都算越线。' },
];

export const NPCS_2015: NpcDef[] = [
  {
    id: 'ye',
    name: '叶振豪',
    title: '董事长',
    org: '鼎华系 · 恒利人寿',
    style: '机会主义',
    persona: '潮汕人，四十多岁，卖菜起家，说话不多，常说“我们是财务投资者”“长期持有”。从不正面谈控制权。',
    secretGoal: '把万川变成鼎华系的现金牛。',
    bottomLine: '杠杆可以加，平仓线不能碰。',
    honesty: 0.4,
    relation: 0,
    avatar: '叶',
    factionId: 'raider',
  },
  {
    id: 'wang',
    name: '王启川',
    title: '董事长',
    org: '万川地产',
    style: '逆向',
    persona: '六十多岁，登过珠峰，爱讲“职业经理人”“规范治理”，说话带着书生气，也带着傲气。当众说过“不欢迎”。',
    secretGoal: '守住管理层，守住万川的文化。',
    bottomLine: '不向“信用不足”的资本低头。',
    honesty: 0.75,
    relation: 0,
    avatar: '王',
    factionId: 'defender',
  },
  {
    id: 'yu',
    name: '余光',
    title: '总裁',
    org: '万川地产',
    style: '经验',
    persona: '四十出头，财务出身，温和、圆通，常说“大家都是股东”“先把公司经营好”。在董事长和各路股东之间来回打圆场。',
    secretGoal: '不管谁赢，公司和团队都要活下去。',
    bottomLine: '不拿员工的饭碗做筹码。',
    honesty: 0.7,
    relation: 10,
    avatar: '余',
  },
  {
    id: 'fu',
    name: '傅成',
    title: '董事长',
    org: '华岳集团（第一大股东）',
    style: '程序',
    persona: '北京口音，五十多岁，央企做派，说话慢，“要按程序走”“要请示”。十几年来对万川不闻不问，被冒犯时会翻脸。',
    secretGoal: '国有股东的地位不能丢，也不能被人当枪使。',
    bottomLine: '不被管理层“绕过去”。',
    honesty: 0.65,
    relation: 10,
    avatar: '傅',
  },
  {
    id: 'wu',
    name: '吴锦',
    title: '董事长',
    org: '安泰保险',
    style: '机会主义',
    persona: '五十岁，八面玲珑，满口“支持管理层”“尊重市场”，从不把话说死。手里的票，谁出价高就给谁。',
    secretGoal: '在两边之间卖个好价钱。',
    bottomLine: '不站在输家那一边。',
    honesty: 0.35,
    relation: 5,
    avatar: '吴',
  },
  {
    id: 'lin',
    name: '林建',
    title: '董事长',
    org: '鹏城地铁集团',
    style: '程序',
    persona: '深圳本地国企掌门，六十岁，务实，“地铁加物业”挂在嘴边。愿意当白衣骑士，前提是有人请、程序走得通。',
    secretGoal: '拿到万川的开发能力，给地铁上盖物业找个好婆家。',
    bottomLine: '不当任何一方的打手。',
    honesty: 0.7,
    relation: 0,
    avatar: '林',
  },
  {
    id: 'chang',
    name: '常正',
    title: '负责人',
    org: '保险与证券监管部门',
    style: '上级',
    persona: '五十多岁，讲话直白，不留情面。看不惯“用保险的钱去抢别人的公司”。',
    secretGoal: '让险资回到“长期投资”的本分上。',
    bottomLine: '不为任何一方背书。',
    honesty: 0.85,
    relation: 0,
    avatar: '常',
  },
  {
    id: 'xu',
    name: '许静',
    title: '记者',
    org: '《南方财经》',
    style: '调查',
    persona: '三十岁，跑公司新闻出身，讲究“资金从哪来”。追着资管计划和万能险的账一笔笔算。',
    secretGoal: '把这场争夺背后的钱算清楚。',
    bottomLine: '不收钱，不替任何一方写通稿。',
    honesty: 0.8,
    relation: 5,
    avatar: '许',
  },
  {
    id: 'zhong',
    name: '钟伯',
    title: '退休工程师',
    org: '中小股东',
    style: '价值',
    persona: '七十岁，1991 年认购了第一批万川股票，每年都去股东大会，带着笔记本，说话慢但句句在理。',
    secretGoal: '万川别被折腾坏了。',
    bottomLine: '谁对小股东好，他投谁。',
    honesty: 0.9,
    relation: 10,
    avatar: '钟',
  },
];

export const RULES_2015: RuleCardDef[] = [
  {
    id: 'stake-5',
    title: '举牌：每 5% 停一停',
    plain: '持股达到 5% 起，三天内要公告；在此期间不得再买。之后每增加 5%，同样要公告、同样要停。',
    why: '让市场知道谁在收购这家公司，给其他股东反应的时间。',
    source: '《证券法》（2014 年修正）第八十六条',
  },
  {
    id: 'tender-30',
    title: '30%：要么要约，要么停下',
    plain: '持股达到 30% 还要继续增持，必须向全体股东发出收购要约：按不低于你过去六个月买入的最高价，买下愿意卖给你的股份。',
    why: '控制权换手的溢价，要让所有股东都分到。',
    source: '《上市公司收购管理办法》第二十四条',
  },
  {
    id: 'halt',
    title: '停牌：筹划重大资产重组',
    plain: '公司筹划重大资产重组时可以申请停牌。停牌期间股票不能交易，收购方也就买不了。当年停半年以上的并不少见。',
    why: '防止重组消息泄露、股价异动。也常被当作反收购的盾牌。',
    source: '深交所《股票上市规则》（2014 年修订）第十二章',
  },
  {
    id: 'egm',
    title: '临时股东大会',
    plain: '单独或合计持股 10% 以上的股东，可以请求召开临时股东大会，提议罢免董事。过半数表决通过即可。',
    why: '股东是公司的主人，董事会要向股东负责。',
    source: '《公司法》（2013 年修正）第一百条、第一百零一条',
  },
  {
    id: 'concert',
    title: '一致行动人合并计算',
    plain: '通过协议、其他安排与他人共同扩大表决权的，持股要合并计算；隐瞒一致行动关系、拆成几个账户买，是违法的。',
    why: '不然谁都可以把 20% 拆成五个 4%，一次举牌都不用。',
    source: '《上市公司收购管理办法》第八十三条',
  },
  {
    id: 'insurance-cap',
    title: '险资投资单一股票的上限',
    plain: '保险资金投资单一股票，账面余额不得超过上季末总资产的 5%；权益类资产合计不超过 30%。用万能险的短钱买长期股权，监管越来越不容忍。',
    why: '保户的钱是要还的。拿它去打控制权之争，风险最后落在保户身上。',
    source: '原保监会《关于加强和改进保险资金运用比例监管的通知》（2014 年）及 2016—2017 年相关通报',
  },
  {
    id: 'price-limit',
    title: '涨跌停 10%',
    plain: '一天之内股价最多涨、跌 10%。复牌那天如果封在跌停，想卖的人排着队卖不出去。',
    why: '抑制过度投机。代价是：跌停封死的时候，流动性也没了。',
    source: '深交所《交易规则》',
  },
  {
    id: 'wash-trade',
    title: '对倒：自己跟自己成交',
    plain: '在自己控制的账户之间买卖，制造成交量，影响股价。',
    why: '虚假的成交量会骗来跟风的人。',
    source: '《证券法》（2014 年修正）第七十七条',
  },
  {
    id: 'spoofing',
    title: '虚假申报',
    plain: '大量申报买卖、又迅速撤单，误导其他投资者。',
    why: '盘口上那些单子不打算成交，只是摆给别人看。',
    source: '《证券法》（2014 年修正）第七十七条；深交所异常交易监控细则',
  },
  {
    id: 'marking-close',
    title: '尾市拉抬',
    plain: '在收盘前集中申报，影响收盘价。',
    why: '收盘价决定市值、质押的平仓线和基金净值。',
    source: '深交所异常交易监控细则',
  },
];

export const SOURCES_2015: SourceCard[] = [
  { id: 'proto', title: '原型与化名', body: '本剧本的原型是 2015—2017 年一家深圳地产公司的控制权之争：险资通过万能险和资管计划多次举牌成为第一大股东，公司以重大资产重组为由停牌半年、引入地方国资，复牌后连续跌停，监管部门在 2016 年底公开批评“野蛮人”式收购。剧中人物与机构均为化名合成，台词为虚构。', cite: '公开报道与上市公司公告（2015—2017）' },
  { id: 'prices', title: '价格', body: '停牌前最后收盘价 24.43 元、复牌首日跌停 21.99 元取自公开行情；其余几天的日内走势按当日大致的开盘、收盘重建，标注为“重建”。', cite: '公开行情报道' },
  { id: 'rules', title: '规则', body: '举牌每 5% 停一停、30% 要约、临时股东大会、一致行动人合并计算、险资单一股票上限，按 2014—2016 年的法规条文简化。', cite: '《证券法》（2014 年修正）、《上市公司收购管理办法》、《公司法》（2013 年修正）' },
];

export const PROLOGUE_2015: string[] = [
  '2015 年夏天，A 股刚刚经历了一场股灾。救市资金还在场内，很多大盘股的价格跌回了几年前。',
  '万川地产是全国最大的地产商，股权却极其分散：第一大股东华岳集团只持有 15%，管理层和员工合计不到 5%。董事会多年来由创始人说了算。',
  '7 月 10 日，一家名不见经传的保险公司发布公告：它持有万川 5% 的股份了。',
];
