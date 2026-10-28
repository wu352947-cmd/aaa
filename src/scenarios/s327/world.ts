import type { Game } from '../../engine/game';
import type { Actor, Market } from '../../engine/market';
import { Rng } from '../../engine/rng';
import type { OrderReq } from '../../engine/types';
import { ALLY, HIDE, HIDE_POS, isPlayer, LONG, mi, sd, SHORT, SHORT_POS, st } from './common';
import { BATTLE } from './data';
import { JAN_FLOWS, JAN_NET } from './january';

/**
 * 这一局的世界：不照搬历史。
 *
 * - 财政部按这一局的实际局面决定贴不贴息、贴多少（mofDecide）。历史上是足额贴息；
 *   游说、丑闻、市场过热、交易所的秩序都会改变它。
 * - 各家资本有自己的打算（一月、二月的建仓计划），但按行情和各自的判断随时增减：
 *   便宜了多方多买，贵了空方加空，价格涨得太猛辽北就想平空。
 * - 市场共识（Market.shift）随消息和政策风声偏离历史价格。
 *
 * 没有人搅局时，这一切大致还原历史；你一动，结果就会偏离。
 */

export type Verdict = 'full' | 'partial' | 'none';

/** 财政部的三种决定：兑付价，以及消息出来后市场共识移到哪里（分） */
export const VERDICTS: Record<Verdict, { pay: number; after: number; name: string; headline: string; body: string }> = {
  full: {
    pay: 14850,
    after: 15110,
    name: '足额贴息',
    headline: '财政部公告：327 国债按 148.50 元兑付',
    body: '对到期国债实行贴息，327 兑付价远高于 132 元。',
  },
  partial: {
    pay: 14100,
    after: 14360,
    name: '打折贴息',
    headline: '财政部公告：327 国债按 141.00 元兑付',
    body: '贴息照给，但比市场预期的少了一大截：327 兑付价 141.00 元。',
  },
  none: {
    pay: 13200,
    after: 13700,
    name: '不贴息',
    headline: '财政部表态：327 国债按原办法兑付',
    body: '财政部称，到期国债按票面本息加保值贴补兑付，不另行贴息。327 兑付价约 132 元。',
  },
};

export interface World {
  /** 市场共识偏离历史价格的部分（分）：消息与风声推出来的，隔夜消退一部分 */
  drift: number;
  /** 计划之外的仓位变化（协议平仓、被追保强平……）：各家不会再按原计划把它补回来 */
  adj: Record<string, number>;
  /** 上一个交易日收盘时各家的仓位：夜里的场外变化从这里算 */
  lastPos: Record<string, number>;
  /** 各方在财政部那里使的劲（贴息倾向的加减） */
  push: Record<string, number>;
  /** 2 月 22 日晚财政部定下的方案 */
  verdict?: Verdict;
  /** 定案时的打分与各因素（结局与复盘里展示） */
  score?: number;
  factors?: { label: string; value: number }[];
}

export const newWorld = (): World => ({ drift: 0, push: {}, adj: {}, lastPos: {} });

/** 财政部的打分：≥0.7 足额贴息，≥0.5 打折，否则不贴 */
export function mofFactors(g: Game): { label: string; value: number }[] {
  const s = st(g);
  const w = s.world;
  const ex = g.market.ex;
  const out: { label: string; value: number }[] = [];
  // 通胀还在高位：保值贴补率居高不下，财政部不贴息说不过去。每一局略有不同
  out.push({ label: '通胀与保值贴补率', value: 0.5 + (new Rng(`${g.seed}:cpi`).next() - 0.5) * 0.08 });
  out.push({ label: '今年的国债要发得出去', value: 0.25 });
  // 多方的人事关系：魏国梁一直在跑财政部
  out.push({ label: '中财在部里的关系', value: s.evidence.has('wei') ? -0.12 : 0.08 });
  if (s.evidence.has('wei')) out.push({ label: '中财与财政部的关联被查出来，部里要避嫌', value: -0.05 });
  for (const [k, v] of Object.entries(w.push)) if (v) out.push({ label: k, value: v });
  // 市场太热：价格被投机推得越高，财政部越不愿意替投机者兑现
  const close = ex.last;
  const ref = 14821;
  if (close > ref + 50) out.push({ label: `327 被炒到 ${(close / 100).toFixed(2)} 元，部里不愿被市场绑架`, value: -0.08 * ((close - ref - 50) / 100) });
  if (close < ref - 100) out.push({ label: `327 跌到 ${(close / 100).toFixed(2)} 元，新券怕发不出去`, value: 0.04 * ((ref - 100 - close) / 100) });
  // 交易所管不住市场：部里不想在乱局里表态
  if (s.order < 45) out.push({ label: '交易所的秩序一团糟', value: -((45 - s.order) / 100) });
  return out;
}

export const mofScore = (g: Game) => mofFactors(g).reduce((x, f) => x + f.value, 0);
export const verdictOf = (score: number): Verdict => (score >= 0.7 ? 'full' : score >= 0.5 ? 'partial' : 'none');

/** 2 月 22 日晚：财政部定案。之后的游说就来不及了 */
export function mofDecide(g: Game): void {
  const w = st(g).world;
  if (w.verdict) return;
  w.factors = mofFactors(g);
  w.score = w.factors.reduce((x, f) => x + f.value, 0);
  w.verdict = verdictOf(w.score);
}

/** 消息传开时，大户室里说的那一句 */
export const newsLine = (g: Game): string => ({ full: '327 要贴息', partial: '贴息打了折，327 只按 141 元兑付', none: '财政部不贴息了' })[verdict(g)];

export const verdict = (g: Game): Verdict => st(g).world.verdict ?? verdictOf(mofScore(g));

/** 往财政部使劲（正为推贴息，负为反对）：越往后越难再推动，同一方向叠加打折 */
export function lobbyMof(g: Game, key: string, v: number): number {
  const w = st(g).world;
  if (w.verdict) return 0;
  const before = w.push[key] ?? 0;
  // 同一路人反复去说，部里听得越来越少；一路人最多能挪动 0.2
  const eff = Math.sign(v) * Math.min(Math.abs(v) / (1 + Math.abs(before) * 8), Math.max(0, 0.2 - Math.abs(before)));
  w.push[key] = before + eff;
  return eff;
}

/** 消息与风声：推动市场共识（分） */
export function sway(g: Game, fen: number): void {
  st(g).world.drift += fen;
  if (g.phase === 'trading') g.market.shift = st(g).world.drift;
}

// ───────────── 各家资本 ─────────────

/** 二月十六日各家的仓位（史料）：一月是怎么一步步走到这里的，见 JAN_FLOWS */
const FEB16: Record<string, number> = { [SHORT]: -SHORT_POS, [LONG]: 1_500_000, [ALLY]: -800_000, [HIDE]: -HIDE_POS };

/** 二月布局期每天的打算：中财每天再吸 6 万口 */
const FEB_DAILY: Record<string, number> = { [LONG]: 60_000 };

/** 到剧本日 d 收盘为止，计划里的仓位 */
export function planned(id: string, d: number): number {
  let q = FEB16[id] - (JAN_NET[id] ?? 0);
  for (let k = -11; k <= Math.min(d, -1); k++) for (const f of JAN_FLOWS[k] ?? []) if (f.seat === id) q += (f.side === 'buy' ? 1 : -1) * f.qty * f.n;
  for (let k = 0; k <= Math.min(d, BATTLE - 1); k++) q += FEB_DAILY[id] ?? 0;
  return q;
}

/** 行情每偏离历史 1 元，各家的目标仓位改多少口；以及各自的判断（读报纸的看法）占多大分量 */
const REACT: Record<string, { perYuan: number; view: number; npc: string; mof: number }> = {
  // 中财按价值买：贵了少买，便宜了多买。它在部里有人，部里的倾向一变它最先知道
  [LONG]: { perYuan: -250_000, view: 200_000, npc: 'wei', mof: 1_500_000 },
  // 申江认定兑付价是 132 元：越贵越要空；听说部里不想贴，更要空
  [SHORT]: { perYuan: -200_000, view: 150_000, npc: 'shen', mof: 800_000 },
  [HIDE]: { perYuan: -60_000, view: 0, npc: 'shen', mof: 0 },
  // 辽北跟着风向走：涨得太猛就想平空
  [ALLY]: { perYuan: 150_000, view: 150_000, npc: 'gao', mof: 400_000 },
};

/** 这一刻某家想要的仓位：计划 + 行情偏离 + 自己的判断，受限额与保证金约束 */
export function wanted(g: Game, id: string): number {
  const m = g.market;
  const ex = m.ex;
  const a = ex.acct(id);
  const r = REACT[id];
  const dev = (ex.last - m.hist()) / 100;
  // 部里的倾向（0.83 左右是历史上的样子）：中财一直知道，别人要到二月底才听到风声
  const heard = id === LONG || sd(g) >= 2 ? 1 : 0.3;
  const lean = (mofScore(g) - 0.83) * r.mof * heard;
  let q = planned(id, sd(g)) + (st(g).world.adj[id] ?? 0) + r.perYuan * dev + r.view * (g.npc(r.npc)?.view ?? 0) + lean;
  const lim = ex.limitOf(a);
  q = Math.max(-lim, Math.min(lim, q));
  // 加仓要有保证金：权益撑不住的部分不加
  if (Math.abs(q) > Math.abs(a.pos) && Math.sign(q) === Math.sign(a.pos || q)) {
    const room = Math.floor((ex.equity(a) * 0.8) / (ex.contractValue(ex.last) * ex.deck.marginRate));
    if (Math.abs(q) > room) q = Math.sign(q) * Math.max(Math.abs(a.pos), room);
  }
  return Math.round(q / 1000) * 1000;
}

/** 某家今天在几点出手：一月照着各自的打算；没有计划的日子，上午、下午各看一次行情 */
function slots(id: string, d: number): number[] {
  const out: number[] = [];
  for (const f of JAN_FLOWS[d] ?? []) if (f.seat === id) for (let k = 0; k < f.n; k++) out.push(mi(f.at) + 15 * k);
  if (!out.length && id === LONG && d >= 0) out.push(mi('9:50'), mi('11:00'), mi('13:40'), mi('14:50'));
  if (!out.length) out.push(mi('10:40'), mi('14:10'));
  return out;
}

/** 布局期（一月、二月）：电脑扮演的各家按“想要的仓位”分批进出 */
export function capitalActor(g: Game): Actor {
  return {
    id: 'capital',
    onTick(m: Market) {
      if (m.day.kind !== 'layout') return [];
      const d = sd(g);
      const out: OrderReq[] = [];
      for (const id of [SHORT, LONG, ALLY, HIDE]) {
        if (isPlayer(g, id) || !m.ex.accounts.has(id)) continue;
        const a = m.ex.acct(id);
        if (a.closeOnly) continue;
        const ts = slots(id, d);
        const k = ts.indexOf(m.t);
        if (k < 0) continue;
        const gap = wanted(g, id) - a.pos;
        const planned_ = (JAN_FLOWS[d] ?? []).some((f) => f.seat === id);
        // 没有计划的日子，偏离不大就不动
        if (!planned_ && Math.abs(gap) < 40_000) continue;
        const q = Math.min(150_000, Math.round(Math.abs(gap) / (ts.length - k) / 1000) * 1000);
        if (q >= 10_000) out.push({ owner: id, side: gap > 0 ? 'buy' : 'sell', qty: q, type: 'market' });
      }
      return out;
    },
  };
}

/** 隔夜：风声消退一部分；财政部的倾向慢慢渗到市场里 */
export function worldNight(g: Game): void {
  const w = st(g).world;
  w.drift *= 0.6;
  // 你推动的价格，市场会记住一半：不再一夜之间被拉回历史
  const rc = g.recaps[g.recaps.length - 1];
  const mine = rc?.parts.find((p) => p.who === 'player');
  if (mine) w.drift += 0.5 * mine.move;
  const d = sd(g);
  // 越临近定案，部里的倾向越藏不住：大家心里的价位跟着挪
  if (d >= 2 && d < BATTLE && !w.verdict) w.drift += (mofScore(g) - 0.83) * 40;
}

/** 开盘：夜里发生的场外仓位变化（协议平仓、增资之类）记进计划外 */
export function worldOpen(g: Game): void {
  const w = st(g).world;
  for (const id of [SHORT, LONG, ALLY, HIDE]) {
    if (!g.market.ex.accounts.has(id)) continue;
    const pos = g.market.ex.acct(id).pos;
    if (w.lastPos[id] != null) w.adj[id] = (w.adj[id] ?? 0) + pos - w.lastPos[id];
  }
}

/** 收盘：记下各家的仓位 */
export function worldClose(g: Game): void {
  const w = st(g).world;
  for (const id of [SHORT, LONG, ALLY, HIDE]) if (g.market.ex.accounts.has(id)) w.lastPos[id] = g.market.ex.acct(id).pos;
}

/** 被强制减仓：这部分不再按计划补回 */
export function forced(g: Game, id: string, signedQty: number): void {
  const w = st(g).world;
  w.adj[id] = (w.adj[id] ?? 0) + signedQty;
}
