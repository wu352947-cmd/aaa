import { fmtYi } from '../../engine/exchange';
import { addCrowdFlow } from '../../engine/flows';
import type { CardDef, CardResult, DraftRules, Game } from '../../engine/game';
import { addDeter, addOrder, ALLY, flag, isPlayer, LONG, memberName, members, rumor, SHORT, spendCap, st, wan } from './common';
import { BATTLE } from './data';

/**
 * 每晚选卡：从这个座位的牌堆里发三张，收下一张。
 * 每张牌都有两种用法——打出它写的事，或者不打、换算成本钱（监管座位换政治资本，交易座位换精力）。
 * 对手的牌自己用不了：换算给的多，但会替对手把事办了。
 */

const R = (ok: boolean, title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok, title, effects, reply });
const isOfficial = (g: Game) => g.factionId === 'official';

type Deal = CardDef & { /** 能发的日子与条件 */ ok(g: Game): boolean; pts: number };

function officialDeck(g: Game): Deal[] {
  const s = st(g);
  const d = g.dayIndex;
  const pre = d < BATTLE;
  const mem = members(g).map((id) => ({ id, label: memberName(g, id) }));
  return [
    {
      id: 'x-classmate',
      name: '财政部的老同学',
      group: '手牌',
      color: 'white',
      does: '国债司的一位处长是你大学同学。一个电话，贴息方案在 23 日开盘前公告——这次不会被回绝，也不伤和气。',
      cost: '1 点政治资本。',
      when: 'night',
      blocked: flag(g, 'mofPublic') ? '财政部已经答应' : !pre ? '来不及了' : s.cap < 1 ? '政治资本不足（需 1 点）' : undefined,
      convert: '+1 点政治资本',
      pts: 1,
      ok: (g) => g.dayIndex >= 1 && g.dayIndex < BATTLE && !flag(g, 'mofPublic'),
    },
    {
      id: 'x-taskforce',
      name: '临时稽查小组',
      group: '手牌',
      color: 'white',
      does: '从结算部借三个人：今晚就去查一家会员，明晚出结果。不花政治资本，也不占精力。',
      cost: '对方关系 −8。',
      when: 'night',
      targets: mem.filter((x) => !s.used.has(`insp-${x.id}`)),
      convert: '+1 点政治资本',
      pts: 1,
      ok: (g) => g.dayIndex < BATTLE,
    },
    {
      id: 'x-overtime',
      name: '交易部通宵加班',
      group: '手牌',
      color: 'white',
      does: '把每家会员这几天的往来都过一遍：所有人的盘算，你都看得清。',
      cost: '无。',
      when: 'night',
      convert: '+1 点政治资本',
      pts: 1,
      ok: (g) => g.dayIndex < BATTLE && !st(g).know.has('all'),
    },
    {
      id: 'x-fund',
      name: '风险基金追加拨款',
      group: '手牌',
      color: 'white',
      does: '证监会特批：交易所风险基金增加 5 亿元。出了窟窿，能补得更多。',
      cost: '无。',
      when: 'any',
      convert: '+2 点政治资本',
      pts: 2,
      ok: () => true,
    },
    {
      id: 'x-breaker',
      name: '熔断预案',
      group: '手牌',
      color: 'white',
      does: '盘中暂停 30 分钟。按预案执行：不算今天的停市次数，不花政治资本，也没人能说你乱作为。',
      cost: '会员不满。',
      when: 'trading',
      blocked: g.market.t < g.market.haltUntil ? '正在停市' : undefined,
      convert: '+1 点政治资本',
      pts: 1,
      ok: (g) => g.dayIndex >= 3 && g.dayIndex < BATTLE,
    },
    {
      id: 'x-backing',
      name: '严正的口头授权',
      group: '手牌',
      color: 'white',
      does: '严正在电话里说：“出了事我担着。”从现在起，限令会员只许平仓都按有据可查算，只要 1 点政治资本，也不会被追究。',
      cost: '无。',
      when: 'any',
      status: flag(g, 'coBacked') ? '已授权' : undefined,
      convert: '+2 点政治资本',
      pts: 2,
      ok: (g) => g.dayIndex >= 2 && g.dayIndex < BATTLE,
    },
    {
      id: 'x-ledger',
      name: '结算部的逐笔系统',
      group: '手牌',
      color: 'white',
      does: '结算部连夜调好了逐笔核对的程序：裁决时“只撤销透支成交”不再需要政治资本。',
      cost: '无。',
      when: 'any',
      status: flag(g, 'preciseFree') ? '已就绪' : undefined,
      convert: '+1 点政治资本',
      pts: 1,
      ok: (g) => g.dayIndex >= 2 && g.dayIndex < BATTLE,
    },
    {
      id: 'x-foe-letter',
      name: '申江的游说信',
      group: '手牌',
      color: 'grey',
      does: '申江托上面的人递来一封信：“请交易所顾全大局，不要对会员赶尽杀绝。”',
      cost: '这是对手的牌。',
      when: 'any',
      foe: '换算：上面有人替你说话，政治资本 +3。但申江知道你收了信——它对你的威慑 −2。',
      convert: '+3 点政治资本',
      pts: 3,
      ok: (g) => g.dayIndex < BATTLE && !isPlayer(g, SHORT),
    },
    {
      id: 'x-foe-dinner',
      name: '中财的饭局',
      group: '手牌',
      color: 'grey',
      does: '中财在锦江饭店订了一桌，财政部的人也在。',
      cost: '这是对手的牌。',
      when: 'any',
      foe: '换算：席上有人替你在部里美言，政治资本 +3。但被记者看见了：秩序 −5，中财不再怕你（威慑 −1）。',
      convert: '+3 点政治资本',
      pts: 3,
      ok: (g) => g.dayIndex < BATTLE && !isPlayer(g, LONG),
    },
  ];
}

function traderDeck(g: Game): Deal[] {
  const f = g.factionId;
  const d = g.dayIndex;
  const pre = d < BATTLE;
  const s = st(g);
  const big = f !== 'retail';
  const out: Deal[] = [
    {
      id: 'x-eyes',
      name: '大户室的眼线',
      group: '手牌',
      color: 'grey',
      does: '钱有福在各家席位都有熟人。请他们喝顿酒：所有人的盘算，你都看得清。',
      cost: big ? '200 万元。' : '200 元。',
      when: 'night',
      convert: '+1 点精力',
      pts: 1,
      ok: (g) => g.dayIndex < BATTLE && !st(g).know.has('all'),
    },
    {
      id: 'x-calm',
      name: '托人压一压',
      group: '手牌',
      color: 'grey',
      does: '找关系，把交易所的问询压下去：监管热度 −12。',
      cost: '欠下一个人情。',
      when: 'night',
      blocked: g.heat <= 0 ? '眼下没有问询' : undefined,
      convert: '+1 点精力',
      pts: 1,
      ok: (g) => g.heat >= 10,
    },
    {
      id: 'x-reporter',
      name: '相熟的记者',
      group: '手牌',
      color: 'white',
      does: '明早的头条由你定：偏多还是偏空，你选。散户跟着报纸走；各方按自己的风格解读——消息驱动的跟，逆向的反着来。',
      cost: '1 点精力。',
      when: 'night',
      targets: [
        { id: 'bull', label: '偏多：“政策面将有变化”' },
        { id: 'bear', label: '偏空：“兑付价就是 132 元”' },
      ],
      blocked: g.energy <= 0 ? '精力用完了' : !pre ? '来不及了' : undefined,
      convert: '+1 点精力',
      pts: 1,
      ok: (g) => g.dayIndex < BATTLE,
    },
  ];
  if (big)
    out.push({
      id: 'x-loan',
      name: '同业拆借 5 亿元',
      group: '手牌',
      color: 'white',
      does: '向兄弟单位借 5 亿元，保证金立刻宽裕。',
      cost: '结局时连本带息还 5.5 亿元。',
      when: 'any',
      convert: '+1 点精力',
      pts: 1,
      ok: (g) => g.dayIndex < BATTLE,
    });
  if (f === 'short')
    out.push(
      {
        id: 'x-shell',
        name: '第二个壳',
        group: '手牌',
        color: 'black',
        does: '再借一家小会员的席位开仓：持仓限额 +100 万口（和借壳分仓叠加）。',
        cost: '监管热度 +12；交易记录可被追溯。',
        when: 'any',
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex < BATTLE,
      },
      {
        id: 'x-halt-req',
        name: '请交易所临时停市',
        group: '手牌',
        color: 'white',
        does: '决战日盘中打给交易所：申请停市 15 分钟，让倒戈的冲击冷一冷。陈默肯不肯，看你们的关系。',
        cost: '陈默 关系 −5。',
        when: 'trading',
        blocked: !g.isBattleDay ? '只有决战日用得上' : g.market.t < g.market.haltUntil ? '正在停市' : undefined,
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex >= 3 && g.dayIndex < BATTLE,
      },
      {
        id: 'x-foe-wei',
        name: '中财放出的口风',
        group: '手牌',
        color: 'grey',
        does: '魏国梁让人带话：“空头现在认输，还来得及。”',
        cost: '这是对手的牌。',
        when: 'any',
        foe: '换算：你借着这句话跟同行通气，精力 +2。但话传开了——明早散户情绪偏多。',
        convert: '+2 点精力',
        pts: 2,
        ok: (g) => g.dayIndex < BATTLE,
      },
    );
  if (f === 'long')
    out.push(
      {
        id: 'x-crowd',
        name: '大户室里的自己人',
        group: '手牌',
        color: 'grey',
        does: '你的人在大户室里一起喊“327 要贴息”：15 分钟内引来约 30 万口跟风买盘。',
        cost: '监管热度 +6。',
        when: 'trading',
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex >= 1 && g.dayIndex <= BATTLE - 1,
      },
      {
        id: 'x-shell',
        name: '另一家信托代持',
        group: '手牌',
        color: 'black',
        does: '让关系户的信托帮你多拿一些：持仓限额 +100 万口。',
        cost: '监管热度 +12；交易记录可被追溯。',
        when: 'any',
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex < BATTLE,
      },
      {
        id: 'x-foe-shen',
        name: '申江放出的口风',
        group: '手牌',
        color: 'grey',
        does: '申江的交易员在饭桌上说：“贴息？早就被否了。”',
        cost: '这是对手的牌。',
        when: 'any',
        foe: '换算：你借这个由头去北京又问了一圈，精力 +2。但谣言已经传开——明早散户会抛出约 60 万口。',
        convert: '+2 点精力',
        pts: 2,
        ok: (g) => g.dayIndex < BATTLE && !isPlayer(g, SHORT),
      },
    );
  if (f === 'ally')
    out.push(
      {
        id: 'x-hk',
        name: '香港来的接盘人',
        group: '手牌',
        color: 'grey',
        does: '一家香港的基金愿意私下接走你 30 万口空单：不经过订单簿，申江看不见，也不算在锁仓里。',
        cost: '按收盘价加 0.2 元成交。',
        when: 'night',
        blocked: g.player.pos >= 0 ? '没有空单了' : undefined,
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex < BATTLE && g.player.pos < 0,
      },
      {
        id: 'x-foe-shen',
        name: '申江的眼线',
        group: '手牌',
        color: 'grey',
        does: '申江在你的交易室里安了一个人。',
        cost: '这是对手的牌。',
        when: 'any',
        foe: '换算：你将计就计，借他的嘴传话，精力 +2。但你的底细也漏了出去——沈立行 关系 −15。',
        convert: '+2 点精力',
        pts: 2,
        ok: (g) => g.dayIndex < BATTLE && !isPlayer(g, SHORT),
      },
    );
  if (f === 'retail')
    out.push(
      {
        id: 'x-overdraft',
        name: '营业部的透支额度',
        group: '手牌',
        color: 'grey',
        does: '营业部经理给你开了透支：现金 +8 万元。',
        cost: '结局时还 9 万元。',
        when: 'any',
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex < BATTLE,
      },
      {
        id: 'x-zhou',
        name: '老周的一句话',
        group: '手牌',
        color: 'white',
        does: '老周把他看到的说给你听：一个大席位的盘算，你选一个。',
        cost: '无。',
        when: 'any',
        targets: [
          { id: 'shen', label: '席位 011' },
          { id: 'wei', label: '席位 102' },
          { id: 'gao', label: '席位 217' },
        ].filter((t) => !s.know.has(t.id)),
        convert: '+1 点精力',
        pts: 1,
        ok: (g) => g.dayIndex < BATTLE,
      },
    );
  return out;
}

function deck(g: Game): Deal[] {
  return isOfficial(g) ? officialDeck(g) : traderDeck(g);
}

export const DRAFT_327: DraftRules = {
  deck: (g) => deck(g),
  offerable: (g, c) => (c as Deal).ok(g),
  convert(g, id) {
    const c = deck(g).find((x) => x.id === id)!;
    const s = st(g);
    const fx: string[] = [];
    if (isOfficial(g)) {
      s.cap = Math.min(10, s.cap + c.pts);
      fx.push(`政治资本 +${c.pts}`);
    } else {
      g.energy += c.pts;
      fx.push(`精力 +${c.pts}`);
    }
    switch (id) {
      case 'x-foe-letter':
        addDeter(g, SHORT, -2);
        fx.push('申江威慑 −2');
        break;
      case 'x-foe-dinner':
        addOrder(g, -5);
        addDeter(g, LONG, -1);
        g.relate('su', -5, '交易所的人去了中财的饭局');
        fx.push('秩序 −5', '中财威慑 −1');
        break;
      case 'x-foe-wei':
        g.flags.sentNext = ((g.flags.sentNext as number) || 0) + 0.3;
        fx.push('明早散户情绪偏多');
        break;
      case 'x-foe-shen':
        if (g.factionId === 'long') {
          g.flags.vetoNext = true;
          rumor(g, `foe-veto-${g.dayIndex}`, '贴息被财政部否了', '申江的交易员在饭桌上说：“贴息？早就被否了。”话已经传到了大户室。', '饭局上', 0.1);
          fx.push('明早散户会抛出约 60 万口');
        } else {
          g.relate('shen', -15, '从眼线那里知道了你的底细');
          fx.push('沈立行 关系 −15');
        }
        break;
    }
    return R(true, `${c.name}：换算`, fx);
  },
};

export function draftPlay(g: Game, id: string, target?: string): CardResult {
  const s = st(g);
  const ex = g.market.ex;
  const p = g.player;
  switch (id) {
    // ── 监管座位 ──
    case 'x-classmate':
      spendCap(g, 1);
      g.flags.mofPublic = true;
      addOrder(g, 10);
      g.relate('wei', -10);
      return R(true, '财政部同意：23 日开盘前公告', ['政治资本 −1', '秩序 +10：没人能靠提前知道赚钱', '中财 关系 −10'], { who: '国债司的老同学', text: '部里本来也在吵什么时候公布。你这一推，算是帮了忙。' });
    case 'x-taskforce':
      s.used.add(`insp-${target}`);
      s.inspecting.push(target!);
      addDeter(g, target!, 1);
      s.know.add(MEMBER(target!));
      g.relate(MEMBER(target!), -8, '交易所派员稽查');
      return R(true, `稽查小组进驻 ${memberName(g, target!)}`, ['明晚出结果', '威慑 +1', '对方关系 −8']);
    case 'x-overtime':
      s.know.add('all');
      return R(true, '一夜没睡：所有人的盘算都摊在了桌上', ['对手动向全部摸清']);
    case 'x-fund':
      s.fund += 500_000_000;
      return R(true, '风险基金 +5 亿元', [`余额 ${fmtYi(s.fund)}`]);
    case 'x-breaker': {
      const m = g.market;
      m.haltUntil = m.t + 30;
      m.sentiment *= 0.3;
      m.flow *= 0.6;
      addOrder(g, 2);
      g.push({ kind: 'intel', text: '交易所按熔断预案：327 合约暂停交易 30 分钟' });
      return R(true, '按预案暂停 30 分钟', ['情绪降温', '秩序 +2']);
    }
    case 'x-backing':
      g.flags.coBacked = true;
      return R(true, '严正口头授权', ['限令只许平仓按有据可查算'], { who: '严正', text: '出了事我担着。但你要拿得出东西来。' });
    case 'x-ledger':
      g.flags.preciseFree = true;
      return R(true, '逐笔核对程序就绪', ['“只撤销透支成交”不再需要政治资本']);
    // ── 交易座位 ──
    case 'x-eyes':
      s.know.add('all');
      p.cash -= g.factionId === 'retail' ? 200 : 2_000_000;
      return R(true, '眼线回话了', ['对手动向全部摸清'], { who: '钱有福', text: '老板，各家的底细我都打听清爽了。' });
    case 'x-calm':
      g.heat = Math.max(g.heatPeak * 0.3, g.heat - 12);
      return R(true, '问询被压了下去', ['监管热度 −12']);
    case 'x-reporter':
      g.energy--;
      g.spin(target === 'bull' ? 1 : -1, target === 'bull' ? '本报记者：政策面将有变化，327 兑付价或远高于 132 元' : '本报记者：327 兑付价就是 132 元，贴息无从谈起', '相熟的记者');
      return R(true, target === 'bull' ? '明早见报：“政策面将有变化”' : '明早见报：“兑付价就是 132 元”', ['明早的头条', target === 'bull' ? '散户情绪偏多；跟着报纸走的人更看多，逆向的人反着来' : '散户情绪偏空；跟着报纸走的人更看空，逆向的人反着来']);
    case 'x-loan':
      p.cash += 500_000_000;
      s.debt += 550_000_000;
      return R(true, '拆借 5 亿元到账', ['现金 +5 亿元', '结局时还 5.5 亿元']);
    case 'x-shell':
      p.limit = (p.limit ?? ex.deck.positionLimit) + 1_000_000;
      g.addHeat(12, '借壳代持');
      if (g.principleId === 'no-violation') g.crossLine('借壳代持绕过持仓限额');
      return R(true, '又多了一个壳', [`持仓限额 → ${wan(p.limit)}`, '监管热度 +12']);
    case 'x-halt-req': {
      const chen = g.npc('chen');
      g.relate('chen', -5);
      if (!chen || chen.relation < -10) return R(false, '交易所没有同意', ['陈默 关系 −5'], { who: '陈默', text: '停不停市，交易所自己判断。' });
      g.market.haltUntil = g.market.t + 15;
      g.market.sentiment *= 0.4;
      g.push({ kind: 'intel', text: '交易所宣布：327 合约临时停市 15 分钟' });
      return R(true, '交易所临时停市 15 分钟', ['陈默 关系 −5'], { who: '陈默', text: '十五分钟。冷一冷也好。' });
    }
    case 'x-crowd':
      addCrowdFlow(g, 'buy', 300_000, 15);
      g.addHeat(6, '组织跟风');
      return R(true, '大户室喊起来了', ['15 分钟内约 30 万口跟风买盘', '监管热度 +6']);
    case 'x-hk': {
      const q = Math.min(300_000, -p.pos);
      const price = ex.last + 20;
      ex.rebook({ tick: ex.tick, price, qty: q, buyer: p.id, seller: LONG, aggressor: 'buy' });
      // 不经过订单簿，也不算在锁仓的账上
      s.allianceStartPos += q;
      return R(true, `香港基金接走 ${wan(q)}`, [`成交价 ${(price / 100).toFixed(2)} 元`, `空单降到 ${wan(-p.pos)}`]);
    }
    case 'x-overdraft':
      p.cash += 80_000;
      s.debt += 90_000;
      return R(true, '透支额度批下来了', ['现金 +8 万元', '结局时还 9 万元']);
    case 'x-zhou':
      s.know.add(target!);
      return R(true, '老周说了他看到的', ['摸清了一个大席位的盘算（见“对手动向”）'], { who: '老周', text: '侬自家看，阿拉只讲到这里。' });
  }
  return R(false, '没有效果', []);
}

const MEMBER = (acct: string) => ({ [SHORT]: 'shen', [LONG]: 'wei', [ALLY]: 'gao' })[acct] ?? 'shen';
