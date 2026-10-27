import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game, Npc, NpcDef, SocialOutcome, Verb } from '../engine/game';
import type { ChatMessage } from '../llm/client';
import { speak } from '../llm/director';
import { ERA_1995_SH } from '../llm/era';
import type { LlmSettings } from '../llm/settings';
import { cls, money } from './format';

export interface ChatLine {
  who: 'you' | 'npc' | 'sys';
  text: string;
  pending?: boolean;
  source?: 'llm' | 'template';
  note?: string;
}

const VERBS: { verb: Verb; label: string; hint: string }[] = [
  { verb: 'probe', label: '试探', hint: '换取立场线索' },
  { verb: 'exchange', label: '交换', hint: '情报 / 资金 / 人情' },
  { verb: 'ally', label: '结盟', hint: '签带条款的协议' },
  { verb: 'betray', label: '背叛', hint: '撕毁协议抢先手' },
  { verb: 'report', label: '告发', hint: '把证据交给监管' },
];

const CHAT_LIMIT = 4;

/** 对话状态放在交易屏上，抽屉开关不会丢 */
export function useDialogues(game: Game | null, llm: LlmSettings) {
  const [chats, setChats] = useState<Record<string, ChatLine[]>>({});
  const [chatCount, setChatCount] = useState<Record<string, number>>({});

  const push = useCallback((id: string, ...lines: ChatLine[]) => {
    setChats((c) => ({ ...c, [id]: [...(c[id] ?? []), ...lines] }));
  }, []);

  const resolve = useCallback(
    (id: string, persona: NpcDef, out: SocialOutcome['dialogue'], playerText?: string, history?: ChatMessage[]) => {
      const marker = Math.random().toString(36).slice(2);
      push(id, { who: 'npc', text: marker, pending: true });
      speak(llm, persona, ERA_1995_SH, out, { playerText, history, salt: game?.dayIndex }).then((line) => {
        setChats((c) => ({
          ...c,
          [id]: (c[id] ?? []).map((l) =>
            l.pending && l.text === marker ? { who: 'npc', text: line.text, source: line.source, note: line.rejected?.length ? `模型台词未通过校验：${line.rejected.join('；')}` : undefined } : l,
          ),
        }));
      });
    },
    [llm, push, game],
  );

  const act = useCallback(
    (npcId: string, verb: Verb, option?: string) => {
      if (!game) return;
      if (game.energy <= 0) {
        push(npcId, { who: 'sys', text: '今天的精力用完了。明天再说。' });
        return;
      }
      const out = game.act({ type: 'social', verb, npc: npcId, option });
      if (!out) return;
      push(npcId, { who: 'you', text: out.dialogue.playerMove }, ...out.effects.map((e) => ({ who: 'sys' as const, text: e })));
      const speaker = game.scenario.npcs.find((n) => n.id === out.dialogue.npcId) ?? game.npc(npcId)!;
      resolve(npcId, speaker, out.dialogue);
    },
    [game, push, resolve],
  );

  const chat = useCallback(
    (npcId: string, text: string) => {
      if (!game || !text.trim()) return;
      const key = `${npcId}:${game.dayIndex}`;
      const used = chatCount[key] ?? 0;
      if (used >= CHAT_LIMIT) {
        push(npcId, { who: 'sys', text: '对方看了看表：“今天就聊到这儿吧。”' });
        return;
      }
      setChatCount((c) => ({ ...c, [key]: used + 1 }));
      const history: ChatMessage[] = (chats[npcId] ?? [])
        .filter((l) => l.who !== 'sys' && !l.pending)
        .slice(-6)
        .map((l) => ({ role: l.who === 'you' ? 'user' : 'assistant', content: l.text }));
      push(npcId, { who: 'you', text });
      const intent = game.scenario.chatIntent(game, npcId);
      resolve(npcId, game.npc(npcId)!, { ...intent, playerMove: '闲聊' }, text, history);
    },
    [game, chats, chatCount, push, resolve],
  );

  return { chats, act, chat, chatLeft: (npcId: string) => CHAT_LIMIT - (chatCount[`${npcId}:${game?.dayIndex}`] ?? 0) };
}

export function Contacts({
  game,
  dlg,
  llmOn,
  onClose,
  inline,
}: {
  game: Game;
  dlg: ReturnType<typeof useDialogues>;
  llmOn: boolean;
  onClose?: () => void;
  inline?: boolean;
}) {
  const npcs = [...game.npcs.values()];
  const [sel, setSel] = useState<string>(npcs[0]?.id);
  const [panel, setPanel] = useState<'verbs' | 'exchange' | 'report'>('verbs');
  const [text, setText] = useState('');
  const n = game.npc(sel) as Npc | undefined;
  const offers = n ? game.scenario.offers(game, n.id) : [];
  const evidence = n ? game.intel.filter((i) => i.kind === 'evidence' && i.against === n.id) : [];
  const lines = (n && dlg.chats[n.id]) || [];
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lines]);

  const body = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          今日精力{' '}
          <span className="energy">
            {Array.from({ length: game.maxEnergy }, (_, i) => (
              <i key={i} className={cls(i < game.energy && 'on')} />
            ))}
          </span>
        </span>
        <span className="faint" style={{ fontSize: 12 }}>
          台词：{llmOn ? '模型生成（经校验）' : '内置模板'}
        </span>
      </div>
      <div className="npc-list">
        {npcs.map((x) => (
          <button key={x.id} className={cls('npc', x.id === sel && 'on')} onClick={() => (setSel(x.id), setPanel('verbs'))}>
            <span className="avatar">{x.avatar}</span>
            <span>
              <b>{x.name}</b> <span className="muted" style={{ fontSize: 12 }}>{x.org} · {x.title}</span>
              <div className="bar-track" style={{ width: 120 }}>
                <div style={{ width: `${(x.relation + 100) / 2}%`, background: x.relation >= 0 ? 'var(--gold)' : 'var(--up)' }} />
              </div>
            </span>
            <span className="rel" title="关系值 −100 到 100：影响他是否给你真消息、是否愿意结盟">
              {x.relation > 0 ? '+' : ''}
              {x.relation}
            </span>
          </button>
        ))}
      </div>

      {game.alliances.map((a) => (
        <div key={a.id} className={cls('alliance', a.brokenBy && 'broken')}>
          <b>{a.terms}</b>
          <div className="faint">
            {a.brokenBy ? `已破裂（${a.brokenBy === 'player' ? '你先背叛' : '对方先背叛'}）` : `有效至 ${game.scenario.days[a.lockUntilDay].date}${a.penalty ? ` · 违约金 ${money(a.penalty)}` : ''}`}
          </div>
        </div>
      ))}

      {n && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>
              {n.avatar}
            </span>
            <div>
              <b style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{n.name}</b>
              <div className="muted" style={{ fontSize: 12 }}>
                {n.org}
                {n.title} · 风格：{n.style}
                {n.seat && game.flags.seatsKnown ? ` · 席位 ${n.seat}` : ''}
              </div>
            </div>
          </div>
          {n.memory.length > 0 && (
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              他记得：{n.memory.slice(-3).join('；')}
            </div>
          )}
          <div className="verbs">
            {VERBS.map((v) => (
              <button
                key={v.verb}
                disabled={game.energy <= 0 || game.phase === 'reckoning'}
                onClick={() => {
                  if (v.verb === 'exchange') setPanel(panel === 'exchange' ? 'verbs' : 'exchange');
                  else if (v.verb === 'report') setPanel(panel === 'report' ? 'verbs' : 'report');
                  else {
                    setPanel('verbs');
                    dlg.act(n.id, v.verb);
                  }
                }}
              >
                {v.label}
                <small>{v.hint}</small>
              </button>
            ))}
          </div>
          {panel === 'exchange' && (
            <div className="preview" style={{ marginBottom: 8 }}>
              {offers.length === 0 && <span className="faint">他现在没什么可以换给你的。</span>}
              {offers.map((o) => (
                <button key={o.id} className="choice" onClick={() => (dlg.act(n.id, 'exchange', o.id), setPanel('verbs'))}>
                  <b>{o.label}</b>
                  <small>代价：{o.cost}</small>
                </button>
              ))}
            </div>
          )}
          {panel === 'report' && (
            <div className="preview" style={{ marginBottom: 8 }}>
              {evidence.length === 0 && <span className="faint">你手上没有针对他的证据。证据要靠交换、试探与盯盘得来。</span>}
              {evidence.map((e) => (
                <button key={e.id} className="choice danger" onClick={() => (dlg.act(n.id, 'report', e.id), setPanel('verbs'))}>
                  <b>把「{e.title}」交给交易所</b>
                  <small>告发会让圈内人对你有看法，但能换来从轻处理</small>
                </button>
              ))}
            </div>
          )}
          <div className="chat">
            {lines.map((l, i) => (
              <div key={i} className={cls('bubble', l.who, l.pending && 'typing')} title={l.note}>
                {l.pending ? '' : l.text}
                {l.who === 'npc' && !l.pending && l.source && <span className="src-tag">{l.source === 'llm' ? '模型台词 · 已校验' : '模板台词'}{l.note ? ' · 模型稿未通过校验' : ''}</span>}
              </div>
            ))}
          </div>
          <div ref={end} />
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              dlg.chat(n.id, text);
              setText('');
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`和${n.name}闲聊（不耗精力，今天还能聊 ${dlg.chatLeft(n.id)} 句）`} maxLength={120} />
            <button className="btn small" disabled={!text.trim()}>
              说
            </button>
          </form>
          <p className="faint" style={{ fontSize: 11 }}>
            闲聊只影响气氛，不会改变任何数值；对方只会说他此刻愿意说的话。
          </p>
        </div>
      )}
    </>
  );

  if (inline) return <div>{body}</div>;
  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>人脉</h3>
        <button className="btn ghost small" onClick={onClose}>
          关闭 <span className="kbd">Esc</span>
        </button>
      </div>
      <div className="drawer-body">{body}</div>
    </div>
  );
}
