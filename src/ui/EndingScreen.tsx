import type { Game } from '../engine/game';
import { Chart } from './Chart';
import { cls } from './format';
import { Recap } from './Night';

const QUAD: [string, string][] = [
  ['长青者', '慢 · 合规'],
  ['猎手', '快 · 合规'],
  ['蛀虫', '慢 · 越线'],
  ['流星', '快 · 越线'],
];

export function EndingScreen({ game, onAgain, onTitle }: { game: Game; onAgain: () => void; onTitle: () => void }) {
  const e = game.ending!;
  return (
    <div className="ending" style={{ background: '#0b0c10' }}>
      <div className="ending-inner">
        <div className="front-page paper">
          <div className="masthead">
            <div className="name">{game.scenario.paperName ?? '财经报'}</div>
            <div className="meta">
              <span>{game.scenario.endingDate ?? ''}</span>
              <span>号外</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <div className="headline" style={{ margin: 0 }}>
              {e.headline}
            </div>
            <span className="archetype">{e.archetype}</span>
          </div>
          <div className="subhead">{e.subhead}</div>
          <div className="engraved-rule" />
          <div className="front-grid">
            <div>
              <h4>你的结局：{e.title}</h4>
              <p style={{ color: 'var(--seal)', textIndent: 0 }}>{e.ruled}</p>
              {e.body.map((b, i) => (
                <p key={i}>{b}</p>
              ))}
              <div className="stats">
                {e.stats.map(([k, v]) => (
                  <div key={k}>
                    {k}
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="history-col">
              <h4>历史上的这一天</h4>
              {e.history.map((h, i) => (
                <p key={i} style={{ fontSize: 14 }}>
                  {h}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 18, marginTop: 18 }}>
          <div className="recap">
            <h3>决战日走势 · 你的市场 vs 真实历史</h3>
            <div className="chart-legend" style={{ margin: '4px 0 0', justifyContent: 'flex-start' }}>
              <span>
                <i className="legend-line" />
                这一局
              </span>
              <span>
                <i className="legend-line hist" />
                真实历史（重建）
              </span>
            </div>
            <div className="ending-chart">
              <Chart game={game} rev={0} mode="intraday" voidFrom={game.flags.voided ? (game.flags.voidedT as number) : null} showPosition={false} />
            </div>
          </div>
          <div className="recap">
            <h3>历史偏离度</h3>
            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
              {e.deviation.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            <h3 style={{ marginTop: 14 }}>致富路径 · 速度 × 合规性</h3>
            <div className="quad paper" style={{ marginTop: 8 }}>
              {QUAD.map(([k, sub]) => (
                <div key={k} className={cls(e.archetype === k && 'on')}>
                  <span style={{ textAlign: 'center' }}>
                    {k}
                    <br />
                    <small style={{ fontSize: 10 }}>{sub}</small>
                  </span>
                </div>
              ))}
            </div>
            {e.archetype === '出局者' && <p className="muted" style={{ fontSize: 13 }}>你没能走到终点。</p>}
            {(e.archetype === '守门人' || e.archetype === '旁观者') && (
              <p className="muted" style={{ fontSize: 13 }}>
                你没有下单，这张图不属于你。{e.archetype === '守门人' ? '你选择了守门：让违规者付出代价。' : '你选择了旁观：让已经发生的成交成立。'}
              </p>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <Recap game={game} />
        </div>

        <div className="section-label" style={{ color: 'var(--text)' }}>
          史料卡
        </div>
        <div className="sources">
          {game.scenario.sources.map((s) => (
            <div key={s.id} className="source-card paper">
              <h5>{s.title}</h5>
              <div>{s.body}</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                出处：{s.url ? (
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

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28 }}>
          <button className="btn" onClick={onTitle}>
            回到标题
          </button>
          <button className="btn primary" onClick={onAgain}>
            换个座位再来一局
          </button>
        </div>
        <p className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
          游戏不构成投资建议。真实市场的风险远比游戏复杂。种子：{game.seed}
        </p>
      </div>
    </div>
  );
}
