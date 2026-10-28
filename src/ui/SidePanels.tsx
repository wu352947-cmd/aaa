import { useState } from 'react';
import type { Game } from '../engine/game';
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
      {game.market.ex.open && Math.abs(game.market.lean) >= 0.15 && (
        <div className="faint" style={{ fontSize: 12, marginTop: 4 }} title="现价附近的大额挂单（不算做市商和散户）偏向一边时，做市商会把报价往那边挪，散户也更愿意跟着那一边。">
          盘口倾斜：{game.market.lean > 0 ? '买盘' : '卖盘'}明显更厚
        </div>
      )}
    </div>
  );
}

/** 我的挂单：限价单、冰山单、带时限的单子，都可以单独撤 */
function MyOrders({ game }: { game: Game }) {
  const ex = game.market.ex;
  const mine = ex.book.ordersOf(game.player.id);
  if (!mine.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="muted" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span>我的挂单</span>
        <button className="btn ghost small" onClick={() => game.act({ type: 'cancel-all' })}>
          全部撤单
        </button>
      </div>
      {mine.map((o) => (
        <div key={o.id} className="book-row" style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
          <span className={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? '买' : '卖'}</span>
          <span className="num">
            {price(o.price)} × {qty(o.qty)}
            {o.display != null && <span className="faint"> （露 {qty(Math.min(o.qty, o.display))}）</span>}
          </span>
          <span className="faint" style={{ fontSize: 11 }}>{o.expires != null ? `${Math.max(0, o.expires - ex.tick)} 分钟后撤` : ''}</span>
          <button className="btn ghost small" onClick={() => game.act({ type: 'cancel', id: o.id })}>
            撤
          </button>
        </div>
      ))}
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
        <dt title="（最新价 − 持仓均价）× 合约乘数 × 持仓数量。每天收盘后结转进现金（逐日盯市）">浮动盈亏</dt>
        <dd className={dir(upnl)}>{signed(upnl, money)}</dd>
        {open && (
          <>
            <dt title={game.market.ex.deck.markToMarket ? "逐日盯市后，均价重置为前一日结算价" : "买入或卖空的平均成本"}>持仓均价</dt>
            <dd>{p.pos ? price(p.avg) : '—'}</dd>
            <dt title="持仓数量 × 每单位价值 × 保证金比例">
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
      <MyOrders game={game} />
    </div>
  );
}

/** 交易所官员的监管台：看得到每家会员的持仓与保证金（这是交易者看不到的） */
export function MembersCard({ game }: { game: Game }) {
  const ex = game.market.ex;
  const members = (game.scenario.members ?? []).filter((id) => ex.accounts.has(id)).map((id) => ex.acct(id));
  return (
    <div className="card">
      <h4>
        <span>监管台 · 会员持仓</span>
        <span className="faint">保证金 {(ex.deck.marginRate * 100).toFixed(1)}%</span>
      </h4>
      {members.map((a) => {
        const eq = ex.equity(a);
        const use = eq > 0 ? ex.marginReq(a.pos) / eq : 9;
        return (
          <div key={a.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{game.scenario.groupName?.(game, a.id) ?? `${a.name}（${a.seat}）`}</span>
              <span className={a.pos > 0 ? 'up' : a.pos < 0 ? 'down' : ''}>{a.pos === 0 ? '空仓' : `${a.pos > 0 ? '多' : '空'} ${qty(Math.abs(a.pos))}`}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted">
              <span>权益 {money(eq)}</span>
              <span className={cls(use > 1 && 'up')}>{eq > 0 ? `占用 ${(use * 100).toFixed(0)}%` : '已穿仓'}</span>
            </div>
            <div className={cls('bar-track', use > 0.85 && 'danger')}>
              <div style={{ width: `${Math.min(100, use * 100)}%` }} />
            </div>
            {(a.violations > 0 || a.closeOnly) && (
              <div className="danger-box" style={{ marginTop: 4, padding: '2px 8px' }}>
                {a.closeOnly ? '只许平仓' : ''}
                {a.closeOnly && a.violations > 0 ? ' · ' : ''}
                {a.violations > 0 ? `违规委托 ${a.violations} 笔` : ''}
              </div>
            )}
          </div>
        );
      })}
      {game.market.t < game.market.haltUntil && <div className="warn-box">停市中，{game.market.haltUntil >= game.market.session.minutes ? '至收盘' : `剩 ${game.market.haltUntil - game.market.t} 分钟`}</div>}
    </div>
  );
}

export function TapeCard({ game }: { game: Game }) {
  const seats: Record<string, string> = {};
  for (const a of game.market.ex.accounts.values()) if (a.seat) seats[a.seat] = a.id;
  const name = (id: string) => game.scenario.groupName?.(game, id) ?? id;
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
            <span title="席位号：对应某家会员单位。问问场内的老人就知道是谁。">{mine ? '你' : seats[r.seat] ? name(seats[r.seat]) : `席位 ${r.seat}`}</span>
            <span className={r.side === 'buy' ? 'up' : 'down'}>{r.side === 'buy' ? '买' : '卖'}</span>
            <span className="num">{qty(r.qty)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 各方态度：监管座位要同时应付的人 */
export function StakeCard({ game }: { game: Game }) {
  const npcs = [...game.npcs.values()].filter((n) => n.style !== '经验' && n.style !== '消息贩子');
  return (
    <div className="card">
      <h4>
        <span>各方态度</span>
      </h4>
      {npcs.map((n) => (
        <div key={n.id} className="stake-row" title={`${n.org} · ${n.title}`}>
          <span>
            {n.name} <span className="faint">{n.org.replace('中国', '')}</span>
          </span>
          <div className="bar-track">
            <div style={{ width: `${(n.relation + 100) / 2}%`, background: n.relation >= 0 ? 'var(--gold)' : 'var(--up)' }} />
          </div>
          <span className="num rel">{n.relation > 0 ? '+' : ''}{n.relation}</span>
        </div>
      ))}
    </div>
  );
}
