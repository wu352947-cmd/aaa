import type { Game, Intel } from '../engine/game';

const KIND: Record<Intel['kind'], [string, string]> = {
  news: ['报道', ''],
  rumor: ['传言', 'rumor'],
  evidence: ['证据', 'evidence'],
  clue: ['线索', 'clue'],
  mentor: ['老周', 'mentor'],
  system: ['笔记', ''],
};

export function IntelList({ game, showMentor }: { game: Game; showMentor: boolean }) {
  const days = game.scenario.days;
  const items = game.intel.filter((i) => showMentor || i.kind !== 'mentor');
  return (
    <div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        每条情报都有来源和时间，但可信度藏在背后——你看到的永远只是“听说”。标为“证据”的可以拿去告发。
      </p>
      {items.map((i, k) => (
        <div key={i.id + k} className="intel">
          <div className="meta">
            <span className={`tag ${KIND[i.kind][1]}`}>{KIND[i.kind][0]}</span>
            <span>{i.source}</span>
            <span>
              {days[i.day]?.date.slice(5)} {i.time}
            </span>
          </div>
          <div className="title">{i.title}</div>
          <div className="body">{i.body}</div>
        </div>
      ))}
    </div>
  );
}

export function IntelDrawer({ game, showMentor, onClose }: { game: Game; showMentor: boolean; onClose: () => void }) {
  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>情报</h3>
        <button className="btn ghost small" onClick={onClose}>
          关闭 <span className="kbd">Esc</span>
        </button>
      </div>
      <div className="drawer-body">
        <IntelList game={game} showMentor={showMentor} />
      </div>
    </div>
  );
}
