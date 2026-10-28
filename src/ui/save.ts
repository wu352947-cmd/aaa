import { replay, type Game, type GameOpts, type LoggedAction, type Scenario } from '../engine/game';
import { EVENINGS } from '../scenarios/tulip/data';
import { replayTulip, type TulipAction, type TulipFaction, type TulipGame } from '../scenarios/tulip/game';

/**
 * 存档只记“种子 + 动作日志”，读档时用确定性引擎重放到存档那一刻。
 * 这和排行榜校验、录像回放用的是同一套机制。
 */
export interface SaveData {
  v: 1;
  scenario: string;
  seed: string;
  faction: string;
  principle: string;
  log: LoggedAction[] | TulipAction[];
  at: number;
  label: string;
  savedAt: number;
  difficulty?: string;
  undos?: number;
  opts?: GameOpts;
}

const KEY = 'chouma.save';

export function saveGame(g: Game): void {
  if (g.ending) {
    clearSave();
    return;
  }
  const data: SaveData = {
    v: 1,
    scenario: g.scenario.id,
    seed: g.seed,
    faction: g.factionId,
    principle: g.principleId,
    log: g.log,
    at: g.globalTick,
    label: `${g.faction.name} · ${g.day.date} ${g.phase === 'night' ? '夜' : g.time}`,
    savedAt: Date.now(),
    difficulty: g.difficulty,
    undos: g.undos,
    opts: g.setupOpts,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 存储不可用时静默放弃 */
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

export function restore(scenario: Scenario, d: SaveData): Game {
  const g = replay(scenario, d.seed, d.faction, d.principle, d.log as LoggedAction[], d.at, d.opts ?? {});
  g.difficulty = d.difficulty ?? 'standard';
  g.undos = d.undos ?? 0;
  return g;
}

const TULIP_SEAT: Record<TulipFaction, string> = { speculator: '酒馆投机客', grower: '球茎种植者', council: '行会议员' };

export function saveTulip(g: TulipGame): void {
  if (g.phase === 'ending') return clearSave();
  const ev = EVENINGS[g.evening];
  const data: SaveData = {
    v: 1,
    scenario: 'tulip',
    seed: g.seed,
    faction: g.faction,
    principle: '',
    log: g.log,
    at: g.log.length,
    label: `酒馆里的花 · ${TULIP_SEAT[g.faction]} · ${g.phase === 'ruling' ? '2 月 24 日' : `${ev.date} ${ev.label}`}`,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 存储不可用时静默放弃 */
  }
}

export function restoreTulip(d: SaveData): TulipGame {
  return replayTulip(d.seed, d.faction as TulipFaction, d.log as TulipAction[]);
}
