import { useState } from 'react';
import type { CardDef, Clock, Directive, DocSheet } from '../engine/game';
import type { Era } from '../pixel/palettes';
import { cls } from './format';
import { PixelPortrait } from './Pixel';

/** 进度钟：一圈分成几格，填满时计划落地 */
export function ClockDial({ c, size = 34 }: { c: Clock; size?: number }) {
  const r = size / 2 - 2;
  const cx = size / 2;
  const seg = (i: number) => {
    const a0 = (i / c.segs) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / c.segs) * Math.PI * 2 - Math.PI / 2;
    const p = (a: number) => `${cx + r * Math.cos(a)} ${cx + r * Math.sin(a)}`;
    return `M ${cx} ${cx} L ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)} Z`;
  };
  return (
    <svg className={cls('clock-dial', c.tone, c.state)} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${c.filled} / ${c.segs}`}>
      {Array.from({ length: c.segs }, (_, i) => (
        <path key={i} d={seg(i)} className={cls('seg', i < c.filled && 'on')} />
      ))}
      <circle cx={cx} cy={cx} r={r} className="rim" />
    </svg>
  );
}

const STATE: Record<NonNullable<Clock['state']>, string> = { running: '', fired: '已经发生', defused: '没有发生' };

export function ClockRow({ c, era }: { c: Clock; era: Era }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cls('clock-row', !c.known && 'unknown', c.state && c.state !== 'running' && 'settled')}>
      <button className="clock-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <PixelPortrait id={c.who} era={era} size={28} mood={c.tone === 'threat' ? 'frown' : c.tone === 'friend' ? 'smile' : 'neutral'} />
        <span className="clock-name">
          {c.name}
          {c.state && c.state !== 'running' && <span className="clock-state">{STATE[c.state]}</span>}
        </span>
        <ClockDial c={c} />
      </button>
      {open && (
        <div className="clock-body">
          {c.known ? (
            <>
              <div>
                <b>满格时：</b>
                {c.then}
              </div>
              {c.now && (
                <div>
                  <b>眼下：</b>
                  {c.now}
                </div>
              )}
              {c.counter && (
                <div className="clock-counter">
                  <b>怎么应对：</b>
                  {c.counter}
                </div>
              )}
            </>
          ) : (
            <div className="faint">你只看得出他在准备什么，看不清是什么。当面聊一聊、派人去查，或者找个眼线，才摸得清。</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ClocksList({ clocks, era }: { clocks: Clock[]; era: Era }) {
  if (!clocks.length) return <p className="faint">眼下看不出谁在准备什么。</p>;
  return (
    <div className="clocks">
      {clocks.map((c) => (
        <ClockRow key={c.id} c={c} era={era} />
      ))}
    </div>
  );
}

/** 侧栏里的“对手动向” */
export function ClocksCard({ clocks, era }: { clocks: Clock[]; era: Era }) {
  if (!clocks.length) return null;
  return (
    <div className="card">
      <h4>
        <span>对手动向</span>
        <span className="faint" style={{ fontSize: 11 }}>
          点开看详情
        </span>
      </h4>
      <ClocksList clocks={clocks} era={era} />
    </div>
  );
}

const DIR_STATUS: Record<Directive['status'], string> = { open: '待办', met: '办到了', failed: '没办到' };

export function DirectivesList({ dirs, era, names }: { dirs: Directive[]; era: Era; names: (id: string) => string }) {
  if (!dirs.length) return null;
  return (
    <div className="directives">
      {dirs.map((d) => (
        <div key={d.id} className={cls('directive', d.status)}>
          <PixelPortrait id={d.from} era={era} size={28} mood={d.status === 'failed' ? 'frown' : d.status === 'met' ? 'smile' : 'neutral'} />
          <div>
            <div className="dir-from">
              {names(d.from)} <span className={cls('dir-status', d.status)}>{DIR_STATUS[d.status]}</span>
            </div>
            <div className="dir-text">“{d.text}”</div>
            <div className="dir-stakes">{d.verdict ?? d.stakes}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DirectivesCard({ dirs, era, names }: { dirs: Directive[]; era: Era; names: (id: string) => string }) {
  if (!dirs.length) return null;
  return (
    <div className="card">
      <h4>
        <span>上级指示</span>
      </h4>
      <DirectivesList dirs={dirs} era={era} names={names} />
    </div>
  );
}

/** 案头文书：逐行下结论，最后签字 */
export function DocSheetView({ doc, onFile }: { doc: DocSheet; onFile: (marks: Record<string, string>) => void }) {
  const [marks, setMarks] = useState<Record<string, string>>(doc.filed?.marks ?? {});
  const filed = !!doc.filed;
  const def = doc.marks[0].id;
  return (
    <div className="docsheet">
      <div className="doc-head">
        <b>{doc.title}</b>
        <span className="faint"> · {doc.from}</span>
      </div>
      <p className="doc-note">{doc.note}</p>
      <div className="doc-scroll">
        <table className="doc-table">
          <thead>
            <tr>
              {doc.cols.map((c, i) => (
                <th key={c} className={cls(doc.colSource?.[i])} title={doc.colSource?.[i] === 'cleared' ? '结算部逐笔汇总：可信' : doc.colSource?.[i] === 'reported' ? '会员自己申报' : undefined}>
                  {c}
                </th>
              ))}
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {doc.rows.map((r) => {
              const m = marks[r.id] ?? def;
              return (
                <tr key={r.id} className={cls(m !== def && 'flagged')}>
                  {r.cells.map((cell, i) => (
                    <td key={i} className={cls(doc.colSource?.[i], /^[+−\d]/.test(cell) && 'num')}>
                      {cell}
                    </td>
                  ))}
                  <td>
                    <select className={cls('doc-mark', m !== def && 'flag')} disabled={filed} value={m} onChange={(e) => setMarks({ ...marks, [r.id]: e.target.value })} aria-label={`${r.cells[0]} 的结论`}>
                      {doc.marks.map((mk) => (
                        <option key={mk.id} value={mk.id}>
                          {mk.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filed ? (
        <div className={cls('card-result latest', !doc.filed!.result.ok && 'fail')}>
          <b>{doc.filed!.result.title}</b>
          <div className="fx">{doc.filed!.result.effects.join(' · ')}</div>
        </div>
      ) : (
        <div className="doc-foot">
          <span className="faint">冤枉了人要付代价；签字放过的问题，没有人会告诉你。</span>
          <button className="btn primary small" onClick={() => onFile(marks)}>
            签字归档
          </button>
        </div>
      )}
    </div>
  );
}

const COLOR: Record<CardDef['color'], string> = { white: '白', grey: '灰', black: '黑' };

/** 今晚发到面前的三张牌：收下一张，或者都不要 */
export function DraftOffer({ cards, handFull, onTake, onSkip, tone }: { cards: CardDef[]; handFull: boolean; onTake: (id: string) => void; onSkip: () => void; tone?: 'paper' }) {
  if (!cards.length) return null;
  return (
    <div className={cls('draft', tone)}>
      <div className="draft-head">
        <b>今晚的机会</b>
        <span className="faint">三选一，收进手牌。每张牌都能打出，也能不打、换算成本钱。</span>
      </div>
      <div className="draft-row">
        {cards.map((c) => (
          <div key={c.id} className={cls('draft-card', c.color, c.foe && 'foe')}>
            <div className="ac-head">
              <span className={cls('ac-color', c.color)}>{COLOR[c.color]}</span>
              <b>{c.name}</b>
            </div>
            <div className="ac-does">{c.does}</div>
            {c.foe ? <div className="ac-foe">{c.foe}</div> : <div className="ac-cost">代价：{c.cost}</div>}
            <div className="draft-foot">
              <span className="faint">{c.foe ? '对手的牌' : `或换算：${c.convert}`}</span>
              <button className="btn small primary" disabled={handFull} onClick={() => onTake(c.id)}>
                收下
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="draft-skip">
        {handFull && <span className="warn-text">手牌满了（最多 3 张）：先打出或换算一张。</span>}
        <button className="btn ghost small" onClick={onSkip}>
          都不要
        </button>
      </div>
    </div>
  );
}
