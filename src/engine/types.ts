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
