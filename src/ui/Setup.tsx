import { useState } from 'react';
import type { Scenario } from '../engine/game';
import { cls } from './format';

export function Setup({ scenario, onBegin, onBack }: { scenario: Scenario; onBegin: (faction: string, principle: string, seed: string) => void; onBack: () => void }) {
  const [faction, setFaction] = useState('short');
  const [principle, setPrinciple] = useState(scenario.principles[0].id);
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 8));
  const cards = ['no-price-limit', 'margin', 'position-limit', 'daily-settlement'].map((id) => scenario.ruleCards.find((r) => r.id === id)!);
  const f = scenario.factions.find((x) => x.id === faction)!;
  return (
    <div className="setup paper">
      <div className="setup-inner">
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

        <div className="setup-footer">
          <button className="btn" onClick={onBack}>
            ← 返回
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            随机种子{' '}
            <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ width: 90, background: 'transparent', border: '1px solid var(--ink-soft)', padding: '2px 6px' }} />
            （同一种子 + 同样的操作 = 同一局）
          </span>
          <button className="btn primary" onClick={() => onBegin(faction, principle, seed || 'chouma')}>
            以「{f.name}」入场 →
          </button>
        </div>
      </div>
    </div>
  );
}
