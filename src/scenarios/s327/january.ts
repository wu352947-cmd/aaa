import type { Game } from '../../engine/game';
import type { Actor, Market } from '../../engine/market';
import type { OrderReq } from '../../engine/types';
import { addCrowdFlow } from '../../engine/flows';
import { ALLY, flag, HIDE, isPlayer, LONG, mentor, mi, news, rumor, sd, SHORT, wan } from './common';

/**
 * 第一章：一月份的十个交易日（剧本日 −11 到 −2）和春节休市（−1）。
 *
 * 各家席位在一月里照着各自的打算进进出出：逐笔里能看到它们，夜里可以拿来推理。
 * 一月的净买卖已经从开局仓位里扣掉了（见 JAN_NET），所以到二月十六日，各家的仓位和原来的剧本一模一样。
 */

interface Flow {
  seat: string;
  side: 'buy' | 'sell';
  /** 每笔多少口 */
  qty: number;
  /** 几笔 */
  n: number;
  /** 第一笔在几点（之后每 15 分钟一笔） */
  at: string;
}

/** 剧本日 → 当天各家席位的动作 */
export const JAN_FLOWS: Record<number, Flow[]> = {
  [-11]: [
    { seat: SHORT, side: 'sell', qty: 40_000, n: 6, at: '9:45' },
    { seat: LONG, side: 'buy', qty: 30_000, n: 4, at: '13:15' },
  ],
  [-10]: [
    { seat: LONG, side: 'buy', qty: 50_000, n: 6, at: '10:00' },
    { seat: ALLY, side: 'sell', qty: 20_000, n: 3, at: '14:00' },
  ],
  [-9]: [{ seat: HIDE, side: 'sell', qty: 40_000, n: 5, at: '10:15' }],
  [-8]: [{ seat: ALLY, side: 'buy', qty: 20_000, n: 2, at: '13:30' }],
  [-7]: [{ seat: SHORT, side: 'sell', qty: 60_000, n: 5, at: '10:00' }],
  [-6]: [{ seat: LONG, side: 'buy', qty: 60_000, n: 4, at: '13:45' }],
  [-5]: [{ seat: HIDE, side: 'buy', qty: 30_000, n: 3, at: '9:35' }],
  [-4]: [
    { seat: ALLY, side: 'sell', qty: 30_000, n: 3, at: '10:30' },
    { seat: SHORT, side: 'sell', qty: 30_000, n: 3, at: '14:15' },
  ],
  [-3]: [{ seat: LONG, side: 'buy', qty: 40_000, n: 5, at: '10:00' }],
  [-2]: [
    { seat: SHORT, side: 'buy', qty: 30_000, n: 2, at: '14:30' },
    { seat: LONG, side: 'sell', qty: 20_000, n: 2, at: '15:00' },
  ],
};

/** 一月里各家的净买卖（口，买为正）：开局仓位要先扣掉它 */
export const JAN_NET: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const flows of Object.values(JAN_FLOWS)) for (const f of flows) out[f.seat] = (out[f.seat] ?? 0) + (f.side === 'buy' ? 1 : -1) * f.qty * f.n;
  return out;
})();

/** 一月里电脑扮演的席位按 JAN_FLOWS 下单；玩家自己的席位不动 */
export function januaryActor(g: Game): Actor {
  return {
    id: 'january',
    onTick(m: Market) {
      const flows = JAN_FLOWS[sd(g)];
      if (!flows || m.day.kind !== 'layout') return [];
      const out: OrderReq[] = [];
      for (const f of flows) {
        if (isPlayer(g, f.seat) || !m.ex.accounts.has(f.seat)) continue;
        const k = (m.t - mi(f.at)) / 15;
        if (k >= 0 && k < f.n && Number.isInteger(k)) out.push({ owner: f.seat, side: f.side, qty: f.qty, type: 'market' });
      }
      return out;
    },
  };
}

/** 一月份每天盘中的消息（t 是刚走完的那一分钟） */
export function januaryTick(g: Game, t: number): void {
  const d = sd(g);
  if (d === -11 && t === mi('10:00')) news(g, 'jan-subsidy', '财政部公布本月保值贴补率', '贴补率比上月又高了一点。到期国债的兑付价，眼下还是按票面本息加贴补算。', 1);
  if (d === -10 && t === mi('10:30')) rumor(g, 'jan-buyer', '有家北京来的机构在吃货', '大户室里的人说：有个席位这两天一直在买，量不小，口音是北京的。', '大户室传言', 0.9);
  if (d === -9 && t === mi('14:00')) news(g, 'jan-305', '一家小会员席位成交突然活跃', '席位 305 今天卖出不少。它平时没什么动静。', 0.95);
  if (d === -8 && t === mi('11:00')) {
    // 假消息：散户追进去，下午又吐回来
    rumor(g, 'jan-fake', '财政部下周公布 327 兑付办法', '有人信誓旦旦：财政部下周就公布，兑付价“只高不低”。', '营业部的朋友', 0.25);
    addCrowdFlow(g, 'buy', 300_000, 20);
  }
  if (d === -8 && t === mi('14:00')) addCrowdFlow(g, 'sell', 300_000, 25);
  if (d === -7 && t === mi('9:40')) {
    news(g, 'jan-limit', '交易所重申：单一会员持仓不得超过 300 万口', '交易所发出通知，要求各会员自查持仓，超限的限期压缩。', 1);
    g.push({ kind: 'rule', rule: 'position-limit', text: '交易所重申持仓限额' });
  }
  if (d === -6 && t === mi('13:30')) rumor(g, 'jan-102', '102 在加仓', '场内的红马甲说：102 下午又进了一批，单子一笔比一笔大。', '场内', 0.8);
  if (d === -4 && t === mi('10:00')) news(g, 'jan-editorial', '《沪上财经报》社论：国债期货是否过热？', '社论指出，327 合约持仓量远超可交割的现券，“投机气氛浓厚”，呼吁交易所加强风险管理。', 0.95);
  if (d === -2 && t === mi('13:45') && !g.faction.observer && g.player.pos !== 0 && !g.decision) {
    const pos = g.player.pos;
    g.decision = {
      id: 'jan-holiday',
      title: '节前最后一个下午',
      body: `明天起春节休市，要到二月中才开盘。你手里 ${pos > 0 ? '多' : '空'}单 ${wan(Math.abs(pos))}。长假里什么消息都可能出来，开盘时你来不及反应。`,
      choices: [
        { id: 'hold', label: '拿着过节', detail: '仓位不动。' },
        { id: 'trim', label: '减掉三成再过节', detail: '收盘前分批平掉 30%，少赚也少亏。' },
      ],
      countdown: 25,
    };
  }
}

export function januaryDecide(g: Game, id: string, choice: string): boolean {
  if (id !== 'jan-holiday') return false;
  if (choice === 'trim' && g.player.pos) {
    const q = Math.round(Math.abs(g.player.pos) * 0.3);
    g.addPlanFromScript({ label: '节前减仓', cond: 'now', price: 0, side: g.player.pos > 0 ? 'sell' : 'buy', qty: q, spread: 20, closeOnly: true });
    g.flags.holidayTrim = true;
  }
  return true;
}

/** 一月份的夜晚 */
export function januaryNight(g: Game): void {
  const d = sd(g);
  if (d === -11) rumor(g, 'jan-short', '申江在加空', '钱有福在电话里说：“老板，申江今天又卖了一大片，他们是铁了心看 132 元。”', '钱有福', 0.85);
  if (d === -10) mentor(g, '逐笔里那些大单都带着席位号。哪个席位在买、哪个在卖、买了多少——夜里对着成交单子慢慢看，看得出名堂。');
  if (d === -7) rumor(g, 'jan-shen-limit', '申江的空单离限额不远了', '结算部的朋友说：申江加上它借的几个壳，合起来可能已经过了 300 万口。', '结算部的朋友', 0.7);
  if (d === -5) news(g, 'jan-305-call', '浦江实业被追加保证金', '席位 305 今早被要求补足保证金，开盘后买入平掉了一部分空单。', 0.95);
  if (d === -4 && g.factionId === 'official' && !flag(g, 'jan-editorial-reply')) {
    g.flags['jan-editorial-reply'] = true;
    g.addIntel({ id: 'jan-ed-ask', title: '社论之后，证监会来电询问', body: '严正问：“报纸上说过热，你们怎么看？要不要采取措施？”你可以在手段里发风险提示、提保证金，也可以先按兵不动。', source: '严正', credibility: 1, kind: 'system' });
  }
  if (d === -3 && (g.factionId === 'short' || g.factionId === 'ally')) {
    g.addIntel({ id: 'jan-lock-terms', title: '锁仓同盟的条款', body: '申江和辽北的锁仓协议写的是：327 空单持有至交割，期间任何一方不得平仓。违约金一栏空着，“彼此信任”。', source: '你的保险柜', credibility: 1, kind: 'system' });
  }
}

/** 春节休市：一个很长的夜晚。精力多两点，饭桌上听到的话真假参半 */
export function holidayNight(g: Game): void {
  g.energy += 2;
  g.papers.push({ day: g.dayIndex, headline: '春节特刊：国债期货这一年', sub: '327 合约持仓创纪录，多空分歧集中在保值贴补率', facts: [] });
  mentor(g, '过年了。饭桌上的话，听听就好。开盘以后，价格说了算。');
  const f = g.factionId;
  if (f === 'long') rumor(g, 'cny-mof', '财政部的人在饭桌上没否认', '年夜饭上有人问起贴息，财政部那位只笑了笑：“过了年再说。”', '年夜饭', 0.85);
  else if (f === 'short') rumor(g, 'cny-132', '北京的老关系说兑付价就是 132', '拜年时一位老领导拍拍你的肩：“国家不会让你们这些做空的吃亏。”他没说是哪个国家部门的意思。', '拜年', 0.3);
  else if (f === 'ally') rumor(g, 'cny-wei', '魏国梁托人带来一盒茶叶', '盒子里压着一张名片，背面写着：“节后见面聊聊？”', '魏国梁', 0.9);
  else if (f === 'official') g.addIntel({ id: 'cny-yan', title: '团拜会上严正的一句话', body: '“节后这个品种要盯紧。出了事，你我都要写检查。”', source: '严正', credibility: 1, kind: 'system' });
  else rumor(g, 'cny-retail', '亲戚说 327 是“国家的东西，稳赚”', '饭桌上，表舅说他也开了户，买了 327，“国家的东西，稳赚”。', '年夜饭', 0.2);
  g.push({ kind: 'intel', text: '春节休市：今晚多两点精力，适合走动' });
}
