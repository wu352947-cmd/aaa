import { useCallback, useState } from 'react';
import { speak } from '../llm/director';
import { ERA_1637_HAARLEM } from '../llm/era';
import type { LlmSettings } from '../llm/settings';
import { ANNUAL_WAGE, APRIL_VALUE, COUNCIL, EVENINGS, HOST, MEANS, TULIP_NPCS, TULIP_RULES, TULIP_SOURCES, WINE_MONEY } from '../scenarios/tulip/data';
import { RULE_NAME, TulipGame, type Settlement, type TulipFaction, type TulipRule } from '../scenarios/tulip/game';
import { CardList } from './Cards';
import { ClocksList, DirectivesList, DraftOffer } from './Plans';
import { PixelPortrait, PixelScene } from './Pixel';
import { clearSave, saveTulip } from './save';
import { tulipIntent } from '../scenarios/tulip/talk';
import { cls } from './format';
import { RuleCardModal } from './Modals';

const councilName = (id: string) => COUNCIL.find((c) => c.id === id)?.name ?? id;
const fl = (n: number) => `${Math.round(n).toLocaleString()} 盾`;
const sgn = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fl(Math.abs(n));

const SEATS: { id: TulipFaction | 'council'; name: string; blurb: string; locked?: string }[] = [
  { id: 'speculator', name: '酒馆投机客', blurb: '你口袋里只有 100 荷兰盾，手里一个球茎也没有。但在这里，签约不用付钱。' },
  { id: 'grower', name: '球茎种植者', blurb: '你城外的花田里埋着 6 份“瑞士人”，四月才能挖出来。酒馆里的人愿意现在就出价。' },
  { id: 'council', name: '行会议员', blurb: '你不下场，但你手里有权力。七个夜晚，酒馆里的人一份份签下约定；你每晚有两点影响力，可以贴告示、定规矩、收印花钱、登门游说其他议员。二月底，七位议员在阿姆斯特丹的会上投票决定：这些约定还算不算数。' },
];

interface Bubble {
  npc: string;
  text: string;
  pending?: boolean;
  source?: 'llm' | 'template';
}

export function TulipSetup({ onBegin, onBack }: { onBegin: (f: TulipFaction) => void; onBack: () => void }) {
  const [seat, setSeat] = useState<TulipFaction>('speculator');
  return (
    <div className="setup paper tavern-paper">
      <div className="setup-inner">
        <div className="scene-frame">
          <PixelScene scene="tavern" state={{ who: ['jan', 'pieter', 'cornelis', 'maritje', 'dirck', 'hendrick'] }} label="金鹿酒馆" />
        </div>
        <div style={{ letterSpacing: '0.3em', fontSize: 12, color: 'var(--ink-soft)' }}>新 手 第 一 课</div>
        <h2>酒馆里的花</h2>
        <div className="engraved-rule" />
        <div className="prologue">
          <p>1636 年冬天，荷兰哈勒姆。郁金香球茎的价格已经涨了好几个月，买卖它的人却从来没见过自己买的花——球茎埋在地里，要到四月才挖得出来。</p>
          <p>这一课没有 K 线，也没有交易所。只有一间酒馆、一群人、几块写着粉笔字的石板。你会学到：价格是人谈出来的；一张约定可以比你的口袋大得多；而规则一改，谁赚谁赔就全变了。</p>
        </div>
        <div className="section-label">选择你的座位</div>
        <div className="faction-grid">
          {SEATS.map((x) => (
            <button key={x.id} className={cls('faction', seat === x.id && 'selected', x.locked && 'locked')} disabled={!!x.locked} onClick={() => !x.locked && setSeat(x.id as TulipFaction)}>
              <h3>{x.name}</h3>
              <p>{x.blurb}</p>
              {x.locked && <div className="secret">{x.locked}</div>}
            </button>
          ))}
        </div>
        <div className="setup-footer">
          <button className="btn" onClick={onBack}>
            ← 返回
          </button>
          <button className="btn primary" onClick={() => onBegin(seat)}>
            推开金鹿酒馆的门 →
          </button>
        </div>
      </div>
    </div>
  );
}

export function TulipScreen({ game, llm, onExit, onTo327 }: { game: TulipGame; llm: LlmSettings; onExit: () => void; onTo327: () => void }) {
  const [, setRev] = useState(0);
  const bump = () => setRev((x) => x + 1);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [card, setCard] = useState<string | null>(game.log.length ? null : 'forward-intro');
  const [seen, setSeen] = useState<Set<string>>(new Set());

  const showCard = useCallback(
    (id: string) => {
      if (seen.has(id)) return;
      setSeen((s) => new Set(s).add(id));
      setCard(id);
    },
    [seen],
  );

  const say = (npcId: string, talk: ReturnType<TulipGame['act']>) => {
    if (!talk) return;
    const persona = TULIP_NPCS.find((n) => n.id === npcId)!;
    const key = Math.random().toString(36).slice(2);
    setBubbles((b) => [...b.filter((x) => x.npc !== npcId), { npc: npcId, text: key, pending: true }]);
    speak(llm, persona, ERA_1637_HAARLEM, tulipIntent(game, talk), { salt: game.evening }).then((line) =>
      setBubbles((b) => b.map((x) => (x.pending && x.text === key ? { npc: npcId, text: line.text, source: line.source } : x))),
    );
  };

  const council = game.faction === 'council';
  const act = (npcId: string, kind: 'accept' | 'counter') => {
    const before = game.contracts.length;
    const lockedBefore = game.shortDeposit();
    const talk = kind === 'accept' ? game.act({ type: 'accept', npc: npcId }) : game.act({ type: 'counter', npc: npcId, price: Number(offers[npcId]) || 0 });
    say(npcId, talk);
    // 一次只弹一张规则卡：按顺序挑第一张没看过的，其余留到下一次
    const due: string[] = [];
    if (game.contracts.length > before && game.contracts.length === 1) due.push('forward');
    if (talk?.kind === 'deposit' || game.shortDeposit() > lockedBefore) due.push('short-deposit');
    if (game.contracts.length > before && game.contracts.length >= 2) due.push('wine-money');
    if (game.contracts.length > before && game.leverage() >= 3) due.push('leverage');
    const next = due.find((id) => !seen.has(id));
    if (next) showCard(next);
    saveTulip(game);
    bump();
  };

  const leave = () => {
    game.act({ type: 'leave' });
    setBubbles([]);
    setOffers({});
    if (game.phase === 'table' && game.night.kind === 'crash') showCard('counterparty');
    if (game.phase === 'ruling') showCard('option');
    saveTulip(game);
    bump();
    window.scrollTo({ top: 0 });
  };

  const rule = card && card !== 'forward-intro' ? TULIP_RULES.find((r) => r.id === card) : null;

  if (game.phase === 'ending') return <TulipEnding game={game} onExit={onExit} onTo327={onTo327} />;
  if (game.phase === 'ruling')
    return (
      <>
        <TulipRuling
          game={game}
          onNext={(rule) => {
            if (rule) game.act({ type: 'rule', rule });
            game.finish();
            clearSave();
            bump();
            window.scrollTo({ top: 0 });
          }}
        />
        {rule && <RuleCardModal card={rule} onClose={() => setCard(null)} />}
      </>
    );

  const ev = game.night;
  const paperPnl = game.contracts.reduce((a, c) => a + game.paper(c), 0);
  const notional = game.contracts.reduce((a, c) => a + c.price, 0);

  return (
    <div className="tavern">
      <div className="tavern-inner">
        <header className="tavern-head">
          <div>
            <div className="tavern-date">
              {ev.date} · {ev.label}
            </div>
            <div className="tavern-dots" aria-label={`第 ${game.evening + 1} 夜，共 ${EVENINGS.length} 夜`}>
              {EVENINGS.map((e, i) => (
                <i key={e.date} className={cls(i < game.evening && 'past', i === game.evening && 'now', e.kind === 'crash' && 'crash')} title={`${e.date} ${e.label}`} />
              ))}
            </div>
          </div>
          <div className="tavern-purse">
            {council ? (
              <>
                <span>今晚的影响力 {game.influence} / 2</span>
                <span className="energy" style={{ justifyContent: 'flex-end' }}>
                  {[0, 1].map((i) => (
                    <i key={i} className={cls(i < game.influence && 'on')} />
                  ))}
                </span>
                {game.tax && <span>城里钱箱 {fl(game.treasury)}</span>}
                {game.gifts.length > 0 && <span>口袋里 {fl(game.cash)}</span>}
              </>
            ) : (
              <>
                <span>口袋里</span>
                <b>{fl(game.cash)}</b>
                {game.shortDeposit() > 0 && <span>其中押作卖空定金 {fl(game.shortDeposit())}</span>}
              </>
            )}
            {game.faction === 'grower' && <span>花田里还有 {game.bulbs} 份球茎</span>}
          </div>
        </header>

        <div className="scene-frame">
          <PixelScene
            scene="tavern"
            state={{ who: game.quotes.filter((q) => !q.done || council).map((q) => q.npc), empty: ev.kind !== 'normal' }}
            label={`${ev.date} 的金鹿酒馆`}
          />
        </div>
        <div className="host">
          <span className="host-name">
            {HOST.name}（{HOST.title}）
          </span>
          {ev.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {game.evening > 0 && ev.kind === 'normal' && game.impact > 0.02 && <p className="host-aside">“托你的福，今晚大家心里的价都高了一截。”——你上次买得多，桌边的人都看在眼里。</p>}
          {game.evening > 0 && ev.kind === 'normal' && game.impact < -0.02 && <p className="host-aside">“你上回卖了不少，今晚大家都压着价。”</p>}
        </div>

        <div className="tavern-grid">
          <section className="table" aria-label="石板">
            {game.quotes.map((q) => {
              const n = TULIP_NPCS.find((x) => x.id === q.npc)!;
              const b = bubbles.find((x) => x.npc === q.npc);
              return (
                <div key={q.npc} className={cls('seat', q.done && 'gone')}>
                  <div className="seat-head">
                    <PixelPortrait id={n.id} era="1637" size={40} talking={!!b?.pending} mood={ev.kind === 'normal' ? (q.side === 'buy' ? 'smile' : 'neutral') : 'frown'} />
                    <span>
                      <b>{n.name}</b> <span className="seat-title">{n.title}</span>
                      {!council && <span className="seat-means">家底约 {MEANS[n.id]} 盾</span>}
                    </span>
                  </div>
                  <div className={cls('slate', q.side)}>
                    <span className="slate-verb">{q.side === 'buy' ? '想买' : '想卖'}</span>
                    <span className="slate-price">{q.done ? '——' : `${q.price} 盾`}</span>
                    <span className="slate-unit">一份 · 春天交货</span>
                  </div>
                  {game.revealed[q.npc] != null && !q.done && <div className="slate-hint">老板说：底价约 {game.revealed[q.npc]} 盾</div>}
                  {!council && !q.done && q.side === 'buy' && game.depositNeed(q.price) > 0 && (
                    <div className={cls('slate-hint', game.depositShort(q.price) > 0 && 'warn-text')}>
                      你没有球茎可交：卖给他要押 {fl(game.depositNeed(q.price))} 定金{game.depositShort(q.price) > 0 ? '，口袋里不够' : ''}
                    </div>
                  )}
                  {b && <div className={cls('seat-bubble', b.pending && 'typing')}>{b.pending ? '' : b.text}</div>}
                  {!q.done && !council && (
                    <div className="seat-actions">
                      <button className="btn small primary" onClick={() => act(q.npc, 'accept')}>
                        {q.side === 'buy' ? `卖给他 ${q.price}` : `向他买 ${q.price}`}
                      </button>
                      <form
                        className="haggle"
                        onSubmit={(e) => {
                          e.preventDefault();
                          act(q.npc, 'counter');
                        }}
                      >
                        <input
                          id={`offer-${q.npc}`}
                          inputMode="numeric"
                          placeholder="还价"
                          aria-label={`向${n.name}还价`}
                          value={offers[q.npc] ?? ''}
                          onChange={(e) => setOffers({ ...offers, [q.npc]: e.target.value.replace(/\D/g, '') })}
                        />
                        <button className="btn small" disabled={!offers[q.npc]}>
                          还价
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <aside className="ledger">
            {council ? (
              <CouncilBook game={game} />
            ) : (
              <>
            <h3>你的合约簿</h3>
            {game.contracts.length === 0 && <p className="ledger-empty">还没有签任何约。点“向他买”或“卖给他”，就是签下一份春天交货的约定。</p>}
            {game.contracts.map((c) => {
              const n = TULIP_NPCS.find((x) => x.id === c.npc)!;
              const p = game.paper(c);
              // 他欠你的已经超过他的家底：这份“利润”到春天未必收得回来
              const shaky = p > MEANS[c.npc];
              return (
                <div key={c.id} className="ledger-row">
                  <span>
                    {c.side === 'buy' ? '向' : '卖给'}
                    {n.name}
                    <small>
                      {EVENINGS[c.evening].date.slice(5)}
                      {shaky && <span className="warn-text"> · 他欠你的已超过他的家底（约 {MEANS[c.npc]} 盾）</span>}
                    </small>
                  </span>
                  <span className="num">{c.price} 盾</span>
                  <span className={cls('num', p > 0 ? 'gain' : p < 0 ? 'loss' : '')}>{sgn(p)}</span>
                </div>
              );
            })}
            {game.contracts.length > 0 && (
              <div className="ledger-sum">
                <div>
                  <span>合约总额</span>
                  <b className="num">{fl(notional)}</b>
                </div>
                <div title="按今晚大家心里的价算。这只是纸面上的数字：春天之前，没有人真的付过钱。">
                  <span>纸面盈亏</span>
                  <b className={cls('num', paperPnl > 0 ? 'gain' : paperPnl < 0 ? 'loss' : '')}>{sgn(paperPnl)}</b>
                </div>
                <div>
                  <span>相当于手艺人的工钱</span>
                  <b className="num">{(notional / ANNUAL_WAGE).toFixed(1)} 年</b>
                </div>
              </div>
            )}
            <h3 style={{ marginTop: 18 }}>前几晚的成交</h3>
            <ul className="prints">
              {game.prints.slice(0, game.evening).map((ps, i) => (
                <li key={i}>
                  <span>{EVENINGS[i].date.slice(5)}</span>
                  <span className="num">{ps.length ? `${Math.round(ps.reduce((a, b) => a + b, 0) / ps.length)} 盾（${ps.length} 笔）` : '你没有成交'}</span>
                </li>
              ))}
              {game.evening === 0 && <li className="ledger-empty">今晚是第一夜。</li>}
            </ul>
            <p className="ledger-note">每成交一份，买方付给卖方 {WINE_MONEY} 盾酒钱。除此之外，春天之前谁都不用付钱。</p>
            <p className="ledger-note">纸面上的赚头要等春天对方付钱才算数。卖给家底薄的人，价钱再高，他倾家荡产时也只还得出一部分——花传到最后一个人手里，前面每个人都会落空一截。</p>
              </>
            )}
            {council && game.directives().length > 0 && (
              <>
                <h3 style={{ marginTop: 18 }}>市政官的交代</h3>
                <DirectivesList dirs={game.directives()} era="1637" names={councilName} />
              </>
            )}
            <h3 style={{ marginTop: 18 }}>对手动向</h3>
            <ClocksList clocks={game.clocks()} era="1637" />
          </aside>
        </div>

        {game.cards().length > 0 && (
          <section className="tavern-cards">
            <h3>{council ? '今晚你能做的事' : '桌边的手段'}</h3>
            {game.offer && (
              <DraftOffer
                tone="paper"
                cards={game.offerCards()}
                handFull={game.hand.length >= game.maxHand}
                onTake={(id) => {
                  game.act({ type: 'draft', id });
                  saveTulip(game);
                  bump();
                }}
                onSkip={() => {
                  game.act({ type: 'draft', id: null });
                  saveTulip(game);
                  bump();
                }}
              />
            )}
            <CardList
              cards={game.cards()}
              result={(id) => {
                const r = game.cardLog.filter((x) => x.evening === game.evening && x.id === id).at(-1);
                return r && { result: r.result, latest: r === game.cardLog[game.cardLog.length - 1] };
              }}
              onPlay={(id, target) => {
                game.act({ type: 'card', id, target });
                saveTulip(game);
                bump();
              }}
              onConvert={(id) => {
                game.act({ type: 'convert', id });
                saveTulip(game);
                bump();
              }}
            />
          </section>
        )}

        <div className="tavern-foot">
          <span>{council ? '你在角落里记账。桌边的人彼此出价，谈得拢就签。' : '每个人今晚只跟你成交一次；还价两次谈不拢，他就不理你了。'}</span>
          <button className="btn primary" onClick={leave}>
            {game.evening >= EVENINGS.length - 1 ? '离开酒馆，等二月底的消息 →' : '离开酒馆，等下一个夜晚 →'}
          </button>
        </div>
      </div>
      {card === 'forward-intro' && (
        <div className="overlay" onClick={() => setCard(null)}>
          <div className="rule-card paper" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">怎 么 玩</div>
            <h3>在石板上谈价钱</h3>
            <div className="plain">每个人的石板上写着他想买或想卖的价。你可以直接成交，也可以写一个数字还价。他心里有一个不说出口的底价：够到了就成交，够不到他会让一半。</div>
            <div className="why">你买得多，下一晚大家心里的价就会被你抬高一点——市场是人组成的，你也是其中一个。</div>
            <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn primary" onClick={() => setCard(null)}>
                坐下
              </button>
            </div>
          </div>
        </div>
      )}
      {rule && <RuleCardModal card={rule} detail={rule.id === 'leverage' ? `合约总额 ${fl(notional)}，口袋里 ${fl(game.cash)}` : undefined} onClose={() => setCard(null)} />}
    </div>
  );
}

function SettleTable({ s, title }: { s: Settlement; title: string }) {
  return (
    <div className="settle">
      <h4>{title}</h4>
      {s.lines.map((l) => (
        <div key={l.contract.id} className="settle-row">
          <span>
            {l.contract.side === 'buy' ? '买入' : '卖出'} {l.contract.price} 盾
            <small>{l.note}</small>
          </span>
          <span className={cls('num', l.amount > 0 ? 'gain' : l.amount < 0 ? 'loss' : '')}>{sgn(l.amount)}</span>
        </div>
      ))}
      {s.unpaid > 0 && (
        <div className="settle-row">
          <span>
            落空的钱<small>对方倾家荡产，没还上的部分（已从上面扣掉）</small>
          </span>
          <span className="num loss">{fl(s.unpaid)}</span>
        </div>
      )}
      {s.bulbsValue > 0 && (
        <div className="settle-row">
          <span>
            花田里剩下的球茎<small>按四月每份 {APRIL_VALUE} 盾</small>
          </span>
          <span className="num">{fl(s.bulbsValue)}</span>
        </div>
      )}
      <div className="settle-total">
        <span>最后身家</span>
        <b className={cls('num', s.total < 0 && 'loss')}>{fl(s.total)}</b>
      </div>
    </div>
  );
}

const RULES: { id: TulipRule; label: string; detail: string }[] = [
  { id: 'forward', label: '照约履行', detail: '签了就得认：买方付清合约价，收下只值 60 盾的球茎。' },
  { id: 'option', label: '改作期权：付 3.5% 即可解约', detail: '历史上的选择。买方只赔一点，损失落到卖方头上。' },
  { id: 'void', label: '一律作废', detail: '当这个冬天什么都没发生过。谁也不赔，谁也不赚。' },
];

function CouncilBook({ game }: { game: TulipGame }) {
  const heard = game.npcBook.filter((d) => d.heard);
  const tonight = heard.filter((d) => d.evening === game.evening);
  const total = heard.reduce((a, d) => a + d.price, 0);
  const name = (id: string) => TULIP_NPCS.find((n) => n.id === id)?.name ?? id;
  // 集会记录：每个人签下的买约总额（集会后才知道全部）
  const owed = TULIP_NPCS.map((n) => ({ n, buy: game.npcBook.filter((d) => d.buyer === n.id).reduce((a, d) => a + d.price, 0) })).filter((x) => x.buy > 0);
  return (
    <>
      <h3>今晚{game.registered ? '登记' : '听说'}的约定</h3>
      {tonight.length === 0 && <p className="ledger-empty">{game.night.kind === 'crash' ? '一份都没有。买家没有来。' : game.registered ? '还没有人谈拢。' : '没听到什么。'}</p>}
      {tonight.map((d, i) => (
        <div key={i} className="ledger-row">
          <span>
            {name(d.seller)} → {name(d.buyer)}
          </span>
          <span className="num">{d.price} 盾</span>
          <span />
        </div>
      ))}
      <div className="ledger-sum">
        <div>
          <span>你知道的约定</span>
          <b className="num">{heard.length} 份</b>
        </div>
        <div>
          <span>合约总额</span>
          <b className="num">{fl(total)}</b>
        </div>
        <div>
          <span>相当于手艺人的工钱</span>
          <b className="num">{(total / ANNUAL_WAGE).toFixed(0)} 年</b>
        </div>
      </div>
      {!game.registered && <p className="ledger-note">约定不用登记，有些你根本听不到。</p>}
      {game.assembled && (
        <>
          <h3 style={{ marginTop: 16 }}>集会记录：谁签了多少买约</h3>
          {owed.map(({ n, buy }) => (
            <div key={n.id} className="ledger-row">
              <span>
                {n.name}
                <small>家底约 {MEANS[n.id]} 盾</small>
              </span>
              <span className="num">{fl(buy)}</span>
              <span className={cls('num', buy > MEANS[n.id] * 3 && 'loss')}>{(buy / MEANS[n.id]).toFixed(1)} 倍</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function OutcomeTable({ game, rule }: { game: TulipGame; rule: TulipRule }) {
  const o = game.npcOutcome(rule);
  const ruined = new Set(game.ruined(rule));
  return (
    <div className="settle">
      {TULIP_NPCS.map((n) => {
        const relief = game.reliefFor(rule, n.id);
        const v = (o.get(n.id) ?? 0) + relief;
        return (
          <div key={n.id} className="settle-row">
            <span>
              {n.name}
              <small>
                {n.title}
                {relief > 0 ? ` · 救济 ${Math.round(relief)} 盾` : ''}
                {ruined.has(n.id) ? ` · 倾家荡产（家底 ${MEANS[n.id]} 盾）` : ''}
              </small>
            </span>
            <span className={cls('num', v > 0 ? 'gain' : v < 0 ? 'loss' : '')}>{sgn(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function TulipRuling({ game, onNext }: { game: TulipGame; onNext: (rule?: TulipRule) => void }) {
  const fwd = game.settle('forward');
  const opt = game.settle('option');
  const [pick, setPick] = useState<TulipRule>(game.speech ?? 'option');
  if (game.faction === 'council') return <CouncilVote game={game} pick={pick} setPick={setPick} onNext={onNext} />;
  return (
    <div className="setup paper tavern-paper">
      <div className="setup-inner">
        <div style={{ letterSpacing: '0.3em', fontSize: 12, color: 'var(--seal)', fontWeight: 700 }}>1637 年 2 月 24 日 · 阿姆斯特丹</div>
        <h2>花商行会的决定</h2>
        <div className="engraved-rule" />
        <div className="prologue">
          <p>崩盘之后，城里到处是付不起钱的买家和要不到钱的卖家。各地的花商派代表到阿姆斯特丹开会。</p>
          <p>会上宣布：去年十一月底以后签下的这些约定，不再当作非履行不可的买卖，而是当作“选择权”——买方只要付合约价的 3.5%，就可以走开。</p>
        </div>
        <div className="section-label">同样的合约，换一条规则</div>
        {game.contracts.length === 0 ? (
          <p>你一份约都没有签。这条新规则跟你无关——你是这间酒馆里少数能安稳睡觉的人。</p>
        ) : (
          <div className="settle-grid">
            <SettleTable s={fwd} title="如果还按原来的约定（远期）" />
            <SettleTable s={opt} title="按行会的新规则（期权）" />
          </div>
        )}
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>四月球茎挖出来时，一份“瑞士人”实际只能卖 {APRIL_VALUE} 盾左右（重建）。</p>
        <div className="setup-footer">
          <span />
          <button className="btn primary" onClick={() => onNext()}>
            看看这个冬天留下了什么 →
          </button>
        </div>
      </div>
    </div>
  );
}

function CouncilVote({ game, pick, setPick, onNext }: { game: TulipGame; pick: TulipRule; setPick: (r: TulipRule) => void; onNext: (rule?: TulipRule) => void }) {
  const [, bump] = useState(0);
  const t = game.tally(pick);
  return (
    <div className="setup paper tavern-paper">
      <div className="setup-inner">
        <div style={{ letterSpacing: '0.3em', fontSize: 12, color: 'var(--seal)', fontWeight: 700 }}>1637 年 2 月 24 日 · 阿姆斯特丹</div>
        <h2>七位议员，一次表决</h2>
        <div className="engraved-rule" />
        <div className="scene-frame">
          <PixelScene scene="chamber" state={{ who: COUNCIL.map((c) => c.id) }} label="阿姆斯特丹的议事厅" />
        </div>
        <div className="section-label">你提交哪一条？</div>
        <div className="seg" style={{ marginBottom: 12 }}>
          {RULES.map((r) => (
            <button key={r.id} className={cls(pick === r.id && 'on')} onClick={() => setPick(r.id)} style={{ color: 'var(--ink)' }}>
              {r.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 14 }}>{RULES.find((r) => r.id === pick)!.detail}</p>
        {game.speech && game.speech !== pick && <p className="warn-text" style={{ fontSize: 13 }}>你在会上当众力主的是“{RULE_NAME[game.speech]}”。提交别的，会场里的人都会记得。</p>}
        <OutcomeTable game={game} rule={pick} />
        <div className="section-label">如果现在表决</div>
        <div className="settle">
          {COUNCIL.map((c) => (
            <div key={c.id} className="settle-row">
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <PixelPortrait id={c.id} era="1637" size={36} mood={t.votes[c.id] === pick ? 'smile' : 'frown'} />
                <span>
                  {c.name}
                  <small>
                    {c.title} · {c.stance}
                  </small>
                </span>
              </span>
              <span className="num">{RULE_NAME[t.votes[c.id]]}</span>
            </div>
          ))}
          <div className="settle-total">
            <span>
              照约 {t.count.forward} · 期权 {t.count.option} · 作废 {t.count.void}（含你一票）
            </span>
            <b className={cls(t.winner !== pick && 'loss')}>通过：{RULE_NAME[t.winner]}</b>
          </div>
        </div>
        <div className="tavern-cards" style={{ marginTop: 14 }}>
          <h3>表决前最后的奔走（影响力 {game.influence}）</h3>
          <CardList
            cards={game.cards()}
            result={(id) => {
              const r = game.cardLog.filter((x) => x.evening === game.evening && x.id === id).at(-1);
              return r && { result: r.result, latest: r === game.cardLog[game.cardLog.length - 1] };
            }}
            onPlay={(id, target) => {
              game.act({ type: 'card', id, target });
              if (id.startsWith('speech-') && game.speech) setPick(game.speech);
              saveTulip(game);
              bump((x) => x + 1);
            }}
            onConvert={(id) => {
              game.act({ type: 'convert', id });
              saveTulip(game);
              bump((x) => x + 1);
            }}
          />
        </div>
        <div className="setup-footer">
          <span />
          <button className="btn primary" onClick={() => onNext(pick)}>
            提交表决：{RULE_NAME[pick]} →
          </button>
        </div>
      </div>
    </div>
  );
}

function CouncilEnding({ game, onExit, onTo327 }: { game: TulipGame; onExit: () => void; onTo327: () => void }) {
  const o = game.npcOutcome(game.rule);
  const ruined = TULIP_NPCS.filter((n) => game.ruined(game.rule).includes(n.id));
  const histRuined = game.ruined('option');
  const rule = RULES.find((r) => r.id === game.rule)!;
  const verdict = game.councilVerdict();
  const did = [...new Set(game.cardLog.map((c) => c.result.title.replace(/拜访了.*/, '登门游说')))];
  const headline = verdict.exposed
    ? '议员收礼，小册子点名'
    : game.rule === 'option'
      ? '行会议定：约定改作期权，付 3.5% 即可解约'
      : game.rule === 'forward'
        ? '行会议定：签了就得认，照约履行'
        : '行会议定：这个冬天的约定一律作废';
  const losers = TULIP_NPCS.filter((n) => (o.get(n.id) ?? 0) < 0).map((n) => n.name);
  const winners = TULIP_NPCS.filter((n) => (o.get(n.id) ?? 0) > 0).map((n) => n.name);
  return (
    <div className="ending" style={{ background: '#1b130d' }}>
      <div className="ending-inner">
        <div className="front-page paper tavern-paper">
          <div className="scene-frame">
            <PixelScene scene="chamber" state={{ who: COUNCIL.map((c) => c.id), faded: 0.45 }} label="议事厅" />
          </div>
          <div className="masthead">
            <div className="name" style={{ fontSize: 26, letterSpacing: '0.15em' }}>真嘴与贪财的对话</div>
            <div className="meta">
              <span>仿 1637 年流行的对话体小册子</span>
              <span>阿姆斯特丹</span>
            </div>
          </div>
          <div className="headline">{headline}</div>
          <div className="subhead">{ruined.length ? `哈勒姆的金鹿酒馆里，${ruined.map((n) => n.name).join('、')}倾家荡产` : '金鹿酒馆里，没有人倾家荡产'}</div>
          <div className="engraved-rule" />
          <div className="front-grid">
            <div>
              <h4>大会通过：{rule.label}</h4>
              <p>
                {Object.entries(game.votes)
                  .map(([id, r]) => `${id === 'you' ? '你' : COUNCIL.find((c) => c.id === id)!.name}投“${RULE_NAME[r]}”`)
                  .join('，')}
                。
              </p>
              {verdict.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <p>
                在这条规则下，{winners.length ? `${winners.join('、')}拿到了钱` : '没有人拿到钱'}；{losers.length ? `${losers.join('、')}要掏钱` : '也没有人要掏钱'}。
                {game.rule !== 'option' && `按历史上的选择（改作期权），倾家荡产的会是 ${histRuined.length} 个人，而不是 ${ruined.length} 个。`}
              </p>
              <OutcomeTable game={game} rule={game.rule} />
              <p>
                你这个冬天做过的事：{did.length ? did.join('、') : '什么也没做，只是看着'}。威望 <b>{verdict.standing}</b> / 100。
              </p>
              <h4 style={{ marginTop: 14 }}>规则在哪里保护或伤害了人？</h4>
              <p>同样的约定、同样的价格，换一条规则，钱就从一群人的口袋流到另一群人的口袋。没有一条规则对所有人都公平——这正是监管者的难处。</p>
            </div>
            <div className="history-col">
              <h4>历史上的这一天</h4>
              <p style={{ fontSize: 14 }}>1637 年 2 月 24 日，花商行会在阿姆斯特丹开会，宣布此前签下的远期约定可按期权处理：买方付合约价的 3.5% 即可解约。</p>
              <p style={{ fontSize: 14 }}>有经济学家认为，正是这种预期让此前的价格显得疯狂——买方以为自己最多只赔 3.5%。</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onExit}>
            回到标题
          </button>
          <button className="btn primary" onClick={onTo327}>
            下一课：327 · 最后八分钟 →
          </button>
        </div>
      </div>
    </div>
  );
}

function TulipEnding({ game, onExit, onTo327 }: { game: TulipGame; onExit: () => void; onTo327: () => void }) {
  if (game.faction === 'council') return <CouncilEnding game={game} onExit={onExit} onTo327={onTo327} />;
  const fwd = game.settle('forward');
  const opt = game.settle('option');
  const start = game.startWealth;
  const final = opt.total;
  const bought = game.contracts.filter((c) => c.side === 'buy').length;
  const sold = game.contracts.length - bought;
  const ruleHelped = opt.total - fwd.total;
  let headline: string;
  if (game.contracts.length === 0) headline = '一个冬天，一份约也没签';
  else if (fwd.total < 0 && opt.total >= 0) headline = '一纸裁决，救下一个破产的投机客';
  else if (ruleHelped < -50) headline = '卖得最高的人，拿到的最少';
  else if (final > start) headline = '在石板上赚到了真钱';
  else headline = '交了学费的冬天';

  const lessons = [
    {
      q: '价格为什么动？',
      a: game.prints.flat().length
        ? `因为桌边的人愿意出更高的价。你一共成交 ${game.prints.flat().length} 笔，你买得多的晚上，下一晚大家心里的价就被你抬高了。崩盘那一晚，价格跌下来不是因为花变差了，而是因为买家没有来。`
        : '因为桌边的人愿意出更高的价——直到二月三日那一晚，买家没有来。花还是那些花，变的是人。',
    },
    {
      q: '谁赚了谁的钱？',
      a:
        game.contracts.length === 0
          ? '你没有下场。赚到钱的，是在最高处卖出、又碰巧遇到守信买家的人；赔钱的，是在最高处签约买入的人。'
          : `你买入 ${bought} 份、卖出 ${sold} 份。按原来的约定，你最后的身家是 ${fl(fwd.total)}；按行会的新规则，是 ${fl(opt.total)}。`,
    },
    {
      q: '规则在哪里保护或伤害了你？',
      a:
        ruleHelped > 0
          ? `行会把远期改成期权，替你挡下了 ${fl(ruleHelped)} 的损失——这笔损失落到了卖给你的人头上。`
          : ruleHelped < 0
            ? `行会把远期改成期权，让你少拿了 ${fl(-ruleHelped)}——买方付 3.5% 就走了，剩下的损失落到了你头上。`
            : '这条新规则对你没有影响。但对许多人来说，它决定了是倾家荡产还是安然无恙。',
    },
  ];
  if (game.contracts.some((c) => c.side === 'sell') && game.faction === 'speculator')
    lessons.push({
      q: '你卖的花，你有吗？',
      a: '你一个球茎也没有，卖出去的每一份都是“卖空”：赌春天能用更低的价买来交货。这一次价格崩了，你赌对了；可要是价格一直涨，卖空的亏损是没有上限的。所以买家要你先押定金——你能卖多少，取决于你押得起多少。',
    });
  if (fwd.unpaid > 0 || opt.unpaid > 0)
    lessons.push({
      q: '花传到最后，落在谁手里？',
      a: `你账上有一部分“利润”，是别人欠你的钱。可欠你钱的人自己也倾家荡产了：按原来的约定，你有 ${fl(fwd.unpaid)} 收不回来；按行会的新规则，收不回来的是 ${fl(opt.unpaid)}。这就是击鼓传花——每个人都以为自己能在鼓停之前把花传出去，可总有人接在最后，而他付不起，前面所有人的账就都落空一截。`,
    });

  return (
    <div className="ending" style={{ background: '#1b130d' }}>
      <div className="ending-inner">
        <div className="front-page paper tavern-paper">
          <div className="scene-frame">
            <PixelScene scene="tavern" state={{ who: ['jan', 'maritje'], empty: true, faded: 0.45 }} label="春天的酒馆" />
          </div>
          <div className="masthead">
            <div className="name" style={{ fontSize: 26, letterSpacing: '0.15em' }}>真嘴与贪财的对话</div>
            <div className="meta">
              <span>仿 1637 年流行的对话体小册子</span>
              <span>哈勒姆</span>
            </div>
          </div>
          <div className="headline">{headline}</div>
          <div className="subhead">
            开局身家 {fl(start)} → 最后身家 {fl(final)}
            {final < 0 ? `（欠下相当于 ${(-final / ANNUAL_WAGE).toFixed(1)} 年工钱的债）` : ''}
          </div>
          <div className="engraved-rule" />
          <div className="front-grid">
            <div>
              <h4>这一课的三个问题</h4>
              {lessons.map((l) => (
                <div key={l.q} style={{ marginBottom: 12 }}>
                  <b style={{ fontFamily: 'var(--serif)' }}>{l.q}</b>
                  <p style={{ textIndent: 0, margin: '4px 0 0' }}>{l.a}</p>
                </div>
              ))}
            </div>
            <div className="history-col">
              <h4>历史上的这个冬天</h4>
              <p style={{ fontSize: 14 }}>1636 年冬天，荷兰各城的酒馆里，郁金香球茎以“春天交货”的约定反复转手，价格在几个月里涨了许多倍。</p>
              <p style={{ fontSize: 14 }}>1637 年 2 月 3 日，哈勒姆的买家突然不再出价，市场随之崩落。</p>
              <p style={{ fontSize: 14 }}>2 月 24 日，花商行会宣布把这些远期约定改作期权：买方付合约价的 3.5% 即可解约。有经济学家认为，正是这种预期让此前的价格显得疯狂——买方以为自己最多只赔 3.5%。</p>
            </div>
          </div>
        </div>
        <div className="sources" style={{ marginTop: 18 }}>
          {TULIP_SOURCES.map((s) => (
            <div key={s.id} className="source-card paper">
              <h5>{s.title}</h5>
              <div>{s.body}</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                出处：
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.cite}
                  </a>
                ) : (
                  s.cite
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onExit}>
            回到标题
          </button>
          <button className="btn primary" onClick={onTo327}>
            下一课：327 · 最后八分钟 →
          </button>
        </div>
        <p className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
          游戏不构成投资建议。真实市场的风险远比游戏复杂。
        </p>
      </div>
    </div>
  );
}
