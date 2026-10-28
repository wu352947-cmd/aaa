import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Game, GameEvent } from '../engine/game';
import type { LlmSettings } from '../llm/settings';
import { CardsDrawer } from './Cards';
import { Chart } from './Chart';
import { PixelScene } from './Pixel';
import type { SceneId, SceneState } from '../pixel/scenes';
import { Contacts, useDialogues } from './Contacts';
import { cls, money } from './format';
import { IntelDrawer } from './IntelPanel';
import { DecisionModal, RuleCardModal, type UiSettings } from './Modals';
import { Night } from './Night';
import { OrderTicket } from './OrderTicket';
import { PlanBook } from './PlanBook';
import { ClocksCard, DirectivesCard } from './Plans';
import { eraOfScenario } from '../pixel/palettes';
import { saveGame } from './save';
import { HoldersCard, MembersCard, OrderBookCard, PositionCard, StakeCard, TapeCard } from './SidePanels';
import { sound } from './sound';
import { canUndo, countdownScale, difficultyName, LAYERS, tutorialLayer, undoDay } from './tutorial';

// 每分钟行情的现实耗时（毫秒）。布局期一天约 40 秒，决战日按分钟慢慢推进。
const SPEEDS = {
  layout: [250, 120, 40, 8],
  battle: [1500, 600, 200, 30],
};
const SPEED_LABEL = ['慢', '中', '快', '极快', '自动'];
/** 自动档：没有新消息就快进，一有动静（消息、决策、成交放量）就放慢；决战日最后一刻钟按最慢的档走 */
const AUTO = 4;
const AUTO_SPEED = {
  layout: { quiet: 8, busy: 120 },
  battle: { quiet: 200, busy: 600, final: 1500 },
};

type Drawer = null | 'buy' | 'sell' | 'plan' | 'people' | 'intel' | 'cards';
interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'rule' | 'danger';
}

export function GameScreen({ game, llm, ui, onSettings, onEnd, onReplace }: { game: Game; llm: LlmSettings; ui: UiSettings; onSettings: () => void; onEnd: () => void; onReplace: (g: Game) => void }) {
  const [rev, bump] = useReducer((x: number) => x + 1, 0);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(AUTO);
  // 自动档：到第几个 tick 之前保持慢速
  const busyUntil = useRef(0);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [limitPick, setLimitPick] = useState<number | null>(null);
  const [ruleCard, setRuleCard] = useState<{ id: string; detail?: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chartMode, setChartMode] = useState<'intraday' | 'daily'>('intraday');
  const [intelSeen, setIntelSeen] = useState(0);
  // 读档恢复的局面不再重播旧事件
  const cursor = useRef(game.log.length ? game.events.length : 0);
  const toastId = useRef(0);
  const dlg = useDialogues(game, llm);
  const observer = !!game.faction.observer;
  // 专家与铁人档：老周不再提点
  const showMentor = ui.mentor && game.difficulty !== 'expert' && game.difficulty !== 'iron';
  // 铁人档：决战日不能暂停
  const noPause = game.difficulty === 'iron' && game.isBattleDay;
  // 新手档：界面逐层解锁
  const layer = tutorialLayer(game);
  const cards = game.cards();
  // 带快捷键的卡在盘中显示为快捷按钮
  const quick = cards.filter((c) => c.key && c.when !== 'night');
  const meters = game.scenario.meters?.(game);
  const playQuick = useCallback(
    (id: string) => {
      if (game.canPlay(id)) return;
      game.act({ type: 'card', id });
      bump();
    },
    [game],
  );

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
    if (evs.length) busyUntil.current = game.market.ex.tick + 10;
    for (const e of evs) {
      if (e.kind === 'intel' && !showMentor && e.text.startsWith('老周')) continue;
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
        if (ui.sound) sound.bell(true);
        stop = !noPause;
        continue;
      }
      if (ui.sound && (e.kind === 'liquidation' || e.kind === 'phase')) sound.bell(e.kind === 'liquidation');
      toast(e.text, e.kind === 'liquidation' || e.kind === 'margin' ? 'danger' : 'info');
    }
    return stop;
  }, [game, toast, showMentor, noPause, ui.sound]);

  // 自动存档：动作发生、换日或换阶段时写一次；行情推进中每 30 分钟写一次
  const lastSave = useRef('');
  useEffect(() => {
    const key = `${game.log.length}|${game.dayIndex}|${game.phase}|${paused ? game.t : Math.floor(game.t / 30)}`;
    if (key === lastSave.current) return;
    lastSave.current = key;
    saveGame(game);
  });
  useEffect(() => {
    const flush = () => saveGame(game);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [game]);

  // 声音：浏览器要求先有一次交互
  useEffect(() => {
    if (!ui.sound) {
      sound.stop();
      return;
    }
    const kick = () => sound.start();
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
  }, [ui.sound]);
  useEffect(() => () => sound.stop(), []);
  useEffect(() => {
    if (!ui.sound) return;
    const bars = game.market.bars;
    const trading = game.phase === 'trading' && !paused;
    const v = trading && bars.length ? bars[bars.length - 1].v / (game.day.vDay / game.market.session.minutes) : 0;
    sound.setCrowd(trading ? Math.min(1, Math.log2(1 + v) / 4) : 0);
    const eqNow = game.equity();
    const use = eqNow > 0 ? game.marginNeed() / eqNow : game.player.pos ? 2 : 0;
    sound.setHeart(game.phase === 'trading' && use > 0.8 ? Math.min(150, 64 + (use - 0.8) * 120) : 0);
  });

  // 时钟
  useEffect(() => {
    if (paused || ruleCard || game.phase !== 'trading' || game.decision) return;
    const kind = game.isBattleDay ? 'battle' : 'layout';
    const pace = () => {
      if (speed !== AUTO) return SPEEDS[kind][speed];
      const m = game.market;
      if (game.isBattleDay && m.t >= m.session.minutes - 15) return AUTO_SPEED.battle.final;
      // 成交突然放大也算动静
      const bar = m.bars[m.bars.length - 1];
      if (bar && bar.v > (2.5 * game.day.vDay) / m.session.minutes) busyUntil.current = Math.max(busyUntil.current, m.ex.tick + 5);
      return m.ex.tick < busyUntil.current ? AUTO_SPEED[kind].busy : AUTO_SPEED[kind].quiet;
    };
    let id = 0;
    const run = () => {
      const ms = pace();
      const steps = ms < 16 ? Math.ceil(16 / ms) : 1;
      let halt = false;
      for (let i = 0; i < steps; i++) {
        const ok = game.tick();
        const stop = processEvents();
        if (stop) setPaused(true);
        if (!ok || stop || game.decision || game.phase !== 'trading') {
          halt = true;
          break;
        }
        // 快进中撞上动静，立刻按慢速走
        if (speed === AUTO && pace() > ms) break;
      }
      bump();
      if (!halt) id = window.setTimeout(run, Math.max(pace(), 16));
    };
    id = window.setTimeout(run, Math.max(pace(), 16));
    return () => clearTimeout(id);
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
        setPaused((p) => (noPause && !p ? p : !p));
      } else if (quick.some((c) => c.key === k && !game.canPlay(c.id))) playQuick(quick.find((c) => c.key === k)!.id);
      else if (k === 'a') setDrawer('cards');
      else if (!observer && k === 'b') setDrawer('buy');
      else if (!observer && k === 's') setDrawer('sell');
      else if (!observer && k === 'p' && layer >= 3) setDrawer('plan');
      else if (k === 'r') setDrawer('people');
      else if (k === 'i') setDrawer('intel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, ruleCard, observer, playQuick, quick, noPause, layer]);

  // 解锁新的一层时提示一句
  const shownLayer = useRef(layer);
  useEffect(() => {
    if (layer <= shownLayer.current) return;
    shownLayer.current = layer;
    const l = LAYERS[layer - 1];
    toast(`解锁第 ${layer} 层「${l.name}」：${l.opens}`, 'rule');
  }, [layer, toast]);

  const ex = game.market.ex;
  const eq = game.equity();
  const day = game.day;
  const intelCount = game.intel.filter((i) => showMentor || i.kind !== 'mentor').length;
  const unread = Math.max(0, intelCount - intelSeen);
  const latest = game.intel.find((i) => showMentor || i.kind !== 'mentor');
  const ruleDef = ruleCard && game.scenario.ruleCards.find((c) => c.id === ruleCard.id);

  const open = (d: Drawer) => {
    setDrawer(drawer === d ? null : d);
    if (d === 'intel') setIntelSeen(intelCount);
  };

  const sleep = () => {
    game.act({ type: 'end-night' });
    processEvents();
    if (game.isBattleDay) {
      if (speed !== AUTO) setSpeed(0);
      toast(speed === AUTO ? '决战日：有动静时自动放慢，最后一刻钟按分钟推进。盯住订单簿与逐笔。' : '决战日：时间放慢到按分钟推进。盯住订单簿与逐笔。', 'danger');
    }
    setPaused(true);
    setDrawer(null);
    bump();
  };

  return (
    <div className={cls('game', ui.scenes !== false && 'with-scene')}>
      <div className="topbar">
        <div className="clock">
          <span className="date">{day.date}</span>
          <span className="muted">{day.label.replace(' · 决战日', '')}</span>
          {game.chapter && <span className="chapter-tag">{game.chapter.title}</span>}
          {game.isBattleDay && <span className="battle-badge">决战日</span>}
          <span className="time">{game.phase === 'trading' ? game.time : '收盘'}</span>
        </div>
        <button className="btn small" onClick={() => setPaused(!paused)} disabled={game.phase !== 'trading' || (noPause && !paused)} title={noPause ? '铁人：决战日不能暂停' : undefined}>
          {paused ? '▶ 继续' : '❚❚ 暂停'} <span className="kbd">空格</span>
        </button>
        <div className="speed" title="时间流速。自动：没动静就快进，有消息、决策或成交放量就放慢">
          {SPEED_LABEL.map((l, i) => (
            <button key={l} className={cls(speed === i && 'on')} onClick={() => setSpeed(i)}>
              {l}
            </button>
          ))}
        </div>
        <div className="meters">
          {meters ? (
            meters.map((m) => (
              <div key={m.id} className="meter" title={m.tip}>
                <span className="label">{m.label}</span>
                {m.pips ? (
                  <span className={cls('pips', m.pips.tone === 'heat' && 'heat', m.pips.tone === 'good' && 'good')}>
                    {Array.from({ length: m.pips.of }, (_, i) => (
                      <i key={i} className={cls(i < m.pips!.on && 'on')} />
                    ))}
                  </span>
                ) : (
                  <span className={cls('value', m.tone === 'bad' && 'up', m.tone === 'good' && 'gold')}>{m.value}</span>
                )}
              </div>
            ))
          ) : (
            <>
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
            </>
          )}
          <div className="meter" title={`底线「${game.principle.label}」：越过的次数。不扣分，但会改变画面与结局。`}>
            <span className="label">底线</span>
            <span className="value">{game.linesCrossed === 0 ? '守住' : `越过 ${game.linesCrossed} 次`}</span>
          </div>
          {canUndo(game) && (
            <button
              className="btn ghost small"
              title="新手档每局可以撤回一天：回到今天开盘"
              onClick={() => {
                if (window.confirm(`回到 ${day.date} 开盘？今天做过的一切都会撤销。每局只能撤回一次。`)) onReplace(undoDay(game));
              }}
            >
              撤回今天
            </button>
          )}
          <button className="btn ghost small" onClick={onSettings} title="设置">
            ⚙
          </button>
        </div>
      </div>

      <div>
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

      {layer < 5 && (
        <div className="tutor-strip">
          <span className="tutor-step">
            教学 {layer} / 5 · {LAYERS[layer - 1].name}
          </span>
          <span>
            下一步：<b>{LAYERS[layer - 1].goal}</b>
          </span>
          <span className="faint">不做也行，第 {layer + 1} 个交易日自动解锁「{LAYERS[layer].name}」</span>
        </div>
      )}
      </div>

      {ui.scenes !== false && <SceneStrip game={game} paused={paused} redUp={ui.colors === 'cn'} />}

      <div className="main">
        <div className="chart-wrap">
          <div className="chart-tabs">
            <button className={cls(chartMode === 'intraday' && 'on')} onClick={() => setChartMode('intraday')}>
              分时
            </button>
            {layer >= 2 && (
              <button className={cls(chartMode === 'daily' && 'on')} onClick={() => setChartMode('daily')}>
                日线
              </button>
            )}
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
            mode={layer >= 2 ? chartMode : 'intraday'}
            onPickPrice={
              observer || layer < 3
                ? undefined
                : (p) => {
                    setLimitPick(p);
                    if (drawer !== 'buy' && drawer !== 'sell') setDrawer(p < ex.last ? 'buy' : 'sell');
                  }
            }
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
          {observer ? game.scenario.holders ? <HoldersCard game={game} /> : <MembersCard game={game} /> : <PositionCard game={game} layer={layer} />}
          {!observer && game.scenario.holders && <HoldersCard game={game} />}
          <DirectivesCard dirs={(game.scenario.directives?.(game) ?? []).filter((d) => d.status === 'open')} era={eraOfScenario(game.scenario.id)} names={(id) => game.npc(id)?.name ?? id} />
          <ClocksCard clocks={game.scenario.clocks?.(game) ?? []} era={eraOfScenario(game.scenario.id)} />
          {observer && <StakeCard game={game} />}
          {layer >= 3 && <OrderBookCard game={game} />}
          {layer >= 2 && <TapeCard game={game} />}
        </div>
        {(drawer === 'buy' || drawer === 'sell') && <OrderTicket key={drawer} game={game} layer={layer} side={drawer} limitPrice={limitPick} onClose={() => (setDrawer(null), setLimitPick(null), bump())} />}
        {drawer === 'plan' && <PlanBook game={game} onClose={() => setDrawer(null)} />}
        {drawer === 'people' && <Contacts game={game} dlg={dlg} llmOn={llm.enabled} onClose={() => setDrawer(null)} />}
        {drawer === 'intel' && <IntelDrawer game={game} showMentor={showMentor} onClose={() => setDrawer(null)} />}
        {drawer === 'cards' && <CardsDrawer game={game} onClose={() => setDrawer(null)} onPlayed={() => (processEvents(), bump())} />}
      </div>

      <div className="actionbar">
        {!observer && (
          <>
            <button className="core-btn buy" onClick={() => open('buy')}>
              买入<span className="kbd">B</span>
            </button>
            <button className="core-btn sell" onClick={() => open('sell')}>
              卖出<span className="kbd">S</span>
            </button>
            {layer >= 3 && (
              <button className="core-btn" onClick={() => open('plan')}>
                计划书<span className="kbd">P</span>
                {game.plans.filter((p) => !p.done).length > 0 && <span className="badge">{game.plans.filter((p) => !p.done).length}</span>}
              </button>
            )}
          </>
        )}
        {cards.length > 0 && (
          <button className="core-btn" onClick={() => open('cards')}>
            手段<span className="kbd">A</span>
            <span className="badge">{cards.filter((c) => !game.canPlay(c.id, c.targets?.[0]?.id)).length}</span>
          </button>
        )}
        <button className="core-btn" onClick={() => open('people')}>
          人脉<span className="kbd">R</span>
        </button>
        <button className="core-btn" onClick={() => open('intel')}>
          情报<span className="kbd">I</span>
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        {quick.map((c) => (
          <button key={c.id} className={cls('core-btn quick', c.color === 'black' && 'sell')} disabled={!!game.canPlay(c.id)} onClick={() => playQuick(c.id)} title={`${c.does}（代价：${c.cost}）${c.blocked ? ' — ' + c.blocked : ''}`}>
            {c.status ?? c.name}
            <span className="kbd">{c.key!.toUpperCase()}</span>
          </button>
        ))}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {game.faction.name} · {difficultyName(game.difficulty)} · 第 {game.dayIndex + 1} / {game.scenario.days.length} 个交易日
        </span>
      </div>

      {game.phase === 'night' && <Night game={game} llm={llm} dlg={dlg} showMentor={showMentor} onSleep={sleep} />}
      {game.decision && (
        <DecisionModal
          key={game.decision.id}
          d={game.decision}
          scale={countdownScale(game)}
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

/** 世界层：交易屏上方的场景条。只画气氛，不画数字。 */
function SceneStrip({ game, paused, redUp }: { game: Game; paused: boolean; redUp: boolean }) {
  const m = game.market;
  const bars = m.bars;
  const recent = bars.slice(-8);
  const perMin = game.day.vDay / m.session.minutes;
  const vol = recent.length ? recent.reduce((a, b) => a + b.v, 0) / recent.length : 0;
  const trading = game.phase === 'trading' && !paused;
  const heat = trading ? Math.min(1, Math.log2(1 + vol / Math.max(1, perMin)) / 2.5) : game.phase === 'night' ? 0.05 : 0.15;
  const move = recent.length > 1 ? recent[recent.length - 1].c - recent[0].o : 0;
  const dir: SceneState['dir'] = Math.abs(move) < m.last * 0.0005 ? 0 : move > 0 ? 1 : -1;
  const gme = game.scenario.id === 'gme2021';
  const board = game.scenario.id === 'takeover2015';
  // 做市商和做空基金坐在交易台前，散户和券商 CEO 在自己的房间里；举牌之争在会议室里
  const desk = gme && (game.factionId === 'mm' || game.factionId === 'short');
  const scene: SceneId = board ? 'board' : desk ? 'desk' : gme ? 'room' : 'floor';
  // 走势的形状：只取 24 个点，不带数字
  const step = Math.max(1, Math.floor(bars.length / 24));
  const shape = bars.filter((_, i) => i % step === 0).map((b) => b.c);
  const state: SceneState = {
    heat: Math.round(heat * 10) / 10,
    dir,
    halted: m.t < m.haltUntil,
    climax: game.isBattleDay,
    restricted: !!game.flags.restrictActive,
    redUp,
    shape: gme || board ? shape.slice(-24) : undefined,
    who: board ? ['ye', 'fu', 'wang', 'yu'] : undefined,
    faded: Math.min(0.7, game.linesCrossed * 0.2),
  };
  const cap = board ? `深圳 · 万川总部会议室${game.isBattleDay ? ' · 复牌' : ''}` : desk ? `纽约 · ${game.factionId === 'mm' ? '堡垒集团交易台' : '灰狼资本交易室'}${state.halted ? ' · 暂停' : ''}` : gme ? '纽约 · 一间卧室' : `上海 · 交易大厅${state.halted ? ' · 停市' : game.isBattleDay ? ' · 决战日' : ''}`;
  return (
    <div className="scene-strip">
      <PixelScene scene={scene} state={state} label={cap} fit />
      <span className="scene-cap">{cap}</span>
    </div>
  );
}
