import { useEffect, useState } from 'react';
import type { Game } from '../engine/game';
import { headline } from '../llm/director';
import { eraOf } from '../llm/era';
import type { LlmSettings } from '../llm/settings';
import { CardsBody } from './Cards';
import { Contacts, type useDialogues } from './Contacts';
import { cls, price, qty, signed } from './format';
import { IntelList } from './IntelPanel';

const WHY: Record<string, string> = {
  gravity: '没有人持续投钱时，做市与套利资金会把价格拉回真实走势附近',
  crowd: '大户室里成百上千的散户，跟着情绪追涨杀跌',
  trend: '价格偏离够大时，追涨杀跌的资金会放大这段行情',
  player: '你的委托真的进入了订单簿',
};

export function Recap({ game, dayIdx }: { game: Game; dayIdx?: number }) {
  const rc = game.recaps[dayIdx ?? game.recaps.length - 1];
  if (!rc) return null;
  const parts = rc.parts.filter((p) => Math.abs(p.move) >= 0.5);
  const max = Math.max(...parts.map((p) => Math.abs(p.move)), 1);
  const total = rc.close - rc.open;
  const groupName = (g: Game, who: string) => g.scenario.groupName?.(g, who) ?? who;
  return (
    <div className="recap">
      <h3>收盘复盘 · {rc.date}</h3>
      <div className="muted" style={{ fontSize: 13 }}>
        开盘 <span className="num">{price(rc.open)}</span> → 收盘 <span className="num">{price(rc.close)}</span>（
        <span className={total >= 0 ? 'up' : 'down'}>{signed(total / 100, (x) => x.toFixed(2))}</span>）· 真实历史收盘 <span className="num">{price(rc.hist)}</span>
      </div>
      <p style={{ fontSize: 13, margin: '10px 0 4px' }}>今天谁把价格推到了这里：</p>
      {parts.map((p) => (
        <div key={p.who} className="wf-row" title={WHY[p.who] ?? '大席位的主动买卖'}>
          <span>
            {groupName(game, p.who)}
            {Math.abs(p.net) >= 10000 && (
              <span className="faint" style={{ fontSize: 11 }}>
                {' '}
                净{p.net > 0 ? '买' : '卖'} {qty(Math.abs(p.net))}
              </span>
            )}
          </span>
          <div className="wf-track">
            <div className="zero" />
            <div
              className="barv"
              style={{
                left: p.move >= 0 ? '50%' : `${50 - (Math.abs(p.move) / max) * 50}%`,
                width: `${(Math.abs(p.move) / max) * 50}%`,
                background: p.move >= 0 ? 'var(--up)' : 'var(--down)',
                transformOrigin: p.move >= 0 ? 'left' : 'right',
              }}
            />
          </div>
          <span className={cls('num', p.move >= 0 ? 'up' : 'down')} style={{ textAlign: 'right' }}>
            {signed(p.move / 100, (x) => x.toFixed(2))}
          </span>
        </div>
      ))}
      {rc.notes.length > 0 && (
        <ul style={{ fontSize: 13, paddingLeft: 18, marginBottom: 0 }}>
          {rc.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
        每一笔主动成交都会推动盘口；加总起来就是今天的涨跌。“历史引力”一栏是做市资金把价格拉回真实走势的力量。
      </p>
    </div>
  );
}

export function Night({ game, llm, dlg, showMentor, onSleep }: { game: Game; llm: LlmSettings; dlg: ReturnType<typeof useDialogues>; showMentor: boolean; onSleep: () => void }) {
  const [, bump] = useState(0);
  const paper = game.papers[game.papers.length - 1];
  const [hl, setHl] = useState<{ headline: string; sub: string; source: string } | null>(null);
  const hasCards = game.cards().length > 0;
  const [tab, setTab] = useState<'recap' | 'people' | 'intel' | 'cards'>(game.isAftermath && hasCards ? 'cards' : 'recap');
  useEffect(() => {
    setHl(null);
    if (paper) headline(llm, eraOf(game.scenario.eraId), paper, game.day.date).then(setHl);
  }, [paper, llm, game]);
  const next = game.scenario.days[game.dayIndex + 1];
  const todays = game.intel.filter((i) => i.day === game.dayIndex && i.kind !== 'system' && (showMentor || i.kind !== 'mentor'));
  return (
    <div className="night">
      <div className="night-inner">
        <div>
          <div className="newspaper paper">
            <div className="masthead">
              <div className="name">{game.scenario.paperName ?? '财经报'}</div>
              <div className="meta">
                <span>{game.day.date} {game.day.label.replace(' · 决战日', '')}</span>
                <span>第 {1024 + game.dayIndex} 期</span>
              </div>
            </div>
            <div className="headline">{hl?.headline ?? paper?.headline}</div>
            <div className="subhead">{hl?.sub ?? paper?.sub}</div>
            <div className="engraved-rule" />
            {todays.slice(0, 5).map((i, k) => (
              <p key={k} style={{ fontFamily: 'var(--serif)', margin: '0 0 8px', fontSize: 14 }}>
                <b>{i.kind === 'rumor' ? '【坊间】' : i.kind === 'mentor' ? '【场内】' : '【本报讯】'}</b>
                {i.kind === 'mentor' ? `老周说：${i.body}` : `${i.title}。${i.body}`}
              </p>
            ))}
            {todays.length === 0 && <p style={{ fontFamily: 'var(--serif)' }}>今日市况平稳，多空双方各执一词。</p>}
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 8 }}>{hl?.source === 'llm' ? '标题由模型按当年腔调改写，数字取自引擎' : '标题由引擎生成'}</div>
          </div>
        </div>
        <div>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={cls(tab === 'recap' && 'on')} onClick={() => setTab('recap')}>
              收盘复盘
            </button>
            {hasCards && (
              <button className={cls(tab === 'cards' && 'on')} onClick={() => setTab('cards')}>
                手段
              </button>
            )}
            <button className={cls(tab === 'people' && 'on')} onClick={() => setTab('people')}>
              人脉（{game.energy} 点精力）
            </button>
            <button className={cls(tab === 'intel' && 'on')} onClick={() => setTab('intel')}>
              情报
            </button>
          </div>
          {tab === 'recap' && <Recap game={game} />}
          {tab === 'cards' && (
            <div className="recap">
              <CardsBody game={game} onPlayed={() => bump((x) => x + 1)} />
            </div>
          )}
          {tab === 'people' && (
            <div className="recap">
              <Contacts game={game} dlg={dlg} llmOn={llm.enabled} inline />
            </div>
          )}
          {tab === 'intel' && (
            <div className="recap">
              <IntelList game={game} showMentor={showMentor} />
            </div>
          )}
        </div>
        <div className="night-actions">
          <span className="muted" style={{ fontSize: 13 }}>
            {next ? `明天：${next.date} ${next.label}` : '这是最后一夜。'}
          </span>
          <button className="btn primary" onClick={onSleep}>
            {!next ? '收场 →' : next.kind === 'aftermath' ? '熄灯，等明天 →' : '熄灯，等明天开盘 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
