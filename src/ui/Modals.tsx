import { useEffect, useMemo, useRef, useState } from 'react';
import type { Decision, RuleCardDef } from '../engine/game';
import { speak } from '../llm/director';
import { ERA_1995_SH } from '../llm/era';
import { saveLlm, type LlmSettings } from '../llm/settings';
import { NPCS } from '../scenarios/s327/data';
import { cls } from './format';

export function RuleCardModal({ card, detail, onClose }: { card: RuleCardDef; detail?: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="rule-card paper" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">规 则 卡</div>
        <h3>{card.title}</h3>
        {detail && <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--seal)' }}>{detail}</div>}
        <div className="plain">{card.plain}</div>
        <div className="why">
          <b>为什么有这条规则：</b>
          {card.why}
        </div>
        <div className="src">出处：{card.source}</div>
        <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn primary" onClick={onClose}>
            明白了
          </button>
        </div>
      </div>
    </div>
  );
}

export function DecisionModal({ d: raw, onChoose, scale = 1 }: { d: Decision; onChoose: (id: string) => void; scale?: number }) {
  // 难度改倒计时的长短
  const d = useMemo(() => (raw.countdown ? { ...raw, countdown: Math.max(5, Math.round(raw.countdown * scale)) } : raw), [raw, scale]);
  const [left, setLeft] = useState(d.countdown ?? 0);
  const fired = useRef(false);
  const choose = (id: string) => {
    if (fired.current) return;
    fired.current = true;
    onChoose(id);
  };
  useEffect(() => {
    if (!d.countdown) return;
    setLeft(d.countdown);
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [d]);
  useEffect(() => {
    if (d.countdown && left <= 0) choose(d.choices[0].id);
  });
  return (
    <div className="overlay">
      <div className="modal decision">
        <div style={{ fontSize: 12, color: 'var(--seal)', letterSpacing: '0.2em', fontWeight: 700 }}>关 键 时 刻</div>
        <h3>{d.title}</h3>
        <p style={{ margin: '6px 0 4px', whiteSpace: 'pre-line' }}>{d.body}</p>
        {d.choices.map((c) => (
          <button key={c.id} className={cls('choice', c.danger && 'danger')} onClick={() => choose(c.id)}>
            <b>{c.label}</b>
            <small>{c.detail}</small>
          </button>
        ))}
        {d.countdown ? (
          <>
            <div className="countdown">
              <div style={{ width: `${(Math.max(0, left) / d.countdown) * 100}%` }} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {Math.max(0, left)} 秒后默认选择「{d.choices[0].label}」
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export interface UiSettings {
  colors: 'cn' | 'us' | 'cb';
  motion: 'full' | 'reduced';
  mentor: boolean;
  sound: boolean;
  /** 交易屏上方的像素场景条 */
  scenes?: boolean;
}

export function SettingsModal({
  llm,
  setLlm,
  ui,
  setUi,
  onClose,
}: {
  llm: LlmSettings;
  setLlm: (s: LlmSettings) => void;
  ui: UiSettings;
  setUi: (s: UiSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(llm);
  const [test, setTest] = useState<string>('');
  const upd = (p: Partial<LlmSettings>) => setDraft({ ...draft, ...p });
  const runTest = async () => {
    setTest('连接中…');
    const line = await speak({ ...draft, enabled: true }, NPCS.find((n) => n.id === 'zhou')!, ERA_1995_SH, {
      npcId: 'zhou',
      verb: 'chat',
      playerMove: '跟老周打个招呼',
      convey: ['欢迎来到场内', '看盘先看席位'],
      tone: 'warm',
      numbers: [],
      date: '1995-02-16 9:30',
      fallback: [],
    });
    setTest(
      line.source === 'llm'
        ? `✓ 连接成功：「${line.text}」${line.rejected ? `（第一稿被校验拦下：${line.rejected.join('；')}）` : ''}`
        : `✗ 未能使用模型台词：${line.rejected?.join('；') ?? '未知原因'}`,
    );
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(600px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <h3>设置</h3>
        <div className="section-label" style={{ color: 'var(--text)', fontSize: 15 }}>
          台词 AI（OpenAI 兼容接口）
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          不开启时，人物用内置模板说话，游戏完整可玩。开启后，人物台词由模型改写：引擎决定说什么、真话还是谎话，模型只决定怎么说；每句台词都要通过数字、时代与“未来知识”校验，不合格就重写或退回模板。台词不影响任何数值与结局。
        </p>
        <label className="check">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
          启用模型台词
        </label>
        <div className="field" style={{ marginTop: 10 }}>
          <label>接口地址（会自动补 /chat/completions）</label>
          <input value={draft.baseUrl} onChange={(e) => upd({ baseUrl: e.target.value })} placeholder="https://api.deepseek.com" />
        </div>
        <div className="field">
          <label>API Key（只保存在本机浏览器）</label>
          <input type="password" value={draft.apiKey} onChange={(e) => upd({ apiKey: e.target.value })} placeholder="sk-…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
          <div className="field">
            <label>模型</label>
            <input value={draft.model} onChange={(e) => upd({ model: e.target.value })} placeholder="deepseek-chat" />
          </div>
          <div className="field">
            <label>温度 {draft.temperature.toFixed(1)}</label>
            <input type="range" min={0} max={1.5} step={0.1} value={draft.temperature} onChange={(e) => upd({ temperature: +e.target.value })} />
          </div>
        </div>
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          若浏览器报跨域错误：在项目根目录 .env.local 写入 LLM_PROXY_TARGET=https://api.deepseek.com，重启 npm run dev，再把接口地址填成 /llm。
        </p>
        <button className="btn small" onClick={runTest}>
          测试连接
        </button>
        {test && <div className={test.startsWith('✓') ? 'warn-box' : 'danger-box'}>{test}</div>}

        <div className="section-label" style={{ color: 'var(--text)', fontSize: 15 }}>
          显示
        </div>
        <div className="field">
          <label>涨跌配色</label>
          <div className="seg">
            {(
              [
                ['cn', '红涨绿跌'],
                ['us', '绿涨红跌'],
                ['cb', '色弱友好（蓝 / 橙）'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={cls(ui.colors === k && 'on')} onClick={() => setUi({ ...ui, colors: k })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={ui.motion === 'reduced'} onChange={(e) => setUi({ ...ui, motion: e.target.checked ? 'reduced' : 'full' })} />
          减弱动效
        </label>
        <label className="check">
          <input type="checkbox" checked={ui.mentor} onChange={(e) => setUi({ ...ui, mentor: e.target.checked })} />
          显示老交易员导师的提醒（他也有自己的仓位，建议不一定对）
        </label>
        <label className="check">
          <input type="checkbox" checked={ui.sound} onChange={(e) => setUi({ ...ui, sound: e.target.checked })} />
          声音：交易大厅的人声随成交量起落，仓位越危险心跳越快，关键时刻响钟
        </label>
        <label className="check">
          <input type="checkbox" checked={ui.scenes !== false} onChange={(e) => setUi({ ...ui, scenes: e.target.checked })} />
          交易屏上方显示像素场景（交易大厅随成交量热闹或冷清）
        </label>
        <div className="actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setLlm(draft);
              saveLlm(draft);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
