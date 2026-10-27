import { useState } from 'react';
import type { Scenario } from '../engine/game';
import { cls } from './format';
import { PixelScene } from './Pixel';
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
  onStart: (which: 's327' | 'tulip' | 'gme2021') => void;
  onContinue: () => void;
  onSettings: () => void;
}) {
  const [archive, setArchive] = useState(false);
  const [which, setWhich] = useState<'s327' | 'tulip' | 'gme2021'>(save ? (save.scenario as 's327' | 'tulip' | 'gme2021') : 'tulip');
  return (
    <div className="title-screen paper">
      <div className="title-card">
        <div className="title-hero scene-frame">
          {which === 'tulip' ? (
            <PixelScene scene="tavern" state={{ who: ['jan', 'pieter', 'cornelis', 'maritje', 'dirck', 'hendrick'] }} label="1637 年，哈勒姆的金鹿酒馆" />
          ) : which === 's327' ? (
            <PixelScene scene="floor" state={{ heat: 0.7, dir: 1 }} label="1995 年，上海的交易大厅" />
          ) : (
            <PixelScene scene="room" state={{ heat: 0.8, dir: 1 }} label="2021 年，纽约的一间卧室" />
          )}
        </div>
        <h1>筹码</h1>
        <div className="en">C H I P S</div>
        <div className="tagline">价格取自史料，规则取自条文，胜负取决于人。</div>
        <div className="title-tickets" role="radiogroup" aria-label="选择剧本">
          <button className={cls('scenario-ticket', which === 'tulip' && 'on')} role="radio" aria-checked={which === 'tulip'} onClick={() => setWhich('tulip')}>
            <div className="seal" style={{ fontSize: 16 }}>1637</div>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 18 }}>酒馆里的花</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>1636–37 · 荷兰哈勒姆 · 新手第一课</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>没有 K 线。七个夜晚，一桌人，几块石板。约 15 分钟。</div>
            </div>
          </button>
          <button className={cls('scenario-ticket', which === 's327' && 'on')} role="radio" aria-checked={which === 's327'} onClick={() => setWhich('s327')}>
            <div className="seal">327</div>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 18 }}>{scenario.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{scenario.subtitle}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>五个交易日的布局，一个决战日。五个可扮演的座位。</div>
            </div>
          </button>
          <button className={cls('scenario-ticket', which === 'gme2021' && 'on')} role="radio" aria-checked={which === 'gme2021'} onClick={() => setWhich('gme2021')}>
            <div className="seal" style={{ fontSize: 16 }}>2021</div>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 18 }}>散户起义</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>2021 · 纽约 · 游戏零售股逼空</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>没有涨跌停，只有熔断式暂停。论坛散户、做空基金、零佣金券商，三个座位。</div>
            </div>
          </button>
        </div>
        <div className="title-actions">
          {save && (
            <button className="btn primary" onClick={onContinue} title={`存于 ${new Date(save.savedAt).toLocaleString('zh-CN')}`}>
              继续：{save.label}
            </button>
          )}
          <button className={cls('btn', !save && 'primary')} onClick={() => onStart(which)}>
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
