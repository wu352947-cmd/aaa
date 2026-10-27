import { useState } from 'react';
import type { CardDef, CardResult, Game } from '../engine/game';
import { cls } from './format';

const COLOR: Record<CardDef['color'], string> = { white: '白', grey: '灰', black: '黑' };
const COLOR_TIP: Record<CardDef['color'], string> = {
  white: '合规手段',
  grey: '游走在规则边缘：会被记下，可能被追究',
  black: '违法：短期收益高，必然留痕',
};
const WHEN: Record<CardDef['when'], string> = { trading: '盘中', night: '收盘后', any: '随时' };

/** 行动卡：按分组摊开，当前时段能用的排在前面 */
export function CardsBody({ game, onPlayed }: { game: Game; onPlayed?: () => void }) {
  const phaseOk = (c: CardDef) => c.when === 'any' || (c.when === 'trading' ? game.phase === 'trading' : game.phase === 'night');
  const latest = game.cardLog[game.cardLog.length - 1];
  return (
    <CardList
      cards={game.cards()}
      phaseOk={phaseOk}
      offPhase={game.phase === 'night' ? '盘中' : '收盘后'}
      result={(id) => {
        const r = game.cardLog.filter((x) => x.day === game.dayIndex && x.id === id).at(-1);
        return r && { result: r.result, time: r.time, latest: r === latest };
      }}
      onPlay={(id, target) => {
        game.act({ type: 'card', id, target });
        onPlayed?.();
      }}
    />
  );
}

/** 卡面列表：与具体剧本无关，郁金香酒馆也用它 */
export function CardList({
  cards,
  phaseOk = () => true,
  offPhase = '',
  result,
  onPlay,
  tone,
}: {
  cards: CardDef[];
  phaseOk?: (c: CardDef) => boolean;
  offPhase?: string;
  result: (id: string) => { result: CardResult; time?: string; latest?: boolean } | undefined;
  onPlay: (id: string, target?: string) => void;
  tone?: 'paper';
}) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [showOther, setShowOther] = useState(false);
  const now = (c: CardDef) => phaseOk(c) && !c.blocked;
  const groups = [...new Set(cards.filter(phaseOk).map((c) => c.group))];
  const other = cards.filter((c) => !phaseOk(c));
  const play = (c: CardDef) => {
    onPlay(c.id, targets[c.id] ?? (c.targets?.length === 1 ? c.targets[0].id : undefined));
    const rest = { ...targets };
    delete rest[c.id];
    setTargets(rest);
  };
  return (
    <div className={cls('cards', tone)}>
      {cards.length === 0 && <p className="faint">这个座位没有可用的手段。</p>}
      {groups.map((gname) => {
        const list = cards.filter((c) => c.group === gname && phaseOk(c)).sort((a, b) => Number(now(b)) - Number(now(a)));
        return (
          <div key={gname} className="card-group">
            <div className="card-group-title">{gname}</div>
            {list.map((c) => {
              const usable = now(c);
              const tgt = targets[c.id] ?? (c.targets?.length === 1 ? c.targets[0].id : undefined);
              const res = result(c.id);
              return (
                <div key={c.id} className={cls('action-card', c.color, !usable && 'off')}>
                  <div className="ac-head">
                    <span className={cls('ac-color', c.color)} title={COLOR_TIP[c.color]}>
                      {COLOR[c.color]}
                    </span>
                    <b>{c.name}</b>
                    {c.status && <span className="ac-status">{c.status}</span>}
                    <span className="ac-when">{WHEN[c.when]}</span>
                  </div>
                  <div className="ac-does">{c.does}</div>
                  <div className="ac-cost">代价：{c.cost}</div>
                  {c.targets && c.targets.length > 1 && usable && (
                    <div className="ac-targets">
                      {c.targets.map((t) => (
                        <button key={t.id} className={cls(tgt === t.id && 'on')} onClick={() => setTargets({ ...targets, [c.id]: t.id })}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="ac-foot">
                    {c.blocked ? (
                      <span className="faint">{c.blocked}</span>
                    ) : !usable ? (
                      <span className="faint">{WHEN[c.when]}才能用</span>
                    ) : (
                      <span />
                    )}
                    <button className={cls('btn small', usable && !(c.targets && !tgt) && 'primary')} disabled={!usable || (!!c.targets && !tgt)} onClick={() => play(c)}>
                      {c.targets && !tgt ? '先选对象' : '打出'}
                      {c.key && <span className="kbd">{c.key.toUpperCase()}</span>}
                    </button>
                  </div>
                  {res && (
                    <div className={cls('card-result', !res.result.ok && 'fail', res.latest && 'latest')}>
                      <b>{res.result.title}</b>
                      {res.time && <span className="faint"> · {res.time}</span>}
                      {res.result.effects.length > 0 && <div className="fx">{res.result.effects.join(' · ')}</div>}
                      {res.result.reply && (
                        <div className="reply">
                          {res.result.reply.who}：“{res.result.reply.text}”
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {other.length > 0 && (
        <div className="card-group">
          <button className="btn ghost small" onClick={() => setShowOther(!showOther)}>
            {showOther ? '收起' : '看看'}{offPhase}才能用的 {other.length} 张
          </button>
          {showOther &&
            other.map((c) => (
              <div key={c.id} className={cls('action-card', c.color, 'off')}>
                <div className="ac-head">
                  <span className={cls('ac-color', c.color)}>{COLOR[c.color]}</span>
                  <b>{c.name}</b>
                  {c.status && <span className="ac-status">{c.status}</span>}
                  <span className="ac-when">{WHEN[c.when]}</span>
                </div>
                <div className="ac-does">{c.does}</div>
                <div className="ac-cost">代价：{c.cost}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function CardsDrawer({ game, onClose, onPlayed }: { game: Game; onClose: () => void; onPlayed: () => void }) {
  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>手段</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          精力{' '}
          <span className="energy">
            {Array.from({ length: game.maxEnergy }, (_, i) => (
              <i key={i} className={cls(i < game.energy && 'on')} />
            ))}
          </span>
        </span>
        <button className="btn ghost small" onClick={onClose}>
          关闭 <span className="kbd">Esc</span>
        </button>
      </div>
      <div className="drawer-body">
        <CardsBody game={game} onPlayed={onPlayed} />
      </div>
    </div>
  );
}
