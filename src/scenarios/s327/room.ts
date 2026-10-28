import { addCrowdFlow } from '../../engine/flows';
import type { Game } from '../../engine/game';
import { Rng } from '../../engine/rng';
import { flag, mi, p2, sd } from './common';
import { newsLine, verdict } from './world';
import { BATTLE } from './data';

/**
 * 大户室：散户座位的决策点。
 *
 * 布局期每天有人在大户室里递一句话：说某个方向要动。有的是真的，有的是错的，散户只能赌。
 * 说对了，跟风盘真的会朝那边涌；说错了，涌向另一边。决战日还有两个关口：消息传开的那一刻，
 * 和 16:15——有人说申江在调透支额度，要不要在砸盘前跑。
 *
 * 真假只取决于种子和局面，跟你选什么无关；结局页会揭晓每条消息的可信度。
 */

const isRetail = (g: Game) => g.factionId === 'retail';

/** 只取决于种子的硬币：不动剧本的随机流，其它座位的局面不变 */
export function coin(g: Game, key: string): number {
  return new Rng(`${g.seed}/room/${key}`).next();
}

/** 按全部权益算，还能新开多少口 */
export function roomLots(g: Game): number {
  const ex = g.market.ex;
  const per = ex.contractValue(ex.last) * ex.deck.marginRate;
  return Math.max(0, Math.floor(Math.max(0, g.equity()) / per) - Math.abs(g.player.pos));
}

interface Tip {
  at: string;
  who: string;
  up: string;
  down: string;
}

/** 布局期每天一句话（第 0 天是开局，不递） */
const TIPS: (Tip | null)[] = [
  null,
  { at: '10:50', who: '钱有福', up: '102 的人在营业部开了新户头，下午要拉！', down: '011 下午要压一压，阿拉先出来。' },
  { at: '9:50', who: '隔壁的股评家', up: '技术上看，147.70 是铁底，今天要往上走。', down: '头肩顶出来了，今天要跌破 148。' },
  { at: '13:10', who: '老周', up: '102 在悄悄收，侬看逐笔，下午还有一波。', down: '今朝有人在出货，下午要回落。' },
  { at: '10:10', who: '营业部经理', up: '几个大客户刚下了买单，量不小。', down: '几个大客户刚下了卖单，量不小。' },
];
/** 一月份（剧本日 −11 到 −2）每天的一句话 */
const JAN_TIPS: Tip[] = [
  { at: '10:20', who: '钱有福', up: '北京来的那家今天还要买，老板跟上！', down: '申江今天要砸，老板先出来。' },
  { at: '13:30', who: '隔壁的股评家', up: '均线拐头向上，下午有一波。', down: '量价背离，下午要回落。' },
  { at: '10:40', who: '营业部经理', up: '几个大户刚打电话来要加仓。', down: '几个大户刚打电话来要减仓。' },
  { at: '11:00', who: '老周', up: '侬看 102 的单子，一笔比一笔大，下午还要涨。', down: '305 在出货，下午压一压。' },
  { at: '9:50', who: '钱有福', up: '财政部的消息！今天要涨！', down: '财政部的消息！今天要跌！' },
  { at: '13:15', who: '隔壁的股评家', up: '147 是铁底，今天要往上走。', down: '头肩顶，今天破位。' },
  { at: '10:10', who: '营业部经理', up: '机构的买单排着队呢。', down: '机构的卖单排着队呢。' },
  { at: '14:00', who: '老周', up: '收盘前有人要拉一拉。', down: '收盘前有人要砸一砸。' },
  { at: '10:30', who: '钱有福', up: '节前红包行情，老板要不要搏一记？', down: '节前大家都要换钱过年，要跌。' },
  { at: '9:45', who: '隔壁的股评家', up: '节前最后一天，多头要封盘过节。', down: '节前最后一天，空头要砸盘过节。' },
];
const tipFor = (d: number): Tip | null | undefined => (d < 0 ? JAN_TIPS[d + 11] : TIPS[d]);
/** 这一天那句话是几点递过来的（没有就是 undefined） */
export const tipAt = (d: number): string | undefined => tipFor(d)?.at ?? undefined;

/** 跟风盘的规模：约等于布局日成交量的四分之一，二十五分钟里涌完 */
const TIP_FLOW = 500_000;
/** 消息兑现时，市场的共识价挪多少（分）：一口赚赔 70 元，百十口就是本金的一成 */
const TIP_SHIFT = 35;
const TIP_DELAY = 6;

/** 每分钟调用（onTick，t 是刚走完的那一分钟） */
export function roomTick(g: Game, t: number): void {
  if (!isRetail(g) || g.bankrupt) return;
  const d = sd(g);
  const tip = tipFor(d);
  if (d < BATTLE && tip) {
    if (t === mi(tip.at)) {
      const up = coin(g, `dir-${d}`) < 0.5;
      const truth = coin(g, `truth-${d}`) < 0.6;
      g.flags[`tip-${d}`] = `${up ? 'up' : 'down'}:${truth ? 1 : 0}`;
      const line = up ? tip.up : tip.down;
      g.addIntel({ id: `tip-${d}`, title: `“${line.slice(0, 18)}${line.length > 18 ? '…' : ''}”`, body: line, source: tip.who, credibility: truth ? 0.85 : 0.2, kind: 'rumor' });
      const n = Math.max(1, Math.floor(roomLots(g) / 2));
      g.decision = {
        id: 'room-tip',
        title: `${tip.who}凑过来`,
        body: `“${line}”\n\n他说得对不对，没人知道。现价 ${p2(g.market.last)} 元，你手里 ${g.player.pos ? `${g.player.pos > 0 ? '多' : '空'}单 ${Math.abs(g.player.pos)} 口` : '空仓'}。`,
        choices: [
          { id: 'pass', label: '听听就算了', detail: '不跟，也不反着做。' },
          { id: 'follow', label: `跟：${up ? '买入' : '卖出'} ${n} 口`, detail: '用一半保证金额度。说对了就赚，说错了就亏。' },
          { id: 'fade', label: `反着做：${up ? '卖出' : '买入'} ${n} 口`, detail: '赌他说错了。' },
        ],
        countdown: 20,
      };
    }
    // 消息几分钟后兑现（或落空）：跟风盘涌向真正的方向
    const f = flag(g, `tip-${d}`) as string | undefined;
    if (f && t === mi(tip.at) + TIP_DELAY) {
      const [dir, truth] = f.split(':');
      const up = (dir === 'up') === (truth === '1');
      addCrowdFlow(g, up ? 'buy' : 'sell', TIP_FLOW, 25);
      // 市场的共识也跟着挪：一刻钟里移过去，停一个钟头，再慢慢回到原来的路上
      const m = g.market;
      const base = m.day.base ?? m.day.hist;
      const t0 = t + 1;
      const shift = (i: number) => {
        const x = i - t0;
        if (x < 0) return 0;
        if (x < 15) return x / 15;
        if (x < 75) return 1;
        return Math.max(0, 1 - (x - 75) / 45);
      };
      m.day = { ...m.day, base: base.map((p, i) => Math.round(p + (up ? 1 : -1) * TIP_SHIFT * shift(i))) };
    }
    return;
  }
  if (!g.isBattleDay) return;
  // 消息传开的那一刻：信不信老周昨晚的话
  const n0 = flag(g, 'mofPublic') ? 0 : mi('9:58');
  if (t === n0 + 1 && !flag(g, 'mofPublic')) {
    const n = roomLots(g);
    const good = verdict(g) === 'full';
    g.decision = {
      id: 'room-news',
      title: '消息传开了',
      body: `大户室炸了锅：${newsLine(g)}。价格 ${p2(g.market.last)} 元。${flag(g, 'zhouCall') === 'flip' ? '老周昨晚讲，217 会翻多。' : flag(g, 'zhouCall') === 'hold' ? '老周昨晚讲，217 会守住锁仓。' : ''}消息是真是假、哪一方会认输，现在谁都说不准。`,
      choices: [
        { id: 'wait', label: '等等看', detail: '先看逐笔里大席位怎么动。' },
        { id: 'chase', label: good ? `追进：买入 ${n} 口` : `抄底：买入 ${n} 口`, detail: '用全部保证金额度。赌价格还要往上走。' },
        { id: 'short', label: good ? `不信：卖出 ${Math.max(1, Math.floor(n / 2))} 口` : `跟着跑：卖出 ${Math.max(1, Math.floor(n / 2))} 口`, detail: '赌价格要往下走。' },
      ],
      countdown: 20,
    };
  }
  // 16:16：有人说申江在调透支额度
  if (t === mi('16:16')) {
    const plan = flag(g, 'shenPlan') as string | undefined;
    const real = plan === 'dump' || plan === 'small';
    if (!real && coin(g, 'false-alarm') >= 0.5) return;
    g.addIntel({ id: 'eight-tip', title: '申江在调透支额度？', body: '结算部的朋友压低声音：“011 刚刚在打电话调额度，数目大得吓人。”', source: '结算部的朋友', credibility: real ? 0.85 : 0.2, kind: 'rumor' });
    const pos = g.player.pos;
    const n = Math.max(1, Math.floor(roomLots(g) / 2));
    g.decision = {
      id: 'room-eight',
      title: '还剩十四分钟',
      body: `结算部的朋友打来电话：“011 刚刚在调透支额度，数目大得吓人。”\n\n他也可能听岔了。价格 ${p2(g.market.last)} 元，你手里 ${pos ? `${pos > 0 ? '多' : '空'}单 ${Math.abs(pos)} 口` : '空仓'}。`,
      choices: [
        { id: 'hold', label: '不动', detail: '消息不一定准。' },
        ...(pos ? [{ id: 'exit', label: '全部平掉，离场', detail: '两分钟内平完。砸了你躲过，没砸你少赚。' }] : []),
        { id: 'short', label: `抢先做空 ${n} 口`, detail: '赌他真的会砸。可要是砸盘违规、交易被撤销，你的空单也拿不到那段跌幅。' },
      ],
      countdown: 20,
    };
  }
}

export function roomDecide(g: Game, id: string, choice: string): void {
  const p = g.player;
  const d = sd(g);
  const plan = (label: string, side: 'buy' | 'sell', qty: number, closeOnly = false) => {
    if (qty > 0) g.addPlanFromScript({ label, cond: 'now', price: 0, side, qty, spread: 2, closeOnly });
  };
  if (id === 'room-tip' && choice !== 'pass') {
    const up = (flag(g, `tip-${d}`) as string).startsWith('up');
    const buy = up === (choice === 'follow');
    plan(choice === 'follow' ? '跟着消息' : '反着消息', buy ? 'buy' : 'sell', Math.max(1, Math.floor(roomLots(g) / 2)));
    g.flags[`tipChoice-${d}`] = choice;
  }
  if (id === 'room-news') {
    if (choice === 'chase') plan('追进', 'buy', roomLots(g));
    if (choice === 'short') plan('不信消息', 'sell', Math.max(1, Math.floor(roomLots(g) / 2)));
  }
  if (id === 'room-eight') {
    if (choice === 'exit' && p.pos) plan('砸盘前离场', p.pos > 0 ? 'sell' : 'buy', Math.abs(p.pos), true);
    if (choice === 'short') plan('抢先做空', 'sell', Math.max(1, Math.floor(roomLots(g) / 2)));
    g.flags.eightChoice = choice;
  }
}

/** 收盘时揭晓：今天那句话兑现了没有 */
export function roomDayEnd(g: Game): void {
  const d = sd(g);
  const f = flag(g, `tip-${d}`) as string | undefined;
  if (!isRetail(g) || !f || !tipFor(d)) return;
  const truth = f.endsWith(':1');
  const choice = flag(g, `tipChoice-${d}`) as string | undefined;
  const right = choice ? (choice === 'follow') === truth : null;
  g.push({ kind: 'intel', text: `${tipFor(d)!.who}今天那句话${truth ? '兑现了' : '落空了'}${right == null ? '。' : right ? '——你押对了。' : '——你押错了。'}` });
}

/** 决战前夜：老周对 217 的判断。他也会看走眼 */
export function zhouCall(g: Game): string | null {
  if (!isRetail(g) || !g.npc('zhou')) return null;
  const flip = !!flag(g, 'gaoFlip');
  const say = coin(g, 'zhou-call') < (flip ? 0.65 : 0.5) ? 'flip' : 'hold';
  g.flags.zhouCall = say;
  const right = (say === 'flip') === flip;
  const text = say === 'flip' ? '217 这几天在逐笔里零零碎碎地买。阿拉看，明朝消息一出，它要翻多。' : '217 跟申江是一条船上的，锁仓签了字。明朝它不会动。';
  g.addIntel({ id: 'zhou-call', title: text.slice(0, 22) + '…', body: text, source: '老周', credibility: right ? 0.8 : 0.25, kind: 'mentor' });
  return say;
}
