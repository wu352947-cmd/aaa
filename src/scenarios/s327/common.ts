import type { Account } from '../../engine/exchange';
import type { Game, Intel } from '../../engine/game';
import { minuteIndex as mi } from '../../engine/market';
import type { Fen } from '../../engine/types';

// ───────────── 剧本私有状态（随 Game 实例存在，参与确定性） ─────────────

export interface Snap {
  accounts: Map<string, Account>;
  last: Fen;
}

export interface State {
  snaps: Map<number, Snap>;
  dayStartTick: number;
  dayStartPos: number;
  allianceStartPos: number;
  usedOffers: Set<string>;
  probeTruth: Map<string, boolean>;
  /** 政治资本（监管座位）：0–10 */
  cap: number;
  /** 市场秩序：0–100 */
  order: number;
  /** 对各会员的威慑：越高，越不敢违规 */
  deter: Record<string, number>;
  /** 已掌握的证据（split 分仓、wei 关联、gao 暗中平空） */
  evidence: Set<string>;
  /** 稽查中的会员，次晚出结果 */
  inspecting: string[];
  /** 一次性动作的记录 */
  used: Set<string>;
  /** 会员次日开盘须减仓的数量（口） */
  reduce: Map<string, number>;
  /** 交易所风险基金（元） */
  fund: number;
  /** 你留下的制度 */
  legacy: string[];
  /** 处置记录：会员 → 已处理方式 */
  resolved: Map<string, string>;
  /** 监控警报：今天已经报过的 */
  alerted: Set<string>;
}

export const STATE = new WeakMap<Game, State>();
export const st = (g: Game) => STATE.get(g)!;

export const SHORT = 'shenjiang';
export const SHORT_POS = 2_200_000;
export const SHORT_CASH = 2_200_000_000;
export const LONG = 'zhongcai';
export const ALLY = 'liaobei';
/** 申江借壳代持的小会员席位（只在申江由电脑扮演时存在） */
export const HIDE = 'pujiang';
export const HIDE_POS = 900_000;

export const MEMBER_NPC: Record<string, string> = { [SHORT]: 'shen', [LONG]: 'wei', [ALLY]: 'gao', [HIDE]: 'shen' };

export const p2 = (fen: number) => (fen / 100).toFixed(2);
export const wan = (q: number) => `${(q / 10000).toFixed(q % 10000 ? 1 : 0)} 万口`;
export const isPlayer = (g: Game, acct: string) => g.faction.accountId === acct;
export const flag = (g: Game, k: string) => g.flags[k];
export { mi };

export function members(g: Game): string[] {
  return [SHORT, LONG, ALLY, HIDE].filter((id) => g.market.ex.accounts.has(id) && !isPlayer(g, id));
}

export function memberName(g: Game, id: string): string {
  const a = g.market.ex.accounts.get(id);
  if (!a) return id;
  if (id === HIDE) return st(g).evidence.has('split') ? '浦江实业（305 · 申江代持）' : '浦江实业（305）';
  return a.name;
}

/** 保证金占用：所需保证金 ÷ 权益；穿仓记为 9 */
export function usage(g: Game, id: string): number {
  const ex = g.market.ex;
  const a = ex.acct(id);
  const eq = ex.equity(a);
  if (a.pos === 0) return 0;
  return eq > 0 ? ex.marginReq(a.pos) / eq : 9;
}

export function deter(g: Game, id: string): number {
  return st(g).deter[id] ?? 0;
}
export function addDeter(g: Game, id: string | 'all', n: number): void {
  const s = st(g);
  for (const m of id === 'all' ? [SHORT, LONG, ALLY, HIDE] : [id]) s.deter[m] = (s.deter[m] ?? 0) + n;
}

export function addOrder(g: Game, n: number): void {
  const s = st(g);
  s.order = Math.max(0, Math.min(100, s.order + n));
}

export function spendCap(g: Game, n: number): void {
  const s = st(g);
  s.cap = Math.max(0, s.cap - n);
}

// ───────────── 消息与导师 ─────────────

// 消息树：每条消息从源头到玩家经过的每一环，结局时揭晓
type Chain = NonNullable<Intel['chain']>;
export const CHAINS: Record<string, Chain> = {
  'tiexi-1': [
    { who: '财政部', said: '内部讨论是否对到期国债贴息' },
    { who: '魏国梁（中财信托）', said: '贴息基本定了', altered: true },
    { who: '钱有福', said: '327 要贴息，消息是从北京来的' },
  ],
  'mof-visit': [
    { who: '财政部', said: '正在研究到期国债的保值贴补与贴息方案' },
    { who: '中财信托的交易员', said: '上面在开会，327 的事快定了', altered: true },
    { who: '大户室', said: '财政部正在研究 327 的贴息方案' },
  ],
  'su-article': [
    { who: '苏晓的采访', said: '空方测算兑付价约 132 元，多方押注贴息' },
    { who: '《沪上财经报》', said: '327 多空分歧加大' },
  ],
  'zc-visit': [
    { who: '苏晓（记者）', said: '看见中财信托的人进出财政部门' },
    { who: '大户室', said: '某多方机构最近常去财政部门' },
  ],
  'wei-dinner': [{ who: '魏国梁', said: '锁仓的事，自己的账自己算' }],
  'mof-rumor': [
    { who: '财政部', said: '决定提高 327 国债的兑付价' },
    { who: '中财信托', said: '消息来了，赶紧吃货' },
    { who: '几个大户室', said: '327 要贴息，兑付价远高于 132 元' },
  ],
  'mof-public': [
    { who: '财政部', said: '公告：327 国债按 148.50 元兑付' },
    { who: '交易所', said: '开盘前转发公告' },
  ],
  'gao-bait': [
    { who: '高振宇', said: '放出风声：贴息方案被否了', altered: true },
    { who: '钱有福', said: '老板，贴息黄了' },
  ],
  'fake-veto': [
    { who: '你', said: '编造：贴息方案被财政部否了', altered: true },
    { who: '钱有福', said: '到处讲：贴息黄了' },
    { who: '大户室', said: '贴息黄了，327 要跌' },
  ],
};

export function news(g: Game, id: string, title: string, body: string, cred: number) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title, body, source: '《沪上财经报》', credibility: cred, kind: 'news', chain: CHAINS[id] });
}
export function rumor(g: Game, id: string, title: string, body: string, source: string, cred: number, chain?: Chain) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title: `听说${title.startsWith('听说') ? title.slice(2) : title}`, body, source, credibility: cred, kind: 'rumor', chain: chain ?? CHAINS[id] });
}
export function mentor(g: Game, text: string) {
  if (!g.npc('zhou')) return;
  g.addIntel({ id: `mentor-${g.dayIndex}-${g.intel.length}`, title: text.slice(0, 22) + (text.length > 22 ? '…' : ''), body: text, source: '老周', credibility: 0.75, kind: 'mentor' });
}
export function evidence(g: Game, id: string, title: string, body: string, source: string, against: string) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title, body, source, credibility: 1, kind: 'evidence', against });
}

export function dateTime(g: Game): string {
  return `${g.day.date} ${g.phase === 'night' ? '晚上' : g.time}`;
}

export function timeOf(t: number): string {
  const m = t < 120 ? 9 * 60 + 30 + t : 13 * 60 + (t - 120);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
