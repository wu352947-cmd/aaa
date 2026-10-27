import { replay, type Game, type LoggedAction, type Scenario } from '../engine/game';

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
  log: LoggedAction[];
  at: number;
  label: string;
  savedAt: number;
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
  return replay(scenario, d.seed, d.faction, d.principle, d.log, d.at);
}
