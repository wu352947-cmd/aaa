import type { Fen } from './types';

/**
 * 场内期权：标准合约每张 100 股，Black-Scholes 定价，做市商按 delta 对冲。
 * 剧本只提供到期日、行权价网格和每天的隐含波动率；持仓、计价和对冲反馈都在这里与 Game 里完成。
 */

export type OptKind = 'call' | 'put';

export interface Expiry {
  id: string;
  label: string;
  /** 到期日是第几个交易日（从剧本第一天算，0 起；可以超出剧本的天数），当天收盘到期 */
  day: number;
}

export interface OptionSpec {
  expiries: Expiry[];
  /** 交易所挂牌的行权价（分） */
  strikes: Fen[];
  /** 当天的隐含波动率（年化） */
  iv(dayIndex: number): number;
  /** 每张合约多少股 */
  size: number;
  /** 买卖价差占中间价的比例 */
  spread: number;
  /** 做市商对冲时，一次最多吃掉每分钟正常成交量的多少 */
  hedgeCap: number;
}

export interface OptPosition {
  kind: OptKind;
  strike: Fen;
  expiry: string;
  /** 张数（正 = 买方） */
  qty: number;
  /** 买入花的钱（美元） */
  cost: number;
}

function ncdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** 每股的期权价值（美元）与 delta；T 为年 */
export function price(kind: OptKind, s: Fen, k: Fen, T: number, iv: number): { value: number; delta: number } {
  const S = s / 100;
  const K = k / 100;
  if (T <= 0) {
    const intr = kind === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { value: intr, delta: kind === 'call' ? (S > K ? 1 : 0) : S < K ? -1 : 0 };
  }
  const v = iv * Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * v * v) / v;
  const d2 = d1 - v;
  if (kind === 'call') return { value: S * ncdf(d1) - K * ncdf(d2), delta: ncdf(d1) };
  return { value: K * ncdf(-d2) - S * ncdf(-d1), delta: ncdf(d1) - 1 };
}

/** 一张合约的买价与卖价（美元 / 股），最少一美分 */
export function quote(mid: number, spread: number): { bid: number; ask: number } {
  const half = Math.max(0.01, mid * spread * 0.5);
  return { bid: Math.max(0, Math.round((mid - half) * 100) / 100), ask: Math.round((mid + half) * 100) / 100 };
}

export const optKey = (p: Pick<OptPosition, 'kind' | 'strike' | 'expiry'>) => `${p.expiry}:${p.kind}:${p.strike}`;
