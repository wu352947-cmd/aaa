import type { CardDef, Decision, Game as GameT, Scenario } from '../engine/game';
import { Game } from '../engine/game';
import { Rng } from '../engine/rng';
import { st } from '../scenarios/s327/common';
import { MEANS } from '../scenarios/tulip/data';
import { TulipGame, type TulipFaction, type TulipRule } from '../scenarios/tulip/game';

/**
 * 平衡性模拟：每个座位用几种典型打法跑很多个种子，统计结局分布。
 * 打法只用玩家能看到的东西（卡面、是否被挡住、决策选项），日报除外——
 * “照章办事”按真相标日报，代表一个看得仔细的玩家。
 */

export interface Policy {
  name: string;
  /** 每晚：选卡、打牌、签日报 */
  night(g: GameT, r: Rng): void;
  /** 盘中每隔几分钟问一次 */
  trading(g: GameT, r: Rng): void;
  decide(g: GameT, d: Decision, r: Rng): string;
}

export interface Run {
  scenario: string;
  seat: string;
  policy: string;
  seed: string;
  ending: string;
  archetype: string;
  /** 交易座位：收益率；监管 / 券商：剧本指标 */
  ret: number | null;
  num: Record<string, number>;
  played: number;
  converted: number;
}

const safe = (d: Decision) => (d.choices.find((c) => !c.danger) ?? d.choices[0]).id;
const pick = <T>(r: Rng, xs: T[]): T => xs[Math.floor(r.next() * xs.length)];

/** 打一张能打的卡（需要对象时随机挑一个合法对象） */
function tryPlay(g: GameT, c: CardDef, r: Rng): boolean {
  const t = c.targets?.length ? pick(r, c.targets).id : undefined;
  if (g.canPlay(c.id, t)) return false;
  const before = g.cardLog.length;
  g.act({ type: 'card', id: c.id, target: t });
  return g.cardLog.length > before;
}

function fileAudits(g: GameT, how: 'truth' | 'blank' | 'random', r: Rng): void {
  for (const d of g.scenario.docs?.(g) ?? []) {
    if (d.filed) continue;
    const marks: Record<string, string> = {};
    const au = g.scenario.id === 's327' ? st(g).audits.get(g.dayIndex) : undefined;
    for (const row of d.rows) {
      if (how === 'truth') marks[row.id] = au?.truth[row.id] ?? d.marks[0].id;
      else if (how === 'random') marks[row.id] = r.chance(0.7) ? d.marks[0].id : pick(r, d.marks).id;
      else marks[row.id] = d.marks[0].id;
    }
    g.act({ type: 'doc', id: d.id, marks });
  }
}

export const POLICIES: Policy[] = [
  {
    name: '什么都不做',
    night(g) {
      if (g.offer) g.act({ type: 'draft', id: null });
      fileAudits(g, 'blank', new Rng('x'));
    },
    trading() {},
    decide: (_g, d) => safe(d),
  },
  {
    name: '照章办事',
    night(g, r) {
      if (g.offer) {
        const ok = g.offerCards().find((c) => !c.foe);
        g.act({ type: 'draft', id: ok?.id ?? null });
      }
      fileAudits(g, 'truth', r);
      // 白卡能打就打，直到没有能打的
      for (let i = 0; i < 12; i++) {
        const c = g.cards().find((x) => x.color === 'white' && x.when !== 'trading' && !x.foe && !g.canPlay(x.id, x.targets?.[0]?.id));
        if (!c || !tryPlay(g, { ...c, targets: c.targets?.slice(0, 1) }, r)) break;
      }
      for (const c of g.handCards()) if (c.foe) g.act({ type: 'convert', id: c.id });
    },
    trading(g, r) {
      const c = g.cards().find((x) => x.color === 'white' && x.when === 'trading' && !x.blocked);
      if (c && r.chance(0.1)) tryPlay(g, c, r);
    },
    decide: (_g, d) => safe(d),
  },
  {
    name: '随手乱打',
    night(g, r) {
      if (g.offer) g.act({ type: 'draft', id: r.chance(0.8) ? pick(r, g.offer) : null });
      fileAudits(g, 'random', r);
      for (let i = 0; i < 6; i++) {
        const open = g.cards().filter((x) => x.when !== 'trading' && !x.blocked);
        if (!open.length || r.chance(0.35)) break;
        tryPlay(g, pick(r, open), r);
      }
      for (const c of g.handCards()) if (c.foe || r.chance(0.3)) g.act({ type: 'convert', id: c.id });
      if (g.energy > 0 && g.npcs.size && r.chance(0.5)) g.act({ type: 'social', verb: 'probe', npc: pick(r, [...g.npcs.keys()]) });
    },
    trading(g, r) {
      if (!r.chance(0.04)) return;
      const open = g.cards().filter((x) => x.when !== 'night' && !x.blocked);
      if (open.length) tryPlay(g, pick(r, open), r);
    },
    decide: (_g, d, r) => pick(r, d.choices).id,
  },
  {
    // 更像真人：每晚只出一手，日报不细看
    name: '偶尔出手',
    night(g, r) {
      if (g.offer) g.act({ type: 'draft', id: pick(r, g.offer) });
      fileAudits(g, 'blank', r);
      const open = g.cards().filter((x) => x.when !== 'trading' && !x.blocked);
      if (open.length) tryPlay(g, pick(r, open), r);
      for (const c of g.handCards()) if (c.foe) g.act({ type: 'convert', id: c.id });
    },
    trading() {},
    decide: (_g, d) => safe(d),
  },
  {
    name: '只换算',
    night(g) {
      if (g.offer) g.act({ type: 'draft', id: g.offer[0] });
      fileAudits(g, 'blank', new Rng('x'));
      for (const c of g.handCards()) g.act({ type: 'convert', id: c.id });
    },
    trading() {},
    decide: (_g, d) => safe(d),
  },
];

export function runGame(scenario: Scenario, seat: string, policy: Policy, seed: string): Run {
  const g = new Game(scenario, `bal-${seed}`, seat, 'no-violation');
  const r = new Rng(`policy:${policy.name}:${seed}`);
  const start = g.equity();
  const nights = new Set<number>();
  for (let guard = 0; guard < 20000 && !g.ending; guard++) {
    if (g.phase === 'night') {
      if (!nights.has(g.dayIndex)) {
        nights.add(g.dayIndex);
        policy.night(g, r);
      }
      if (g.ending) break;
      g.act({ type: 'end-night' });
    } else if (g.decision) g.act({ type: 'decision', id: g.decision.id, choice: policy.decide(g, g.decision, r) });
    else {
      if (g.phase === 'trading' && g.t % 5 === 0) policy.trading(g, r);
      g.tick();
    }
  }
  const e = g.ending;
  const num: Record<string, number> = {};
  if (scenario.id === 's327' && seat === 'official') {
    const s = st(g);
    num.cap = s.cap;
    num.order = s.order;
    num.dirsMet = s.dirs.filter((d) => d.status === 'met').length;
    num.dirsFailed = s.dirs.filter((d) => d.status === 'failed').length;
    num.auditMissed = Number(g.flags.auditMissed ?? 0);
    num.dumped = Number(!!g.flags.npcDump);
  }
  if (g.flags.trust != null) num.trust = Number(g.flags.trust);
  num.heat = g.heatTier();
  const played = g.log.filter((l) => l.action.type === 'card').length;
  const converted = g.log.filter((l) => l.action.type === 'convert').length;
  const end = g.equity();
  return {
    scenario: scenario.id,
    seat,
    policy: policy.name,
    seed,
    ending: e?.id ?? '(未结束)',
    archetype: e?.archetype ?? '-',
    ret: g.faction.observer || !start ? null : (end - start) / Math.abs(start),
    num,
    played,
    converted,
  };
}

// ───────────── 酒馆 ─────────────

export interface TulipPolicy {
  name: string;
  seats: TulipFaction[];
  evening(g: TulipGame, r: Rng): void;
  ruling?(g: TulipGame, r: Rng): TulipRule;
}

const sellers = (g: TulipGame) => g.quotes.filter((q) => q.side === 'sell' && !q.done);
const buyers = (g: TulipGame) => g.quotes.filter((q) => q.side === 'buy' && !q.done);
const drafts = (g: TulipGame, r: Rng) => {
  if (g.offer) g.act({ type: 'draft', id: g.hand.length < g.maxHand ? pick(r, g.offer) : null });
  for (const c of g.handCards()) {
    if (!c.blocked && r.chance(0.6)) g.act({ type: 'card', id: c.id, target: c.targets?.[0]?.id });
    else g.act({ type: 'convert', id: c.id });
  }
};

export const TULIP_POLICIES: TulipPolicy[] = [
  { name: '一份不签', seats: ['speculator', 'grower'], evening() {} },
  {
    name: '一路买进',
    seats: ['speculator', 'grower'],
    evening(g) {
      if (g.night.kind === 'normal') for (const q of sellers(g)) g.act({ type: 'accept', npc: q.npc });
    },
  },
  {
    name: '先买后卖',
    seats: ['speculator', 'grower'],
    evening(g) {
      if (g.night.kind !== 'normal') return;
      if (g.evening <= 2) for (const q of sellers(g)) g.act({ type: 'accept', npc: q.npc });
      else for (const q of buyers(g)) g.act({ type: 'accept', npc: q.npc });
    },
  },
  {
    name: '高位全卖',
    seats: ['speculator', 'grower'],
    evening(g) {
      if (g.night.kind === 'normal' && g.evening >= 2) for (const q of buyers(g)) g.act({ type: 'accept', npc: q.npc });
    },
  },
  {
    name: '高位只卖给有家底的',
    seats: ['speculator', 'grower'],
    evening(g) {
      if (g.night.kind === 'normal' && g.evening >= 2) for (const q of buyers(g).filter((x) => MEANS[x.npc] >= 500)) g.act({ type: 'accept', npc: q.npc });
    },
  },
  {
    name: '还价砍一成再卖',
    seats: ['speculator', 'grower'],
    evening(g) {
      if (g.night.kind !== 'normal' || g.evening < 2) return;
      for (const q of buyers(g)) {
        g.act({ type: 'counter', npc: q.npc, price: Math.round(q.price * 1.1) });
        if (!q.done) g.act({ type: 'accept', npc: q.npc });
      }
    },
  },
  {
    name: '随手乱打',
    seats: ['speculator', 'grower', 'council'],
    evening(g, r) {
      drafts(g, r);
      for (let i = 0; i < 4; i++) {
        const open = g.cards().filter((c) => !c.blocked && !g.hand.includes(c.id));
        if (!open.length || r.chance(0.4)) break;
        const c = pick(r, open);
        g.act({ type: 'card', id: c.id, target: c.targets?.length ? pick(r, c.targets).id : undefined });
      }
      if (g.faction !== 'council' && g.night.kind === 'normal')
        for (const q of g.quotes.filter((x) => !x.done)) if (r.chance(0.3)) g.act({ type: 'accept', npc: q.npc });
    },
    ruling: (_g, r) => pick(r, ['forward', 'option', 'void'] as TulipRule[]),
  },
  { name: '旁观', seats: ['council'], evening() {}, ruling: () => 'option' },
  {
    name: '尽职（规矩 + 游说市政官）',
    seats: ['council'],
    evening(g, r) {
      drafts(g, r);
      for (const id of ['register', 'tax', 'notice', 'relief', 'assembly']) {
        const c = g.cards().find((x) => x.id === id);
        if (c && !c.blocked) g.act({ type: 'card', id });
      }
      const lob = g.cards().find((x) => x.id === 'lobby-option');
      if (lob && !lob.blocked) g.act({ type: 'card', id: 'lobby-option', target: 'witt' });
    },
    ruling(g) {
      g.act({ type: 'card', id: 'speech-option' });
      return 'option';
    },
  },
  {
    name: '收礼替花农说话',
    seats: ['council'],
    evening(g) {
      for (const id of ['gift-grower']) {
        const c = g.cards().find((x) => x.id === id);
        if (c && !c.blocked) g.act({ type: 'card', id });
      }
      const lob = g.cards().find((x) => x.id === 'lobby-forward');
      if (lob && !lob.blocked) g.act({ type: 'card', id: 'lobby-forward', target: 'spiegel' });
    },
    ruling(g) {
      g.act({ type: 'card', id: 'speech-forward' });
      return 'forward';
    },
  },
  {
    name: '说一套投一套',
    seats: ['council'],
    evening() {},
    ruling(g) {
      g.act({ type: 'card', id: 'speech-void' });
      return 'option';
    },
  },
];

export interface TulipRun {
  seat: TulipFaction;
  policy: string;
  seed: string;
  /** 交易座位：按历史规则（期权）的收益率；议员：威望 */
  score: number;
  fwd?: number;
  unpaid?: number;
  ruined?: number;
  rule?: TulipRule;
  dirsMet?: number;
}

export function runTulip(seat: TulipFaction, p: TulipPolicy, seed: string): TulipRun {
  const g = new TulipGame(`bal-${seed}`, seat);
  const r = new Rng(`tpolicy:${p.name}:${seed}`);
  while (g.phase === 'table') {
    p.evening(g, r);
    g.act({ type: 'leave' });
  }
  if (seat === 'council') {
    const rule = p.ruling?.(g, r) ?? 'option';
    g.act({ type: 'rule', rule });
    g.finish();
    const v = g.councilVerdict();
    return { seat, policy: p.name, seed, score: v.standing, ruined: g.ruined(g.rule).length, rule: g.rule, dirsMet: g.dirs.filter((d) => d.status === 'met').length };
  }
  const opt = g.settle('option');
  const fwd = g.settle('forward');
  const start = g.startWealth;
  return { seat, policy: p.name, seed, score: (opt.total - start) / start, fwd: (fwd.total - start) / start, unpaid: opt.unpaid + fwd.unpaid };
}
