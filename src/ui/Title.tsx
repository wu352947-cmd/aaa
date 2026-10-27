import { useState } from 'react';
import type { Scenario } from '../engine/game';
import { cls } from './format';
import type { SaveData } from './save';

export function Title({
  scenario,
  save,
  onStart,
  onContinue,
  onSettings,
}: {
  scenario: Scenario;
  save: SaveData | null;
  onStart: () => void;
  onContinue: () => void;
  onSettings: () => void;
}) {
  const [archive, setArchive] = useState(false);
  return (
    <div className="title-screen paper">
      <div className="title-card">
        <h1>筹码</h1>
        <div className="en">C H I P S</div>
        <div className="tagline">价格取自史料，规则取自条文，胜负取决于人。</div>
        <div className="scenario-ticket">
          <div className="seal">327</div>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 18 }}>{scenario.title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{scenario.subtitle} · 垂直切片</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>五个交易日的布局，一个决战日。三个可扮演的座位。</div>
          </div>
        </div>
        <div className="title-actions">
          {save && (
            <button className="btn primary" onClick={onContinue} title={`存于 ${new Date(save.savedAt).toLocaleString('zh-CN')}`}>
              继续：{save.label}
            </button>
          )}
          <button className={cls('btn', !save && 'primary')} onClick={onStart}>
            {save ? '新的一局' : '开始'}
          </button>
          <button className="btn" onClick={() => setArchive(!archive)}>
            史料馆
          </button>
          <button className="btn" onClick={onSettings}>
            设置
          </button>
        </div>
        {archive && (
          <div style={{ textAlign: 'left', marginTop: 24 }}>
            {scenario.sources.map((s) => (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <b style={{ fontFamily: 'var(--serif)' }}>{s.title}</b>
                <div style={{ fontSize: 13 }}>{s.body}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  出处：
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--seal)' }}>
                      {s.cite}
                    </a>
                  ) : (
                    s.cite
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className={cls('disclaimer')}>游戏不涉及真实资金，不构成投资建议。真实市场的风险远比游戏复杂。人物与机构均为化名合成。</div>
      </div>
    </div>
  );
}
