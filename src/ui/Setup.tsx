import { useState } from 'react';
import type { Scenario } from '../engine/game';
import { cls } from './format';
import { PixelScene } from './Pixel';
import { DIFFICULTIES, type Difficulty } from './tutorial';

const PLAYED = 'chouma.played';
export function markPlayed(): void {
  try {
    localStorage.setItem(PLAYED, '1');
  } catch {
    /* 忽略 */
  }
}
function playedBefore(): boolean {
  try {
    return !!localStorage.getItem(PLAYED);
  } catch {
    return false;
  }
}

export function Setup({ scenario, onBegin, onBack }: { scenario: Scenario; onBegin: (faction: string, principle: string, seed: string, difficulty: Difficulty) => void; onBack: () => void }) {
  const [faction, setFaction] = useState(() => scenario.factions.find((x) => !x.locked)!.id);
  const [principle, setPrinciple] = useState(scenario.principles[0].id);
  // 第一次玩默认新手：界面逐层解锁
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (playedBefore() ? 'standard' : 'novice'));
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 8));
  const cards = (scenario.setupRules ?? []).map((id) => scenario.ruleCards.find((r) => r.id === id)).filter((c) => !!c);
  const f = scenario.factions.find((x) => x.id === faction)!;
  return (
    <div className="setup paper">
      <div className="setup-inner">
        <div className="scene-frame">
          {scenario.id === 'gme2021' ? <PixelScene scene="room" state={{ heat: 0.5 }} label="2021 年，纽约" /> : <PixelScene scene="floor" state={{ heat: 0.5 }} label="1995 年，上海" />}
        </div>
        <div className="muted" style={{ color: 'var(--ink-soft)', letterSpacing: '0.3em', fontSize: 12 }}>
          序 幕
        </div>
        <h2>{scenario.title}</h2>
        <div className="engraved-rule" />
        <div className="prologue">
          {scenario.prologue.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="section-label">当年的规则</div>
        <div className="rule-strip">
          {cards.map((c) => (
            <div key={c.id} className="rule-mini" title={c.why}>
              <b>{c.title}</b>
              <div>{c.plain}</div>
            </div>
          ))}
        </div>

        <div className="section-label">选择你的座位</div>
        <div className="faction-grid">
          {scenario.factions.map((x) => (
            <button key={x.id} className={cls('faction', faction === x.id && 'selected', x.locked && 'locked')} onClick={() => !x.locked && setFaction(x.id)} disabled={!!x.locked}>
              <h3>{x.name}</h3>
              <div className="role">{x.role}</div>
              <p>{x.blurb}</p>
              {x.locked ? <div className="secret">{x.locked}</div> : faction === x.id && <div className="secret">秘密目标：{x.secretGoal}</div>}
            </button>
          ))}
        </div>

        <div className="section-label">给自己定一条底线</div>
        <p style={{ marginTop: -4, fontSize: 13, color: 'var(--ink-soft)' }}>越过它不会扣分，但会改变画面的颜色和结局的文字。</p>
        <div className="principles">
          {scenario.principles.map((p) => (
            <button key={p.id} className={cls('principle', principle === p.id && 'selected')} onClick={() => setPrinciple(p.id)}>
              <b style={{ fontFamily: 'var(--serif)' }}>{p.label}</b>
              <div style={{ fontSize: 12 }}>{p.desc}</div>
            </button>
          ))}
        </div>

        <div className="section-label">难度</div>
        <p style={{ marginTop: -4, fontSize: 13, color: 'var(--ink-soft)' }}>难度只改界面和节奏，市场本身不变：同一个种子，在哪一档都是同一局。</p>
        <div className="principles">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} className={cls('principle', difficulty === d.id && 'selected')} onClick={() => setDifficulty(d.id)}>
              <b style={{ fontFamily: 'var(--serif)' }}>{d.name}</b>
              <div style={{ fontSize: 12 }}>{d.desc}</div>
            </button>
          ))}
        </div>

        <div className="setup-footer">
          <button className="btn" onClick={onBack}>
            ← 返回
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            随机种子{' '}
            <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ width: 90, background: 'transparent', border: '1px solid var(--ink-soft)', padding: '2px 6px' }} />
            （同一种子 + 同样的操作 = 同一局）
          </span>
          <button className="btn primary" onClick={() => onBegin(faction, principle, seed || 'chouma', difficulty)}>
            以「{f.name}」入场 →
          </button>
        </div>
      </div>
    </div>
  );
}
