import { useState } from 'react';
import type { Game } from '../engine/game';
import { optKey, type OptKind } from '../engine/options';
import { cls, money } from './format';

const d2 = (x: number) => x.toFixed(2);

/** 期权链：选到期日 → 在链上点一个价 → 填张数 → 买入；下面是持有的期权，可以卖出平仓 */
export function OptionsTicket({ game, onDone }: { game: Game; onDone: () => void }) {
  const spec = game.scenario.options?.(game);
  const [expiry, setExpiry] = useState(spec?.expiries[0].id ?? '');
  const [pick, setPick] = useState<{ kind: OptKind; strike: number } | null>(null);
  const [n, setN] = useState(1);
  if (!spec) return null;
  const S = game.market.last;
  const strikes = spec.strikes.filter((k) => k >= S * 0.4 && k <= S * 2.5);
  const q = pick ? game.optQuote(pick.kind, pick.strike, expiry) : null;
  const cost = q ? q.ask * spec.size * n : 0;
  const hedge = q ? Math.round(q.delta * spec.size * n) : 0;
  const open = game.market.ex.open;
  return (
    <div className="opt-ticket">
      <div className="field">
        <label>到期日 · 隐含波动率 {Math.round(spec.iv(game.dayIndex) * 100)}%</label>
        <div className="seg">
          {spec.expiries.map((e) => (
            <button key={e.id} className={cls(expiry === e.id && 'on')} onClick={() => setExpiry(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <div className="opt-chain-wrap">
        <table className="opt-chain">
          <thead>
            <tr>
              <th colSpan={2}>看涨（买价 / 卖价）</th>
              <th>行权价</th>
              <th colSpan={2}>看跌（买价 / 卖价）</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((k) => {
              const c = game.optQuote('call', k, expiry);
              const p = game.optQuote('put', k, expiry);
              const atm = Math.abs(k - S) === Math.min(...strikes.map((x) => Math.abs(x - S)));
              const sel = (kind: OptKind) => pick?.kind === kind && pick.strike === k;
              return (
                <tr key={k} className={cls(atm && 'atm', k < S ? 'itm-call' : 'itm-put')}>
                  <td className={cls('num', sel('call') && 'sel')} onClick={() => setPick({ kind: 'call', strike: k })}>
                    {d2(c.bid)}
                  </td>
                  <td className={cls('num', sel('call') && 'sel')} onClick={() => setPick({ kind: 'call', strike: k })}>
                    {d2(c.ask)}
                  </td>
                  <td className="strike num">{(k / 100).toFixed(0)}</td>
                  <td className={cls('num', sel('put') && 'sel')} onClick={() => setPick({ kind: 'put', strike: k })}>
                    {d2(p.bid)}
                  </td>
                  <td className={cls('num', sel('put') && 'sel')} onClick={() => setPick({ kind: 'put', strike: k })}>
                    {d2(p.ask)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pick && q && (
        <div className="preview">
          <div style={{ marginBottom: 6 }}>
            <b>
              {pick.kind === 'call' ? '看涨' : '看跌'} · 行权价 {(pick.strike / 100).toFixed(0)} · {spec.expiries.find((e) => e.id === expiry)!.label}
            </b>
          </div>
          <div className="field">
            <label>张数（每张 {spec.size} 股）</label>
            <input className="num" type="number" min={1} value={n || ''} onChange={(e) => setN(Math.max(0, Math.round(+e.target.value)))} />
          </div>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>要付的权利金</dt>
            <dd>{money(cost)}</dd>
            <dt title="到期时股价要过这个价，这笔才不亏">到期不亏的股价</dt>
            <dd>{d2(pick.kind === 'call' ? pick.strike / 100 + q.ask : pick.strike / 100 - q.ask)} 美元</dd>
            <dt title="卖给你期权的做市商，要按 delta 买（或卖）这么多股票来对冲：你买得越多，它推的价格越多">做市商要对冲</dt>
            <dd className={hedge > 0 ? 'up' : 'down'}>
              {hedge > 0 ? '买入' : '卖出'} {Math.abs(hedge).toLocaleString()} 股
            </dd>
          </dl>
          <button className="btn primary" style={{ width: '100%', marginTop: 10 }} disabled={!open || n <= 0 || cost > game.player.cash} onClick={() => (game.act({ type: 'option', side: 'buy', kind: pick.kind, strike: pick.strike, expiry, qty: n }), onDone())}>
            {!open ? '休市中' : cost > game.player.cash ? '现金不够' : `买入 ${n} 张`}
          </button>
        </div>
      )}
      {game.opts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12 }}>持有的期权</div>
          {game.opts.map((o) => {
            const v = game.optQuote(o.kind, o.strike, o.expiry);
            const val = v.mid * spec.size * o.qty;
            return (
              <div key={optKey(o)} className="opt-pos">
                <span>
                  {o.kind === 'call' ? '看涨' : '看跌'} {(o.strike / 100).toFixed(0)} · {spec.expiries.find((e) => e.id === o.expiry)?.label.slice(0, 6)} × {o.qty}
                </span>
                <span className={cls('num', val >= o.cost ? 'up' : 'down')}>
                  {money(val)}（{val >= o.cost ? '+' : '−'}
                  {money(Math.abs(val - o.cost))}）
                </span>
                <button className="btn small" disabled={!open} onClick={() => game.act({ type: 'option', side: 'sell', kind: o.kind, strike: o.strike, expiry: o.expiry, qty: o.qty })}>
                  按买价 {d2(v.bid)} 卖出
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
