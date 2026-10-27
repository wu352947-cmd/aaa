import { useState } from 'react';
import type { Game } from '../engine/game';
import { groupName } from '../scenarios/s327';
import { cls, dir, money, price, qty, signed } from './format';
import { Term } from './Term';

export function OrderBookCard({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const d = game.market.ex.book.depth(open ? 5 : 1);
  return (
    <div className="card">
      <h4>
        <span>
          盘口 <span className="faint">（谁在挂单、挂在哪）</span>
        </span>
        <button onClick={() => setOpen(!open)}>{open ? '收起' : '展开五档'}</button>
      </h4>
      {[...d.asks].reverse().map(([p, q], i) => (
        <div key={'a' + p} className="book-row">
          <span className="muted">卖{d.asks.length - i}</span>
          <span className="down">{price(p)}</span>
          <span className="num">{qty(q)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--line)', margin: '3px 0' }} />
      {d.bids.map(([p, q], i) => (
        <div key={'b' + p} className="book-row">
          <span className="muted">买{i + 1}</span>
          <span className="up">{price(p)}</span>
          <span className="num">{qty(q)}</span>
        </div>
      ))}
      {!game.market.ex.open && <div className="faint" style={{ fontSize: 12 }}>休市</div>}
    </div>
  );
}

export function PositionCard({ game }: { game: Game }) {
  const ex = game.market.ex;
  const p = game.player;
  const eq = ex.equity(p);
  const need = ex.marginReq(p.pos);
  const use = eq > 0 ? need / eq : need > 0 ? 9 : 0;
  const upnl = ex.unrealized(p);
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <h4>
        <span>我的账户 · {game.faction.role}</span>
        <button onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button>
      </h4>
      <dl className="kv" style={{ margin: 0 }}>
        <dt title="现金 + 浮动盈亏">
          <Term k="权益" />
        </dt>
        <dd>{money(eq)}</dd>
        <dt>持仓</dt>
        <dd>{p.pos === 0 ? '空仓' : <span className={p.pos > 0 ? 'up' : 'down'}>{p.pos > 0 ? '多' : '空'} {qty(Math.abs(p.pos))}</span>}</dd>
        <dt title="（最新价 − 持仓均价）× 每元 200 元 × 持仓口数。每天收盘后结转进现金（逐日盯市）">浮动盈亏</dt>
        <dd className={dir(upnl)}>{signed(upnl, money)}</dd>
        {open && (
          <>
            <dt title="逐日盯市后，均价重置为前一日结算价">持仓均价</dt>
            <dd>{p.pos ? price(p.avg) : '—'}</dd>
            <dt title="持仓口数 × 每口合约价值 × 2.5%">
              <Term k="保证金">所需保证金</Term>
            </dt>
            <dd>{money(need)}</dd>
            <dt>现金</dt>
            <dd>{money(p.cash)}</dd>
            <dt>违规次数</dt>
            <dd>{p.violations}</dd>
          </>
        )}
      </dl>
      <div style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }} title="所需保证金 ÷ 权益。超过 100% 时收盘会被追加保证金；权益跌穿零会被立即强平。">
        <span className="muted">保证金占用</span>
        <span className={cls('num', use > 1 && 'up')}>{(use * 100).toFixed(0)}%</span>
      </div>
      <div className={cls('bar-track', use > 0.85 && 'danger')}>
        <div style={{ width: `${Math.min(100, use * 100)}%` }} />
      </div>
      {game.marginCall && <div className="danger-box">追加保证金通知：明早开盘前补足，否则强制平仓。</div>}
    </div>
  );
}

export function TapeCard({ game }: { game: Game }) {
  const seats: Record<string, string> = { '011': 'shenjiang', '102': 'zhongcai', '217': 'liaobei' };
  const rows = game.tape.filter((r) => r.day === game.dayIndex).slice(0, 14);
  return (
    <div className="card" style={{ flex: 1 }}>
      <h4>
        <span>
          逐笔大单 <span className="faint">（≥ {qty(game.tapeThreshold())}）</span>
        </span>
      </h4>
      {rows.length === 0 && <div className="faint" style={{ fontSize: 12 }}>暂无大单</div>}
      {rows.map((r, i) => {
        const mine = game.player.seat && r.seat === game.player.seat;
        return (
          <div key={i} className="tape-row">
            <span className="muted num">{r.time}</span>
            <span title="席位号：对应某家会员单位。问问场内的老人就知道是谁。">{mine ? '你' : seats[r.seat] ? groupName(game, seats[r.seat]) : `席位 ${r.seat}`}</span>
            <span className={r.side === 'buy' ? 'up' : 'down'}>{r.side === 'buy' ? '买' : '卖'}</span>
            <span className="num">{qty(r.qty)}</span>
          </div>
        );
      })}
    </div>
  );
}
