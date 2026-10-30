import type { CardResult, Clock, Directive, DocSheet, Game } from '../../engine/game';
import { mofScore, verdictOf, VERDICTS } from './world';
import { bribeWeight } from './deals';
import {
  addDeter,
  addOrder,
  ALLY,
  deter,
  evidence,
  flag,
  HIDE,
  isPlayer,
  knows,
  LONG,
  members,
  memberName,
  MEMBER_NPC,
  mi,
  newsMinute,
  SHORT,
  shenPlan,
  st,
  usage,
  wan, sd
} from './common';
import { BATTLE } from './data';

const isOfficial = (g: Game) => g.factionId === 'official';
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ───────────── 对手动向 ─────────────

/** 辽北倒戈的诱惑：与 decideFlip 同一个算法，去掉随机扰动 */
function gaoTemptation(g: Game): number {
  const gao = g.npc('gao');
  const rel = gao?.relation ?? 30;
  const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
  const d = Math.max(3, sd(g));
  const belief = 0.55 + 0.05 * d + bribeWeight(g) + 0.15 * (gao?.view ?? 0);
  const loyalty = (Math.max(0, rel) / 100) * 0.5 + ((lock?.penalty ?? 0) / 3e8) * 0.35 + (flag(g, 'gaoShared') ? 0.1 : 0);
  return belief - loyalty;
}

const PLAN_NOW: Record<ReturnType<typeof shenPlan>, string> = {
  dump: '照眼下的样子，16:15 他会决定超额透支、砸到底。',
  small: '照眼下的样子，他只敢小砸一把。',
  cover: '照眼下的样子，他会认赔，买回一部分空单。',
  hold: '保证金还够，他不必砸。',
  blocked: '被限令只许平仓，他砸不了。',
};

export function s327Clocks(g: Game): Clock[] {
  const out: Clock[] = [];
  const d = sd(g);
  const f = g.factionId;
  const battleOver = d > BATTLE || (d === BATTLE && g.phase !== 'trading');
  const afterNews = d > BATTLE || (d === BATTLE && (g.phase !== 'trading' || g.market.t >= newsMinute(g)));

  // 申江：尾盘最后一搏
  if (!isPlayer(g, SHORT)) {
    const u = usage(g, SHORT);
    let fill = u < 0.6 ? 0 : u < 0.8 ? 1 : u < 1 ? 2 : u < 1.3 ? 3 : 4;
    if (afterNews) fill++;
    if (flag(g, 'gaoActed')) fill++;
    const decided = flag(g, 'shenPlan') as ReturnType<typeof shenPlan> | undefined;
    const plan = decided ?? shenPlan(g);
    const known = isOfficial(g) ? knows(g, 'shen') || deter(g, SHORT) > 0 : knows(g, 'shen');
    out.push({
      id: 'shen-dump',
      who: 'shen',
      name: known ? '申江：最后一搏' : '申江在盘算什么',
      segs: 6,
      filled: decided === 'dump' || decided === 'small' ? 6 : clamp(fill, 0, 6),
      known,
      then: '决战日 16:22 起，席位 011 不顾保证金超额透支抛售，把价格砸穿。',
      now: decided ? `他已经拿定主意：${PLAN_NOW[decided].replace('照眼下的样子，16:15 ', '').replace('照眼下的样子，', '')}` : PLAN_NOW[plan],
      counter: isOfficial(g)
        ? `威慑够 2 他只敢小砸，够 4 他会认赔；盘中限令只许平仓，他就砸不了；协议平仓能先拆掉一半炸药。眼下威慑 ${deter(g, SHORT).toFixed(1)}。`
        : f === 'long'
          ? '把他借壳超仓的证据交给交易所，交易所盯紧了，他就未必敢砸。'
          : f === 'ally'
            ? '他越绝望，越会拉着锁仓的盟友一起赌。'
            : '看不见底牌的人，16:22 之后别急着抄底。',
      tone: f === 'retail' ? 'neutral' : 'threat',
      state: decided ? (decided === 'dump' || decided === 'small' ? 'fired' : 'defused') : battleOver ? 'defused' : 'running',
    });
  }

  // 辽北：倒戈
  if (!isPlayer(g, ALLY) && g.npc('gao')) {
    const t = gaoTemptation(g);
    const flipped = !!flag(g, 'gaoFlip');
    const fill = flipped ? 4 : t <= 0.05 ? 0 : t <= 0.12 ? 1 : t <= 0.19 ? 2 : 3;
    out.push({
      id: 'gao-flip',
      who: 'gao',
      name: knows(g, 'gao') ? '辽北：倒戈' : '辽北在盘算什么',
      segs: 4,
      filled: fill,
      known: knows(g, 'gao'),
      then: '消息一传开，席位 217 两分钟内买入 240 万口：平掉空单，反手做多。',
      now: flipped ? '他已经下了决心。' : d >= 5 ? '他没有倒戈。' : t > 0.25 ? '照这样下去，他会倒戈。21 日、22 日晚上他拿主意。' : '还在犹豫。21 日、22 日晚上他拿主意。',
      counter:
        f === 'short'
          ? '拉关系、谈违约金、跟他分享情报，都能拴住他；有人在给他递好处，就拴不住。'
          : f === 'long'
            ? '给他递话、许他好处，会推他一把——这正是你想要的。'
            : isOfficial(g)
              ? '派员稽查辽北：他若已经悄悄平空，能拿到证据。'
              : '他一动，价格会在一分钟里跳 2 元。',
      tone: f === 'short' ? 'threat' : f === 'long' ? 'friend' : 'neutral',
      state: flag(g, 'gaoActed') ? 'fired' : flipped || d < BATTLE || !battleOver ? 'running' : 'defused',
    });
  }

  // 中财：决战日托盘
  if (!isPlayer(g, LONG) && g.npc('wei')) {
    const fired = d > BATTLE || (d === BATTLE && g.market.t >= (flag(g, 'mofPublic') ? mi('9:35') : mi('10:06')));
    out.push({
      id: 'wei-prop',
      who: 'wei',
      name: knows(g, 'wei') ? '中财：决战日托盘' : '中财在盘算什么',
      segs: 5,
      filled: fired ? 5 : clamp(d, 0, 5),
      known: knows(g, 'wei'),
      then: '消息一出，席位 102 用到持仓限额，把价格托在 148 元以上，尾盘护着往 151 元走。',
      now: flag(g, 'zcBust') ? '它被强平了。' : st(g).world.verdict && st(g).world.verdict !== 'full' ? '部里的方案对它不利：它不会再托盘，而是想办法把多单卖掉。' : flag(g, 'zcCurbed') ? '被点名之后，它只敢用一半弹药。' : flag(g, 'mofPublic') ? '公告提前了：它失去先手，9:35 才跟着入场。' : '它比所有人先知道消息。',
      counter: isOfficial(g)
        ? '吹风会点名中财，它的托盘力度减半；请财政部提前公告，就没有人能抢跑。'
        : f === 'short'
          ? '它的弹药上限就是持仓限额 300 万口。'
          : '跟着 102 走的人，消息出来前就已经上车了。',
      tone: f === 'short' ? 'threat' : 'neutral',
      state: fired ? 'fired' : 'running',
    });
  }

  // 财政部：贴息方案
  if (g.npc('lu')) {
    const known = isOfficial(g) || f === 'long' || knows(g, 'lu');
    const fired = afterNews;
    out.push({
      id: 'mof-plan',
      who: 'lu',
      name: known ? '财政部：贴息方案' : '财政部的方案',
      segs: 5,
      filled: fired ? 5 : clamp(d, 0, 5),
      known,
      then: '方案公布：327 按 148.50 元兑付，远高于 132 元。这一局部里会看局面再定：22 日晚定案。',
      now: `${known ? `部里眼下的倾向：${VERDICTS[st(g).world.verdict ?? verdictOf(mofScore(g))].name}${st(g).world.verdict ? '（已定案）' : '（22 日晚定案）'}。` : ''}${flag(g, 'mofPublic') ? '已经答应 23 日开盘前公告：所有人同时知道。' : '23 日上午消息会先从多方那里流出来。'}`,
      counter: isOfficial(g)
        ? '请财政部提前公告，消息就没人能抢跑；向部里反映市场过热，贴息可能打折。'
        : f === 'long'
          ? '你比市场早知道——但不能让人知道。加紧游说能稳住部里；被查出关联就坏事了。'
          : f === 'short'
            ? '托人给部里递材料，能把倾向往“不贴”那边挪；价格炒得越高，部里也越不想替投机者兑现。'
            : '托关系去北京打听，越临近 23 日，问到的越准。',
      tone: f === 'short' ? 'threat' : f === 'long' ? 'friend' : 'neutral',
      state: fired ? 'fired' : 'running',
    });
  }
  return out;
}

// ───────────── 上级指示（监管座位） ─────────────

interface Spec {
  id: string;
  day: number;
  from: 'yan' | 'lu';
  text: string;
  stakes: string;
  /** 什么时候见分晓 */
  at: 'close' | 'night' | 'morning';
  check(g: Game): boolean;
}

const STAKES = '办到：政治资本 +1、关系 +5。办砸：关系 −6。';

const SPECS: Spec[] = [
  {
    id: 'clarify',
    day: 0,
    from: 'yan',
    text: '开市头一天，大户室里传言很多。今天收盘前发一次风险提示，或者今晚开个吹风会，把交易所的态度亮出来。',
    stakes: STAKES,
    at: 'morning',
    check: (g) => st(g).used.has('notice-0') || st(g).used.has('brief-0'),
  },
  {
    id: 'inspect',
    day: 1,
    from: 'yan',
    text: '上面听说有会员借壳超仓。今晚之前派人去查一家，查谁你定。',
    stakes: STAKES,
    at: 'morning',
    check: (g) => [...st(g).used].some((k) => k.startsWith('insp-')),
  },
  {
    id: 'audit',
    day: 2,
    from: 'yan',
    text: '今晚把会员日报逐行核一遍。有问题当场标出来，没问题签字归档——别冤枉人。',
    stakes: STAKES,
    at: 'morning',
    check: (g) => {
      const au = st(g).audits.get(2);
      return !!au?.sheet.filed && !flag(g, 'auditWrong-2');
    },
  },
  {
    id: 'no-margin',
    day: 2,
    from: 'lu',
    text: '国债发行靠这个市场撑着。这几天交易所别动保证金。',
    stakes: '办到：财政部那边好说话（陆明远 关系 +5）。办砸：陆明远 关系 −6，请财政部提前公告会更难。',
    at: 'morning',
    check: () => true,
  },
  {
    id: 'limit',
    day: 3,
    from: 'yan',
    text: '21 日收盘时，不能有会员超出持仓限额——关联席位合并计算。',
    stakes: STAKES,
    at: 'close',
    check: (g) => {
      const ex = g.market.ex;
      const lim = ex.deck.positionLimit;
      for (const id of members(g)) if (Math.abs(ex.acct(id).pos) > ex.limitOf(ex.acct(id))) return false;
      if (ex.accounts.has(HIDE) && Math.abs(ex.acct(SHORT).pos) + Math.abs(ex.acct(HIDE).pos) > lim) return false;
      return true;
    },
  },
  {
    id: 'ready',
    day: 4,
    from: 'yan',
    text: '明天可能出事。今晚之前至少落实一条应急措施：保证金 5%、压缩限额、涨跌停板、协议平仓、财政部提前公告，任选。',
    stakes: STAKES,
    at: 'morning',
    check: (g) => {
      const ex = g.market.ex;
      return ex.deck.marginRate >= 0.05 || ex.deck.positionLimit <= 2_000_000 || ex.deck.priceLimit != null || !!flag(g, 'mediated') || !!flag(g, 'mofPublic');
    },
  },
  {
    id: 'quiet',
    day: 4,
    from: 'lu',
    text: '方案公布之前，交易所不要放任何口风：不开吹风会，不发风险提示。',
    stakes: '办到：陆明远 关系 +5。办砸：陆明远 关系 −6。',
    at: 'morning',
    check: () => true,
  },
  {
    id: 'no-bust',
    day: 5,
    from: 'yan',
    text: '今天无论如何不能有会员穿仓。出了窟窿，就是系统性风险。',
    stakes: STAKES,
    at: 'night',
    check: (g) => members(g).every((id) => g.market.ex.equity(g.market.ex.acct(id)) >= 0),
  },
];

const FROM_NAME: Record<string, string> = { yan: '严正（证监会）', lu: '陆明远（财政部）' };

/** 早上下指示，并结算前一天“第二天见分晓”的那几条 */
export function directivesMorning(g: Game): void {
  if (!isOfficial(g)) return;
  const s = st(g);
  for (const dir of s.dirs) {
    const spec = SPECS.find((x) => x.id === dir.id)!;
    if (dir.status === 'open' && spec.at === 'morning' && dir.day < sd(g)) settle(g, dir, spec.check(g));
  }
  for (const spec of SPECS.filter((x) => x.day === sd(g))) {
    if (s.dirs.some((x) => x.id === spec.id)) continue;
    s.dirs.push({ id: spec.id, day: spec.day, from: spec.from, text: spec.text, stakes: spec.stakes, status: 'open' });
    g.push({ kind: 'intel', text: `${FROM_NAME[spec.from]}：${spec.text}` });
  }
}

export function directivesAt(g: Game, at: 'close' | 'night'): void {
  if (!isOfficial(g)) return;
  for (const dir of st(g).dirs) {
    const spec = SPECS.find((x) => x.id === dir.id)!;
    if (dir.status === 'open' && spec.at === at && dir.day === sd(g)) settle(g, dir, spec.check(g));
  }
}

/** 违背指示的动作当场判负 */
export function breakDirective(g: Game, id: string, why: string): void {
  const dir = st(g).dirs.find((x) => x.id === id && x.status === 'open');
  if (dir) settle(g, dir, false, why);
}

function settle(g: Game, dir: Directive, ok: boolean, why?: string): void {
  const s = st(g);
  const who = g.npc(dir.from)?.name ?? dir.from;
  dir.status = ok ? 'met' : 'failed';
  if (ok) {
    s.cap = Math.min(10, s.cap + 1);
    g.relate(dir.from, 5, '交代的事办到了');
    dir.verdict = `办到了：政治资本 +1，${who} 关系 +5`;
  } else {
    g.relate(dir.from, -6, '交代的事没办到');
    dir.verdict = `${why ?? '没办到'}：${who} 关系 −6`;
  }
  g.push({ kind: 'intel', text: `上级指示「${dir.text.slice(0, 16)}…」${dir.verdict}` });
}

export function s327Directives(g: Game): Directive[] {
  if (!isOfficial(g)) return [];
  const d = sd(g);
  // 今天下的、还没见分晓的，以及昨天刚见分晓的
  return st(g).dirs.filter((x) => x.day === d || x.status === 'open' || x.day === d - 1);
}

// ───────────── 会员日报（监管座位每晚的案头工作） ─────────────

const TERMINAL: Record<string, string> = {
  [SHORT]: '申江大厦 3F',
  [LONG]: '中财大厦 12F',
  [ALLY]: '辽北驻沪办',
  [HIDE]: '浦江实业 本部',
};

const MARKS = [
  { id: 'ok', label: '无误' },
  { id: 'pos', label: '持仓对不上' },
  { id: 'term', label: '终端异常' },
];

/** 收盘后生成当晚的日报：每家会员自己申报，买卖两列来自结算部 */
export function makeAudit(g: Game): void {
  if (!isOfficial(g) || sd(g) >= BATTLE) return;
  const s = st(g);
  const d = sd(g);
  const ex = g.market.ex;
  const w = (q: number) => Math.round(q / 1000) / 10;
  const sgn = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1);
  const rows: DocSheet['rows'] = [];
  const truth: Record<string, string> = {};
  for (const id of members(g)) {
    const a = ex.acct(id);
    let buys = 0;
    let sells = 0;
    for (const t of ex.trades) {
      if (t.tick <= s.dayStartTick) continue;
      if (t.buyer === id) buys += t.qty;
      if (t.seller === id) sells += t.qty;
    }
    const y = w(s.memberStart[id] ?? a.pos);
    const b = w(buys);
    const sl = w(sells);
    let reported = Math.round((y + b - sl) * 10) / 10;
    let terminal = TERMINAL[id];
    // 浦江是申江的壳：从 17 日起，它的委托从申江的交易室报进来
    if (id === HIDE && d >= 1) {
      terminal = TERMINAL[SHORT];
      truth[id] = 'term';
    }
    // 申江保证金吃紧时少报 20 万口空单，躲追保
    if (id === SHORT && usage(g, SHORT) > 0.9) {
      reported = Math.round((reported + 20) * 10) / 10;
      truth[id] = 'pos';
    }
    // 辽北拿定主意倒戈后悄悄平空，报表上却照抄昨天的持仓
    if (id === ALLY && flag(g, 'gaoFlip') && b >= 1) {
      reported = y;
      truth[id] = 'pos';
    }
    rows.push({ id, cells: [`${a.seat ?? ''} ${memberName(g, id).replace(/（.*）/, '')}`, sgn(y), b.toFixed(1), sl.toFixed(1), sgn(reported), terminal] });
  }
  s.audits.set(d, {
    sheet: {
      id: `audit-${d}`,
      title: `会员持仓日报 · ${g.day.date}`,
      from: '结算部',
      note: '申报持仓应当等于“昨日持仓 + 今日买入 − 今日卖出”。买入、卖出两列由结算部逐笔汇总，可信；其余各列是会员自己报的。单位：万口，空单记为负数。',
      cols: ['会员', '昨日持仓', '今日买入', '今日卖出', '申报持仓', '下单终端'],
      colSource: ['label', 'reported', 'cleared', 'cleared', 'reported', 'reported'],
      rows,
      marks: MARKS,
    },
    truth,
  });
}

export function s327Docs(g: Game): DocSheet[] {
  const au = st(g).audits.get(sd(g));
  return au && g.phase === 'night' ? [au.sheet] : [];
}

export function fileAudit(g: Game, id: string, marks: Record<string, string>): CardResult {
  const s = st(g);
  const d = sd(g);
  const au = s.audits.get(d);
  if (!au || au.sheet.id !== id || au.sheet.filed) return { ok: false, title: '没有可签的日报', effects: [] };
  const fx: string[] = [];
  let caught = 0;
  let wrong = 0;
  for (const row of au.sheet.rows) {
    const m = marks[row.id] ?? 'ok';
    const t = au.truth[row.id] ?? 'ok';
    if (t !== 'ok' && m === t) {
      caught++;
      fx.push(...catchRow(g, row.id, t));
    } else if (m !== 'ok') {
      wrong++;
      const npc = MEMBER_NPC[row.id];
      g.relate(npc, -8, '交易所冤枉了他们的报表');
      g.relate('yan', -3, '日报上冤枉了会员');
      addOrder(g, -1);
      fx.push(`冤枉了${memberName(g, row.id)}：对方关系 −8，严正 关系 −3，秩序 −1`);
    } else if (t !== 'ok') {
      g.flags.auditMissed = ((g.flags.auditMissed as number) || 0) + 1;
    }
  }
  if (wrong) g.flags[`auditWrong-${d}`] = true;
  if (wrong) breakDirective(g, 'audit', '冤枉了会员');
  const result: CardResult = {
    ok: wrong === 0,
    title: caught ? `日报签字：标出 ${caught} 处问题` : wrong ? '日报签字：标错了' : '日报签字归档',
    effects: fx.length ? fx : ['没有标出问题'],
  };
  au.sheet.filed = { marks, result };
  return result;
}

function catchRow(g: Game, id: string, kind: string): string[] {
  const s = st(g);
  const ex = g.market.ex;
  if (id === HIDE && kind === 'term') {
    s.know.add('shen');
    addDeter(g, SHORT, 2);
    addOrder(g, 2);
    const fx = ['浦江 305 的委托从申江的交易室报进来：借壳代持', '申江威慑 +2', '秩序 +2'];
    if (!s.evidence.has('split')) {
      s.evidence.add('split');
      evidence(g, 'ev-split', '申江借壳分仓：浦江实业 305 代持空单', `会员日报显示：席位 305 浦江实业的委托全部来自申江大厦 3F 的交易室。两家合计空单 ${wan(Math.abs(ex.acct(SHORT).pos) + Math.abs(ex.acct(HIDE).pos))}。`, '会员日报', 'shen');
      fx.push('获得证据：申江借壳分仓');
    }
    const over = Math.abs(ex.acct(SHORT).pos) + Math.abs(ex.acct(HIDE).pos) - ex.deck.positionLimit;
    if (over > 0 && (s.reduce.get(SHORT) ?? 0) < over) {
      s.reduce.set(SHORT, over);
      fx.push(`合并计算超出限额 ${wan(over)}：申江明早须减仓`);
    }
    return fx;
  }
  if (id === SHORT) {
    s.know.add('shen');
    g.flags.shenMisreport = true;
    addDeter(g, SHORT, 2);
    addOrder(g, 2);
    return ['申江少报了 20 万口空单，想躲追保', '申江威慑 +2', '秩序 +2', '限令只许平仓从此有据可查'];
  }
  if (id === ALLY) {
    s.know.add('gao');
    addDeter(g, ALLY, 1);
    if (!s.evidence.has('gao')) {
      s.evidence.add('gao');
      evidence(g, 'ev-gao', '辽北发展在锁仓期内悄悄平空', '会员日报对不上：结算部记下辽北今天买入平空，它报上来的持仓却照抄昨天。它在准备倒戈。', '会员日报', 'gao');
    }
    return ['辽北买入平空却照抄昨天的持仓：它在准备倒戈', '获得证据：辽北悄悄平空'];
  }
  return [];
}
