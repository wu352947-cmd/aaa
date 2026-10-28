// 价格一律用整数“分”（0.01 元）表示，避免浮点误差进入撮合层。
export type Side = 'buy' | 'sell';
export type Fen = number;

export interface OrderReq {
  owner: string;
  side: Side;
  qty: number;
  type: 'market' | 'limit';
  price?: Fen;
  /** 明知超出保证金或持仓限额仍然下单（违规，会被记录） */
  overdraw?: boolean;
  tag?: string;
  /** 冰山单：盘口上只露出这么多，其余藏着 */
  display?: number;
  /** 挂单时限（分钟）：到时没成交的部分自动撤掉 */
  ttl?: number;
  /** 对倒：自己的两个账户之间对敲，只留下成交量和成交价，不转移持仓 */
  wash?: boolean;
}

export interface RestingOrder {
  id: number;
  owner: string;
  side: Side;
  price: Fen;
  qty: number;
  tick: number;
  expires?: number;
  overdraw?: boolean;
  /** 冰山单露出的量 */
  display?: number;
  /** 挂单时的原始数量（用来判断撤单前成交了多少） */
  placed?: number;
}

export interface Trade {
  tick: number;
  price: Fen;
  qty: number;
  buyer: string;
  seller: string;
  aggressor: Side;
  /** 主动方的订单带违规标记 */
  overdrawn?: boolean;
  /** 对倒成交：买卖双方是同一个人 */
  wash?: boolean;
}

/** 一个账户当天的交易痕迹：监管从这里看出对倒、虚假申报、尾市拉抬 */
export interface DayStats {
  /** 对倒量 */
  wash: number;
  /** 挂过的大单（笔）与撤掉时几乎没成交的大单（笔、量） */
  bigPlaced: number;
  bigCancelled: number;
  bigCancelledQty: number;
  /** 主动成交量：按分钟记，收盘看最后一段的占比 */
  aggrByMin: Record<number, number>;
}

/** 订单被规则挡下或放行但违规时，引擎抛出的规则事件；界面据此弹出规则卡 */
export interface RuleHit {
  rule: string;
  owner: string;
  blocked: boolean;
  detail: string;
}

export interface SubmitResult {
  filled: number;
  avgPrice: Fen | null;
  rested: number;
  rejected: boolean;
  hits: RuleHit[];
  trades: Trade[];
}

export interface Bar {
  tick: number;
  o: Fen;
  h: Fen;
  l: Fen;
  c: Fen;
  v: number;
  /** 当分钟真实历史（重建）价格 */
  hist: Fen;
}
