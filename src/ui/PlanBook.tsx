import { useState } from 'react';
import type { Game } from '../engine/game';
import type { Side } from '../engine/types';
import { cls, price, qty } from './format';

/** 计划书：把条件单排成序列，开盘后由引擎逐分钟执行（垂直切片只开放条件单这一类行动卡） */
export function PlanBook({ game, onClose }: { game: Game; onClose: () => void }) {
  const [cond, setCond] = useState<'gte' | 'lte'>('gte');
  const [px, setPx] = useState(price(game.market.last + 50));
  const [side, setSide] = useState<Side>('buy');
  const [q, setQ] = useState(0);
  const [spread, setSpread] = useState(3);
  const add = () => {
    if (q <= 0) return;
    const fen = Math.round(parseFloat(px) * 100);
    game.act({
      type: 'plan-add',
      plan: { label: `价格${cond === 'gte' ? '≥' : '≤'} ${price(fen)} 时${side === 'buy' ? '买入' : '卖出'} ${qty(q)}`, cond, price: fen, side, qty: q, spread },
    });
    setQ(0);
  };
  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>计划书</h3>
        <button className="btn ghost small" onClick={onClose}>
          关闭 <span className="kbd">Esc</span>
        </button>
      </div>
      <div className="drawer-body">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          复杂操作不是一个按钮。写好条件，计划会在条件满足时分几分钟执行完——大单拆开执行能看清市场的反应，但拆单不会让冲击变小。
        </p>
        <div className="field">
          <label>当价格</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="seg">
              <button className={cls(cond === 'gte' && 'on')} onClick={() => setCond('gte')}>
                涨到 ≥
              </button>
              <button className={cls(cond === 'lte' && 'on')} onClick={() => setCond('lte')}>
                跌到 ≤
              </button>
            </div>
            <input className="num" value={px} onChange={(e) => setPx(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>就</label>
          <div className="seg">
            <button className={cls(side === 'buy' && 'on buy')} onClick={() => setSide('buy')}>
              买入
            </button>
            <button className={cls(side === 'sell' && 'on sell')} onClick={() => setSide('sell')}>
              卖出
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
          <div className="field">
            <label>数量（口）</label>
            <input className="num" type="number" value={q || ''} onChange={(e) => setQ(Math.max(0, Math.round(+e.target.value)))} />
          </div>
          <div className="field">
            <label>分几分钟执行</label>
            <input className="num" type="number" min={1} max={30} value={spread} onChange={(e) => setSpread(Math.max(1, Math.min(30, +e.target.value)))} />
          </div>
        </div>
        <button className="btn primary" disabled={q <= 0} onClick={add}>
          写入计划书
        </button>

        <div className="section-label" style={{ color: 'var(--text)', fontSize: 14 }}>
          当前计划
        </div>
        {game.plans.length === 0 && <p className="faint">还没有计划。</p>}
        {game.plans.map((p) => (
          <div key={p.id} className="alliance" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>
              {p.label}
              {p.overdraw && <span className="tag evidence" style={{ marginLeft: 6 }}>违规</span>}
              <br />
              <span className="faint">
                {p.done ? '已执行完' : p.remaining != null ? `执行中，剩 ${qty(p.remaining)}` : `等待触发 · 分 ${p.spread} 分钟执行`}
              </span>
            </span>
            {!p.done && p.remaining == null && (
              <button className="btn small" onClick={() => game.act({ type: 'plan-remove', id: p.id })}>
                撤销
              </button>
            )}
          </div>
        ))}
        <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>
          举牌、要约收购、做空报告等资本运作卡将在后续剧本开放。
        </p>
      </div>
    </div>
  );
}
