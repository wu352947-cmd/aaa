import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Game, GameEvent } from '../engine/game';
import type { LlmSettings } from '../llm/settings';
import { Chart } from './Chart';
import { Contacts, useDialogues } from './Contacts';
import { cls, money } from './format';
import { IntelDrawer } from './IntelPanel';
import { DecisionModal, RuleCardModal, type UiSettings } from './Modals';
import { Night } from './Night';
import { OrderTicket } from './OrderTicket';
import { PlanBook } from './PlanBook';
import { OrderBookCard, PositionCard, TapeCard } from './SidePanels';

// 每分钟行情的现实耗时（毫秒）。布局期一天约 40 秒，决战日按分钟慢慢推进。
const SPEEDS = {
  layout: [250, 120, 40, 8],
  battle: [1500, 600, 200, 30],
};
const SPEED_LABEL = ['慢', '中', '快', '极快'];

type Drawer = null | 'buy' | 'sell' | 'plan' | 'people' | 'intel';
interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'rule' | 'danger';
}

export function GameScreen({ game, llm, ui, onSettings, onEnd }: { game: Game; llm: LlmSettings; ui: UiSettings; onSettings: () => void; onEnd: () => void }) {
  const [rev, bump] = useReducer((x: number) => x + 1, 0);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [limitPick, setLimitPick] = useState<number | null>(null);
  const [ruleCard, setRuleCard] = useState<{ id: string; detail?: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chartMode, setChartMode] = useState<'intraday' | 'daily'>('intraday');
  const [intelSeen, setIntelSeen] = useState(0);
  const cursor = useRef(0);
  const toastId = useRef(0);
  const dlg = useDialogues(game, llm);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  /** 处理引擎新产生的事件；返回 true 表示需要停下时钟 */
  const processEvents = useCallback((): boolean => {
    let stop = false;
    const evs: GameEvent[] = game.events.slice(cursor.current);
    cursor.current = game.events.length;
    for (const e of evs) {
      if (e.kind === 'intel' && !ui.mentor && e.text.startsWith('老周')) continue;
      if (e.rule) {
        const card = game.scenario.ruleCards.find((c) => c.id === e.rule);
        if (card && !game.seenRules.has(card.id)) {
          game.seenRules.add(card.id);
          setRuleCard({ id: card.id, detail: e.text });
          stop = true;
          continue;
        }
        toast(e.text, e.blocked === false || e.kind === 'liquidation' ? 'danger' : 'rule');
        continue;
      }
      if (e.kind === 'pause') {
        toast(e.text, 'danger');
        stop = true;
        continue;
      }
      toast(e.text, e.kind === 'liquidation' || e.kind === 'margin' ? 'danger' : 'info');
    }
    return stop;
  }, [game, toast, ui.mentor]);

  // 时钟
  useEffect(() => {
    if (paused || ruleCard || game.phase !== 'trading' || game.decision) return;
    const ms = SPEEDS[game.isBattleDay ? 'battle' : 'layout'][speed];
    const steps = ms < 16 ? Math.ceil(16 / ms) : 1;
    const id = setInterval(() => {
      for (let i = 0; i < steps; i++) {
        const ok = game.tick();
        const stop = processEvents();
        if (stop) setPaused(true);
        if (!ok || stop || game.decision || game.phase !== 'trading') break;
      }
      bump();
    }, Math.max(ms, 16));
    return () => clearInterval(id);
  }, [paused, ruleCard, speed, game, processEvents, game.phase, game.decision, game.dayIndex]);

  useEffect(() => {
    if (game.phase === 'reckoning') onEnd();
  }, [game.phase, rev, onEnd]);

  useEffect(() => {
    processEvents();
    bump();
  }, [processEvents]);

  // 键盘：B / S / P / R / I 对应五个核心按钮，空格暂停
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !game.decision && !ruleCard) {
        setDrawer(null);
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (game.phase === 'night' || game.decision || ruleCard) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (k === 'b') setDrawer('buy');
      else if (k === 's') setDrawer('sell');
      else if (k === 'p') setDrawer('plan');
      else if (k === 'r') setDrawer('people');
      else if (k === 'i') setDrawer('intel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, ruleCard]);

  const ex = game.market.ex;
  const eq = game.equity();
  const day = game.day;
  const intelCount = game.intel.filter((i) => ui.mentor || i.kind !== 'mentor').length;
  const unread = Math.max(0, intelCount - intelSeen);
  const latest = game.intel.find((i) => ui.mentor || i.kind !== 'mentor');
  const ruleDef = ruleCard && game.scenario.ruleCards.find((c) => c.id === ruleCard.id);

  const open = (d: Drawer) => {
    setDrawer(drawer === d ? null : d);
    if (d === 'intel') setIntelSeen(intelCount);
  };

  const sleep = () => {
    game.act({ type: 'end-night' });
    processEvents();
    if (game.isBattleDay) {
      setSpeed(0);
      toast('决战日：时间放慢到按分钟推进。盯住订单簿与逐笔。', 'danger');
    }
    setPaused(true);
    setDrawer(null);
    bump();
  };

  return (
    <div className="game">
      <div className="topbar">
        <div className="clock">
          <span className="date">{day.date}</span>
          <span className="muted">{day.label.replace(' · 决战日', '')}</span>
          {game.isBattleDay && <span className="battle-badge">决战日</span>}
          <span className="time">{game.phase === 'trading' ? game.time : '收盘'}</span>
        </div>
        <button className="btn small" onClick={() => setPaused(!paused)} disabled={game.phase !== 'trading'}>
          {paused ? '▶ 继续' : '❚❚ 暂停'} <span className="kbd">空格</span>
        </button>
        <div className="speed" title="时间流速">
          {SPEED_LABEL.map((l, i) => (
            <button key={l} className={cls(speed === i && 'on')} onClick={() => setSpeed(i)}>
              {l}
            </button>
          ))}
        </div>
        <div className="meters">
          <div className="meter" title="现金 + 浮动盈亏">
            <span className="label">权益</span>
            <span className="value">{money(eq)}</span>
          </div>
          <div className="meter" title="监管热度：违规行为会累积热度，按真实流程逐级升级——问询、警示、立案、处罚、禁入。只降不清零。">
            <span className="label">监管热度 · 第 {game.heatTier()} 级</span>
            <span className="pips heat">
              {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={cls(game.heatTier() >= i && 'on')} />
              ))}
            </span>
          </div>
          <div className="meter" title="声望：圈内信誉，决定谁愿意和你结盟、给你真消息">
            <span className="label">声望</span>
            <span className="value">{game.reputation}</span>
          </div>
          <div className="meter" title={`底线「${game.principle.label}」：越过的次数。不扣分，但会改变画面与结局。`}>
            <span className="label">底线</span>
            <span className="value">{game.linesCrossed === 0 ? '守住' : `越过 ${game.linesCrossed} 次`}</span>
          </div>
          <button className="btn ghost small" onClick={onSettings} title="设置">
            ⚙
          </button>
        </div>
      </div>

      <div className="newsbar">
        {latest ? (
          <>
            <span className="src">{latest.source}</span>
            <span>{latest.title}</span>
            <span className="faint">{latest.time}</span>
          </>
        ) : (
          <span className="faint">暂无消息</span>
        )}
      </div>

      <div className="main">
        <div className="chart-wrap">
          <div className="chart-tabs">
            <button className={cls(chartMode === 'intraday' && 'on')} onClick={() => setChartMode('intraday')}>
              分时
            </button>
            <button className={cls(chartMode === 'daily' && 'on')} onClick={() => setChartMode('daily')}>
              日线
            </button>
            <div className="chart-legend">
              <span>
                <i className="legend-line" />
                这一局
              </span>
              <span title="没有玩家干预时，价格会贴着这条线走。你的大单会把价格推离它。">
                <i className="legend-line hist" />
                真实历史
              </span>
              <span className="prov" title={game.scenario.sources.find((s) => s.id === 'reconstruction')?.body}>
                {day.provenance === 'measured' ? '实测' : '重建'}
              </span>
            </div>
          </div>
          <Chart
            game={game}
            rev={rev}
            mode={chartMode}
            onPickPrice={(p) => {
              setLimitPick(p);
              if (drawer !== 'buy' && drawer !== 'sell') setDrawer(p < ex.last ? 'buy' : 'sell');
            }}
          />
          <div className="toast-stack">
            {toasts.map((t) => (
              <div key={t.id} className={cls('toast', t.kind === 'rule' && 'rule', t.kind === 'danger' && 'danger')}>
                {t.text}
              </div>
            ))}
          </div>
          {paused && game.phase === 'trading' && <div className="pause-veil">已暂停 · 按空格继续</div>}
        </div>
        <div className="side">
          <PositionCard game={game} />
          <OrderBookCard game={game} />
          <TapeCard game={game} />
        </div>
        {(drawer === 'buy' || drawer === 'sell') && <OrderTicket key={drawer} game={game} side={drawer} limitPrice={limitPick} onClose={() => (setDrawer(null), setLimitPick(null), bump())} />}
        {drawer === 'plan' && <PlanBook game={game} onClose={() => setDrawer(null)} />}
        {drawer === 'people' && <Contacts game={game} dlg={dlg} llmOn={llm.enabled} onClose={() => setDrawer(null)} />}
        {drawer === 'intel' && <IntelDrawer game={game} showMentor={ui.mentor} onClose={() => setDrawer(null)} />}
      </div>

      <div className="actionbar">
        <button className="core-btn buy" onClick={() => open('buy')}>
          买入<span className="kbd">B</span>
        </button>
        <button className="core-btn sell" onClick={() => open('sell')}>
          卖出<span className="kbd">S</span>
        </button>
        <button className="core-btn" onClick={() => open('plan')}>
          计划书<span className="kbd">P</span>
          {game.plans.filter((p) => !p.done).length > 0 && <span className="badge">{game.plans.filter((p) => !p.done).length}</span>}
        </button>
        <button className="core-btn" onClick={() => open('people')}>
          人脉<span className="kbd">R</span>
        </button>
        <button className="core-btn" onClick={() => open('intel')}>
          情报<span className="kbd">I</span>
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {game.faction.name} · 第 {game.dayIndex + 1} / {game.scenario.days.length} 个交易日
        </span>
      </div>

      {game.phase === 'night' && <Night game={game} llm={llm} dlg={dlg} showMentor={ui.mentor} onSleep={sleep} />}
      {game.decision && (
        <DecisionModal
          key={game.decision.id}
          d={game.decision}
          onChoose={(c) => {
            game.act({ type: 'decision', id: game.decision!.id, choice: c });
            processEvents();
            setPaused(false);
            bump();
          }}
        />
      )}
      {ruleDef && <RuleCardModal card={ruleDef} detail={ruleCard?.detail} onClose={() => setRuleCard(null)} />}
    </div>
  );
}
