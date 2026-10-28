import { fmtYi, newAccount } from '../../engine/exchange';
import { addCrowdFlow } from '../../engine/flows';
import type { CardDef, CardResult, Clock, DialogueIntent, Ending, ExchangeOffer, Game, Meter, Scenario, SocialOutcome } from '../../engine/game';
import { traderArchetype } from '../../engine/game';
import type { Actor, Market } from '../../engine/market';
import { Rng } from '../../engine/rng';
import {
  BATTLE_2015,
  DAYS_2015,
  DECK_2015,
  FACTIONS_2015,
  mi,
  NPCS_2015,
  PARAMS_2015,
  PRE_HALT,
  PRINCIPLES_2015,
  PROLOGUE_2015,
  RULES_2015,
  SHARES,
  SOURCES_2015,
  START_2015,
  SZSE,
} from './data';
import { victimTakeover } from './victims';

/**
 * 门口的野蛮人：资本运作层（设计文档 6.1 第四层）。
 *
 * 不是比谁赚得多，而是比谁拿到公司：
 * - 举牌：持股每跨过 5%，公告、停一停；30% 以上只能走要约。
 * - 股东大会：罢免董事会要过半数，定向增发引入白衣骑士要三分之二。每一票落在谁手里，看你这些日子怎么对待华岳、安泰和小股东。
 * - 停牌：公司可以停牌，把收购方冻在半路；代价是复牌那天的跌停、小股东的怒气和监管的问询。
 * - 杠杆：险资的钱来自万能险和资管计划，复牌连续跌停就会碰到平仓线；监管热度攒够了，会有一篇“野蛮人”的讲话。
 */

export const RAIDER = 'dinghua';
const HUAYUE = 'huayue';
const ANTAI = 'antai';
const YINGAN = 'yingan';
const PENG = 'pengcheng';

const flag = (g: Game, k: string) => g.flags[k];
const num = (g: Game, k: string) => (g.flags[k] as number) || 0;
const isRaider = (g: Game) => g.factionId === 'raider';
const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const yuan = (fen: number) => `${(fen / 100).toFixed(2)} 元`;
const gu = (q: number) => (Math.abs(q) >= 1e8 ? `${(q / 1e8).toFixed(2)} 亿股` : `${(q / 1e4).toFixed(0)} 万股`);
const pctS = (x: number) => `${(x * 100).toFixed(2)}%`;

/** 总股本（定向增发之后会变大） */
export const totalShares = (g: Game) => SHARES + num(g, 'placed');
export const stake = (g: Game, id: string) => (g.market.ex.accounts.get(id)?.pos ?? 0) / totalShares(g);
/** 已经公告过的举牌线（5% 的倍数） */
const lines = (g: Game) => num(g, 'lines');
const halted = (g: Game) => !!flag(g, 'halted');
const HALT0 = DAYS_2015.findIndex((d) => d.kind === 'halt');

/** 险资这一方的“监管热度”：玩家扮演险资时就是玩家的热度 */
const raiderHeat = (g: Game) => (isRaider(g) ? g.heat : num(g, 'raiderHeat'));
const addRaiderHeat = (g: Game, x: number, why: string) => (isRaider(g) ? g.addHeat(x, why) : (g.flags.raiderHeat = num(g, 'raiderHeat') + x));
/** 管理层这一方的热度 */
const addMgmtHeat = (g: Game, x: number, why: string) => (isRaider(g) ? (g.flags.mgmtHeat = num(g, 'mgmtHeat') + x) : g.addHeat(x, why));

/** 华岳、安泰、小股东的立场：+1 站险资，−1 站管理层 */
const lean = (g: Game, who: 'huayue' | 'antai' | 'retail') => num(g, `lean-${who}`);
const shift = (g: Game, who: 'huayue' | 'antai' | 'retail', x: number) => (g.flags[`lean-${who}`] = clamp(lean(g, who) + x));

function news(g: Game, id: string, title: string, body: string, cred = 0.95) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title, body, source: '《南方财经》', credibility: cred, kind: 'news' });
}
function rumor(g: Game, id: string, title: string, body: string, source: string, cred: number) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title: `听说${title}`, body, source, credibility: cred, kind: 'rumor' });
}

// ───────────── 举牌 ─────────────

/** 盘中或夜里，险资持股跨过新的 5% 线：公告、冷静期、跟风盘 */
function checkStake(g: Game) {
  const a = g.market.ex.accounts.get(RAIDER);
  if (!a) return;
  const p = stake(g, RAIDER);
  const k = Math.floor(p / 0.05 + 1e-9);
  if (k <= lines(g)) return;
  g.flags.lines = k;
  const at = Math.min(k, 6) * 5;
  const me = isRaider(g);
  news(g, `stake-${k}`, `鼎华系举牌万川：持股达到 ${pctS(p)}`, `恒利人寿及其一致行动人公告：合计持有万川 ${pctS(p)} 的股份。${k >= 3 && p > stake(g, HUAYUE) ? '鼎华系超过华岳集团，成为万川第一大股东。' : ''}`, 1);
  if (k >= 6) {
    a.freeze = { rule: 'tender-30', detail: '持股已经达到 30%：再要增持，只能向全体股东发出要约' };
    if (me) g.push({ kind: 'rule', rule: 'tender-30', text: '持股达到 30%：再买只能走要约' });
  } else if (g.phase === 'trading') {
    a.freeze = { rule: 'stake-5', detail: `举牌冷静期：持股刚跨过 ${at}%，公告后三天内不得再买入` };
    if (me) g.push({ kind: 'rule', rule: 'stake-5', text: `持股跨过 ${at}%：举牌公告，三天内不得再买` });
    else g.push({ kind: 'pause', text: `鼎华系举牌：持股跨过 ${at}%` });
  }
  // 举牌概念：散户追进来
  if (g.phase === 'trading') addCrowdFlow(g, 'buy', Math.round(g.day.vDay * 0.06), 30);
  g.market.sentiment = clamp(g.market.sentiment + 0.15);
  // 小股东看着股价涨，对险资的观感好一点
  shift(g, 'retail', 0.04);
}

/**
 * 还能买多少钱的股票（元）。引擎按期货式记账：买入不从现金里扣，持仓市值不能超过权益（股票全额付款，保证金比例 100%）。
 */
export function power(g: Game, id: string): number {
  const ex = g.market.ex;
  const a = ex.acct(id);
  return Math.max(0, ex.equity(a) - a.pos * (ex.last / 100));
}

/**
 * 按某个价格直接成交一批股票（不经过订单簿）：场外分批买入、协议转让、要约。
 * 均价摊进持仓；溢价部分立刻变成浮亏。返回成交的股数。
 */
function fill(g: Game, id: string, q: number, px: number): number {
  const a = g.market.ex.acct(id);
  const take = Math.min(q, Math.floor(power(g, id) / (px / 100)));
  if (take <= 0) return 0;
  a.avg = (a.avg * a.pos + px * take) / (a.pos + take);
  a.pos += take;
  return take;
}

/** 场外分批买入（夜里）：几周里在二级市场慢慢收，均价比收盘高一截；不能一口气跨过下一条举牌线 */
function offBook(g: Game, id: string, upto: number, premium: number): number {
  const ex = g.market.ex;
  const q = Math.max(0, Math.floor(upto * totalShares(g)) - ex.acct(id).pos);
  return q ? fill(g, id, q, Math.round(ex.last * (1 + premium))) : 0;
}

// ───────────── NPC ─────────────

/** 险资（玩家不扮演时）：按史料的节奏收货，被冷静期挡住就停；华岳增持了，它就追到华岳前面 */
const RAID_TARGET = [0.0502, 0.1504, 0.1650, 0.2001, 0.2245];
function raiderActor(g: Game): Actor {
  return {
    id: RAIDER,
    onTick(m: Market) {
      const a = m.ex.acct(RAIDER);
      if (m.day.kind !== 'layout' || a.freeze || flag(g, 'raiderStopped')) return [];
      const target = Math.max(RAID_TARGET[g.dayIndex] ?? 0, Math.min(0.299, stake(g, HUAYUE) + 0.004));
      const need = Math.floor(target * totalShares(g)) - a.pos;
      if (need <= 0) return [];
      // 不追高：价格被推离中枢太多就歇一歇
      if (m.last > m.reference * 1.04) return [];
      const q = Math.min(need, Math.round((m.day.vDay / SZSE.minutes) * 0.7));
      return q > 0 ? [{ owner: RAIDER, side: 'buy', qty: q, type: 'market' }] : [];
    },
  };
}

/** 华岳：被险资超过时会增持（看它站在哪边、你请没请它） */
function huayueActor(g: Game): Actor {
  return {
    id: HUAYUE,
    onTick(m: Market) {
      if (m.day.kind !== 'layout' || typeof flag(g, 'huayueBuy') !== 'number') return [];
      const a = m.ex.acct(HUAYUE);
      const need = Math.floor((flag(g, 'huayueBuy') as number) * totalShares(g)) - a.pos;
      if (need <= 0) return [];
      return [{ owner: HUAYUE, side: 'buy', qty: Math.min(need, Math.round((m.day.vDay / SZSE.minutes) * 0.4)), type: 'market' }];
    },
  };
}

/** 复牌那天：散户和机构排队卖，跌停板上压着成山的卖单 */
function panicActor(g: Game): Actor {
  return {
    id: 'panic',
    onTick(m: Market) {
      if (m.day.kind !== 'battle' || !halted(g)) return [];
      const pressure = 1 - 0.5 * clamp(lean(g, 'retail'), 0, 1);
      return [{ owner: 'panic', side: 'sell', qty: Math.round((m.day.vDay / SZSE.minutes) * 1.2 * pressure), type: 'market' }];
    },
  };
}

/** 管理层（玩家扮演险资时）：险资过了 20%（或者 12 月以后过了 15%），就停牌 */
function mgmtNight(g: Game) {
  if (isRaider(g) === false || halted(g)) return;
  const d = g.dayIndex;
  const p = stake(g, RAIDER);
  if (d === 3 && !flag(g, 'speech')) {
    g.flags.speech = true;
    g.spin(-0.5, '万川董事长：不欢迎信用不足的险资做第一大股东', '万川管理层');
    shift(g, 'retail', -0.08);
    shift(g, 'huayue', 0.08);
  }
  if (p >= 0.2 || (d >= 3 && p >= 0.15) || d === BATTLE_2015 - 3) {
    declareHalt(g);
  }
}

function declareHalt(g: Game) {
  g.flags.halted = true;
  g.flags.haltDay = g.dayIndex;
  news(g, 'halt', '万川停牌：筹划重大资产重组', `万川发布公告：公司正在筹划重大资产重组，股票自明日起停牌。停牌前收盘 ${yuan(g.market.last)}。`, 1);
  g.push({ kind: 'rule', rule: 'halt', text: '万川停牌：筹划重大资产重组' });
  // 华岳事先不知道：它觉得被管理层绕过去了
  if (!flag(g, 'consulted')) shift(g, 'huayue', 0.25);
  shift(g, 'retail', -0.1);
}

// ───────────── 表决 ─────────────

interface Tally {
  yes: number;
  no: number;
  cast: number;
  pass: boolean;
  need: string;
  lines: string[];
}

/**
 * 股东大会表决。kind：'egm' 罢免董事会（过半数，章程被改过就要三分之二）；'placement' 向鹏城地铁定增（三分之二）。
 * 大股东按立场投票；其余流通股约三成到场，按小股东的立场分。
 */
export function tally(g: Game, kind: 'egm' | 'placement'): Tally {
  const total = totalShares(g);
  const r = flag(g, 'crackdown') ? 0 : stake(g, RAIDER);
  const h = stake(g, HUAYUE);
  const a = stake(g, ANTAI);
  const m = stake(g, YINGAN) + 0.004; // 管理层与员工合伙
  const p = stake(g, PENG);
  const rest = Math.max(0, 1 - r - h - a - m - p);
  const turnout = 0.3 + 0.1 * new Rng(`${g.seed}/vote/${kind}`).next();
  const forRaider = kind === 'egm';
  const lines: string[] = [];
  let yes = 0;
  let no = 0;
  const vote = (who: string, w: number, side: 1 | 0 | -1) => {
    if (w <= 0) return;
    if (side > 0) yes += w;
    else if (side < 0) no += w;
    lines.push(`${who} ${pctS(w)}：${side > 0 ? '赞成' : side < 0 ? '反对' : '弃权'}`);
  };
  // 险资：罢免赞成，定增反对
  if (flag(g, 'crackdown') && stake(g, RAIDER) > 0) lines.push(`鼎华系 ${pctS(stake(g, RAIDER))}：被监管限制表决`);
  vote('鼎华系', r, forRaider ? 1 : -1);
  const hl = lean(g, 'huayue');
  vote('华岳集团', h, forRaider ? (hl > 0.35 ? 1 : hl < -0.1 ? -1 : 0) : hl < -0.2 ? 1 : -1);
  const al = lean(g, 'antai');
  vote('安泰保险', a, forRaider ? (al > 0.2 ? 1 : al < -0.2 ? -1 : 0) : al < 0 ? 1 : al > 0.3 ? -1 : 0);
  vote('管理层与员工', m, forRaider ? -1 : 1);
  vote('鹏城地铁', p, forRaider ? -1 : 1);
  const rl = lean(g, 'retail');
  const show = rest * turnout;
  const ry = show * clamp(0.5 + (forRaider ? 0.35 : -0.35) * rl, 0.1, 0.9);
  yes += ry;
  no += show - ry;
  lines.push(`中小股东到场 ${pctS(show)}：赞成 ${pctS(ry)}，反对 ${pctS(show - ry)}`);
  const cast = yes + no;
  const twoThirds = kind === 'placement' || !!flag(g, 'bylaw');
  const pass = cast > 0 && (twoThirds ? yes >= (cast * 2) / 3 : yes > cast / 2);
  void total;
  return { yes, no, cast, pass, need: twoThirds ? '三分之二' : '过半数', lines };
}

/** 停牌第二夜：股东大会 */
function meeting(g: Game, what: 'egm' | 'placement') {
  if (what === 'placement' && flag(g, 'placementBoard') && !flag(g, 'placementVoted')) {
    g.flags.placementVoted = true;
    const t = tally(g, 'placement');
    g.flags.placementPass = t.pass;
    if (t.pass) {
      // 鹏城地铁以发行股份的方式注资：拿到扩大后股本的约 20.65%
      const add = Math.round(SHARES * 0.26);
      g.flags.placed = add;
      g.market.ex.acct(PENG).pos += add;
    }
    g.addIntel({
      id: 'vote-placement',
      title: `股东大会：向鹏城地铁定向增发${t.pass ? '通过' : '被否决'}`,
      body: `赞成 ${pctS(t.yes)}，反对 ${pctS(t.no)}，需要${t.need}。\n${t.lines.join('\n')}${t.pass ? `\n鹏城地铁持有扩大后股本的 ${pctS(stake(g, PENG))}，成为第一大股东；鼎华系被稀释到 ${pctS(stake(g, RAIDER))}。` : ''}`,
      source: '股东大会',
      credibility: 1,
      kind: 'news',
    });
  }
  if (what === 'egm' && flag(g, 'egm') && !flag(g, 'egmVoted')) {
    g.flags.egmVoted = true;
    const t = tally(g, 'egm');
    g.flags.egmPass = t.pass;
    g.addIntel({
      id: 'vote-egm',
      title: `临时股东大会：罢免全体董事${t.pass ? '通过' : '被否决'}`,
      body: `赞成 ${pctS(t.yes)}，反对 ${pctS(t.no)}，需要${t.need}。\n${t.lines.join('\n')}`,
      source: '股东大会',
      credibility: 1,
      kind: 'news',
    });
  }
}

/** 余波第一夜：监管表态。险资的热度攒够了，就是那篇“野蛮人”的讲话 */
function regulatorNight(g: Game) {
  if (flag(g, 'regulatorSpoke')) return;
  g.flags.regulatorSpoke = true;
  const heat = raiderHeat(g);
  if (heat >= 50) {
    g.flags.crackdown = true;
    g.flags.raiderStopped = true;
    g.addIntel({
      id: 'crackdown',
      title: '监管：“用来路不当的钱从事杠杆收购，是野蛮人”',
      body: '监管部门负责人在一次行业大会上点名批评：“希望资产管理人不要做奢淫无度的土豪、兴风作浪的妖精、坑民害民的害人精。”两天后，恒利人寿被暂停万能险新业务，鼎华系的股份被限制表决。',
      source: '常正',
      credibility: 1,
      kind: 'news',
    });
    if (isRaider(g)) g.addHeat(20, '被监管点名');
    else shift(g, 'retail', -0.1);
  } else {
    g.addIntel({ id: 'reg-mild', title: '监管：险资举牌要“依法合规”', body: '监管部门表示，支持保险资金财务性投资，对“短钱长投”保持关注。鼎华系的资金来源没有被点名。', source: '常正', credibility: 1, kind: 'news' });
  }
  // 复牌后第二个跌停（7 月 5 日）在盘后补上：资管计划可能碰线
  if (halted(g)) secondLimit(g);
}

function secondLimit(g: Game) {
  if (flag(g, 'secondLimit')) return;
  g.flags.secondLimit = true;
  const ex = g.market.ex;
  // 复牌那天收在跌停附近，第二天就再来一个跌停
  if (ex.last <= num(g, 'battleLo') * 1.01) {
    ex.last = Math.round(ex.last * 0.9);
    g.addIntel({ id: 'limit-2', title: `复牌第二天再次跌停：${yuan(ex.last)}`, body: '7 月 5 日，万川再度一字跌停。此后股价在 18—21 元之间反复。', source: '行情', credibility: 1, kind: 'news' });
  }
  const c = g.credit;
  if (isRaider(g) && c && c.loan > 0 && ex.equity(g.player) <= c.loan * c.line) {
    // 资管计划的优先级资金在第二个跌停碰到了平仓线
    const p = g.player;
    // 期货式记账：卖出时把这部分的盈亏结进现金，再把借款还掉
    const sell = Math.min(p.pos, Math.ceil(c.loan / (ex.last / 100)));
    p.cash += ((ex.last - p.avg) / 100) * sell - c.loan;
    p.pos -= sell;
    g.credit = { ...c, loan: 0 };
    g.flags.otcLiquidated = 1;
    g.push({ kind: 'liquidation', rule: 'otc-liquidation', text: `资管计划碰到平仓线：优先级资金强制卖出 ${gu(sell)}` });
    checkStake(g);
  }
}

// ───────────── 剧本 ─────────────

export const TAKEOVER: Scenario = {
  id: 'takeover2015',
  title: '门口的野蛮人',
  subtitle: '2015 · 深圳 · 险资举牌',
  era: '2015—2016 年，深圳',
  deck: DECK_2015,
  params: PARAMS_2015,
  days: DAYS_2015,
  startPrice: START_2015,
  factions: FACTIONS_2015,
  principles: PRINCIPLES_2015,
  npcs: NPCS_2015,
  ruleCards: RULES_2015,
  sources: SOURCES_2015,
  prologue: PROLOGUE_2015,
  session: SZSE,
  instrument: '万川地产',
  units: { qty: '股', cur: '元' },
  eraId: '2015-shenzhen',
  paperName: '南方财经',
  endingDate: '2017-03-16 星期四',
  setupRules: ['stake-5', 'tender-30', 'halt', 'egm'],
  members: [RAIDER, HUAYUE, ANTAI],
  lotPresets: [50_000_000, 200_000_000],
  groupName: (g, who) => groupName(g, who),
  holders: (g) =>
    [
      { id: RAIDER, name: '鼎华系', pct: stake(g, RAIDER), you: isRaider(g), note: flag(g, 'crackdown') ? '被监管限制表决' : g.market.ex.acct(RAIDER).freeze?.rule === 'stake-5' ? '举牌冷静期：暂不能买入' : g.market.ex.acct(RAIDER).freeze ? '30%：再买只能走要约' : undefined },
      { id: HUAYUE, name: '华岳集团', pct: stake(g, HUAYUE) },
      { id: PENG, name: '鹏城地铁', pct: stake(g, PENG) },
      { id: ANTAI, name: '安泰保险', pct: stake(g, ANTAI) },
      { id: YINGAN, name: '管理层（盈安合伙）', pct: stake(g, YINGAN), you: !isRaider(g) },
    ].filter((r) => r.pct > 0 || r.id === RAIDER),
  cards: (g) => (isRaider(g) ? raiderCards(g) : defenderCards(g)),
  playCard: (g, id, target) => (isRaider(g) ? raiderPlay(g, id, target) : defenderPlay(g, id, target)),
  victim: victimTakeover,
  meters: (g) => meters(g),
  clocks: (g) => clocks(g),
  // 资管计划：劣后级出一份，优先级借两份；资产跌到借款的 130%，优先级强制平仓
  credit: (g) =>
    isRaider(g)
      ? { lender: '资管计划优先级', multiple: 2, line: 1.3, rate: 0.0002, color: 'grey', note: '券商资管计划替你加杠杆：你出一份劣后，优先级资金借你两份。总资产跌到借款的 130%，优先级资金不等你，直接卖股票收回本金。' }
      : null,
  nextDay: (g) => (halted(g) && g.dayIndex < HALT0 ? HALT0 : undefined),

  setup(g) {
    const ex = g.market.ex;
    const grp = (id: string) => (g.faction.accountId === id ? 'player' : id);
    // 史料：7 月 10 日之前，恒利人寿已经悄悄收了 4% 多
    // 玩家自己的钱只够再买 10% 左右，要走得更远就得加杠杆、卖万能险；电脑扮演时这些都算在场外
    ex.add(newAccount({ id: RAIDER, name: '鼎华系', seat: '恒利', group: grp(RAIDER), cash: isRaider(g) ? 15_000_000_000 : 65_000_000_000, pos: Math.round(SHARES * 0.046), avg: 1320, borrowLimit: 0 }));
    ex.add(newAccount({ id: HUAYUE, name: '华岳集团', seat: '华岳', group: grp(HUAYUE), cash: 40_000_000_000, pos: Math.round(SHARES * 0.1489), avg: 600, borrowLimit: 0 }));
    ex.add(newAccount({ id: ANTAI, name: '安泰保险', seat: '安泰', group: ANTAI, cash: 40_000_000_000, pos: 0, avg: 0, borrowLimit: 0 }));
    ex.add(newAccount({ id: YINGAN, name: '盈安合伙（管理层）', seat: '盈安', group: grp(YINGAN), cash: 3_000_000_000, pos: Math.round(SHARES * 0.006), avg: 1300, borrowLimit: 0 }));
    ex.add(newAccount({ id: PENG, name: '鹏城地铁', seat: '鹏城', group: PENG, cash: 0, pos: 0, avg: 0, exempt: true }));
    ex.add(newAccount({ id: 'panic', name: '排队卖出的股东', group: 'crowd', exempt: true }));
    g.flags.lines = 0;
    g.flags['lean-huayue'] = 0;
    g.flags['lean-antai'] = 0;
    g.flags['lean-retail'] = 0;
    // 万能险和资管计划的钱，监管一开始就看在眼里
    g.flags.raiderHeat = 15;
    g.flags.companyCash = 8_000_000_000;
    if (!isRaider(g)) g.market.actors.push(raiderActor(g));
    g.market.actors.push(huayueActor(g), panicActor(g));
    g.flags.startEq = ex.equity(g.player);
    g.flags.startPos = g.player.pos;
    g.flags.startMark = ex.last;
    if (isRaider(g)) g.heat = g.heatPeak = 15;
    g.seenRules.add('stake-5');
    g.addIntel({ id: 'brief', title: '开局简报', body: briefing(g), source: '你的笔记', credibility: 1, kind: 'system' });
  },

  onDayStart(g) {
    const ex = g.market.ex;
    if (g.isAftermath || g.isHalted) return;
    // 几周过去了：冷静期早就过了（30% 那条线除外）
    const a = ex.acct(RAIDER);
    if (a.freeze?.rule === 'stake-5') delete a.freeze;
    const m = g.market;
    if (g.isBattleDay) {
      // 复牌：涨跌停按停牌前的收盘价算；中枢按史料的跌幅跟着这一局的价格走。没有停牌，就是平常的一天
      const pre = m.closePrices[m.closePrices.length - 1] ?? ex.last;
      const k = halted(g) ? pre / PRE_HALT : pre / 2199;
      m.day = { ...m.day, base: m.day.hist.map((p) => Math.round(p * k)) };
      ex.refClose = pre;
      if (!halted(g)) return;
    } else {
      // 两个交易日之间隔着几周（中间有过好几个涨停）：涨跌停按史料的开盘价算，
      // 价格回到史料的中枢，再加上你这些日子的买卖留下的永久冲击
      ex.refClose = m.day.hist[0];
    }
    const [lo, hi] = ex.priceBand();
    ex.last = Math.max(lo, Math.min(hi, Math.round(m.reference)));
    if (!g.isBattleDay) return;
    g.flags.battleLo = lo;
    if (g.isBattleDay) {
      news(g, 'resume', '万川复牌', `停牌半年之后，万川今天复牌。重组预案${flag(g, 'placementPass') ? '已经股东大会通过' : flag(g, 'placementBoard') ? '还悬而未决' : '没有拿出来'}。开盘就封在跌停。`, 1);
      if (isRaider(g)) {
        const c = g.credit;
        const lineAt = c && c.loan > 0 && g.player.pos > 0 ? Math.max(0, Math.round(((c.loan * c.line - Math.max(0, g.player.cash)) / g.player.pos) * 100)) : 0;
        g.decision = {
          id: 'resume',
          title: '复牌即跌停',
          body: `开盘封死在 ${yuan(ex.last)}，跌停板上压着成山的卖单。${lineAt ? `你的资管计划平仓线在 ${yuan(lineAt)} 附近——再一个跌停就到了。` : '你没有借资管计划的钱，不会被强平。'}`,
          choices: [
            { id: 'wait', label: '不动', detail: '跌停板上什么都做不了，等。' },
            { id: 'prop', label: '动用万能险的钱，在跌停价托盘', detail: '买下跌停板上的卖单：价格也许能撬开，钱也许会打水漂。' },
            ...(c && c.loan > 0 ? [{ id: 'topup', label: '补仓：把现金还给优先级，降低杠杆', detail: '平仓线往下挪。代价是手里的子弹少了。' }] : []),
          ],
          countdown: 25,
        };
      } else {
        g.decision = {
          id: 'resume-mgmt',
          title: '复牌即跌停',
          body: `开盘封死在 ${yuan(ex.last)}。小股东在电话里骂：停了半年，一复牌就跌停。记者在等你表态。`,
          choices: [
            { id: 'silent', label: '不表态', detail: '让市场自己消化。' },
            { id: 'welcome', label: '公开表态：欢迎鼎华做财务投资者', detail: '缓和一点。小股东和监管会记住你给了台阶。' },
            { id: 'hard', label: '公开表态：绝不接受野蛮人', detail: '强硬到底。小股东里有人鼓掌，也有人觉得是你害他们跌停。' },
          ],
          countdown: 25,
        };
      }
    }
  },

  onTick(g) {
    const m = g.market;
    const t = m.t - 1;
    checkStake(g);
    // 史料里的消息节点
    if (g.dayIndex === 0 && t === mi('10:00')) news(g, 'first-stake', '一家保险公司举牌万川', '恒利人寿公告：持有万川 5% 的股份。市场的第一反应是：这是谁？', 1);
    if (g.dayIndex === 3 && t === mi('10:30')) rumor(g, 'leverage', '鼎华的钱一半是借来的', '券商的朋友说：鼎华系通过九个资管计划加了杠杆，优先级资金要求的平仓线不低。', '券商资管部', 0.85);
    if (g.isBattleDay && t === mi('10:00') && flag(g, 'propped')) news(g, 'prop', '有资金在跌停板上大笔承接', '跌停板上的卖单被成片吃掉。市场猜是鼎华系。', 0.9);
  },

  onDayEnd(g) {
    if (g.isBattleDay) return;
    // 史料：8 月底华岳被超过后增持了一点；你请过它，它会多买
    if (g.dayIndex === 1 && stake(g, RAIDER) > stake(g, HUAYUE)) {
      const add = lean(g, 'huayue') < -0.2 ? 0.02 : 0.004;
      offBook(g, HUAYUE, stake(g, HUAYUE) + add, 0.02);
      news(g, 'huayue-add', `华岳集团增持，重回第一大股东`, `华岳集团宣布增持万川至 ${pctS(stake(g, HUAYUE))}。`, 1);
    }
  },

  onNight(g) {
    const d = g.dayIndex;
    const ex = g.market.ex;
    if (g.isHalted) return haltNight(g);
    if (g.isAftermath) return aftermathNight(g);
    paper(g);
    // 夜里到下一个交易日之间隔着几周：险资（电脑扮演时）照着史料继续收
    if (!isRaider(g) && !flag(g, 'raiderStopped') && !halted(g)) {
      const next = [0.1, 0.1504, 0.1735, 0.22, 0.2245][d] ?? 0;
      if (next > stake(g, RAIDER)) {
        offBook(g, RAIDER, next, 0.03);
        checkStake(g);
      }
    }
    // 安泰在 12 月初悄悄收了 5% 多
    if (d === 3 && !stake(g, ANTAI)) {
      offBook(g, ANTAI, 0.0519, 0.03);
      news(g, 'antai-in', '安泰保险举牌万川', `安泰保险公告持有万川 ${pctS(stake(g, ANTAI))}，表示“支持管理层，看好公司长期发展”。它的票投给谁，没人说得准。`, 1);
    }
    mgmtNight(g);
    if (d === 0) rumor(g, 'who', '恒利人寿背后是鼎华系', '深圳的朋友说：恒利人寿是鼎华系的，卖万能险起家，收益率比银行理财高一截。', '深圳地产圈', 0.9);
    void ex;
  },

  offers(g, npcId) {
    const out: ExchangeOffer[] = [];
    if (npcId === 'fu') out.push(isRaider(g) ? { id: 'seats', label: '许诺：改组后华岳拿三个董事席位', cost: '你得到的董事会会小一圈' } : { id: 'consult', label: '把重组方案先拿给华岳过目', cost: '方案可能会被改得面目全非' });
    if (npcId === 'wu') out.push(isRaider(g) ? { id: 'deal', label: '和安泰谈：投票支持你，你把一块地卖给它', cost: '一笔不划算的交易，约 20 亿元' } : { id: 'seat', label: '给安泰一个董事席位', cost: '董事会里多一个摇摆的人' });
    if (npcId === 'zhong') out.push({ id: 'listen', label: '去他家里听他讲讲', cost: '一个晚上' });
    if (npcId === 'xu') out.push({ id: 'story', label: '给许静一份材料', cost: isRaider(g) ? '管理层的事会上报纸' : '鼎华的资金来源会上报纸' });
    if (npcId === 'lin' && !isRaider(g)) out.push({ id: 'knight', label: '请鹏城地铁当白衣骑士', cost: '要停牌、要重组、要股东大会三分之二' });
    return out;
  },

  social(g, verb, npcId, option) {
    const n = g.npc(npcId)!;
    const date = `${g.day.date} ${g.phase === 'night' ? '晚上' : g.time}`;
    const out = (ok: boolean, effects: string[], dl: Pick<DialogueIntent, 'convey' | 'tone' | 'playerMove'>): SocialOutcome => ({ npc: npcId, verb, ok, effects, dialogue: { npcId, verb, numbers: [], date, fallback: dl.convey, ...dl } });
    const raider = isRaider(g);
    const toward = raider ? 1 : -1;
    switch (verb) {
      case 'probe': {
        g.relate(npcId, 2, '你主动来聊');
        g.flags[`know-${npcId}`] = true;
        const s = stance(g, npcId);
        return out(true, [`${n.name} 关系 +2`, '摸清了对方的立场（见“对手动向”）'], { playerMove: `问${n.name}怎么看这件事`, ...s });
      }
      case 'exchange':
        switch (`${npcId}:${option}`) {
          case 'fu:seats':
            shift(g, 'huayue', 0.3);
            g.relate('fu', 10);
            return out(true, ['华岳立场 → 更靠近你', '傅成 关系 +10'], { playerMove: '许诺改组后给华岳三个董事席位', convey: ['这个要请示', '不过，管理层这几年确实不太尊重股东'], tone: 'neutral' });
          case 'fu:consult':
            g.flags.consulted = true;
            shift(g, 'huayue', -0.3);
            g.relate('fu', 10);
            return out(true, ['华岳立场 → 更靠近你', '停牌重组时华岳不会觉得被绕过', '傅成 关系 +10'], { playerMove: '把重组方案先送到华岳', convey: ['按程序走，我们会认真研究', '你们早该这样'], tone: 'warm' });
          case 'wu:deal':
            g.player.cash -= 2_000_000_000;
            shift(g, 'antai', 0.5);
            g.relate('wu', 15);
            return out(true, ['现金 −20 亿元', '安泰立场 → 站到你这边', '吴锦 关系 +15'], { playerMove: '用一块地换安泰的票', convey: ['我们一向尊重市场', '这块地的位置不错'], tone: 'warm' });
          case 'wu:seat':
            shift(g, 'antai', -0.5);
            g.relate('wu', 15);
            return out(true, ['安泰立场 → 站到管理层这边', '吴锦 关系 +15'], { playerMove: '许给安泰一个董事席位', convey: ['我们一向支持管理层', '董事会里多一个声音是好事'], tone: 'warm' });
          case 'zhong:listen':
            shift(g, 'retail', 0.1 * toward);
            g.relate('zhong', 10);
            return out(true, ['小股东立场 → 更靠近你', '钟伯 关系 +10'], { playerMove: '去钟伯家里坐了一晚', convey: ['我只想知道，谁会对公司好', '小股东的票，也是票'], tone: 'warm' });
          case 'xu:story':
            g.relate('xu', 5);
            if (raider) {
              addMgmtHeat(g, 10, '管理层持股计划被报道');
              shift(g, 'retail', 0.08);
              g.spin(0.4, '万川管理层的“盈安合伙”：谁在用员工的钱加杠杆', '许静');
            } else {
              addRaiderHeat(g, 12, '资金来源被报道');
              shift(g, 'retail', -0.08);
              g.spin(-0.5, '万能险、九个资管计划、四倍杠杆：鼎华的钱从哪里来', '许静');
            }
            return out(true, ['明早的头条', raider ? '管理层热度 +10' : '鼎华热度 +12'], { playerMove: '给许静一份材料', convey: ['我会核实两个信源', '谢谢，但我不替任何人写稿'], tone: 'neutral' });
          case 'lin:knight':
            g.flags.knight = true;
            g.relate('lin', 10);
            return out(true, ['鹏城地铁愿意当白衣骑士：停牌后可以提重组预案'], { playerMove: '请林建出手', convey: ['地铁加物业，是个好模式', '程序要走通，股东大会要过'], tone: 'neutral' });
        }
        return out(false, ['对方没什么可换的'], { playerMove: '想做个交换', convey: ['今天就算了'], tone: 'neutral' });
      case 'ally': {
        if (npcId === 'fu') {
          shift(g, 'huayue', 0.2 * toward);
          g.relate('fu', 5);
          return out(true, [`华岳立场 → ${raider ? '靠近你' : '靠近管理层'}`], { playerMove: '请华岳站在一起', convey: ['我们是国有股东，要从大局出发', '会认真考虑'], tone: 'neutral' });
        }
        if (npcId === 'wu') {
          shift(g, 'antai', 0.15 * toward);
          return out(true, ['安泰立场 → 稍稍靠近你'], { playerMove: '请安泰站在一起', convey: ['我们一向尊重市场'], tone: 'neutral' });
        }
        return out(false, ['对方没有兴趣'], { playerMove: `向${n.name}提议合作`, convey: ['不必了'], tone: 'cold' });
      }
      case 'betray':
        return out(false, ['你们之间没有约定'], { playerMove: '想撕毁一个不存在的约定', convey: ['我们约好什么了？'], tone: 'neutral' });
      case 'report': {
        if (npcId !== 'chang') return out(false, ['举报要找监管'], { playerMove: `向${n.name}举报`, convey: ['这不归我管'], tone: 'neutral' });
        if (raider) {
          addMgmtHeat(g, 15, '被举报内部人控制');
          shift(g, 'huayue', 0.05);
          return out(true, ['管理层热度 +15：内部人控制、为停牌而停牌'], { playerMove: '举报万川管理层内部人控制', convey: ['我们会依法核查', '各方都要依法合规'], tone: 'neutral' });
        }
        addRaiderHeat(g, 15, '资金来源被举报');
        g.relate('chang', 5);
        return out(true, ['鼎华热度 +15：万能险资金、资管计划杠杆'], { playerMove: '举报鼎华系的资金来源', convey: ['我们会依法核查', '短钱长投的问题，我们一直在关注'], tone: 'neutral' });
      }
    }
    return out(false, [], { playerMove: '', convey: [''], tone: 'neutral' });
  },

  decide(g, id, choice) {
    const p = g.player;
    const ex = g.market.ex;
    switch (`${id}:${choice}`) {
      case 'resume:prop': {
        // 在跌停价上挂一大笔买单，吃掉排队的卖单
        const q = Math.min(Math.floor(power(g, p.id) / (ex.last / 100)), Math.round(totalShares(g) * 0.015));
        if (q > 0) g.pending.push({ owner: p.id, side: 'buy', qty: q, type: 'limit', price: ex.priceBand()[0] });
        g.flags.propped = true;
        break;
      }
      case 'resume:topup': {
        const c = g.credit;
        if (c) {
          const amt = Math.min(c.loan, Math.max(0, p.cash));
          p.cash -= amt;
          g.credit = { ...c, loan: c.loan - amt };
        }
        break;
      }
      case 'resume-mgmt:welcome':
        shift(g, 'retail', 0.05);
        shift(g, 'huayue', -0.05);
        g.flags.welcomed = true;
        g.reputation += 5;
        break;
      case 'resume-mgmt:hard':
        shift(g, 'retail', -0.05);
        addRaiderHeat(g, 5, '管理层公开指责');
        g.spin(-0.4, '万川董事长：绝不接受野蛮人', '万川管理层');
        break;
    }
  },

  chatIntent(g, npcId) {
    const s = stance(g, npcId);
    return { npcId, verb: 'chat', playerMove: '随便聊聊', ...s, date: g.day.date, fallback: s.convey };
  },

  reckon(g) {
    return reckon(g);
  },
};

// ───────────── 夜晚 ─────────────

function paper(g: Game) {
  const rc = g.recaps[g.recaps.length - 1];
  const prev = g.recaps.length > 1 ? g.recaps[g.recaps.length - 2].close : START_2015;
  const pct = rc ? ((rc.close - prev) / prev) * 100 : 0;
  g.papers.push({
    day: g.dayIndex,
    headline: `万川收于 ${yuan(rc?.close ?? g.market.last)}，鼎华系持股 ${pctS(stake(g, RAIDER))}`,
    sub: pct >= 0 ? `较上次报道上涨 ${pct.toFixed(1)}%` : `较上次报道下跌 ${(-pct).toFixed(1)}%`,
    facts: [`华岳集团 ${pctS(stake(g, HUAYUE))}`, `安泰保险 ${pctS(stake(g, ANTAI))}`],
  });
}

function haltNight(g: Game) {
  const first = g.dayIndex === HALT0;
  g.papers.push({ day: g.dayIndex, headline: first ? (halted(g) ? '万川停牌已近三个月，重组方案仍未出炉' : `鼎华系持股升至 ${pctS(stake(g, RAIDER))}`) : '万川股东大会：今晚见分晓', sub: halted(g) ? '股票停牌中' : '控制权之争转到会议室', facts: [] });
  // 没有停牌：鼎华（电脑扮演时）这几个月里接着在二级市场收
  if (!halted(g) && !isRaider(g) && !flag(g, 'raiderStopped')) {
    offBook(g, RAIDER, Math.min(0.299, stake(g, RAIDER) + 0.035), 0.03);
    checkStake(g);
  }
  if (first) {
    // 电脑扮演的管理层：请白衣骑士、提重组预案；董事会能不能过，看华岳
    if (isRaider(g) && halted(g) && !flag(g, 'placementBoard')) {
      g.flags.knight = true;
      proposePlacement(g);
    }
    // 电脑扮演的险资：过了 10% 就提议召开临时股东大会
    if (!isRaider(g) && stake(g, RAIDER) >= 0.1 && !flag(g, 'egm')) {
      g.flags.egm = true;
      addRaiderHeat(g, 8, '提议罢免全体董事');
      news(g, 'egm-call', '鼎华系提议召开临时股东大会，罢免全体董事', '鼎华系发函：提请罢免包括董事长在内的全体董事和监事。', 1);
    }
  } else {
    meeting(g, 'egm');
  }
}

function proposePlacement(g: Game): CardResult {
  // 董事会：11 席，华岳 3 席。华岳反对、独董回避，预案就过不了
  const hl = lean(g, 'huayue');
  const ok = hl < 0.3;
  g.flags.placementBoard = ok;
  g.addIntel({
    id: 'board-placement',
    title: `董事会：向鹏城地铁定向增发的预案${ok ? '通过' : '被否决'}`,
    body: ok
      ? '十一名董事里七票赞成。预案年底提交股东大会，需要三分之二通过。'
      : '华岳的三名董事当场反对，指责管理层“没有和股东充分沟通”。一名独立董事以利益冲突为由回避，预案没有过半。',
    source: '董事会',
    credibility: 1,
    kind: 'news',
  });
  if (!ok) shift(g, 'huayue', 0.1);
  return { ok, title: ok ? '董事会通过重组预案' : '董事会否决重组预案', effects: [ok ? '年底股东大会表决（三分之二）' : '华岳当场翻脸'] };
}

function aftermathNight(g: Game) {
  const first = g.dayIndex === BATTLE_2015 + 1;
  if (first) {
    regulatorNight(g);
    // 年底的股东大会：重组预案（监管出手之后，鼎华的票可能已经被限制）；复牌后才提议的罢免案也在这时表决
    meeting(g, 'egm');
    meeting(g, 'placement');
    g.papers.push({ day: g.dayIndex, headline: flag(g, 'crackdown') ? '监管重拳：险资“野蛮人”被叫停' : '万川之争进入僵持', sub: `万川收于 ${yuan(g.market.last)}`, facts: [] });
  } else {
    // 清算：华岳退场，股权尘埃落定
    const ex = g.market.ex;
    ex.last = Math.max(ex.last, 2050);
    if (!flag(g, 'egmPass') && lean(g, 'huayue') < 0.35) {
      // 史料：华岳把股份转给了鹏城地铁
      const q = ex.acct(HUAYUE).pos;
      ex.acct(HUAYUE).pos = 0;
      ex.acct(PENG).pos += q;
      g.flags.huayueExit = true;
      news(g, 'huayue-exit', '华岳集团把万川股份转让给鹏城地铁', `华岳集团以协议转让的方式退出，鹏城地铁合计持有 ${pctS(stake(g, PENG))}。`, 1);
    }
    g.papers.push({ day: g.dayIndex, headline: '万川股权之争落幕', sub: '董事会换届在即', facts: [] });
  }
}

// ───────────── 行动卡 ─────────────

function raiderCards(g: Game): CardDef[] {
  const d = g.dayIndex;
  const p = stake(g, RAIDER);
  const used = (k: string) => !!flag(g, `used-${k}-${d}`);
  // 几周时间：可以跨过一条举牌线（公告、停三天、接着买），在下一条线前停下
  const next = Math.min(0.3, (lines(g) + 2) * 0.05);
  const out: CardDef[] = [];
  if (!g.isHalted && !g.isAftermath && !halted(g)) {
    out.push({
      id: 'offbook',
      name: '接下来几周，在二级市场分批收',
      group: '收购',
      color: 'white',
      does: `几周里慢慢买到 ${pctS(next - 0.0005)}：中间跨过一条举牌线（公告、停三天、接着买），在下一条线前停下。均价比现在高 3%。`,
      cost: `约 ${fmtYi(Math.max(0, (next - 0.0005) * totalShares(g) - g.player.pos) * (g.market.last / 100) * 1.03)}。`,
      when: 'night',
      blocked: used('offbook') ? '这几周已经在收了' : p >= 0.295 ? '再买就要走要约' : power(g, RAIDER) < 1e9 ? '钱不够了：借资管计划，或者卖万能险' : undefined,
    });
    out.push({
      id: 'concert',
      name: '找几个“朋友”的账户代持',
      group: '收购',
      color: 'black',
      does: '冷静期里接着买：用几个不披露关系的资管计划和朋友的账户。今天剩下的时间不受举牌冷静期限制。',
      cost: '隐瞒一致行动人，监管热度 +20；被查出来就是另一个罪名。',
      when: 'trading',
      blocked: g.player.freeze?.rule !== 'stake-5' ? '眼下没有被冷静期挡住' : undefined,
    });
  }
  out.push({
    id: 'policy',
    name: '再卖一批万能险',
    group: '资金',
    color: 'grey',
    does: `承诺 7% 的年化收益，几周里收进 150 亿元保费（最多三轮，已卖 ${num(g, 'policies')} 轮）。`,
    cost: '监管热度 +10；保户的钱是要还的：结局时连本带息算作负债。',
    when: 'night',
    blocked: flag(g, 'crackdown') ? '万能险新业务被叫停' : num(g, 'policies') >= 3 ? '已经卖了三轮，渠道卖不动了' : used('policy') ? '这一轮已经卖过了' : undefined,
  });
  if (!g.isAftermath && !g.isHalted && !halted(g))
    out.push({
      id: 'tender',
      name: '部分要约：以溢价 10% 收购 5%',
      group: '收购',
      color: 'white',
      does: '向全体股东公开报价，按市价加 10% 收购 5% 的股份。不经过订单簿，不推高股价，也不受冷静期限制；30% 以上只能走这条路。',
      cost: `约 ${fmtYi(totalShares(g) * 0.05 * (g.market.last / 100) * 1.1)}；要约期间股价会贴着要约价。`,
      when: 'night',
      blocked: flag(g, 'tendered') ? '已经发过要约' : power(g, RAIDER) < totalShares(g) * 0.05 * (g.market.last / 100) * 1.1 ? '钱不够' : undefined,
    });
  if (g.isHalted || g.isAftermath)
    out.push({
      id: 'egm',
      name: '提议召开临时股东大会，罢免全体董事',
      group: '控制权',
      color: 'grey',
      does: '单独持股 10% 以上就能提议。罢免要过半数到场表决权。',
      cost: '公开撕破脸：监管热度 +8，管理层会更强硬。',
      when: 'night',
      blocked: flag(g, 'egm') ? '已经提议过' : p < 0.1 ? '持股不到 10%' : flag(g, 'egmVoted') ? '已经表决过' : undefined,
    });
  out.push({
    id: 'pr',
    name: '媒体：我们只是财务投资者',
    group: '舆论',
    color: 'white',
    does: '让相熟的媒体写一篇“险资是长期财务投资者”。明早的头条偏多，小股东对你的观感好一点。',
    cost: '无。',
    when: 'night',
    blocked: used('pr') ? '今晚已经找过' : undefined,
  });
  return out;
}

function raiderPlay(g: Game, id: string, _target?: string): CardResult {
  const d = g.dayIndex;
  const mark = (k: string) => (g.flags[`used-${k}-${d}`] = true);
  const R = (ok: boolean, title: string, effects: string[]): CardResult => ({ ok, title, effects });
  switch (id) {
    case 'offbook': {
      mark('offbook');
      const next = Math.min(0.3, (lines(g) + 2) * 0.05) - 0.0005;
      const q = offBook(g, RAIDER, next, 0.03);
      checkStake(g);
      return R(q > 0, q > 0 ? `几周里收了 ${gu(q)}` : '钱不够了', [`持股 ${pctS(stake(g, RAIDER))}`, `还能买 ${fmtYi(power(g, RAIDER))}`]);
    }
    case 'concert':
      delete g.player.freeze;
      g.addHeat(20, '隐瞒一致行动人');
      if (g.principleId === 'no-violation') g.crossLine('隐瞒一致行动人');
      return R(true, '几个“朋友”的账户开始买', ['今天剩下的时间不受冷静期限制', '监管热度 +20']);
    case 'policy':
      mark('policy');
      g.flags.policies = num(g, 'policies') + 1;
      g.flags.policyDebt = num(g, 'policyDebt') + 15_000_000_000;
      g.player.cash += 15_000_000_000;
      g.addHeat(10, '万能险短钱长投');
      return R(true, '万能险卖出去了', ['现金 +150 亿元', '欠保户 150 亿元（加 7% 收益）', '监管热度 +10']);
    case 'tender': {
      g.flags.tendered = true;
      const px = Math.round(g.market.last * 1.1);
      const q = fill(g, RAIDER, Math.round(totalShares(g) * 0.05), px);
      const a = g.player;
      if (a.freeze?.rule === 'tender-30') delete a.freeze;
      checkStake(g);
      g.market.ex.last = Math.max(g.market.ex.last, Math.round(px * 0.98));
      shift(g, 'retail', 0.1);
      return R(true, `要约收购完成：${gu(q)}，每股 ${yuan(px)}`, [`持股 ${pctS(stake(g, RAIDER))}`, '卖给你的小股东拿到了溢价：小股东对你的观感更好']);
    }
    case 'egm':
      g.flags.egm = true;
      g.addHeat(8, '提议罢免全体董事');
      shift(g, 'huayue', -0.05);
      news(g, 'egm-call', '鼎华系提议召开临时股东大会，罢免全体董事', '鼎华系发函：提请罢免包括董事长在内的全体董事和监事。', 1);
      return R(true, '提议已经送达', ['下一个夜晚股东大会表决（过半数）', '监管热度 +8']);
    case 'pr':
      mark('pr');
      g.spin(0.5, '鼎华系：我们是长期财务投资者，看好万川的价值', '鼎华系');
      shift(g, 'retail', 0.05);
      return R(true, '明早见报', ['明早的头条偏多', '小股东观感 +']);
  }
  return R(false, '没有效果', []);
}

function defenderCards(g: Game): CardDef[] {
  const d = g.dayIndex;
  const used = (k: string) => !!flag(g, `used-${k}-${d}`);
  const out: CardDef[] = [];
  if (!halted(g) && !g.isHalted && !g.isAftermath)
    out.push({
      id: 'halt',
      name: '停牌：筹划重大资产重组',
      group: '盾牌',
      color: 'grey',
      does: '明天起停牌。鼎华系买不了了，剩下的交易日都跳过，直到复牌。',
      cost: '小股东怨气上升；没有像样的重组方案，就是“为停牌而停牌”，监管会问询；复牌那天可能连续跌停。没先和华岳通气，华岳会觉得被绕过。',
      when: 'night',
    });
  if (!g.isHalted && !g.isAftermath && !halted(g))
    out.push({
      id: 'buyback',
      name: '公司回购 1%',
      group: '盾牌',
      color: 'white',
      does: '用公司的钱在二级市场回购 1% 的股份并注销：股价抬高，鼎华再买就更贵。',
      cost: '公司现金约 30 亿元。',
      when: 'trading',
      blocked: num(g, 'companyCash') < 3_000_000_000 ? '公司账上的钱不够了' : used('buyback') ? '今天已经回购过' : undefined,
    });
  out.push({
    id: 'mgmt-buy',
    name: '管理层合伙企业加杠杆增持',
    group: '盾牌',
    color: 'grey',
    does: '盈安合伙用员工的奖金做劣后、券商资管做优先，几周里增持 2%。管理层手里的票多一点。',
    cost: '监管热度 +6；员工的奖金押在了股价上。',
    when: 'night',
    blocked: flag(g, 'mgmtBought') ? '已经加过一次' : halted(g) && !g.isAftermath ? '停牌中买不了' : undefined,
  });
  out.push({
    id: 'huayue-add',
    name: '请华岳增持，守住第一大股东',
    group: '盟友',
    color: 'white',
    does: '华岳如果站在你这边，会在接下来几周里增持到鼎华前面。',
    cost: '华岳立场要偏向管理层才肯出手。',
    when: 'night',
    blocked: halted(g) || g.isAftermath ? '停牌中买不了' : flag(g, 'huayueBuy') ? '已经请过' : lean(g, 'huayue') > -0.15 ? '华岳还没站到你这边（先去谈）' : undefined,
  });
  if (g.isHalted && g.dayIndex === HALT0)
    out.push({
      id: 'placement',
      name: '重组预案：向鹏城地铁定向增发',
      group: '盾牌',
      color: 'white',
      does: '鹏城地铁以地铁上盖物业注入万川，换取扩大后股本的约 20%。董事会先表决（华岳不反对才过），年底提交股东大会（三分之二）。通过了，鼎华被稀释、鹏城成为第一大股东。鼎华的票要是被监管限制了，三分之二就容易得多。',
      cost: '华岳的股份也被稀释，它多半会反对。',
      when: 'night',
      blocked: !halted(g) ? '没有停牌，就谈不上重组' : !flag(g, 'knight') ? '先请鹏城地铁出手（人脉）' : flag(g, 'placementBoard') != null ? '已经提交过' : undefined,
    });
  out.push({
    id: 'bylaw',
    name: '悄悄修改董事会议事规则',
    group: '盾牌',
    color: 'black',
    does: '把罢免董事的门槛从过半数改成三分之二，写进一份没人细看的章程修订里。',
    cost: '监管热度 +20；被查出来，规则作废，你也成了“内部人控制”的样板。',
    when: 'night',
    blocked: flag(g, 'bylaw') ? '已经改过' : flag(g, 'egmVoted') ? '来不及了' : undefined,
  });
  out.push({
    id: 'speech',
    name: '内部讲话：我们不欢迎鼎华',
    group: '舆论',
    color: 'white',
    does: '明早的头条偏空。管理层、员工和一部分小股东会站到你这边；华岳会觉得你把话说得太满。',
    cost: '鼎华会更强硬；股价可能先跌一截。',
    when: 'night',
    blocked: flag(g, 'speech') ? '已经讲过' : undefined,
  });
  return out;
}

function defenderPlay(g: Game, id: string, _target?: string): CardResult {
  const d = g.dayIndex;
  const R = (ok: boolean, title: string, effects: string[]): CardResult => ({ ok, title, effects });
  switch (id) {
    case 'halt':
      declareHalt(g);
      addMgmtHeat(g, 6, '以重组为名停牌');
      return R(true, '明天起停牌', ['剩下的交易日跳过，直到复牌', flag(g, 'consulted') ? '华岳事先知道' : '华岳觉得被绕过了']);
    case 'buyback': {
      g.flags[`used-buyback-${d}`] = true;
      g.flags.companyCash = num(g, 'companyCash') - 3_000_000_000;
      const q = Math.round(totalShares(g) * 0.01);
      g.addPlanFromScript({ label: '公司回购', cond: 'now', price: 0, side: 'buy', qty: q, spread: 20 });
      shift(g, 'retail', -0.03);
      return R(true, '回购开始', ['20 分钟里买入 1%', '公司现金 −30 亿元']);
    }
    case 'mgmt-buy':
      g.flags.mgmtBought = true;
      offBook(g, YINGAN, stake(g, YINGAN) + 0.02, 0.03);
      g.addHeat(6, '员工奖金加杠杆增持');
      return R(true, '盈安合伙增持', [`管理层持股 ${pctS(stake(g, YINGAN))}`, '监管热度 +6']);
    case 'huayue-add': {
      g.flags.huayueBuy = true;
      offBook(g, HUAYUE, Math.min(0.299, Math.max(stake(g, HUAYUE), stake(g, RAIDER)) + 0.01), 0.03);
      news(g, `huayue-add-${d}`, '华岳集团增持万川', `华岳集团几周里增持到 ${pctS(stake(g, HUAYUE))}，重新成为第一大股东。`, 1);
      return R(true, '华岳增持', [`华岳持股 ${pctS(stake(g, HUAYUE))}`]);
    }
    case 'placement':
      return proposePlacement(g);
    case 'bylaw':
      g.flags.bylaw = true;
      g.addHeat(20, '暗改议事规则');
      if (g.principleId === 'no-violation') g.crossLine('暗改公司章程');
      g.darkDeed('bylaw', '暗改议事规则');
      return R(true, '章程修订草案混进了年度议案', ['罢免董事要三分之二', '监管热度 +20']);
    case 'speech':
      g.flags.speech = true;
      g.spin(-0.6, '万川董事长：不欢迎信用不足的险资做第一大股东', '万川管理层');
      shift(g, 'retail', -0.1);
      shift(g, 'huayue', 0.08);
      addRaiderHeat(g, 4, '被管理层公开质疑');
      return R(true, '讲话传遍了朋友圈', ['明早的头条偏空', '小股东和员工更靠近你', '华岳觉得你话说得太满']);
  }
  return R(false, '没有效果', []);
}

// ───────────── 顶栏、对手动向 ─────────────

const leanWord = (x: number) => (x > 0.35 ? '站鼎华' : x > 0.1 ? '偏鼎华' : x < -0.35 ? '站管理层' : x < -0.1 ? '偏管理层' : '观望');

function meters(g: Game): Meter[] {
  const r = stake(g, RAIDER);
  const out: Meter[] = [
    { id: 'stake', label: '鼎华持股', value: pctS(r), tip: `下一条举牌线 ${Math.min(30, (lines(g) + 1) * 5)}%；华岳 ${pctS(stake(g, HUAYUE))}，安泰 ${pctS(stake(g, ANTAI))}${stake(g, PENG) ? `，鹏城 ${pctS(stake(g, PENG))}` : ''}`, tone: isRaider(g) ? 'good' : 'bad' },
    { id: 'huayue', label: '华岳', value: leanWord(lean(g, 'huayue')), tip: '第一大股东华岳集团的立场。罢免董事会、定向增发，它的票最重。' },
    { id: 'antai', label: '安泰', value: leanWord(lean(g, 'antai')), tip: '安泰保险的立场。它手里的票谁出价高就给谁。' },
    { id: 'retail', label: '小股东', value: leanWord(lean(g, 'retail')), tip: '到场的中小股东怎么投。股价、要约溢价、停牌和讲话都会改变它。' },
  ];
  out.push({ id: 'heat', label: '监管热度', pips: { on: g.heatTier(), of: 5, tone: 'heat' }, tip: isRaider(g) ? '热度到 50，年底那篇“野蛮人”的讲话就会点你的名。' : '管理层自己的热度：停牌、暗改章程、员工加杠杆都会记一笔。' });
  return out;
}

function clocks(g: Game): Clock[] {
  const out: Clock[] = [];
  const r = stake(g, RAIDER);
  if (!isRaider(g))
    out.push({
      id: 'raid',
      who: 'ye',
      name: '鼎华：一口一口地买',
      segs: 6,
      filled: Math.min(6, lines(g)),
      known: true,
      then: '持股到 10% 就能提议罢免董事会；超过华岳就是第一大股东；30% 以上只能走要约。',
      now: `持股 ${pctS(r)}。${halted(g) ? '停牌了，它买不了。' : '它会追到华岳前面。'}`,
      counter: '停牌能把它冻在半路；请华岳增持能挡在它前面；举报资金来源能让监管提前出手。',
      tone: 'threat',
      state: flag(g, 'crackdown') ? 'defused' : 'running',
    });
  else
    out.push({
      id: 'shield',
      who: 'yu',
      name: g.flags['know-yu'] ? '管理层：停牌的盾牌' : '管理层在盘算什么',
      segs: 4,
      filled: halted(g) ? 4 : Math.min(3, Math.floor(r / 0.05)),
      known: !!g.flags['know-yu'],
      then: '股票停牌，你买不了；停牌期间他们会请白衣骑士定向增发，稀释你。',
      now: halted(g) ? '已经停牌。' : '你过了 20%，或者 12 月以后过了 15%，他们就会停牌。',
      counter: '赶在停牌前买够；争取华岳，让定增在董事会就过不了。',
      tone: 'threat',
      state: halted(g) ? 'fired' : 'running',
    });
  const heat = raiderHeat(g);
  out.push({
    id: 'reg',
    who: 'chang',
    name: '监管：险资的钱从哪来',
    segs: 5,
    filled: Math.min(5, Math.floor(heat / 10)),
    known: true,
    then: '年底一篇讲话点名“野蛮人”：万能险新业务被叫停，鼎华的股份被限制表决。',
    now: `鼎华的热度 ${Math.round(heat)}，到 50 就会被点名。`,
    counter: isRaider(g) ? '少卖万能险、别隐瞒一致行动人。' : '举报它的资金来源、让记者去查。',
    tone: isRaider(g) ? 'threat' : 'friend',
    state: flag(g, 'crackdown') ? 'fired' : flag(g, 'regulatorSpoke') ? 'defused' : 'running',
  });
  return out;
}

function stance(g: Game, npcId: string): Pick<DialogueIntent, 'convey' | 'tone' | 'numbers'> {
  const l = npcId === 'fu' ? lean(g, 'huayue') : npcId === 'wu' ? lean(g, 'antai') : npcId === 'zhong' ? lean(g, 'retail') : 0;
  const mine = isRaider(g) ? l : -l;
  // 台词里可以引用的数字：鼎华和华岳的持股（百分比）
  const numbers = [Math.round(stake(g, RAIDER) * 10000) / 100, Math.round(stake(g, HUAYUE) * 10000) / 100];
  if (npcId === 'yu') return { convey: ['大家都是股东', halted(g) ? '停牌是为了重组' : '如果持股到了一定比例，公司会考虑一切选项'], tone: 'neutral', numbers };
  if (npcId === 'chang') return { convey: ['保险资金要姓“保”', '我们在看资金来源'], tone: 'cold', numbers };
  if (npcId === 'lin') return { convey: ['地铁加物业，是个好模式', '程序要走得通'], tone: 'neutral', numbers };
  if (npcId === 'xu') return { convey: ['九个资管计划的杠杆，我算了三遍', '管理层的合伙企业也要说清楚'], tone: 'neutral', numbers };
  return { convey: mine > 0.2 ? ['我们站在一起', '具体怎么投，到时候看'] : mine < -0.2 ? ['你们的做法，我们不认同', '到时候按程序投票'] : ['还要再看看', '要从大局出发'], tone: mine > 0.2 ? 'warm' : mine < -0.2 ? 'cold' : 'neutral', numbers };
}

export function groupName(_g: Game, who: string): string {
  return { gravity: '历史引力（做市与套利资金）', crowd: '散户', trend: '趋势资金', player: '你', [RAIDER]: '鼎华系', [HUAYUE]: '华岳集团', [ANTAI]: '安泰保险', [YINGAN]: '盈安合伙（管理层）', [PENG]: '鹏城地铁' }[who] ?? who;
}

function briefing(g: Game): string {
  return isRaider(g)
    ? `你已经悄悄收了万川 ${pctS(stake(g, RAIDER))}，账上有 ${fmtYi(g.player.cash)}（万能险收来的保费）。每跨过一条 5% 的线就要举牌、停几天；30% 以上只能走要约。资管计划能借你两倍（账户面板里的“垫资”）。目标：超过华岳（${pctS(stake(g, HUAYUE))}），到 10% 以上提议罢免董事会，在股东大会上拿到过半数。`
    : `鼎华系已经持有万川 ${pctS(stake(g, RAIDER))}，还在买。你和管理层只有不到 1%。你手里的牌：停牌、请白衣骑士定增、请华岳增持、回购、举报资金来源（按 A 打开）。每一票落在谁手里，看你怎么对待华岳、安泰和小股东。`;
}

// ───────────── 结局 ─────────────

function reckon(g: Game): Ending {
  const ex = g.market.ex;
  const r = stake(g, RAIDER);
  const top = [
    ['鼎华系', r],
    ['华岳集团', stake(g, HUAYUE)],
    ['鹏城地铁', stake(g, PENG)],
    ['安泰保险', stake(g, ANTAI)],
  ].sort((a, b) => (b[1] as number) - (a[1] as number))[0];
  const largest = top[0] as string;
  const egm = !!flag(g, 'egmPass');
  const crack = !!flag(g, 'crackdown');
  const busted = !!flag(g, 'otcLiquidated') || g.bankrupt;
  const placed = !!flag(g, 'placementPass');
  const raider = isRaider(g);
  const startEq = (flag(g, 'startEq') as number) || 1;
  // 借来的钱要还：资管计划的优先级、万能险保户的本金和承诺的收益
  const eq = ex.equity(g.player) - (g.credit?.loan ?? 0) - num(g, 'policyDebt') * 1.07;
  const ret = raider ? (eq - startEq) / startEq : 0;
  const clean = g.heatTier() <= 2 && g.linesCrossed === 0;
  let id: string;
  let title: string;
  let headline: string;
  let subhead: string;
  let archetype: Ending['archetype'];
  const body: string[] = [];
  const control = egm && !crack && largest === '鼎华系';
  if (raider) {
    if (busted) {
      id = 'busted';
      title = '平仓线';
      headline = '鼎华系资管计划被强制平仓';
      subhead = '复牌连续跌停，优先级资金不等人';
      body.push('你借来的那两份钱，在第二个跌停板上要回去了。你卖掉的，是自己好不容易收来的股份。');
      archetype = '出局者';
    } else if (crack && egm) {
      id = 'won-vote-lost-license';
      title = '赢了表决，输给了监管';
      headline = '罢免案通过之后 监管叫停恒利人寿万能险新业务';
      subhead = '鼎华系的股份被限制表决，新董事会迟迟无法组建';
      body.push('股东大会上你赢了。可半年后那篇讲话之后，你的票不能再投，你的钱也不能再收。董事会换届时，名单上没有你的人。');
      archetype = clean ? '长青者' : '流星';
    } else if (crack) {
      id = 'crackdown';
      title = '野蛮人';
      headline = '监管叫停恒利人寿万能险新业务 鼎华系被限制表决';
      subhead = '“不要做兴风作浪的妖精”';
      body.push(`你还持有 ${pctS(r)}，但这些票不能投了。万能险的钱是从保户那里来的，最后要还回去。`);
      archetype = clean ? '长青者' : '流星';
    } else if (control) {
      id = 'control';
      title = '入主';
      headline = '鼎华系改组万川董事会';
      subhead = `临时股东大会罢免全体董事；鼎华持股 ${pctS(r)}`;
      body.push('你拿下了全国最大的地产商。创始人在最后一次董事会上说：“我尊重股东的选择。”');
      archetype = traderArchetype(Math.max(0.15, ret), 0, clean);
    } else if (placed) {
      id = 'diluted';
      title = '被稀释';
      headline = '鹏城地铁成为万川第一大股东';
      subhead = `定向增发获股东大会通过，鼎华系被稀释到 ${pctS(r)}`;
      body.push('你花了几百亿买来的股份，一夜之间少了五分之一的话语权。你成了一个很大的财务投资者。');
      archetype = traderArchetype(ret, 0, clean);
    } else {
      id = 'stalemate';
      title = '第一大股东，进不了董事会';
      headline = largest === '鼎华系' ? '鼎华系仍是万川第一大股东 董事会未改组' : `${largest}成为万川第一大股东`;
      subhead = egm ? '罢免案通过，但监管与各方没有让你入主' : '罢免全体董事的议案没有通过';
      body.push('你有票，却没有足够的盟友。钱能买到股份，买不到别人的票。');
      archetype = traderArchetype(ret, 0, clean);
    }
  } else {
    if (control) {
      id = 'lost';
      title = '失守';
      headline = '万川董事会被改组 创始团队出局';
      subhead = `鼎华系持股 ${pctS(r)}，临时股东大会罢免全体董事`;
      body.push('你守了一年多。最后的那一票，是你没有争取到的人投的。');
      archetype = clean ? '长青者' : '流星';
    } else if (flag(g, 'huayueExit') || placed) {
      id = 'pyrrhic';
      title = '两败俱伤';
      headline = `${largest}成为万川第一大股东 管理层留任`;
      subhead = placed ? '白衣骑士入场，鼎华被稀释' : '华岳退出，鹏城地铁接手';
      body.push('鼎华没有拿下万川。可公司也不再是你说了算：新的大股东是地方国企。几个月后，你在董事会换届时宣布退休。');
      archetype = clean ? '长青者' : '蛀虫';
    } else {
      id = 'held';
      title = '守住了';
      headline = '万川管理层守住控制权';
      subhead = crack ? '监管叫停险资，鼎华的票不能投了' : '罢免案未获通过';
      body.push('公司还是那个公司。你知道，下一次未必还有人帮你。');
      archetype = clean ? '守门人' : '蛀虫';
    }
    if (flag(g, 'bylaw')) body.push('那份悄悄改过的议事规则，后来被小股东翻了出来。');
  }
  if (g.linesCrossed > 0) body.push(`你越过了自己定下的底线「${g.principle.label}」${g.linesCrossed} 次。`);
  const history = [
    '2015 年 7 月起，一家险资通过万能险和九个资管计划多次举牌，12 月持股超过 22%，成为第一大股东。',
    '12 月 18 日公司以重大资产重组为由停牌，半年后提出向深圳地方国企定向增发的预案，原第一大股东在董事会上公开反对。险资提议罢免全体董事。',
    '2016 年 7 月复牌后连续两个跌停。12 月，监管部门负责人公开批评“野蛮人”式收购，涉事险资被暂停万能险新业务，实际控制人后来被处以十年市场禁入。2017 年，原第一大股东把股份转让给地方国企；6 月董事会换届，创始人退休。',
  ];
  const deviation = [
    `停牌：历史上发生了；这一局${halted(g) ? '也发生了' : '没有发生'}`,
    `定向增发引入国企：历史上没能通过；这一局${placed ? '通过了' : flag(g, 'placementBoard') ? '没有通过' : '没有走到表决'}`,
    `罢免全体董事：历史上没有成功；这一局${egm ? '通过了' : flag(g, 'egmVoted') ? '被否决' : '没有表决'}`,
    `监管点名：历史上发生了；这一局${crack ? '也发生了' : '没有发生'}`,
    `第一大股东：历史上最终是地方国企；这一局是${largest}（${pctS(top[1] as number)}）`,
  ];
  const stats: [string, string][] = raider
    ? [
        ['鼎华持股', pctS(r)],
        ['持仓市值', fmtYi(g.player.pos * (ex.last / 100))],
        ['收益率', `${(ret * 100).toFixed(1)}%`],
        ['监管热度', `第 ${g.heatTier()} 级`],
        ['声望', String(g.reputation)],
        ['越过底线', `${g.linesCrossed} 次`],
      ]
    : [
        ['控制权', control ? '失守' : '守住'],
        ['鼎华持股', pctS(r)],
        ['第一大股东', largest],
        ['监管热度', `第 ${g.heatTier()} 级`],
        ['声望', String(g.reputation)],
        ['越过底线', `${g.linesCrossed} 次`],
      ];
  return { id, title, archetype, headline, subhead, body, history, deviation, stats, ruled: egm ? '临时股东大会：罢免全体董事通过' : flag(g, 'egmVoted') ? '临时股东大会：罢免全体董事被否决' : '没有召开临时股东大会' };
}
