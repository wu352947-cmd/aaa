import { fmtYi } from '../../engine/exchange';
import { addCrowdFlow } from '../../engine/flows';
import type { CardDef, CardResult, Game, Meter } from '../../engine/game';
import type { OrderReq } from '../../engine/types';
import {
  addDeter,
  addOrder,
  ALLY,
  evidence,
  flag,
  HIDE,
  LONG,
  MEMBER_NPC,
  memberName,
  members,
  p2,
  rumor,
  SHORT,
  spendCap,
  st,
  usage,
  wan,
} from './common';
import { BATTLE } from './data';
import { breakDirective } from './plans';

const R = (ok: boolean, title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok, title, effects, reply });
const rel = (g: Game, npc: string, d: number, memory?: string) => {
  if (!g.npc(npc)) return '';
  g.relate(npc, d, memory);
  return `${g.npc(npc)!.name} 关系 ${d > 0 ? '+' : '−'}${Math.abs(d)}`;
};

// ───────────── 共用机制 ─────────────

/** 场外协议平仓：空方按商定价格从多方手里买回 qty 口，不经过订单簿 */
export function agreedClose(g: Game, short: string, long: string, qty: number, price: number): number {
  const ex = g.market.ex;
  const q = Math.min(qty, Math.max(0, -ex.acct(short).pos), Math.max(0, ex.acct(long).pos));
  if (q <= 0) return 0;
  ex.rebook({ tick: ex.tick, price, qty: q, buyer: short, seller: long, aggressor: 'buy' });
  return q;
}

function condition(g: Game, id: string): 'ok' | 'strained' | 'bust' {
  const ex = g.market.ex;
  const a = ex.acct(id);
  const eq = ex.equity(a);
  if (eq < 0) return 'bust';
  if (a.pos !== 0 && eq < ex.marginReq(a.pos)) return 'strained';
  return 'ok';
}
export { condition };

const hasEvidence = (g: Game, id: string) => {
  const s = st(g);
  if (id === SHORT) return s.evidence.has('split') || !!flag(g, 'shenMisreport');
  if (id === HIDE) return s.evidence.has('split');
  if (id === LONG) return s.evidence.has('wei');
  if (id === ALLY) return s.evidence.has('gao');
  return false;
};

// ───────────── 监管座位 ─────────────

export function regMeters(g: Game): Meter[] {
  const s = st(g);
  const worst = members(g)
    .map((id) => ({ id, u: usage(g, id) }))
    .sort((a, b) => b.u - a.u)[0];
  return [
    { id: 'cap', label: `政治资本 · ${s.cap}`, pips: { on: s.cap, of: 10, tone: 'good' }, tip: '出手的本钱。停市、限仓、请财政部提前公告都要花；每晚恢复 1 点，向证监会汇报能补一些。' },
    { id: 'order', label: '市场秩序', value: String(s.order), tone: s.order < 40 ? 'bad' : s.order >= 70 ? 'good' : undefined, tip: '违规被放过、谣言满天飞会往下掉；违规被查处、信息公开会往上走。' },
    {
      id: 'risk',
      label: '系统风险',
      value: worst ? (worst.u >= 9 ? `${memberName(g, worst.id).slice(0, 4)} 穿仓` : `${memberName(g, worst.id).slice(0, 4)} ${Math.round(worst.u * 100)}%`) : '—',
      tone: worst && worst.u > 1 ? 'bad' : undefined,
      tip: '保证金占用最高的会员。超过 100%：收盘后要追保；穿仓：亏损会甩给对手和交易所。',
    },
  ];
}

export function regCards(g: Game): CardDef[] {
  const s = st(g);
  const d = g.dayIndex;
  const ex = g.market.ex;
  const m = g.market;
  const pre = d < BATTLE;
  const after = g.isAftermath;
  const need = (n: number) => (s.cap < n ? `政治资本不足（需 ${n} 点）` : undefined);
  const mem = members(g).map((id) => ({ id, label: memberName(g, id) }));
  const out: CardDef[] = [];

  if (!after) {
    out.push(
      {
        id: 'halt',
        name: '临时停市 15 分钟',
        group: '盘中风控',
        color: 'white',
        does: '撮合暂停，让消息被消化、追涨杀跌冷下来。',
        cost: '1 点政治资本；会员不满。价格没怎么动就停，会被说成乱作为。',
        when: 'trading',
        key: 'h',
        blocked: s.used.has(`halt-${d}`) ? '今天已经停过一次' : m.t < m.haltUntil ? '正在停市' : need(1),
      },
      {
        id: 'notice',
        name: '发布风险提示',
        group: '盘中风控',
        color: 'white',
        does: '交易所公告提醒风险：散户情绪降温，会员收敛一点。',
        cost: '1 点政治资本。',
        when: 'trading',
        key: 'n',
        blocked: s.used.has(`notice-${d}`) ? '今天已经发过' : need(1),
      },
      {
        id: 'margin-now',
        name: '盘中提高保证金至 5%',
        group: '盘中风控',
        color: 'white',
        does: '当场生效：所有会员加仓都要多交一倍押金；收盘时押金不够的要追保。',
        cost: '2 点政治资本；全体会员不满。',
        when: 'trading',
        key: 'm',
        status: ex.deck.marginRate >= 0.05 ? '已是 5%' : undefined,
        blocked: ex.deck.marginRate >= 0.05 ? '保证金已经是 5%' : need(2),
      },
      {
        id: 'closeonly',
        name: '限令只许平仓',
        group: '盘中风控',
        color: 'white',
        does: '指定会员今天只能平仓、不能再开新仓——包括透支砸盘。',
        cost: '2 点政治资本（握有证据或对方已违规时 1 点）；对方关系 −25。无据限仓，证监会会皱眉。',
        when: 'trading',
        key: 'c',
        targets: mem.filter((x) => !ex.acct(x.id).closeOnly),
        blocked: need(1),
      },
    );
  }

  out.push({
    id: 'call',
    name: '电话窗口指导',
    group: '会员监管',
    color: 'white',
    does: '打电话给会员负责人，听他怎么说，也让他知道你在看。威慑 +。',
    cost: '1 点精力；对方关系 −4。',
    when: 'any',
    targets: mem,
    blocked: g.energy <= 0 ? '精力用完了' : undefined,
  });
  if (!after || d < g.scenario.days.length - 1) {
    out.push({
      id: 'inspect',
      name: '派员现场稽查',
      group: '会员监管',
      color: 'white',
      does: '查对方的账：代持、关联交易、暗中平仓。明晚出结果，拿到证据后处罚更硬气。',
      cost: '1 点政治资本 + 1 点精力；对方关系 −12。',
      when: 'night',
      targets: mem.filter((x) => !s.used.has(`insp-${x.id}`) && !(x.id === HIDE && s.used.has(`insp-${SHORT}`)) && !(x.id === SHORT && s.used.has(`insp-${HIDE}`))),
      blocked: g.energy <= 0 ? '精力用完了' : need(1),
    });
  }
  if (pre) {
    const hot = mem.filter((x) => usage(g, x.id) > 0.8 && !s.reduce.has(x.id));
    out.push(
      {
        id: 'margincall',
        name: '追加保证金通知',
        group: '会员监管',
        color: 'white',
        does: '保证金占用超过 80% 的会员，明早开盘须减仓到 80% 以内。空方减仓 = 买入，价格会被推高。',
        cost: '1 点精力；对方关系 −8。',
        when: 'night',
        targets: hot,
        blocked: hot.length === 0 ? '没有会员的占用超过 80%' : g.energy <= 0 ? '精力用完了' : undefined,
      },
      {
        id: 'margin',
        name: '明日起保证金提至 5%',
        group: '规则调整',
        color: 'white',
        does: '明天开盘生效。押金不够的会员要么补钱，要么减仓。',
        cost: '1 点政治资本；全体会员不满。',
        when: 'night',
        status: flag(g, 'marginNext') ? '明日生效' : undefined,
        blocked: ex.deck.marginRate >= 0.05 || flag(g, 'marginNext') ? '已经安排' : need(1),
      },
      {
        id: 'limit',
        name: '压缩持仓限额至 200 万口',
        group: '规则调整',
        color: 'white',
        does: '明天开盘生效。超出的会员当天上午必须减到限额以内。',
        cost: '2 点政治资本；超限会员不满。',
        when: 'night',
        status: ex.deck.positionLimit <= 2_000_000 ? '已生效' : flag(g, 'limitNext') ? '明日生效' : undefined,
        blocked: ex.deck.positionLimit <= 2_000_000 || flag(g, 'limitNext') ? '已经安排' : need(2),
      },
      {
        id: 'band',
        name: '设立涨跌停板 ±1.5%',
        group: '规则调整',
        color: 'white',
        does: '明天开盘生效：价格只能在前一日结算价上下 1.5% 内成交。再大的单子也拉不破、砸不穿——但价格发现被推迟。',
        cost: '2 点政治资本；多方与财政部不满。',
        when: 'night',
        status: ex.deck.priceLimit != null ? '已生效' : flag(g, 'bandNext') ? '明日生效' : undefined,
        blocked: ex.deck.priceLimit != null || flag(g, 'bandNext') ? '已经安排' : need(2),
      },
      {
        id: 'mof',
        name: '请财政部提前公告',
        group: '政策协调',
        color: 'white',
        does: '让贴息方案在 23 日开盘前公开，所有人同时知道——没人能靠提前得到的消息赚钱。',
        cost: '2 点政治资本；财政部不喜欢被催，多方失去先手。可能被拒。',
        when: 'night',
        status: flag(g, 'mofPublic') ? '已答应' : undefined,
        blocked: flag(g, 'mofPublic') ? '财政部已经答应' : s.used.has('mof-fail') ? '财政部已经回绝' : need(2),
      },
      {
        id: 'mediate',
        name: '召集多空协议平仓',
        group: '政策协调',
        color: 'white',
        does: '请申江和中财坐下来，按收盘价附近对冲掉 80 万口。成了，决战日的炸药少一半。',
        cost: '2 点政治资本；谈不拢就白花。越临近 23 日、手里证据越多，越容易谈成。',
        when: 'night',
        status: flag(g, 'mediated') ? '已谈成' : undefined,
        blocked: flag(g, 'mediated') ? '已经谈成' : d < 2 ? '双方还没到要谈的时候（20 日起）' : g.npcs.has('shen') && g.npcs.has('wei') ? need(2) : '一方是你自己',
      },
    );
  }
  out.push({
    id: 'csrc',
    name: '向证监会汇报',
    group: '政策协调',
    color: 'white',
    does: '争取上级支持：政治资本 +2。但事事请示，上级会烦。',
    cost: '1 点精力。',
    when: 'night',
    blocked: s.used.has(`csrc-${d}`) ? '今晚已经汇报过' : g.energy <= 0 ? '精力用完了' : undefined,
  });
  const nameable = [
    { id: 'general', label: '一般性风险提示' },
    ...(hasEvidence(g, SHORT) || ex.acct(SHORT).violations > 0 ? [{ id: 'name-shen', label: '点名申江证券' }] : []),
    ...(hasEvidence(g, LONG) ? [{ id: 'name-wei', label: '点名中财信托' }] : []),
  ];
  out.push({
    id: 'brief',
    name: '记者吹风会',
    group: '政策协调',
    color: 'white',
    does: '通过《沪上财经报》放出口风。点名违规会员威慑最大，但未经批准点名，上级不高兴。',
    cost: '1 点政治资本。',
    when: 'night',
    targets: nameable,
    blocked: s.used.has(`brief-${d}`) ? '今晚已经开过' : need(1),
  });

  if (after) {
    const troubled = members(g).filter((id) => condition(g, id) !== 'ok' && !s.resolved.has(id));
    const bust = troubled.filter((id) => condition(g, id) === 'bust');
    const tgt = (ids: string[]) => ids.map((id) => ({ id, label: memberName(g, id) }));
    out.push(
      {
        id: 'fund',
        name: '动用风险基金垫付',
        group: '善后处置',
        color: 'white',
        does: `替穿仓会员补上窟窿，对手方拿到该拿的钱，不会连环违约。风险基金余额 ${fmtYi(s.fund)}。`,
        cost: '1 点政治资本；秩序 −2（谁闯祸谁买单？）。',
        when: 'night',
        targets: tgt(bust),
        blocked: bust.length === 0 ? '没有会员穿仓' : need(1),
      },
      {
        id: 'rescue',
        name: '协调股东注资重组',
        group: '善后处置',
        color: 'grey',
        does: '找主管单位给出事的会员注资，保住公司和它的客户。',
        cost: '2 点政治资本；秩序 −4（大而不倒）。',
        when: 'night',
        targets: tgt(troubled),
        blocked: troubled.length === 0 ? '没有会员需要救' : need(2),
      },
      {
        id: 'liquidate',
        name: '强制平仓了结',
        group: '善后处置',
        color: 'white',
        does: '按结算价替补不上保证金的会员了结全部持仓。干净利落，亏多少认多少。',
        cost: '1 点政治资本；对方关系 −20。',
        when: 'night',
        targets: tgt(troubled),
        blocked: troubled.length === 0 ? '没有会员需要处理' : need(1),
      },
      {
        id: 'refer',
        name: '移交司法机关',
        group: '善后处置',
        color: 'white',
        does: '把违规者交给司法：秩序 +10。没有证据也移交，上级会怪你冒失。',
        cost: '1 点政治资本；对方关系 −50。',
        when: 'night',
        targets: tgt(members(g).filter((id) => !s.used.has(`refer-${id}`) && (hasEvidence(g, id) || g.market.ex.acct(id).violations > 0))),
        blocked: need(1),
      },
      {
        id: 'rules',
        name: '出台新规',
        group: '善后处置',
        color: 'white',
        does: '涨跌停板、分级限仓、透支委托系统拦截，写进交易规则。下一次不会再这样。',
        cost: '2 点政治资本。',
        when: 'night',
        status: s.used.has('rules') ? '已出台' : undefined,
        blocked: s.used.has('rules') ? '已经出台' : need(2),
      },
      {
        id: 'explain',
        name: '向公众解释裁决',
        group: '善后处置',
        color: 'white',
        does: '开发布会讲清楚为什么撤销成交、被一起撤销的人怎么办。',
        cost: '1 点政治资本。',
        when: 'night',
        blocked: !flag(g, 'voided') ? '没有撤销过成交' : s.used.has('explain') ? '已经讲过' : need(1),
      },
      {
        id: 'suspend',
        name: '建议暂停国债期货试点',
        group: '善后处置',
        color: 'grey',
        does: '把整个市场关掉。不会再出事，也不会再有这个市场。',
        cost: '3 点政治资本；会员与财政部不满。',
        when: 'night',
        status: s.used.has('suspend') ? '已建议' : undefined,
        blocked: s.used.has('suspend') ? '已经建议' : need(3),
      },
    );
  }
  return out;
}

export function regPlay(g: Game, id: string, target?: string): CardResult {
  const s = st(g);
  const m = g.market;
  const ex = m.ex;
  const d = g.dayIndex;
  const tName = target ? memberName(g, target) : '';
  const tNpc = target ? MEMBER_NPC[target] : '';
  switch (id) {
    case 'halt': {
      spendCap(g, 1);
      s.used.add(`halt-${d}`);
      m.haltUntil = m.t + 15;
      m.sentiment *= 0.3;
      m.flow *= 0.6;
      g.flags.halts = ((g.flags.halts as number) || 0) + 1;
      const ref = m.bars[Math.max(0, m.bars.length - 15)]?.c ?? m.last;
      const moved = Math.abs(m.last - ref);
      const fx = ['政治资本 −1', '情绪降温'];
      for (const n of ['shen', 'wei', 'gao']) if (g.npc(n)) g.relate(n, -3, '交易所临时停市');
      if (moved < 60) {
        addOrder(g, -3);
        fx.push('价格没怎么动就停市：秩序 −3', rel(g, 'yan', -5, '无故停市'));
      } else {
        addOrder(g, 2);
        fx.push('秩序 +2');
      }
      g.push({ kind: 'intel', text: '交易所宣布：327 合约临时停市 15 分钟' });
      return R(true, '临时停市 15 分钟', fx);
    }
    case 'notice':
      breakDirective(g, 'quiet', '风险提示放出了口风');
      spendCap(g, 1);
      s.used.add(`notice-${d}`);
      m.sentiment *= 0.3;
      addDeter(g, 'all', 1);
      addOrder(g, 2);
      return R(true, '交易所发布风险提示', ['政治资本 −1', '散户情绪降温', '全体会员威慑 +1', '秩序 +2', rel(g, 'su', 3)].filter(Boolean));
    case 'margin-now':
      breakDirective(g, 'no-margin', '交易所动了保证金');
      spendCap(g, 2);
      ex.deck.marginRate = 0.05;
      g.flags.marginUp = true;
      for (const n of ['shen', 'wei', 'gao']) if (g.npc(n)) g.relate(n, -5, '盘中提高保证金');
      addOrder(g, 1);
      g.push({ kind: 'intel', text: `交易所通知：${g.time} 起保证金比例提高到 5%` });
      return R(true, '保证金提高到 5%，当场生效', ['政治资本 −2', '全体会员关系 −5', '收盘时押金不够的会员会被追保']);
    case 'closeonly': {
      const a = ex.acct(target!);
      const ev = hasEvidence(g, target!) || a.violations > 0 || !!flag(g, 'coBacked');
      spendCap(g, ev ? 1 : 2);
      a.closeOnly = true;
      g.flags[`co-${target}-${d}`] = true;
      const fx = [`政治资本 −${ev ? 1 : 2}`, rel(g, tNpc, -25, '交易所限令只许平仓')];
      if (ev) {
        addOrder(g, 4);
        fx.push('有据可查：秩序 +4');
      } else {
        addOrder(g, -2);
        fx.push('无据限仓：秩序 −2', rel(g, 'yan', -8, '无据限仓'));
      }
      g.push({ kind: 'intel', text: `交易所限令 ${tName} 今日只许平仓` });
      return R(true, `${tName}：今日只许平仓`, fx.filter(Boolean), { who: g.npc(tNpc)?.name ?? tName, text: target === SHORT ? '你们这是要逼死空头！' : target === LONG ? '要讲政策，交易所这么做有依据吗？' : '兄弟我可没违规啊。' });
    }
    case 'call': {
      g.energy--;
      st(g).know.add(tNpc);
      addDeter(g, target!, 1.5);
      const fx = [`${tName} 威慑 +1.5`, rel(g, tNpc, -4, '交易所打电话“提醒”')];
      const shenDesperate = condition(g, SHORT) !== 'ok' || usage(g, SHORT) > 0.85;
      const reply =
        target === SHORT
          ? st(g).deter[SHORT] >= 3
            ? '我们会按规矩来。你们也要讲公平，不能光盯着空头。'
            : shenDesperate
              ? '一切按规则办。市场规律会说话的。'
              : '我们是正常套期保值，没什么好担心的。'
          : target === LONG
            ? '我们只是正常套期保值。贴息的事？没听说，要讲政策。'
            : target === ALLY
              ? '兄弟我守规矩的，锁仓协议白纸黑字，一口不动。'
              : '浦江是独立法人，跟谁都没有关系。';
      return R(true, `致电 ${tName}`, fx.filter(Boolean), { who: target === HIDE ? '浦江实业经办人' : (g.npc(tNpc)?.name ?? tName), text: reply });
    }
    case 'inspect':
      st(g).know.add(tNpc);
      spendCap(g, 1);
      g.energy--;
      s.used.add(`insp-${target}`);
      s.inspecting.push(target!);
      addDeter(g, target!, 1);
      return R(true, `稽查组进驻 ${tName}`, ['政治资本 −1', '明晚出结果', `${tName} 威慑 +1`, rel(g, tNpc, -12, '交易所派员稽查')].filter(Boolean));
    case 'margincall': {
      g.energy--;
      const a = ex.acct(target!);
      const eq = ex.equity(a);
      const keep = Math.floor((eq * 0.8) / (ex.contractValue(ex.last) * ex.deck.marginRate));
      const q = Math.max(0, Math.abs(a.pos) - keep);
      s.reduce.set(target!, q);
      return R(true, `${tName}：明早须减仓 ${wan(q)}`, [rel(g, tNpc, -8, '交易所追加保证金')].filter(Boolean), {
        who: g.npc(tNpc)?.name ?? tName,
        text: target === SHORT ? '现在让我们平仓，不是逼着空头往火坑里跳吗？' : '知道了，按通知办。',
      });
    }
    case 'margin':
      breakDirective(g, 'no-margin', '交易所动了保证金');
      spendCap(g, 1);
      g.flags.marginNext = 0.05;
      for (const n of ['shen', 'wei', 'gao']) if (g.npc(n)) g.relate(n, -4, '交易所提高保证金');
      return R(true, '明日起保证金 5%', ['政治资本 −1', '全体会员关系 −4']);
    case 'limit': {
      spendCap(g, 2);
      g.flags.limitNext = 2_000_000;
      const over = members(g).filter((x) => Math.abs(ex.acct(x).pos) > 2_000_000);
      addOrder(g, 3);
      return R(true, '明日起持仓限额 200 万口', ['政治资本 −2', '秩序 +3', over.length ? `超限：${over.map((x) => memberName(g, x)).join('、')}，明天上午必须减仓` : '目前没有会员超限', rel(g, 'shen', -10, '交易所压缩限额')].filter(Boolean));
    }
    case 'band':
      spendCap(g, 2);
      g.flags.bandNext = 0.015;
      addOrder(g, 3);
      return R(true, '明日起实行涨跌停板 ±1.5%', ['政治资本 −2', '秩序 +3', rel(g, 'wei', -10, '交易所设涨跌停'), rel(g, 'lu', -5)].filter(Boolean));
    case 'mof': {
      spendCap(g, 2);
      const lu = g.npc('lu')!;
      const ok = lu.relation >= 0 || g.rngSocial.chance(0.5);
      if (!ok) {
        s.used.add('mof-fail');
        return R(false, '财政部回绝', ['政治资本 −2', rel(g, 'lu', -5, '交易所来催公告')].filter(Boolean), { who: lu.name, text: '方案要按程序走，什么时候公布，部里统筹考虑。' });
      }
      g.flags.mofPublic = true;
      addOrder(g, 10);
      return R(true, '财政部同意：23 日开盘前公告', ['政治资本 −2', '秩序 +10：没人能靠提前知道赚钱', rel(g, 'lu', -10, '交易所催公告'), rel(g, 'wei', -10)].filter(Boolean), {
        who: lu.name,
        text: '行吧，既然市场已经这样了，开盘前发出去。但下不为例。',
      });
    }
    case 'mediate': {
      spendCap(g, 2);
      const shen = g.npc('shen')!;
      const wei = g.npc('wei')!;
      let p = 0.2 + 0.15 * (d - 2);
      if (s.evidence.has('split') || s.evidence.has('wei')) p += 0.2;
      if (ex.deck.marginRate >= 0.05 || flag(g, 'marginNext')) p += 0.1;
      if (shen.relation >= 0) p += 0.1;
      if (wei.relation >= 0) p += 0.1;
      p = Math.min(0.9, p);
      if (!g.rngSocial.chance(p)) {
        g.relate('shen', -3);
        g.relate('wei', -3);
        return R(false, '协议平仓没谈成', ['政治资本 −2', `成功率约 ${Math.round(p * 100)}%`, '双方关系 −3'], { who: shen.name, text: '让我们在 148 元平仓？兑付价是 132 元，这是算出来的！' });
      }
      const price = ex.last + 40;
      const q = agreedClose(g, SHORT, LONG, 800_000, price);
      g.flags.mediated = true;
      addOrder(g, 5);
      g.relate('shen', 5);
      g.relate('wei', 5);
      return R(true, `协议平仓：申江从中财买回 ${wan(q)}，价格 ${p2(price)} 元`, ['政治资本 −2', '秩序 +5', `申江空单降到 ${wan(-ex.acct(SHORT).pos)}`], { who: wei.name, text: '看在交易所的面子上。不过空头还剩多少，就看他们的造化了。' });
    }
    case 'csrc': {
      g.energy--;
      s.used.add(`csrc-${d}`);
      const n = ((g.flags.csrcCount as number) || 0) + 1;
      g.flags.csrcCount = n;
      if (n > 2) return R(false, '向证监会汇报', [rel(g, 'yan', -5, '事事请示')].filter(Boolean), { who: '严正', text: '这种事你们交易所自己拿主意。你的方案是什么？' });
      s.cap = Math.min(10, s.cap + 2);
      return R(true, '向证监会汇报', ['政治资本 +2', rel(g, 'yan', 5, '及时汇报')].filter(Boolean), { who: '严正', text: '情况我知道了。该出手就出手，出了事要第一时间报。' });
    }
    case 'brief': {
      breakDirective(g, 'quiet', '吹风会放出了口风');
      spendCap(g, 1);
      s.used.add(`brief-${d}`);
      if (target === 'name-shen') {
        addDeter(g, SHORT, 3);
        addOrder(g, 4);
        return R(true, '吹风会点名申江证券', ['政治资本 −1', '申江威慑 +3', '秩序 +4', rel(g, 'shen', -30, '交易所点名'), rel(g, 'su', 10), rel(g, 'yan', -5, '未经批准点名会员')].filter(Boolean));
      }
      if (target === 'name-wei') {
        addDeter(g, LONG, 2);
        g.flags.zcCurbed = true;
        addOrder(g, 4);
        return R(true, '吹风会点名中财信托', ['政治资本 −1', '中财收手：决战日托盘力度减半', '秩序 +4', rel(g, 'wei', -30, '交易所点名'), rel(g, 'lu', -10, '财政部被牵连'), rel(g, 'su', 10)].filter(Boolean));
      }
      addDeter(g, 'all', 1);
      addOrder(g, 2);
      return R(true, '吹风会：交易所将严查违规', ['政治资本 −1', '全体会员威慑 +1', '秩序 +2', rel(g, 'su', 5)].filter(Boolean));
    }
    // ── 余波 ──
    case 'fund': {
      spendCap(g, 1);
      const a = ex.acct(target!);
      const hole = -ex.equity(a);
      const paid = Math.min(hole, s.fund);
      s.fund -= paid;
      a.cash += paid;
      s.resolved.set(target!, paid >= hole ? 'fund' : 'fund-partial');
      addOrder(g, -2);
      return R(true, `风险基金垫付 ${tName} ${fmtYi(paid)}`, ['政治资本 −1', paid < hole ? `还差 ${fmtYi(hole - paid)}：基金不够` : '对手方全额拿到钱', '秩序 −2', rel(g, 'yan', 3)].filter(Boolean));
    }
    case 'rescue': {
      spendCap(g, 2);
      const a = ex.acct(target!);
      const inject = Math.max(0, ex.marginReq(a.pos) - ex.equity(a)) + 100_000_000;
      a.cash += inject;
      s.resolved.set(target!, 'rescue');
      addOrder(g, -4);
      return R(true, `${tName} 获股东注资 ${fmtYi(inject)}`, ['政治资本 −2', '秩序 −4：大而不倒', rel(g, tNpc, 20), rel(g, 'yan', 5)].filter(Boolean));
    }
    case 'liquidate': {
      spendCap(g, 1);
      const a = ex.acct(target!);
      const q = Math.abs(a.pos);
      a.cash += ex.unrealized(a);
      a.pos = 0;
      a.avg = 0;
      s.resolved.set(target!, a.cash < 0 ? 'liquidated-bust' : 'liquidated');
      addOrder(g, 3);
      return R(true, `按结算价了结 ${tName} 的 ${wan(q)}`, ['政治资本 −1', '秩序 +3', a.cash < 0 ? `平仓后仍欠 ${fmtYi(-a.cash)}` : `剩余权益 ${fmtYi(a.cash)}`, rel(g, tNpc, -20)].filter(Boolean));
    }
    case 'refer': {
      spendCap(g, 1);
      s.used.add(`refer-${target}`);
      const ev = hasEvidence(g, target!) || (flag(g, 'voidedBy') === target);
      addOrder(g, 10);
      return R(true, `${tName} 相关人员移交司法机关`, ['政治资本 −1', '秩序 +10', rel(g, tNpc, -50, '被移交司法'), ev ? rel(g, 'yan', 5) : rel(g, 'yan', -8, '证据不足就移交')].filter(Boolean));
    }
    case 'rules':
      spendCap(g, 2);
      s.used.add('rules');
      s.legacy.push('涨跌停板', '分级持仓限额', '透支委托系统拦截');
      addOrder(g, 5);
      return R(true, '新规出台', ['政治资本 −2', '秩序 +5', rel(g, 'yan', 5)].filter(Boolean));
    case 'explain':
      spendCap(g, 1);
      s.used.add('explain');
      addOrder(g, 3);
      return R(true, '裁决说明会', ['政治资本 −1', '秩序 +3', '被一起撤销的人至少知道了为什么', rel(g, 'su', 10)].filter(Boolean));
    case 'suspend':
      spendCap(g, 3);
      s.used.add('suspend');
      s.legacy.push('暂停国债期货试点');
      addOrder(g, 5);
      return R(true, '建议暂停国债期货试点', ['政治资本 −3', '秩序 +5', rel(g, 'lu', -5), rel(g, 'wei', -10), rel(g, 'shen', -10)].filter(Boolean), { who: '严正', text: '这个建议分量很重。我会往上报。' });
  }
  return R(false, '没有效果', []);
}

/** 稽查结果：次晚揭晓 */
export function resolveInspections(g: Game): void {
  const s = st(g);
  for (const id of s.inspecting.splice(0)) {
    if (id === SHORT || id === HIDE) {
      if (g.market.ex.accounts.has(HIDE)) {
        s.evidence.add('split');
        evidence(g, 'ev-split', '申江借壳分仓：浦江实业 305 代持 90 万口空单', `稽查组查明：席位 305 浦江实业的 ${wan(HIDE_POS_ABS(g))} 空单由申江证券出资、申江交易员下单。两家合计空单超出持仓限额。`, '稽查组', 'shen');
      } else {
        g.addIntel({ id: `insp-${id}`, title: '稽查结果：申江账目未见代持', body: '账面上看不出代持。', source: '稽查组', credibility: 0.9, kind: 'clue' });
      }
    } else if (id === LONG) {
      s.evidence.add('wei');
      evidence(g, 'ev-wei', '中财信托与财政部门存在人事关联', '稽查组调阅了中财信托的往来记录：其高层与财政部门有直接的人事关联，交易部近期频繁拜访。', '稽查组', 'wei');
    } else if (id === ALLY) {
      if (flag(g, 'gaoFlip')) {
        s.evidence.add('gao');
        evidence(g, 'ev-gao', '辽北发展与中财信托私下接触', '稽查组发现：辽北发展近期与中财信托多次接触，并在锁仓期内分笔试探性平空。', '稽查组', 'gao');
      } else {
        g.addIntel({ id: `insp-${id}`, title: '稽查结果：辽北发展账目干净', body: '锁仓期内没有平仓，往来记录也没有异常。', source: '稽查组', credibility: 0.9, kind: 'clue' });
      }
    }
  }
}
const HIDE_POS_ABS = (g: Game) => Math.abs(g.market.ex.acct(HIDE).pos);

// ───────────── 交易座位 ─────────────

export function traderCards(g: Game): CardDef[] {
  const s = st(g);
  const d = g.dayIndex;
  const pre = d < BATTLE;
  const after = g.isAftermath;
  const f = g.factionId;
  const ex = g.market.ex;
  const out: CardDef[] = [];
  const used = (k: string) => s.used.has(k);
  const energy = g.energy <= 0 ? '精力用完了' : undefined;
  const lobby: CardDef = {
    id: 'lobby',
    name: '托关系探财政部口风',
    group: '信息',
    color: 'grey',
    does: '找北京的关系打听贴息方案到底定没定。越临近 23 日，问到的越准。',
    cost: '500 万元“茶水费”+ 1 点精力；监管热度 +5。',
    when: 'night',
    blocked: !pre ? '已经不需要了' : used(`lobby-${d}`) ? '今晚已经问过' : energy,
  };

  if (f === 'short' && !after) {
    out.push(
      {
        id: 'split',
        name: '借壳分仓',
        group: '仓位',
        color: 'black',
        does: '用关联小会员的席位多开 100 万口：你的持仓限额变成 400 万口。',
        cost: '监管热度 +10；交易记录可被追溯。',
        when: 'any',
        status: g.player.limit ? '已借壳' : undefined,
        blocked: g.player.limit ? '已经借过' : undefined,
      },
      {
        id: 'capital',
        name: '申请股东增资 8 亿元',
        group: '仓位',
        color: 'white',
        does: '主管单位追加资本金，保证金更宽裕。',
        cost: '声望 −3：圈里会知道你缺钱。',
        when: 'night',
        blocked: used('capital') ? '已经增过资' : undefined,
      },
      {
        id: 'fake-veto',
        name: '放风“贴息被否”',
        group: '舆论',
        color: 'black',
        does: '让钱有福在大户室里散布假消息：散户会跟着抛一阵。',
        cost: '监管热度 +15；声望 −5；谣言的源头可以被追到你。',
        when: 'any',
        blocked: used(`veto-${d}`) ? '今天已经放过' : g.isBattleDay && g.market.t >= 148 ? '消息已经满天飞，没人信了' : undefined,
      },
      {
        id: 'interview',
        name: '接受采访：兑付价就是 132 元',
        group: '舆论',
        color: 'grey',
        does: '公开喊话。明早散户情绪偏空。如果最后贴息兑现，你会被打脸。',
        cost: '1 点精力。',
        when: 'night',
        blocked: used(`interview-${d}`) ? '今晚已经接受过采访' : energy,
      },
      lobby,
      {
        id: 'mediate-req',
        name: '请交易所协调协议平仓',
        group: '仓位',
        color: 'white',
        does: '按收盘价加 0.6 元，从中财手里买回 80 万口空单，不经过订单簿。中财愿不愿意，看关系和日子。',
        cost: '1 点精力；谈不成也认。',
        when: 'night',
        blocked: !pre ? '已经过了谈的时候' : d < 2 ? '20 日起才有得谈' : used('mediated') ? '已经谈成' : energy,
      },
    );
  }
  if (f === 'long' && !after) {
    out.push(
      {
        id: 'tip-gao',
        name: '给辽北递话：倒戈有好处',
        group: '拉拢',
        color: 'grey',
        does: '许高振宇一笔“咨询费”，让他更早、更坚决地空翻多。',
        cost: '3000 万元 + 1 点精力；监管热度 +6。',
        when: 'night',
        blocked: !pre ? '来不及了' : used('tip-gao') ? '已经递过话' : energy,
      },
      {
        id: 'press',
        name: '媒体吹风：贴息在即',
        group: '舆论',
        color: 'grey',
        does: '找相熟的记者写一篇“政策面将有变化”。明早散户情绪偏多。',
        cost: '1 点精力；声望 −1。',
        when: 'night',
        blocked: used(`press-${d}`) ? '今晚已经找过' : energy,
      },
      {
        id: 'wash',
        name: '对倒拉抬',
        group: '盘面',
        color: 'black',
        does: '自买自卖做出成交量，引来 45 万口跟风买盘。',
        cost: '监管热度 +15；声望 −3；交易记录可被追溯。',
        when: 'trading',
        key: 'w',
        blocked: used(`wash-${d}`) ? '今天已经做过' : undefined,
      },
      {
        id: 'report-split',
        name: '举报申江借壳超仓',
        group: '拉拢',
        color: 'white',
        does: '把申江代持的证据交给交易所。交易所盯上申江，尾盘他未必还敢砸。',
        cost: '声望 −3（告密）。',
        when: 'any',
        blocked: used('report-split') ? '已经举报过' : !g.intel.some((i) => i.id === 'ev-split') ? '手上没有证据（问问记者或老周）' : undefined,
      },
      {
        id: 'reserve',
        name: '申请护盘资金 10 亿元',
        group: '仓位',
        color: 'white',
        does: '向母公司申请一笔护盘弹药。',
        cost: '声望 −2。',
        when: 'night',
        blocked: used('reserve') ? '已经申请过' : undefined,
      },
      lobby,
    );
  }
  if (f === 'ally' && !after) {
    const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
    out.push(
      {
        id: 'quiet-cover',
        name: '悄悄平掉 10 万口空单',
        group: '仓位',
        color: 'grey',
        does: '分散在一天里慢慢买回，不触发锁仓警报。累计平掉超过 15%，申江会察觉。',
        cost: '若被察觉，等同撕毁锁仓。',
        when: 'trading',
        key: 'q',
        blocked: !pre ? '今天不是慢慢来的时候' : used(`quiet-${d}`) ? '今天已经平过' : g.player.pos >= 0 ? '没有空单了' : undefined,
      },
      {
        id: 'deal-wei',
        name: '与中财谈好处费',
        group: '拉拢',
        color: 'grey',
        does: '拿 3000 万元，答应在消息出来时倒戈。拿了钱不倒戈，中财会记仇。',
        cost: '监管热度 +6。',
        when: 'night',
        blocked: !pre ? '来不及了' : used('deal-wei') ? '已经谈过' : undefined,
      },
      {
        id: 'fake-loyal',
        name: '向申江表忠心',
        group: '拉拢',
        color: 'grey',
        does: '请沈立行吃饭，拍胸脯说锁仓到底。他会更放心——你若倒戈，他也更措手不及。',
        cost: '1 点精力。',
        when: 'night',
        blocked: !lock ? '锁仓已经破裂' : used(`loyal-${d}`) ? '今晚已经请过' : energy,
      },
      lobby,
    );
  }
  if (f === 'retail' && !after) {
    const seats = [SHORT, LONG, ALLY].map((id) => ({ id, label: g.flags.seatsKnown ? `${ex.acct(id).name}（${ex.acct(id).seat}）` : `席位 ${ex.acct(id).seat}` }));
    out.push({
      id: 'follow',
      name: '跟单大席位',
      group: '跟风',
      color: 'white',
      does: '今天剩下的时间，这个席位每出一笔大单，你就用一成资金跟一笔。',
      cost: '跟错了，亏的是你自己。',
      when: 'trading',
      targets: seats,
      status: g.flags[`follow-${d}`] ? `跟着 ${seats.find((x) => x.id === g.flags[`follow-${d}`])?.label}` : undefined,
      blocked: g.flags[`follow-${d}`] ? '今天已经选好了' : undefined,
    });
  }

  if (after) {
    if (f === 'short') {
      const short = ex.equity(g.player) < ex.marginReq(g.player.pos);
      out.push(
        {
          id: 'bailout',
          name: '请求主管部门注资',
          group: '自救',
          color: 'white',
          does: '补上保证金缺口，公司活下来。',
          cost: '声望 −10；从此你说话不算数了。',
          when: 'night',
          blocked: used('bailout') ? '已经求过' : !short && !g.bankrupt ? '账上还够' : undefined,
        },
        { id: 'cooperate', name: '主动配合调查', group: '面对调查', color: 'white', does: '交出交易记录，争取从轻。', cost: '声望 −5。', when: 'night', blocked: used('cooperate') || used('shred') ? '已经选了路' : undefined },
        { id: 'blame', name: '把责任推给交易员', group: '面对调查', color: 'grey', does: '说是下面的人越权下单。', cost: '声望 −8；你的人会记住。', when: 'night', blocked: used('blame') ? '已经推过' : undefined },
        { id: 'shred', name: '销毁交易记录', group: '面对调查', color: 'black', does: '让一部分单据“找不到”。', cost: '监管热度 +25；被查出来就是另一个罪名。', when: 'night', blocked: used('shred') || used('cooperate') ? '已经选了路' : undefined },
      );
    }
    if (f === 'long') {
      out.push(
        { id: 'cooperate', name: '主动配合调查', group: '面对调查', color: 'white', does: '说明消息来源，争取从轻。', cost: '声望 −5；北京的关系会断。', when: 'night', blocked: used('cooperate') || used('coverup') ? '已经选了路' : undefined },
        { id: 'coverup', name: '请财政部的熟人压一压', group: '面对调查', color: 'black', does: '让调查“不了了之”。', cost: '监管热度 +20；牵出来的人会更多。', when: 'night', blocked: used('coverup') || used('cooperate') ? '已经选了路' : undefined },
      );
    }
    if (f === 'ally') {
      const broken = g.alliances.find((a) => a.id === 'lock' && a.brokenBy === 'player');
      out.push(
        { id: 'pay-penalty', name: '向申江赔一笔了事', group: '收尾', color: 'white', does: '按协议的精神赔 1 亿元，买回一点名声。', cost: '1 亿元。', when: 'night', blocked: !broken ? '你没有违约' : used('pay-penalty') ? '已经赔过' : undefined },
        { id: 'cooperate', name: '主动配合调查', group: '收尾', color: 'white', does: '说明倒戈时点和资金来源。', cost: '声望 −3。', when: 'night', blocked: used('cooperate') ? '已经配合' : undefined },
      );
    }
    if (f === 'retail') {
      out.push({ id: 'complain', name: '联名投诉被撤销的成交', group: '收尾', color: 'white', does: '和大户室里的人一起写信给交易所。', cost: '1 点精力。', when: 'night', blocked: !flag(g, 'voided') ? '没有成交被撤销' : used('complain') ? '已经投诉过' : energy });
    }
  }
  return out;
}

export function traderPlay(g: Game, id: string, target?: string): CardResult {
  const s = st(g);
  const ex = g.market.ex;
  const p = g.player;
  const d = g.dayIndex;
  const close = ex.last;
  switch (id) {
    case 'lobby': {
      s.used.add(`lobby-${d}`);
      g.energy--;
      p.cash -= 5_000_000;
      g.addHeat(5, '托关系打听政策');
      if (d >= 3) {
        rumor(g, `lobby-${d}`, '贴息定了，23 日前后公布', '北京的关系压低声音：“方案已经报上去了，兑付价比 132 高得多。就这几天。”', '北京的关系', 0.9, [
          { who: '财政部', said: '贴息方案已上报' },
          { who: '北京的关系', said: '定了，就这几天' },
        ]);
        return R(true, '北京来了准信', ['支付 500 万元', '监管热度 +5', '获得情报：贴息定了'], { who: '北京的关系', text: '就这几天。别说是我讲的。' });
      }
      rumor(g, `lobby-${d}`, '贴息还在讨论，没定', '北京的关系说：“部里还在吵，什么时候定说不好。”', '北京的关系', 0.7, [{ who: '北京的关系', said: '还在讨论' }]);
      return R(true, '口风还不明朗', ['支付 500 万元', '监管热度 +5'], { who: '北京的关系', text: '还在吵，过两天再问。' });
    }
    case 'split':
      p.limit = 4_000_000;
      g.addHeat(10, '借壳分仓');
      g.flags.playerSplit = true;
      if (g.principleId === 'no-violation') g.crossLine('借壳分仓绕过持仓限额');
      return R(true, '借壳分仓', ['持仓限额 → 400 万口', '监管热度 +10']);
    case 'capital':
      s.used.add('capital');
      p.cash += 800_000_000;
      g.reputation -= 3;
      return R(true, '股东增资 8 亿元到账', ['现金 +8 亿元', '声望 −3']);
    case 'fake-veto': {
      s.used.add(`veto-${d}`);
      g.addHeat(15, '散布虚假消息');
      g.reputation -= 5;
      if (g.principleId === 'no-violation') g.crossLine('编造并散布虚假消息');
      rumor(g, `fake-veto-${d}`, '贴息被财政部否了', '钱有福在大户室里嚷：“贴息黄了！327 要跌回去！”', '钱有福', 0.05, [
        { who: '你', said: '编造：贴息方案被财政部否了', altered: true },
        { who: '钱有福', said: '贴息黄了' },
      ]);
      if (g.phase === 'trading') addCrowdFlow(g, 'sell', 600_000, 20);
      else g.flags.vetoNext = true;
      g.market.sentiment = Math.max(-1, g.market.sentiment - 0.5);
      return R(true, '谣言放出去了', ['散户将在 20 分钟内抛出约 60 万口', '监管热度 +15', '声望 −5'], { who: '钱有福', text: '老板放心，半个钟头整个大户室都晓得。' });
    }
    case 'interview':
      s.used.add(`interview-${d}`);
      g.energy--;
      g.flags.sentNext = ((g.flags.sentNext as number) || 0) - 0.35;
      g.flags.interviewed = true;
      g.relate('su', 5);
      return R(true, '采访见报：“兑付价就是 132 元”', ['明早散户情绪偏空', '苏晓 关系 +5'], { who: '苏晓', text: '你确定要我原话照登？好。' });
    case 'mediate-req': {
      g.energy--;
      const wei = g.npc('wei')!;
      const prob = Math.min(0.85, 0.25 + 0.15 * (d - 2) + wei.relation / 200);
      if (!g.rngSocial.chance(prob)) {
        g.relate('wei', -2);
        return R(false, '中财不肯谈', [`成功率约 ${Math.round(prob * 100)}%`], { who: wei.name, text: '现在谈这个？早了点。要讲政策，看大局。' });
      }
      const price = close + 60;
      const q = agreedClose(g, p.id, LONG, 800_000, price);
      s.used.add('mediated');
      g.flags.mediated = true;
      return R(true, `协议平仓 ${wan(q)}，价格 ${p2(price)} 元`, [`空单降到 ${wan(-p.pos)}`], { who: wei.name, text: '看在交易所的面子上。' });
    }
    case 'tip-gao':
      s.used.add('tip-gao');
      g.energy--;
      p.cash -= 30_000_000;
      g.addHeat(6, '利益输送');
      g.flags.gaoBribed = true;
      g.relate('gao', 15);
      return R(true, '话递到了', ['支付 3000 万元', '监管热度 +6', '高振宇 关系 +15'], { who: '高振宇', text: '兄弟够意思。到时候看我的。' });
    case 'press':
      s.used.add(`press-${d}`);
      g.energy--;
      g.reputation -= 1;
      g.flags.sentNext = ((g.flags.sentNext as number) || 0) + 0.4;
      return R(true, '明早见报：“政策面将有变化”', ['明早散户情绪偏多', '声望 −1']);
    case 'wash':
      s.used.add(`wash-${d}`);
      g.addHeat(15, '对倒拉抬');
      g.reputation -= 3;
      if (g.principleId === 'no-violation') g.crossLine('对倒制造成交量');
      addCrowdFlow(g, 'buy', 450_000, 15);
      g.market.sentiment = Math.min(1, g.market.sentiment + 0.4);
      return R(true, '对倒：成交量放出来了', ['15 分钟内引来约 45 万口跟风买盘', '监管热度 +15', '声望 −3']);
    case 'report-split':
      s.used.add('report-split');
      g.reputation -= 3;
      addDeter(g, SHORT, 3);
      g.flags.shenReported = true;
      g.relate('shen', -30, '被举报借壳超仓');
      return R(true, '证据交到了交易所', ['申江被交易所盯上', '声望 −3'], { who: '陈默', text: '材料收下了。按规则办。' });
    case 'reserve':
      s.used.add('reserve');
      p.cash += 1_000_000_000;
      g.reputation -= 2;
      return R(true, '护盘资金 10 亿元到账', ['现金 +10 亿元', '声望 −2']);
    case 'quiet-cover':
      s.used.add(`quiet-${d}`);
      g.addPlanFromScript({ label: '悄悄平空 10 万口', cond: 'now', price: 0, side: 'buy', qty: Math.min(100_000, -p.pos), spread: 60 });
      return R(true, '已加入计划书：一小时内分批买回 10 万口', []);
    case 'deal-wei':
      s.used.add('deal-wei');
      p.cash += 30_000_000;
      g.addHeat(6, '收取好处费');
      g.flags.allyPaid = true;
      g.relate('wei', 20);
      return R(true, '中财的 3000 万元到账', ['现金 +3000 万元', '监管热度 +6', '你答应了倒戈'], { who: '魏国梁', text: '消息一出来，就看高总的了。' });
    case 'fake-loyal':
      s.used.add(`loyal-${d}`);
      g.energy--;
      g.relate('shen', 15, '高振宇拍胸脯说锁仓到底');
      g.flags.fakeLoyal = true;
      return R(true, '饭桌上拍了胸脯', ['沈立行 关系 +15'], { who: '沈立行', text: '有高总这句话，我就放心了。' });
    case 'follow':
      g.flags[`follow-${d}`] = target!;
      return R(true, '开始跟单', [`跟着 ${ex.acct(target!).seat} 席位`]);
    case 'bailout': {
      s.used.add('bailout');
      const inject = Math.max(0, ex.marginReq(p.pos) - ex.equity(p)) + 100_000_000;
      p.cash += inject;
      g.reputation -= 10;
      g.bankrupt = false;
      return R(true, `主管部门注资 ${fmtYi(inject)}`, ['公司保住了', '声望 −10']);
    }
    case 'cooperate':
      s.used.add('cooperate');
      g.reputation -= g.factionId === 'ally' ? 3 : 5;
      g.heat = Math.max(g.heatPeak * 0.3, g.heat - 15);
      return R(true, '主动配合调查', ['监管热度 −15', '声望下降']);
    case 'blame':
      s.used.add('blame');
      g.reputation -= 8;
      g.heat = Math.max(g.heatPeak * 0.3, g.heat - 10);
      if (g.principleId === 'no-betrayal') g.crossLine('把责任推给下属');
      return R(true, '交易员被停职', ['监管热度 −10', '声望 −8']);
    case 'shred':
      s.used.add('shred');
      g.addHeat(25, '销毁交易记录');
      if (g.principleId === 'no-violation') g.crossLine('销毁交易记录');
      return R(true, '一部分单据“找不到了”', ['监管热度 +25']);
    case 'coverup':
      s.used.add('coverup');
      g.addHeat(20, '干扰调查');
      if (g.principleId === 'no-violation') g.crossLine('请人压下调查');
      return R(true, '电话打到了北京', ['监管热度 +20']);
    case 'pay-penalty':
      s.used.add('pay-penalty');
      p.cash -= 100_000_000;
      g.reputation += 8;
      g.relate('shen', 30);
      return R(true, '赔给申江 1 亿元', ['声望 +8', '沈立行 关系 +30'], { who: '沈立行', text: '……算你还有点良心。' });
    case 'complain':
      s.used.add('complain');
      g.energy--;
      g.reputation += 3;
      return R(true, '联名信寄出了', ['声望 +3'], { who: '陈默', text: '来信收到。撤销的是违规时段的全部成交，对所有人一视同仁。' });
  }
  return R(false, '没有效果', []);
}

/** 跟单：被跟的席位刚出了大单，就用一成资金跟一笔 */
export function followOrders(g: Game): OrderReq[] {
  const seatOf = g.flags[`follow-${g.dayIndex}`] as string | undefined;
  if (!seatOf || g.phase !== 'trading') return [];
  const ex = g.market.ex;
  const seat = ex.acct(seatOf).seat;
  const label = g.market.session.label(g.market.t - 1);
  const row = g.tape.find((r) => r.day === g.dayIndex && r.time === label && r.seat === seat);
  if (!row) return [];
  const eq = ex.equity(g.player);
  const q = Math.floor((eq * 0.1) / (ex.contractValue(ex.last) * ex.deck.marginRate));
  if (q <= 0) return [];
  return [{ owner: g.player.id, side: row.side, qty: q, type: 'market' }];
}
