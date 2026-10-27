import { fmtYi } from '../../engine/exchange';
import type { CardDef, CardResult, Clock, DraftRules, Game } from '../../engine/game';
import { BATTLE_2021, NYSE } from './data';

/**
 * 散户起义：对手动向与每晚选卡。
 * 和 327 一样：进度钟没摸清之前只看得到轮廓；每张手牌都能换算成精力，对手的牌换得多、但替对手办事。
 */

const mi = NYSE.index;
const flag = (g: Game, k: string) => g.flags[k];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const knowsGme = (g: Game, id: string) => !!(flag(g, 'know-all') || flag(g, `know-${id}`));
const R = (ok: boolean, title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok, title, effects, reply });

export function gmeClocks(g: Game, requirement: (g: Game) => number): Clock[] {
  const d = g.dayIndex;
  const f = g.factionId;
  const m = g.market;
  const out: Clock[] = [];
  const t = g.phase === 'trading' ? m.t : 999;

  // 灰狼：回补
  if (f !== 'short') {
    const gw = m.ex.acct('greywolf');
    const done = gw.pos >= 0 || d > 3 || (d === 3 && t >= mi('10:00'));
    const fill = done ? 4 : d === 0 ? 0 : d === 1 ? 1 : d === 2 ? (t >= mi('14:00') ? 3 : 2) : 3;
    out.push({
      id: 'gw-cover',
      who: 'rowan',
      name: knowsGme(g, 'rowan') ? '灰狼：回补空单' : '灰狼资本在盘算什么',
      segs: 4,
      filled: fill,
      known: knowsGme(g, 'rowan'),
      then: '26 日下午开始买回空单，27 日开盘半小时内平完。他每买一股，都在把价格往上推。',
      now: done ? '空单已经平完了：之后的上涨，跟他无关。' : `他还扛着 ${(Math.max(0, -gw.pos) / 10000).toFixed(0)} 万股空单。`,
      counter: f === 'retail' ? '他回补的那半小时是最贵的时候；他平完之后，就再没有这股买盘了。' : '空头回补的那一段，正是你的客户追得最凶的时候。',
      tone: 'neutral',
      state: done ? 'fired' : 'running',
    });
  }

  // 堡垒：期权对冲的买盘
  {
    const bars = m.bars;
    const mom = bars.length >= 6 ? (m.last - bars[bars.length - 6].o) / m.last : 0;
    const off = !!flag(g, 'optionsOff');
    const fill = clamp(Math.min(d, 3) + (mom > 0.02 ? 1 : 0), 0, 4);
    const known = f === 'broker' || knowsGme(g, 'stone');
    out.push({
      id: 'ft-gamma',
      who: 'stone',
      name: known ? '堡垒：期权对冲' : '做市商在盘算什么',
      segs: 4,
      filled: off ? Math.min(fill, 1) : fill,
      known,
      then: '价格每往上冲一段，卖出看涨期权的做市商就被迫买股票对冲，把价格推得更高。',
      now: off ? '期权开仓暂停了：这股力量少了大半。' : mom > 0.02 ? '价格正在往上冲：对冲买盘正在涌进来。' : '价格没在冲：它按兵不动。',
      counter:
        f === 'broker'
          ? '暂停这只股票的期权开仓：这股力量少大半。'
          : f === 'short'
            ? '你也可以买看涨期权对冲：逼空越凶，它赚得越多。'
            : '买看涨期权的人越多，做市商被迫买的股票就越多。',
      tone: f === 'short' ? 'threat' : 'neutral',
      state: off ? 'defused' : d > BATTLE_2021 ? 'fired' : 'running',
    });
  }

  // 论坛：钻石手
  {
    const known = f === 'retail' || knowsGme(g, 'jack');
    const hot = m.sentiment > 0.4 ? 1 : 0;
    const fired = d === BATTLE_2021 && g.phase === 'trading' && t >= mi('9:30');
    out.push({
      id: 'forum',
      who: 'jack',
      name: known ? '论坛：钻石手' : '论坛在盘算什么',
      segs: 5,
      filled: fired || d > BATTLE_2021 ? 5 : clamp(d + hot, 0, 4),
      known,
      then: '28 日开盘，论坛上所有人同时按下买入。',
      now: flag(g, 'restrictActive') ? '券商限制了买入：他们只能卖，或者转户。' : hot ? '论坛今天情绪高涨。' : '论坛还在观望。',
      counter:
        f === 'short'
          ? '上电视唱空、游说监管查论坛，能让他们犹豫一点。'
          : f === 'broker'
            ? '限购或限制买入，能把这股买盘挡在门外——代价是用户的信任。'
            : '公约说价格到月球之前一股不卖。月球在哪里，没人写下来。',
      tone: f === 'short' ? 'threat' : f === 'retail' ? 'friend' : 'neutral',
      state: fired ? 'fired' : 'running',
    });
  }

  // 清算所：凌晨五点的押金（只有券商看得见）
  if (f === 'broker') {
    const req = requirement(g);
    const cap = g.flags.capital as number;
    out.push({
      id: 'nscc',
      who: 'nscc',
      name: '清算所：凌晨五点的押金',
      segs: 4,
      filled: clamp(d, 0, 4),
      known: true,
      then: `28 日凌晨五点，清算所要求缴足风险押金。按现行公式约 ${fmtYi(req)}。`,
      now: req > cap ? `你账上 ${fmtYi(cap)}，还缺 ${fmtYi(req - cap)}。` : `你账上 ${fmtYi(cap)}：够了。`,
      counter: '提前融资、提高保证金、暂停期权开仓、半夜去谈豁免，都能让缺口变小。',
      tone: req > cap ? 'threat' : 'neutral',
      state: d >= BATTLE_2021 ? 'fired' : 'running',
    });
  }
  return out;
}

// ───────────── 每晚选卡 ─────────────

type Deal = CardDef & { ok(g: Game): boolean; pts: number };

function deck(g: Game): Deal[] {
  const f = g.factionId;
  const pre = (g: Game) => g.dayIndex < BATTLE_2021;
  const base = { group: '手牌', convert: '+1 点精力', pts: 1 } as const;
  const eyes: Deal = {
    ...base,
    id: 'x-eyes',
    name: f === 'broker' ? '盘后的成交明细' : '论坛的数据爬虫',
    color: 'white',
    does: '把这几天的成交明细和论坛帖子都过一遍：所有人的盘算，你都看得清。',
    cost: '无。',
    when: 'night',
    ok: (g) => pre(g) && !flag(g, 'know-all'),
  };
  if (f === 'broker')
    return [
      eyes,
      { ...base, id: 'x-bridge', name: '风投的过桥贷款', color: 'white', does: '老投资人连夜打来 5 亿美元：账上的钱立刻多一截。', cost: '条款很苛刻：声望 −3。', when: 'night', ok: pre },
      { ...base, id: 'x-nscc-friend', name: '清算所的老同事', color: 'grey', does: '前同事在清算所风险部：他提前告诉你公式里哪一项能谈。押金要求 −3 亿美元。', cost: '欠下一个人情。', when: 'night', ok: (g) => g.dayIndex >= 1 && pre(g) },
      { ...base, id: 'x-support', name: '客服连夜加班', color: 'white', does: '每一封愤怒的邮件都有人回：用户信任 +10。', cost: '无。', when: 'any', ok: () => true },
      {
        ...base,
        id: 'x-foe-forum',
        name: '论坛的悬赏帖',
        color: 'grey',
        does: '论坛上有人悬赏：谁能挖出你们和做市商的关系，给一千美元。',
        cost: '这是对手的牌。',
        when: 'any',
        foe: '换算：你拿这个帖子去董事会要人要钱，精力 +2。但帖子越传越广：用户信任 −10。',
        convert: '+2 点精力',
        pts: 2,
        ok: pre,
      },
    ];
  if (f === 'short')
    return [
      eyes,
      { ...base, id: 'x-borrow2', name: '另一家券商的券池', color: 'white', does: '一家欧洲券商愿意借出 200 万股：你能继续卖空。', cost: '3000 万美元。', when: 'any', ok: pre },
      { ...base, id: 'x-research', name: '卖方研究报告', color: 'grey', does: '相熟的分析师发一篇“目标价 20 美元”：明早散户情绪偏空。', cost: '声望 −2。', when: 'night', ok: pre },
      { ...base, id: 'x-fund', name: '另一家基金的注资意向', color: 'white', does: '一家家族办公室愿意拿出 10 亿美元，换你未来的一部分收益。', cost: '声望 −3：圈里都会知道你缺钱。', when: 'night', ok: (g) => g.dayIndex >= 1 && pre(g) },
      {
        ...base,
        id: 'x-foe-tweet',
        name: '富豪的推文草稿',
        color: 'grey',
        does: '有人把一条还没发出去的推文截图传给了你。',
        cost: '这是对手的牌。',
        when: 'any',
        foe: '换算：你提前知道了风向，连夜布置，精力 +2。但推文照样发了出去——明早散户情绪偏多。',
        convert: '+2 点精力',
        pts: 2,
        ok: pre,
      },
    ];
  return [
    eyes,
    { ...base, id: 'x-invite', name: '朋友的邀请码', color: 'white', does: '用朋友的邀请码在另一家券商开户：拿到 300 美元开户奖励。', cost: '无。', when: 'night', ok: pre },
    {
      ...base,
      id: 'x-target',
      name: '写下你的卖出价',
      color: 'white',
      does: '照比尔说的，在纸上写下一个价格：涨到现价的两倍，计划书自动卖掉一半。',
      cost: '论坛会叫你“纸手”——如果真卖了的话。',
      when: 'any',
      blocked: g.player.pos <= 0 ? '你手里没有股票' : undefined,
      ok: pre,
    },
    { ...base, id: 'x-meme', name: '一张好表情包', color: 'white', does: '你做的表情包被顶上首页：明早买盘更积极，声望 +2。', cost: '无。', when: 'night', ok: pre },
    {
      ...base,
      id: 'x-foe-short',
      name: '空头的研究报告',
      color: 'grey',
      does: '一份唱空的研究报告在群里传。',
      cost: '这是对手的牌。',
      when: 'any',
      foe: '换算：你逐条反驳，帖子被顶上首页，精力 +2。但报告也跟着传开了——明早散户情绪偏空。',
      convert: '+2 点精力',
      pts: 2,
      ok: pre,
    },
  ];
}

export const DRAFT_GME: DraftRules = {
  deck: (g) => deck(g),
  offerable: (g, c) => (c as Deal).ok(g),
  convert(g, id) {
    const c = deck(g).find((x) => x.id === id)!;
    g.energy += c.pts;
    const fx = [`精力 +${c.pts}`];
    const sent = (x: number) => (g.flags.sentNext = ((g.flags.sentNext as number) || 0) + x);
    if (id === 'x-foe-forum') {
      g.flags.trust = Math.max(0, ((g.flags.trust as number) || 0) - 10);
      fx.push('用户信任 −10');
    }
    if (id === 'x-foe-tweet') {
      sent(0.4);
      fx.push('明早散户情绪偏多');
    }
    if (id === 'x-foe-short') {
      sent(-0.3);
      fx.push('明早散户情绪偏空');
    }
    return R(true, `${c.name}：换算`, fx);
  },
};

export function gmeDraftPlay(g: Game, id: string): CardResult {
  const p = g.player;
  const sent = (x: number) => (g.flags.sentNext = ((g.flags.sentNext as number) || 0) + x);
  switch (id) {
    case 'x-eyes':
      g.flags['know-all'] = true;
      return R(true, '所有人的盘算都摊在了桌上', ['对手动向全部摸清']);
    case 'x-bridge':
      g.flags.capital = (g.flags.capital as number) + 500_000_000;
      g.reputation -= 3;
      return R(true, '过桥贷款 5 亿美元到账', [`账上 ${fmtYi(g.flags.capital as number)}`, '声望 −3']);
    case 'x-nscc-friend':
      g.flags.nsccFriend = true;
      return R(true, '知道了公式里能谈的那一项', ['押金要求 −3 亿美元'], { who: '清算所的老同事', text: '这话我没说过。波动率那一项，你们可以申请复核。' });
    case 'x-support':
      g.flags.trust = Math.min(100, ((g.flags.trust as number) || 0) + 10);
      return R(true, '客服连夜回了每一封邮件', ['用户信任 +10']);
    case 'x-borrow2':
      p.borrowLimit = (p.borrowLimit ?? 0) + 2_000_000;
      p.cash -= 30_000_000;
      return R(true, '又借到 200 万股券', ['付 3000 万美元']);
    case 'x-research':
      sent(-0.3);
      g.reputation -= 2;
      return R(true, '报告明早发布：目标价 20 美元', ['明早散户情绪偏空', '声望 −2']);
    case 'x-fund':
      p.cash += 1_000_000_000;
      g.reputation -= 3;
      return R(true, '10 亿美元到账', ['现金 +10 亿美元', '声望 −3']);
    case 'x-invite':
      p.cash += 300;
      return R(true, '开户奖励到账', ['现金 +300 美元']);
    case 'x-target': {
      const price = g.market.last * 2;
      g.addPlanFromScript({ label: '写下的卖出价：卖一半', cond: 'gte', price, side: 'sell', qty: Math.max(1, Math.floor(p.pos / 2)), spread: 1 });
      return R(true, `写下了：${(price / 100).toFixed(2)} 美元卖一半`, ['已加入计划书']);
    }
    case 'x-meme':
      sent(0.2);
      g.reputation += 2;
      return R(true, '表情包上了首页', ['明早买盘更积极', '声望 +2'], { who: '杰克', text: '哈哈哈哈，这张我收藏了。🚀' });
  }
  return R(false, '没有效果', []);
}
