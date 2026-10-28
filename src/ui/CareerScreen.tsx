import { useState } from 'react';
import { biography, choose, currentTurn, fmtWealth, newCareer, SEAT_NAME, TURN_COUNT, type Career } from '../career/career';
import { S327 } from '../scenarios/s327';
import { cls } from './format';
import { PixelScene } from './Pixel';
import { DIFFICULTIES, type Difficulty } from './tutorial';

const STEPS: { id: Career['step']; label: string }[] = [
  { id: 'ch1', label: '1995 · 大户室' },
  { id: 'interlude', label: '那些年' },
  { id: 'ch2', label: '2021 · 逼空' },
  { id: 'done', label: '生涯传记' },
];

/** 生涯模式：开一段人生、那些年的转折点、两章之间的履历、最后的传记 */
export function CareerScreen({
  career,
  onChange,
  onPlay,
  onTitle,
}: {
  career: Career | null;
  onChange: (c: Career | null) => void;
  onPlay: () => void;
  onTitle: () => void;
}) {
  if (!career) return <CareerStart onBegin={onChange} onTitle={onTitle} />;
  if (career.step === 'done') return <Bio career={career} onAgain={() => onChange(null)} onTitle={onTitle} />;
  const c = career;
  const turn = currentTurn(c);
  const at = STEPS.findIndex((s) => s.id === c.step);
  return (
    <div className="setup paper career">
      <div className="setup-inner">
        <div className="career-steps">
          {STEPS.map((s, i) => (
            <span key={s.id} className={cls(i < at && 'past', i === at && 'now')}>
              {s.label}
            </span>
          ))}
        </div>
        <CareerSheet c={c} />

        {c.step === 'ch1' && (
          <div className="career-panel">
            <div className="scene-frame">
              <PixelScene scene="floor" state={{ heat: 0.5 }} label="1995 年，上海" />
            </div>
            <h2>第一章 · 1995 年的大户室</h2>
            <p>你二十五岁，带着八万块积蓄挤进证券营业部的大户室。327 国债期货正在打一场多空大战，你只是一个散户。</p>
            <p className="faint">这一章打完，你的钱、声望和档案会一路带下去。</p>
            <button className="btn primary" onClick={onPlay}>
              走进大户室 →
            </button>
          </div>
        )}

        {c.step === 'interlude' && turn && (
          <div className="career-panel">
            <div className="career-year">{turn.year}</div>
            <h2>{turn.title}</h2>
            <p>{turn.body}</p>
            <div className="career-choices">
              {turn.choices.map((ch) => (
                <button key={ch.id} className={cls('choice', ch.color === 'black' && 'danger', ch.color === 'grey' && 'grey')} onClick={() => onChange(choose(c, ch.id))}>
                  <b>{ch.label}</b>
                  <small>{ch.detail}</small>
                </button>
              ))}
            </div>
            <p className="faint">
              那些年 · 第 {c.next + 1} / {TURN_COUNT} 个转折点
            </p>
          </div>
        )}

        {c.step === 'ch2' && (
          <div className="career-panel">
            <div className="scene-frame">
              <PixelScene scene="room" state={{ heat: 0.6 }} label="2021 年，纽约" />
            </div>
            <h2>第二章 · 2021 年的逼空</h2>
            <p>
              你五十一岁。这些年走的路，把你带到了「{SEAT_NAME[c.path ?? 'retail']}」的位子上。
              {c.path === 'retail' ? `你带着 ${fmtWealth(c.wealth)}（约 ${Math.round(c.wealth / 6.5).toLocaleString()} 美元）进场。` : '公司的钱不是你的钱，但输赢会落到你头上。'}
            </p>
            {c.heat > 0 && <p className="faint">你的监管档案跟着你来了：开局热度 {Math.min(60, Math.round(c.heat * 0.6))}。</p>}
            <button className="btn primary" onClick={onPlay}>
              进入 2021 年 →
            </button>
          </div>
        )}

        {c.events.length > 0 && (
          <div className="career-log">
            <div className="section-label">履历</div>
            {c.chapters[0] && (
              <p>
                <b>1995</b> {c.chapters[0].title}：{c.chapters[0].headline}
              </p>
            )}
            {c.events.map((e) => (
              <p key={e.id}>
                <b>{e.year}</b> {e.title} · {e.choice}。{e.note} <span className="faint">（身家 {fmtWealth(e.wealth)}）</span>
              </p>
            ))}
          </div>
        )}

        <div className="setup-footer">
          <button className="btn" onClick={onTitle}>
            ← 回到标题
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              if (window.confirm('放弃这段人生，从头开始？')) onChange(null);
            }}
          >
            放弃这段人生
          </button>
        </div>
      </div>
    </div>
  );
}

function CareerSheet({ c }: { c: Career }) {
  return (
    <div className="career-sheet">
      <div>
        身家<b>{fmtWealth(c.wealth)}</b>
      </div>
      <div>
        声望<b>{c.reputation}</b>
      </div>
      <div title="只降不清零：带进下一章">
        监管档案<b>{c.heat}</b>
      </div>
      <div>
        留痕的事<b>{c.dirty.length} 件</b>
      </div>
      <div>
        收到的信<b>{c.letters} 封</b>
      </div>
      <div>
        越过底线<b>{c.lines} 次</b>
      </div>
    </div>
  );
}

function CareerStart({ onBegin, onTitle }: { onBegin: (c: Career) => void; onTitle: () => void }) {
  const [principle, setPrinciple] = useState(S327.principles[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 8));
  return (
    <div className="setup paper career">
      <div className="setup-inner">
        <div className="scene-frame">
          <PixelScene scene="floor" state={{ heat: 0.4 }} label="1995 年，上海" />
        </div>
        <div className="muted" style={{ color: 'var(--ink-soft)', letterSpacing: '0.3em', fontSize: 12 }}>
          生 涯
        </div>
        <h2>从大户室到华尔街</h2>
        <div className="engraved-rule" />
        <div className="prologue">
          <p>1995 年，你二十五岁，带着八万块走进上海的证券营业部。2021 年，你五十一岁，坐在纽约的某个位子上，看着一只游戏零售股涨了一百倍。</p>
          <p>中间的二十六年，是一连串的选择：留下还是南下，跟庄还是守规矩，配资还是收手。钱、声望和监管档案一路跟着你；旧账会在后面的年份里被翻出来。你走的路，决定你 2021 年坐哪个座位。</p>
          <p>最后，报纸会给你写一页：风光的是头版，栽了的是讣告。</p>
        </div>

        <div className="section-label">给自己定一条底线</div>
        <p style={{ marginTop: -4, fontSize: 13, color: 'var(--ink-soft)' }}>这一生都算数。</p>
        <div className="principles">
          {S327.principles.map((p) => (
            <button key={p.id} className={cls('principle', principle === p.id && 'selected')} onClick={() => setPrinciple(p.id)}>
              <b style={{ fontFamily: 'var(--serif)' }}>{p.label}</b>
              <div style={{ fontSize: 12 }}>{p.desc}</div>
            </button>
          ))}
        </div>

        <div className="section-label">难度</div>
        <div className="principles">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} className={cls('principle', difficulty === d.id && 'selected')} onClick={() => setDifficulty(d.id)}>
              <b style={{ fontFamily: 'var(--serif)' }}>{d.name}</b>
              <div style={{ fontSize: 12 }}>{d.desc}</div>
            </button>
          ))}
        </div>

        <div className="setup-footer">
          <button className="btn" onClick={onTitle}>
            ← 返回
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            随机种子{' '}
            <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ width: 90, background: 'transparent', border: '1px solid var(--ink-soft)', padding: '2px 6px' }} />
            （同一种子 + 同样的选择 = 同一段人生）
          </span>
          <button className="btn primary" onClick={() => onBegin(newCareer(seed || 'chouma', principle, difficulty))}>
            开始这一生 →
          </button>
        </div>
      </div>
    </div>
  );
}

function Bio({ career, onAgain, onTitle }: { career: Career; onAgain: () => void; onTitle: () => void }) {
  const b = biography(career);
  return (
    <div className="ending" style={{ background: '#0b0c10' }}>
      <div className="ending-inner">
      <div className="front-page paper">
        <div className="masthead">
          <div className="name">{b.kind === 'obituary' ? '讣 告' : '财 经 人 物'}</div>
          <div className="meta">
            <span>2021 年</span>
            <span>生涯传记 · 种子 {career.seed}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <div className="headline" style={{ margin: 0 }}>
            {b.headline}
          </div>
          <span className="archetype">{b.archetype}</span>
        </div>
        <div className="subhead">{b.sub}</div>
        <div className="engraved-rule" />
        <div className="front-grid">
          <div>
            {b.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="history-col">
            <h4>身家曲线</h4>
            <WealthCurve curve={b.curve} />
            <div className="stats">
              {b.stats.map(([k, v]) => (
                <div key={k}>
                  {k}
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28 }}>
          <button className="btn" onClick={onTitle}>
            回到标题
          </button>
          <button className="btn primary" onClick={onAgain}>
            再活一次
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/** 对数刻度的身家曲线：八万块到几个亿要放在一张图里 */
function WealthCurve({ curve }: { curve: { year: string; wealth: number }[] }) {
  const W = 320;
  const H = 150;
  const pad = 24;
  const ys = curve.map((p) => Math.log10(Math.max(1000, p.wealth)));
  const lo = Math.min(...ys, Math.log10(20_000));
  const hi = Math.max(...ys, Math.log10(200_000));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, curve.length - 1);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const pts = ys.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wealth-curve" role="img" aria-label="身家曲线">
      <line x1={pad} x2={W - pad} y1={y(Math.log10(80_000))} y2={y(Math.log10(80_000))} className="base" />
      <polyline points={pts} fill="none" className="line" />
      {curve.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(ys[i])} r={3} className="dot" />
          {(i === 0 || i === curve.length - 1 || (i % 2 === 0 && i < curve.length - 2)) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" className="lbl">
              {p.year}
            </text>
          )}
        </g>
      ))}
      <text x={W - pad} y={14} textAnchor="end" className="val">
        {fmtWealth(curve[curve.length - 1].wealth)}
      </text>
    </svg>
  );
}

