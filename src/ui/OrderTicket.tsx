import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../engine/game';
import type { Side } from '../engine/types';
import { UNITS } from '../engine/exchange';
import { cls, money, price, qty as fq } from './format';
import { OptionsTicket } from './OptionsTicket';
import { basis, daysToDelivery, FLOAT, fundingRate, spot, spotPrice, theoreticalBasis } from '../scenarios/s327/delivery';
import { cal, calCards, price319, spread319 } from '../scenarios/s327/calendar';
import { Term } from './Term';

/** 下单面板：在提交之前就把规则检查、保证金占用与预计冲击算给玩家看 */
export function OrderTicket({
  game,
  side: side0,
  limitPrice,
  onClose,
  layer = 5,
}: {
  game: Game;
  /** 新手档解锁到第几层：第 3 层前只有市价单，第 5 层前没有期权与现券 */
  layer?: number;
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
  const hasOptions = layer >= 5 && !!game.scenario.options?.(game);
  const hasSpot = layer >= 5 && game.scenario.id === 's327' && !game.faction.observer;
  const hasCalendar = layer >= 5 && game.scenario.id === 's327' && !game.faction.observer;
  const [tab, setTab] = useState<'stock' | 'options' | 'spot' | 'calendar'>('stock');

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
  // 能新开多少：保证金够不够，卖空时还要看借到的券还剩多少
  const shortRoom = side === 'sell' && p.borrowLimit != null ? Math.max(0, p.borrowLimit - Math.max(0, -p.pos)) : Infinity;
  const maxOpen = Math.min(Math.floor(free / perLot), shortRoom);
  const u = UNITS.qty;
  const cur = UNITS.cur;
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
        {(hasOptions || hasSpot || hasCalendar) && (
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={cls(tab === 'stock' && 'on')} onClick={() => setTab('stock')}>
              {hasSpot ? '327 期货' : '股票'}
            </button>
            {hasOptions && (
              <button className={cls(tab === 'options' && 'on')} onClick={() => setTab('options')}>
                期权
              </button>
            )}
            {hasSpot && (
              <button className={cls(tab === 'spot' && 'on')} onClick={() => setTab('spot')}>
                92(3) 现券
              </button>
            )}
            {hasCalendar && (
              <button className={cls(tab === 'calendar' && 'on')} onClick={() => setTab('calendar')}>
                319 跨期
              </button>
            )}
          </div>
        )}
        {tab === 'options' ? (
          <OptionsTicket game={game} onDone={onClose} />
        ) : tab === 'spot' ? (
          <SpotTicket game={game} />
        ) : tab === 'calendar' ? (
          <CalendarTicket game={game} />
        ) : (
        <>
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
        {layer >= 3 && (
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
        )}
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
            <label>限价（{cur}）· 也可以点击图表选价</label>
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
            数量（{u === '口' ? <Term k="口" /> : u}）
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
            {p.borrowLimit != null && side === 'sell' && (
              <>
                <dt title="卖空要先借券。借到的券是卖空的上限，包括你已经卖空的部分">借到的券</dt>
                <dd>
                  {fq(p.borrowLimit)}，已卖空 {fq(Math.max(0, -p.pos))}，还能再卖空 {fq(shortRoom)}
                </dd>
              </>
            )}
            <dt title={`每${u}价值 × 保证金比例`}>每{u}保证金</dt>
            <dd>{money(perLot)}</dd>
            <dt>成交后持仓</dt>
            <dd>{newPos === 0 ? '空仓' : `${newPos > 0 ? '多' : '空'} ${fq(Math.abs(newPos))}`}</dd>
            <dt>成交后所需保证金</dt>
            <dd>{money(needAfter)}</dd>
            <dt title="平方根律：冲击 ≈ Y × 日波动 × 价格 × √(单量 / 日成交量)。这是本分钟内的临时冲击，其中一部分会留下来。">
              <Term k="冲击成本">预计冲击</Term>
            </dt>
            <dd className={side === 'buy' ? 'up' : 'down'}>
              {q > 0 ? `${side === 'buy' ? '+' : '−'}${(impact / 100).toFixed(2)} ${cur}` : '—'}
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
        </>
        )}
      </div>
    </div>
  );
}

/** 92(3) 现券：327 交割的就是它。全额付款，市面上流通的不多，囤得越多越缺 */
function SpotTicket({ game }: { game: Game }) {
  // 暂停时没有行情推进来刷新界面：自己动了手就自己重画
  const [, redraw] = useState(0);
  const act = (a: Parameters<Game['act']>[0]) => (game.act(a), redraw((n) => n + 1));
  const s = spot(game);
  const buy = game.cards().find((c) => c.id === 'dlv-buy');
  const sell = game.cards().find((c) => c.id === 'dlv-sell');
  const arb = game.cards().find((c) => c.id === 'dlv-arb');
  const unwind = game.cards().find((c) => c.id === 'dlv-unwind');
  const px = spotPrice(game);
  const b = basis(game);
  const theo = theoreticalBasis(game);
  const fund = fundingRate(game);
  const days = daysToDelivery(game);
  // 市场给的基差之外的，就是自己买出来的那部分
  const mine = b - theo;
  return (
    <div>
      <div className="preview">
        <dl className="kv" style={{ margin: 0 }}>
          <dt>期货 327</dt>
          <dd className="num">{price(game.market.last)} 元</dd>
          <dt>现券 92(3)</dt>
          <dd className="num">{price(px)} 元</dd>
          <dt title="现券价 − 期货价。每 1 分基差 = 每口 2 元">基差</dt>
          <dd className={cls('num', b >= 0 ? 'up' : 'down')}>
            {b >= 0 ? '+' : '−'}
            {(Math.abs(b) / 100).toFixed(2)} 元
            <span className="faint" style={{ fontSize: 11 }}>
              {' '}｜市场给的 {(theo / 100).toFixed(2)}
              {mine ? `，你推出来的 ${(mine / 100).toFixed(2)}` : ''}
            </span>
          </dd>
          <dt title="票息 + 保值贴补 减去 拆借资金成本，按剩余天数折算">持有成本</dt>
          <dd className="num">
            {price(theo)} 元
            <span className="faint" style={{ fontSize: 11 }}> ｜资金 {(fund * 100).toFixed(1)}%</span>
          </dd>
          <dt title="离交割还有几个交易日：交割日基差必须收敛到零">到交割</dt>
          <dd className="num">{days} 个交易日</dd>
          <dt title="每口对应面值 2 万元，全额付款">每口</dt>
          <dd>{money(px * 2)}</dd>
          <dt>市面上流通</dt>
          <dd>{fq(FLOAT)}</dd>
          <dt>你持有</dt>
          <dd>
            {fq(s.held)}（占流通 {Math.round((100 * s.held) / FLOAT)}%）
          </dd>
        </dl>
      </div>
      <p className="faint" style={{ fontSize: 12 }}>
        基差是负的（现券比期货便宜），买现券、卖期货，到交割日按结算价交券，就能锁住这 ${(Math.abs(b) / 100).toFixed(2)} 元的价差。
        资金一紧，carry 转负，基差就往负走。
      </p>
      {arb && (
        <div className="quick" style={{ marginTop: 6 }}>
          {arb.targets?.map((t) => (
            <button key={t.id} className="btn small" disabled={!!arb.blocked} onClick={() => act({ type: 'card', id: 'dlv-arb', target: t.id })}>
              套利 {t.label}
            </button>
          ))}
          {unwind && (
            <button className="btn small" disabled={!!unwind.blocked} onClick={() => act({ type: 'card', id: 'dlv-unwind' })}>
              平掉组合
            </button>
          )}
        </div>
      )}
      <div className="quick" style={{ marginTop: 6 }}>
        {buy?.targets?.map((t) => (
          <button key={t.id} className="btn small" disabled={!!buy.blocked} onClick={() => act({ type: 'card', id: 'dlv-buy', target: t.id })}>
            {t.label}
          </button>
        ))}
        {sell && (
          <button className="btn small" disabled={!!sell.blocked} onClick={() => act({ type: 'card', id: 'dlv-sell' })}>
            全部卖出
          </button>
        )}
      </div>
      {buy?.blocked && <p className="muted" style={{ fontSize: 12 }}>{buy.blocked}</p>}
      {arb?.blocked && <p className="muted" style={{ fontSize: 12 }}>{arb.blocked}</p>}
    </div>
  );
}

/** 319 跨期：远月合约与价差。做的是「两个月份之间的关系」，不是方向 */
function CalendarTicket({ game }: { game: Game }) {
  const [, redraw] = useState(0);
  const act = (a: Parameters<Game['act']>[0]) => (game.act(a), redraw((n) => n + 1));
  const cards = calCards(game);
  const c = cal(game);
  const px = price319(game);
  const sp = spread319(game);
  const buy = cards.find((x) => x.id === 'cal-buy');
  const sell = cards.find((x) => x.id === 'cal-sell');
  const long = cards.find((x) => x.id === 'cal-long-spread');
  const short = cards.find((x) => x.id === 'cal-short-spread');
  const flat = cards.find((x) => x.id === 'cal-flat');
  return (
    <div>
      <div className="preview">
        <dl className="kv" style={{ margin: 0 }}>
          <dt>327（近月）</dt>
          <dd className="num">{price(game.market.last)} 元</dd>
          <dt>319（远月）</dt>
          <dd className="num">{price(px)} 元</dd>
          <dt title="319 − 327。两个交割月之间的持有成本：资金越紧，远月贴水越深">价差</dt>
          <dd className={cls('num', sp >= 0 ? 'up' : 'down')}>
            {sp >= 0 ? '+' : '−'}
            {(Math.abs(sp) / 100).toFixed(2)} 元
          </dd>
          <dt>你持有 319</dt>
          <dd className="num">
            {c.qty === 0 ? '—' : `${fq(Math.abs(c.qty))} ${c.qty > 0 ? '多' : '空'}`}
            {c.qty !== 0 && <span className="faint" style={{ fontSize: 11 }}> ｜均价 {price(c.avg)}</span>}
          </dd>
        </dl>
      </div>
      <p className="faint" style={{ fontSize: 12 }}>
        做多价差是赌两个月份张开，做空价差是赌它收拢。跟 327 涨不涨没关系——只看资金松紧和贴息预期。
      </p>
      <div className="quick" style={{ marginTop: 6 }}>
        {long?.targets?.map((t) => (
          <button key={t.id} className="btn small" disabled={!!long.blocked} onClick={() => act({ type: 'card', id: 'cal-long-spread', target: t.id })}>
            做多价差 {t.label}
          </button>
        ))}
        {short?.targets?.map((t) => (
          <button key={t.id} className="btn small" disabled={!!short.blocked} onClick={() => act({ type: 'card', id: 'cal-short-spread', target: t.id })}>
            做空价差 {t.label}
          </button>
        ))}
      </div>
      <div className="quick" style={{ marginTop: 6 }}>
        {buy?.targets?.map((t) => (
          <button key={t.id} className="btn small" disabled={!!buy.blocked} onClick={() => act({ type: 'card', id: 'cal-buy', target: t.id })}>
            {t.label}
          </button>
        ))}
        {sell?.targets?.map((t) => (
          <button key={t.id} className="btn small" disabled={!!sell.blocked} onClick={() => act({ type: 'card', id: 'cal-sell', target: t.id })}>
            {t.label}
          </button>
        ))}
        {flat && (
          <button className="btn small" onClick={() => act({ type: 'card', id: 'cal-flat' })}>
            平掉 319
          </button>
        )}
      </div>
    </div>
  );
}
