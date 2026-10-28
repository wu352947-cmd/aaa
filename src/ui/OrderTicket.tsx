import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../engine/game';
import type { Side } from '../engine/types';
import { cls, money, price, qty as fq } from './format';
import { Term } from './Term';

/** 下单面板：在提交之前就把规则检查、保证金占用与预计冲击算给玩家看 */
export function OrderTicket({
  game,
  side: side0,
  limitPrice,
  onClose,
}: {
  game: Game;
  side: Side;
  limitPrice: number | null;
  onClose: () => void;
}) {
  const ex = game.market.ex;
  const p = game.player;
  const [side, setSide] = useState<Side>(side0);
  const [type, setType] = useState<'market' | 'limit'>(limitPrice != null ? 'limit' : 'market');
  const [px, setPx] = useState<string>(price(limitPrice ?? ex.last));
  const [q, setQ] = useState<number>(0);
  const [overdraw, setOverdraw] = useState(false);
  /** 普通 / 冰山（只露一小截）/ 对倒（自己跟自己成交） */
  const [mode, setMode] = useState<'normal' | 'iceberg' | 'wash'>('normal');
  const [show, setShow] = useState<number>(0);
  const [ttl, setTtl] = useState<number>(0);
  const [washAt, setWashAt] = useState<'ask' | 'bid'>('ask');

  useEffect(() => {
    if (limitPrice != null) {
      setType('limit');
      setPx(price(limitPrice));
    }
  }, [limitPrice]);

  const wash = mode === 'wash';
  const washPx = (washAt === 'ask' ? ex.book.best('sell') : ex.book.best('buy')) ?? ex.last;
  const ref = wash ? washPx : type === 'limit' ? Math.round(parseFloat(px) * 100) || ex.last : ex.last;
  const perLot = ex.contractValue(ref) * ex.deck.marginRate;
  const dirn = side === 'buy' ? 1 : -1;
  const closing = p.pos !== 0 && Math.sign(p.pos) !== dirn ? Math.abs(p.pos) : 0;
  const free = Math.max(0, ex.equity(p, ref) - ex.marginReq(p.pos, ref));
  const maxOpen = Math.floor(free / perLot);
  const newPos = p.pos + dirn * q;
  const needAfter = ex.marginReq(newPos, ref);
  const impact = q > 0 && game.market.day ? game.market.impactOf(q) : 0;
  const hits = useMemo(() => (q > 0 && !wash ? ex.check({ owner: p.id, side, qty: q, type, price: type === 'limit' ? ref : undefined, overdraw }, p) : []), [q, side, type, ref, overdraw, ex, p, wash]);
  const fee = 2 * ex.contractValue(ref) * q * (ex.deck.feeRate ?? 0.0003);
  const big = q >= ex.bigOrder;
  const blocked = hits.filter((h) => h.blocked);
  const flagged = hits.filter((h) => !h.blocked);
  const unit = Math.abs(p.pos) >= 10000 || game.factionId !== 'retail' ? 10000 : 1;

  const presets: [string, number][] = [];
  if (closing) presets.push(['平一半', Math.round(closing / 2)], ['全部平仓', closing]);
  if (maxOpen > 0) presets.push(['可开 25%', Math.floor(maxOpen * 0.25)], ['可开 50%', Math.floor(maxOpen * 0.5)], ['可开上限', closing + maxOpen]);
  if (game.factionId !== 'retail') for (const n of game.scenario.lotPresets ?? []) presets.push([fq(n), n]);

  const submit = () => {
    if (q <= 0) return;
    if (wash) game.act({ type: 'order', req: { side: washAt === 'ask' ? 'buy' : 'sell', qty: q, type: 'limit', price: ref, wash: true } });
    else {
      const limit = type === 'limit' || mode === 'iceberg';
      game.act({
        type: 'order',
        req: {
          side,
          qty: q,
          type: limit ? 'limit' : 'market',
          price: limit ? ref : undefined,
          overdraw: overdraw || undefined,
          display: mode === 'iceberg' && show > 0 ? show : undefined,
          ttl: limit && ttl ? ttl : undefined,
        },
      });
    }
    onClose();
  };

  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>{side === 'buy' ? '买入' : '卖出'} · {game.scenario.instrument ?? game.scenario.title}</h3>
        <button className="btn ghost small" onClick={onClose}>
          关闭 <span className="kbd">Esc</span>
        </button>
      </div>
      <div className="drawer-body">
        <div className="field">
          <div className="seg">
            <button className={cls(side === 'buy' && 'on buy')} onClick={() => setSide('buy')}>
              买入{p.pos < 0 ? '（回补）' : ''}
            </button>
            <button className={cls(side === 'sell' && 'on sell')} onClick={() => setSide('sell')}>
              卖出{p.pos > 0 ? '（平多）' : ''}
            </button>
          </div>
        </div>
        <div className="field">
          <label>委托方式</label>
          <div className="seg">
            <button className={cls(mode === 'normal' && type === 'market' && 'on')} onClick={() => (setMode('normal'), setType('market'))}>
              市价
            </button>
            <button className={cls(mode === 'normal' && type === 'limit' && 'on')} onClick={() => (setMode('normal'), setType('limit'))}>
              限价
            </button>
            <button className={cls(mode === 'iceberg' && 'on')} onClick={() => (setMode('iceberg'), setType('limit'))} title="限价挂单，盘口上只露出一小截：别人看不出你有多大的单子">
              冰山
            </button>
            <button className={cls(mode === 'wash' && 'on')} onClick={() => setMode('wash')} title="在自己的两个账户之间对敲：持仓不变，盘面上多出成交量和一个你定的成交价（黑色操作）">
              对倒
            </button>
          </div>
        </div>
        {wash && (
          <div className="field">
            <label>对敲的价位</label>
            <div className="seg">
              <button className={cls(washAt === 'ask' && 'on buy')} onClick={() => setWashAt('ask')}>
                按卖一价 {price((ex.book.best('sell') ?? ex.last))}（做出上涨的成交）
              </button>
              <button className={cls(washAt === 'bid' && 'on sell')} onClick={() => setWashAt('bid')}>
                按买一价 {price((ex.book.best('buy') ?? ex.last))}（做出下跌的成交）
              </button>
            </div>
          </div>
        )}
        {!wash && type === 'limit' && (
          <div className="field">
            <label>限价（元）· 也可以点击图表选价</label>
            <input className="num" value={px} onChange={(e) => setPx(e.target.value)} inputMode="decimal" />
          </div>
        )}
        {!wash && type === 'limit' && (
          <div className="field">
            <label>挂单时限（到时没成交的部分自动撤掉）</label>
            <div className="seg">
              {[0, 5, 15, 30].map((m) => (
                <button key={m} className={cls(ttl === m && 'on')} onClick={() => setTtl(m)}>
                  {m ? `${m} 分钟` : '一直挂着'}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === 'iceberg' && (
          <div className="field">
            <label>盘口上露出的量</label>
            <input className="num" type="number" min={0} step={unit} value={show || ''} onChange={(e) => setShow(Math.max(0, Math.round(+e.target.value)))} placeholder={String(Math.round(ex.bigOrder / 10))} />
          </div>
        )}
        <div className="field">
          <label>
            数量（<Term k="口" />）
          </label>
          <input className="num" type="number" min={0} step={unit} value={q || ''} onChange={(e) => setQ(Math.max(0, Math.round(+e.target.value)))} placeholder="0" autoFocus />
          <div className="quick">
            {presets.map(([l, v]) => (
              <button key={l} className="btn small" onClick={() => setQ(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {wash ? (
          <div className="preview">
            <dl className="kv" style={{ margin: 0 }}>
              <dt>持仓</dt>
              <dd>不变</dd>
              <dt>盘面上多出</dt>
              <dd>{q > 0 ? `${fq(q)} 的成交，价格 ${price(ref)}` : '—'}</dd>
              <dt>双边佣金</dt>
              <dd>{q > 0 ? money(fee) : '—'}</dd>
            </dl>
            <div className="danger-box" style={{ marginTop: 8 }}>
              黑色操作。跟风盘看到放量会追进来，但交易所收盘后比对成交双方，对倒一笔不落地记在案。
            </div>
          </div>
        ) : (
        <div className="preview">
          <dl className="kv" style={{ margin: 0 }}>
            <dt title="每口合约价值 × 保证金比例">每口保证金</dt>
            <dd>{money(perLot)}</dd>
            <dt>成交后持仓</dt>
            <dd>{newPos === 0 ? '空仓' : `${newPos > 0 ? '多' : '空'} ${fq(Math.abs(newPos))}`}</dd>
            <dt>成交后所需保证金</dt>
            <dd>{money(needAfter)}</dd>
            <dt title="平方根律：冲击 ≈ Y × 日波动 × 价格 × √(单量 / 日成交量)。这是本分钟内的临时冲击，其中一部分会留下来。">
              <Term k="冲击成本">预计冲击</Term>
            </dt>
            <dd className={side === 'buy' ? 'up' : 'down'}>
              {q > 0 ? `${side === 'buy' ? '+' : '−'}${(impact / 100).toFixed(2)} 元` : '—'}
            </dd>
          </dl>
          {type === 'limit' && big && mode === 'normal' && (
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              这是一张大单：挂在盘口上，做市商和散户都会看到，价格会往你挂的那一边挪。几乎没成交就撤掉，收盘后会被当成虚假申报。
            </div>
          )}
        </div>
        )}

        {blocked.map((h, i) => (
          <div key={i} className="warn-box">
            将被交易所挡下：{h.detail}
          </div>
        ))}
        {flagged.map((h, i) => (
          <div key={i} className="danger-box">
            违规下单：{h.detail}。这笔委托能成交，但会被记录在案。
          </div>
        ))}

        {ex.deck.overdraw && (
        <label className="check" style={{ color: overdraw ? '#ff9b95' : 'var(--muted)' }}>
          <input type="checkbox" checked={overdraw} onChange={(e) => setOverdraw(e.target.checked)} />
          <span>
            <Term k="超额透支">超额透支下单</Term>（绕过保证金与持仓限额。黑色操作：短期有效，必然留痕）
          </span>
        </label>
        )}

        <div className="actions" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className={cls('btn', wash ? 'danger' : 'primary')} style={{ flex: 1 }} disabled={q <= 0 || blocked.length > 0 || !game.market.ex.open} onClick={submit}>
            {game.market.ex.open ? (wash ? '对敲' : '提交委托') : '休市中'} {q > 0 ? `· ${wash ? '' : side === 'buy' ? '买 ' : '卖 '}${fq(q)}` : ''}
          </button>
        </div>
        {!game.market.ex.open && <p className="muted" style={{ fontSize: 12 }}>休市中，可以在计划书里写好明天开盘执行的条件单。</p>}
      </div>
    </div>
  );
}
