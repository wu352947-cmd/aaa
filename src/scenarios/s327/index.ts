import { fmtYi, newAccount } from '../../engine/exchange';
import type { DialogueIntent, Ending, Game, Scenario, SocialOutcome } from '../../engine/game';
import { MINUTES_PER_DAY, type Actor, type Market } from '../../engine/market';
import type { OrderReq } from '../../engine/types';
import { addCrowdFlow, crowdFlowOrders } from '../../engine/flows';
import { condition, followOrders, regCards, regMeters, regPlay, resolveInspections, traderCards, traderPlay } from './cards';
import {
  addOrder,
  ALLY,
  dateTime,
  deter,
  flag,
  HIDE,
  HIDE_POS,
  isPlayer,
  LONG,
  memberName,
  members,
  mentor,
  mi,
  news,
  p2,
  rumor,
  SHORT,
  SHORT_CASH,
  SHORT_POS,
  st,
  STATE,
  timeOf,
  wan,
} from './common';
import { BATTLE, DAYS, DECK_1995, FACTIONS, NPCS, OFFICIAL_CLOSE, PARAMS, PRINCIPLES, PROLOGUE, RULE_CARDS, SOURCES, START_PRICE } from './data';
import { ally, breakLock, exchange, offers, probe, report, stance, type Out } from './social';

const isOfficial = (g: Game) => g.factionId === 'official';
/** 贴息消息传开的那一分钟：财政部提前公告时就是开盘 */
const newsMinute = (g: Game) => (flag(g, 'mofPublic') ? 0 : mi('9:58'));

// ───────────── NPC 交易策略 ─────────────

/** 多方：布局期悄悄吸筹（逐笔里能看到席位 102），决战日把价格托在历史路径上 */
function zhongcaiActor(g: Game): Actor {
  return {
    id: LONG,
    onTick(m: Market) {
      const a = m.ex.acct(LONG);
      if (m.day.kind === 'layout') {
        if (g.rngScript.chance(1.4 / 330)) return [{ owner: LONG, side: 'buy', qty: g.rngScript.int(30, 50) * 1000, type: 'market' }];
        return [];
      }
      if (m.t < (flag(g, 'mofPublic') ? mi('9:35') : mi('10:06')) || flag(g, 'zcBust')) return [];
      const late = m.t >= mi('16:22');
      const target = late ? OFFICIAL_CLOSE : m.hist();
      if (target - m.reference <= 2) return [];
      const cap = m.ex.limitOf(a) * (flag(g, 'zcCurbed') ? 0.5 : 1);
      let budget = Math.max(0, cap - a.pos);
      // 上午的拉升按计划投入固定弹药；少了盟友倒戈的那一推，高点就上不去
      if (m.t < mi('10:30')) budget = Math.min(budget, Math.max(0, 700_000 - ((g.flags.zcMorning as number) || 0)));
      // 尾盘的突袭来得太快，多方只能有限地护盘
      const q = Math.min(Math.round(m.flowToReach(target) * 0.4), late ? 250_000 : 400_000, budget);
      if (q > 0 && m.t < mi('10:30')) g.flags.zcMorning = ((g.flags.zcMorning as number) || 0) + q;
      return q > 0 ? [{ owner: LONG, side: 'buy', qty: q, type: 'market' }] : [];
    },
  };
}

/** 空方盟友：决定翻多后，布局期悄悄平空，消息传开后几分钟内巨量买入 */
function liaobeiActor(g: Game): Actor {
  return {
    id: ALLY,
    onTick(m: Market) {
      if (!flag(g, 'gaoFlip')) return [];
      if (m.day.kind === 'layout') {
        if (g.dayIndex >= 4 && g.rngScript.chance(3 / 330)) return [{ owner: ALLY, side: 'buy', qty: g.rngScript.int(20, 40) * 1000, type: 'market' }];
        return [];
      }
      const t0 = newsMinute(g) + 6;
      if (m.t === t0 || m.t === t0 + 1) {
        if (m.t === t0) {
          g.flags.gaoActed = true;
          const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
          if (lock) {
            lock.brokenBy = 'gao';
            lock.brokenDay = g.dayIndex;
          }
        }
        const scale = flag(g, 'gaoCurbed') ? 0.5 : 1;
        return [{ owner: ALLY, side: 'buy', qty: Math.round(1_200_000 * scale), type: 'market' }];
      }
      return [];
    },
  };
}

/**
 * 空方（玩家不扮演时）：16:15 盘算最后一搏。
 * 保证金还够——不必砸；被盯得太紧——认赔一部分；盯得一般——小砸；没人管——超额透支砸到底。
 */
function shenPlan(g: Game): string {
  const ex = g.market.ex;
  const a = ex.acct(SHORT);
  if (a.closeOnly) return 'blocked';
  if (ex.equity(a) >= ex.marginReq(a.pos)) return 'hold';
  const d = deter(g, SHORT);
  if (d >= 4) return 'cover';
  if (d >= 2) return 'small';
  return 'dump';
}

function shenjiangActor(g: Game): Actor {
  return {
    id: SHORT,
    onTick(m: Market) {
      if (m.day.kind !== 'battle') return [];
      if (m.t === mi('16:15') && flag(g, 'shenPlan') == null) g.flags.shenPlan = shenPlan(g);
      const plan = flag(g, 'shenPlan');
      if (plan === 'cover' && m.t < mi('16:25')) {
        const q = Math.min(-m.ex.acct(SHORT).pos, 90_000);
        return q > 0 ? [{ owner: SHORT, side: 'buy', qty: q, type: 'market' }] : [];
      }
      if ((plan !== 'dump' && plan !== 'small') || m.t < mi('16:22')) return [];
      // 目标是成交价而不是中枢：临时冲击也算数
      const target = m.hist() + Math.round(m.impactOf(1_300_000) * 0.7);
      const need = -m.flowToReach(target);
      if (need <= 0) return [];
      g.flags.npcDump = true;
      const scale = plan === 'small' ? 0.45 : 1;
      const q = Math.round(Math.min(Math.round(need * 0.8), 1_800_000) * scale);
      return [{ owner: SHORT, side: 'sell', qty: q, type: 'market', overdraw: true }];
    },
  };
}

/** 交易所的“手”：被追保或超限的会员开盘后分批减仓；谣言与对倒引来的跟风盘 */
function deskActor(g: Game): Actor {
  return {
    id: 'desk',
    onTick(m: Market) {
      const out: OrderReq[] = crowdFlowOrders(g);
      const s = st(g);
      if (m.t < 40) {
        for (const [id, left] of s.reduce) {
          const a = m.ex.acct(id);
          const q = Math.min(left, Math.ceil(left / (40 - m.t)), Math.abs(a.pos));
          if (q <= 0 || a.pos === 0) {
            s.reduce.delete(id);
            continue;
          }
          out.push({ owner: id, side: a.pos < 0 ? 'buy' : 'sell', qty: q, type: 'market' });
          if (left - q <= 0) s.reduce.delete(id);
          else s.reduce.set(id, left - q);
        }
      }
      return out;
    },
  };
}

// ───────────── 剧本 ─────────────

export const S327: Scenario = {
  id: 's327',
  title: '327：最后八分钟',
  subtitle: '1995 · 上海国债期货',
  era: '1995 年 2 月，上海',
  deck: DECK_1995,
  params: PARAMS,
  days: DAYS,
  startPrice: START_PRICE,
  factions: FACTIONS,
  principles: PRINCIPLES,
  npcs: NPCS,
  ruleCards: RULE_CARDS,
  sources: SOURCES,
  prologue: PROLOGUE,
  eraId: '1995-shanghai',
  instrument: '327 合约',
  paperName: '沪上财经报',
  endingDate: '1995-02-27 星期一',
  setupRules: ['no-price-limit', 'margin', 'position-limit', 'daily-settlement'],
  members: [SHORT, LONG, ALLY, HIDE],
  lotPresets: [100_000, 500_000],
  groupName: (g, who) => groupName(g, who),
  cards: (g) => (isOfficial(g) ? regCards(g) : traderCards(g)),
  playCard: (g, id, target) => (isOfficial(g) ? regPlay(g, id, target) : traderPlay(g, id, target)),
  meters: (g) => (isOfficial(g) ? regMeters(g) : undefined),

  setup(g) {
    const ex = g.market.ex;
    const grp = (id: string) => (isPlayer(g, id) ? 'player' : id);
    ex.add(newAccount({ id: SHORT, name: '申江证券', seat: '011', group: grp(SHORT), cash: SHORT_CASH, pos: -SHORT_POS, avg: 14790 }));
    ex.add(newAccount({ id: LONG, name: '中财信托', seat: '102', group: grp(LONG), cash: 1_800_000_000, pos: 1_500_000, avg: 14760 }));
    ex.add(newAccount({ id: ALLY, name: '辽北发展', seat: '217', group: grp(ALLY), cash: 2_500_000_000, pos: -800_000, avg: 14800 }));
    // 申江由电脑扮演时，另有一个借壳代持的小会员席位：两家合计超出限额
    if (!isPlayer(g, SHORT)) ex.add(newAccount({ id: HIDE, name: '浦江实业', seat: '305', group: HIDE, cash: 900_000_000, pos: -HIDE_POS, avg: 14790 }));
    if (g.factionId === 'retail') ex.add(newAccount({ id: 'retail', name: '你', group: 'player', cash: 80_000 }));
    if (isOfficial(g)) ex.add(newAccount({ id: 'exchange', name: '交易所', group: 'player', exempt: true }));
    if (!isPlayer(g, LONG)) g.market.actors.push(zhongcaiActor(g));
    if (!isPlayer(g, ALLY)) g.market.actors.push(liaobeiActor(g));
    if (!isPlayer(g, SHORT)) g.market.actors.push(shenjiangActor(g));
    g.market.actors.push(deskActor(g));
    const lockTerms = '锁仓同盟：327 空单持有至交割，期间任何一方不得平仓';
    if (g.factionId === 'short') g.alliances.push({ id: 'lock', npc: 'gao', terms: lockTerms, lockUntilDay: BATTLE, penalty: 0 });
    if (g.factionId === 'ally') g.alliances.push({ id: 'lock', npc: 'shen', terms: lockTerms, lockUntilDay: BATTLE, penalty: 0 });
    g.flags.startEq = ex.equity(g.player);
    // 交易所认得每一个席位
    if (isOfficial(g)) g.flags.seatsKnown = true;
    STATE.set(g, {
      snaps: new Map(),
      dayStartTick: 0,
      dayStartPos: 0,
      allianceStartPos: g.player.pos,
      usedOffers: new Set(),
      probeTruth: new Map(),
      cap: 3,
      order: 60,
      deter: {},
      evidence: new Set(),
      inspecting: [],
      used: new Set(),
      reduce: new Map(),
      fund: 1_000_000_000,
      legacy: [],
      resolved: new Map(),
      alerted: new Set(),
    });
    g.seenRules.add('no-price-limit');
    g.addIntel({ id: 'brief', title: '开局简报', body: briefing(g), source: '你的笔记本', credibility: 1, kind: 'system' });
  },

  onDayStart(g) {
    const s = st(g);
    const d = g.dayIndex;
    if (g.isAftermath) return;
    const m = g.market;
    const ex = m.ex;
    s.dayStartTick = ex.tick;
    s.dayStartPos = g.player.pos;
    for (const id of members(g)) ex.acct(id).closeOnly = false;
    // 前一晚定下的规则，今天开盘生效
    if (flag(g, 'marginNext')) {
      ex.deck.marginRate = g.flags.marginNext as number;
      g.flags.marginUp = true;
      delete g.flags.marginNext;
      g.push({ kind: 'intel', text: '新规生效：保证金比例 5%' });
    }
    if (flag(g, 'limitNext')) {
      ex.deck.positionLimit = g.flags.limitNext as number;
      delete g.flags.limitNext;
      g.push({ kind: 'intel', text: `新规生效：持仓限额 ${wan(ex.deck.positionLimit)}` });
    }
    if (flag(g, 'bandNext')) {
      ex.deck.priceLimit = g.flags.bandNext as number;
      delete g.flags.bandNext;
      const [lo, hi] = ex.priceBand();
      ex.last = Math.max(lo, Math.min(hi, ex.last));
      g.push({ kind: 'rule', rule: 'price-limit', text: `新规生效：涨跌停板 ${p2(lo)}–${p2(hi)} 元` });
    }
    if (flag(g, 'sentNext')) {
      m.sentiment = Math.max(-1, Math.min(1, m.sentiment + (g.flags.sentNext as number)));
      delete g.flags.sentNext;
    }
    if (flag(g, 'vetoNext')) {
      delete g.flags.vetoNext;
      // 谣言在开盘后发酵：散户在二十分钟里抛出约 60 万口（公告已经出来的那天就没人信了）
      if (!(g.isBattleDay && flag(g, 'mofPublic'))) addCrowdFlow(g, 'sell', 600_000, 20);
    }
    if (g.isBattleDay) {
      s.snaps.set(ex.tick + 1, { accounts: ex.snapshot(), last: ex.last });
      if (flag(g, 'mofPublic')) {
        // 财政部在开盘前公告：市场共识在开盘后二十分钟内移到新价位，没有人先知道
        const base = m.day.base ?? m.day.hist;
        m.day = { ...m.day, base: base.map((p, i) => (i < 20 ? Math.round(14821 + ((15110 - 14821) * i) / 20) : Math.max(p, 15110))) };
        news(g, 'mof-public', '财政部公告：327 国债按 148.50 元兑付', '财政部今晨公告，对到期国债实行贴息，327 兑付价远高于 132 元。消息开盘前同时送达所有会员。', 1);
        m.sentiment = Math.min(1, m.sentiment + 0.5);
      }
    }
    if (d === 0) mentor(g, '327 每口面值 2 万元，价格动 1 元，每口赚赔 200 元。没有涨跌停——侬要当心。');
    if (d === BATTLE) mentor(g, '今朝是 23 号。消息市里头，最先动的那个席位就是答案。盯牢逐笔。');
  },

  onTick(g) {
    const s = st(g);
    const m = g.market;
    const t = m.t - 1; // 刚刚走完的这一分钟
    const d = g.dayIndex;
    if (g.isBattleDay) s.snaps.set(m.ex.tick + 1, { accounts: m.ex.snapshot(), last: m.ex.last });
    if (g.bankrupt && flag(g, 'bankruptTick') == null) g.flags.bankruptTick = m.ex.tick;
    if (flag(g, `bust-${LONG}`) && !flag(g, 'zcBust')) {
      g.flags.zcBust = true;
      g.addIntel({ id: 'zc-bust', title: '中财信托权益跌穿零，被交易所强制平仓', body: '多方主力爆仓。强平的卖单正在涌出。', source: '场内', credibility: 1, kind: 'news' });
    }
    checkLines(g);
    if (isOfficial(g)) monitor(g);
    g.pending.push(...followOrders(g));

    // 布局期的消息节点
    if (d === 1 && t === mi('10:30')) news(g, 'vol', '国债期货成交连创新高', '327 持仓量突破历史纪录。', 0.95);
    if (d === 2 && t === mi('14:00')) rumor(g, 'mof-visit', '财政部的人这两天在开会', '大户室里有人说，财政部正在研究 327 的贴息方案。', '大户室传言', 0.6);
    if (d === 3 && t === mi('11:00')) news(g, 'cpi', '通胀仍处高位，保值贴补率居高不下', '到期国债的实际兑付价可能高于票面本息。', 0.9);

    if (!g.isBattleDay) return;

    // 决战日
    const n0 = newsMinute(g);
    if (t === mi('9:35') && g.factionId === 'long' && !flag(g, 'mofPublic')) {
      g.decision = {
        id: 'insider-add',
        title: '消息还没公开',
        body: '贴息方案已经定了，上午就会传开。现在加仓，就是利用未公开信息交易。',
        choices: [
          { id: 'hold', label: '按兵不动', detail: '等消息公开。' },
          { id: 'add', label: '抢先加仓 60 万口', detail: '内幕交易：交易记录可被追溯。', danger: true },
        ],
        countdown: 25,
      };
    }
    if (t === n0 && !flag(g, 'mofPublic')) {
      rumor(g, 'mof-rumor', '财政部将提高 327 国债兑付价', '消息从几个大户室同时传出来：327 要贴息。', '场内', 0.9);
      m.sentiment = Math.min(1, m.sentiment + 0.5);
      g.push({ kind: 'pause', text: '消息传开了。' });
    }
    if (flag(g, 'gaoActed') && !flag(g, 'gaoAnnounced')) {
      g.flags.gaoAnnounced = true;
      g.push({ kind: 'pause', text: '席位 217 巨量买入！' });
      mentor(g, '217 在吃货！这不是平仓，是翻多。');
    }
    if (t === n0 && g.factionId === 'ally') {
      g.decision = {
        id: 'ally-flip',
        title: '风向变了',
        body: `327 要贴息。你还有 ${wan(-Math.min(0, g.player.pos))} 空单，锁仓协议没到期。谁先动，谁拿走最多。`,
        choices: [
          { id: 'hold', label: '守约：继续锁仓', detail: '赌消息不会兑现。' },
          { id: 'flip', label: '空翻多：两分钟内买入 240 万口', detail: '撕毁锁仓协议。', danger: true },
          { id: 'cover', label: '只平空：买入 80 万口', detail: '抽身离场。同样算撕毁协议。' },
        ],
        countdown: 25,
      };
    }
    if (t === n0 + 9 && g.factionId === 'short') {
      const flipped = !!(flag(g, 'gaoActed') || flag(g, 'allyFlipped'));
      g.decision = {
        id: 'after-flip',
        title: flipped ? '盟友倒戈' : '价格在涨',
        body: `价格 ${p2(m.last)} 元。权益 ${fmtYi(g.equity())}，需要保证金 ${fmtYi(g.marginNeed())}。`,
        choices: [
          { id: 'hold', label: '扛住不动', detail: '赌消息不会兑现。' },
          { id: 'cut-half', label: '止损：平掉一半空单', detail: '10 分钟内分批买入。' },
          { id: 'press', label: '加空打压', detail: '超出限额与保证金的违规下单。', danger: true },
        ],
        countdown: 30,
      };
    }
    if (t === mi('16:15') && g.factionId === 'short' && !g.bankrupt) {
      g.decision = {
        id: 'last-eight',
        title: '还剩十五分钟',
        body: `价格 ${p2(m.last)} 元，权益 ${fmtYi(g.equity())}，空单 ${wan(-g.player.pos)}。保证金早已不够。`,
        choices: [
          { id: 'hold', label: '扛到收盘', detail: '什么都不做。' },
          { id: 'cover', label: '认赔：平掉全部空单', detail: '保住公司，接受巨亏。' },
          { id: 'dump', label: '最后八分钟：超额透支砸盘', detail: '16:22 起抛出 1040 万口。严重违规，可被追溯。', danger: true },
        ],
        countdown: 30,
      };
    }
    if (t === mi('16:23') && flag(g, 'npcDump')) {
      g.push({ kind: 'pause', text: '席位 011 巨量抛售！' });
      if (g.factionId === 'long' || (g.factionId === 'ally' && g.player.pos > 0)) {
        g.decision = {
          id: 'defend',
          title: '空方砸盘',
          body: `席位 011 在不计成本地抛售，价格 ${p2(m.last)} 元。`,
          choices: [
            { id: 'wait', label: '不动', detail: '赌交易所会出手。' },
            { id: 'defend', label: '护盘：买到持仓限额', detail: '5 分钟内买入。' },
            { id: 'cut', label: '平仓锁利', detail: '卖出全部多单。' },
          ],
          countdown: 20,
        };
      }
    }
    if (t === MINUTES_PER_DAY - 1 && isOfficial(g)) {
      const over = overdrawnByOwner(g);
      const lines = [...over.entries()].filter(([, e]) => e.vol >= 300_000).map(([id, e]) => `${memberName(g, id)} 透支成交 ${wan(e.vol)}`);
      if (lines.length) {
        g.decision = {
          id: 'ruling',
          title: '当晚的裁决',
          body: `收盘 ${p2(m.last)} 元。${lines.join('；')}。这些成交算不算数？`,
          choices: [
            { id: 'void', label: '违规开始之后的交易一律无效', detail: '历史上的做法。违规者受罚，同一时段里正常成交的人也一起被抹掉。' },
            ...(s.cap >= 2
              ? [{ id: 'precise', label: '只撤销透支成交（2 点政治资本）', detail: '其余成交保留。更公平，但要逐笔核对，结算价取违规前的价格。' }]
              : []),
            { id: 'valid', label: '承认全部成交有效', detail: '尊重已发生的成交。违规者拿走利润，多方承担损失。', danger: true },
          ],
        };
      }
    }
    if (t === mi('16:25') && g.factionId === 'retail' && flag(g, 'npcDump')) {
      g.decision = {
        id: 'buy-dip',
        title: '暴跌',
        body: `五分钟内从 151 元跌到 ${p2(m.last)} 元。有人在喊“抄底”。`,
        choices: [
          { id: 'wait', label: '观望', detail: '看不懂，不碰。' },
          { id: 'buy', label: '抄底买入', detail: '用全部可用保证金买入。' },
        ],
        countdown: 15,
      };
    }
  },

  onDayEnd(g) {
    const s = st(g);
    const ex = g.market.ex;
    const d = g.dayIndex;
    // 锁仓期内玩家偷偷平空：累计超过 15% 视同背叛
    const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
    if (lock && (g.factionId === 'short' || g.factionId === 'ally') && d < BATTLE && g.player.pos > s.allianceStartPos * 0.85) {
      breakLock(g, '你在锁仓期内平掉了大量空单');
    }
    if (d < BATTLE) {
      memberMarginCheck(g);
      return;
    }
    if (d !== BATTLE) return;

    // 当晚裁决：大额违规透支 → 违规开始之后的交易无效（玩家扮演官员时由玩家裁决）
    const ruling = isOfficial(g) ? ((flag(g, 'ruling') as string) ?? 'valid') : 'void';
    const byOwner = overdrawnByOwner(g);
    let cut: { owner: string; tick: number } | null = null;
    for (const [owner, e] of byOwner) if (e.vol >= 300_000 && (!cut || e.first < cut.tick)) cut = { owner, tick: e.first };
    if (isOfficial(g)) {
      if (!cut) addOrder(g, 5);
      else if (ruling === 'valid') addOrder(g, -25);
      else addOrder(g, ruling === 'precise' ? 12 : 8);
      // 贴息消息先从多方流出：信息不公平
      if (!flag(g, 'mofPublic')) addOrder(g, -5);
    }
    if (!cut || ruling === 'valid') return;
    const snap = s.snaps.get(cut.tick);
    if (!snap) return;
    const after = ex.trades.filter((t) => t.tick >= cut.tick);
    const violatorVol = after.filter((t) => t.overdrawn).reduce((x, t) => x + t.qty, 0);
    ex.restore(snap.accounts);
    if (ruling === 'precise') {
      // 只撤销透支成交：其余成交按原价重新记账
      for (const t of after) if (!t.overdrawn) ex.rebook(t);
      ex.trades = ex.trades.filter((t) => t.tick < cut.tick || !t.overdrawn);
      g.flags.voidedVol = violatorVol;
      g.flags.innocentVoided = 0;
      g.flags.precise = true;
    } else {
      const vol = after.reduce((x, t) => x + t.qty, 0);
      g.flags.voidedVol = vol;
      g.flags.innocentVoided = Math.max(0, vol - violatorVol);
      ex.trades = ex.trades.filter((t) => t.tick < cut.tick);
    }
    const tIdx = cut.tick - s.dayStartTick - 1;
    g.flags.voided = true;
    g.flags.voidedT = tIdx;
    g.flags.voidedBy = cut.owner;
    g.flags.settle = snap.last;
    if (g.bankrupt && (flag(g, 'bankruptTick') as number) >= cut.tick) g.bankrupt = false;
    g.push({
      kind: 'rule',
      rule: 'void-trades',
      text: ruling === 'precise' ? `交易所宣布：${timeOf(tIdx)} 之后的透支成交无效` : `交易所宣布：${g.market.bars[tIdx] ? timeOf(tIdx) : ''} 之后的交易无效`,
    });
  },

  onNight(g) {
    const s = st(g);
    const d = g.dayIndex;
    for (const n of g.npcs.values()) n.unreachable = false;
    if (isOfficial(g)) {
      s.cap = Math.min(10, s.cap + 1);
      resolveInspections(g);
    }
    if (g.isAftermath) return aftermathNight(g);

    const rc = g.recaps[g.recaps.length - 1];
    // 复盘注记：大席位的净买卖
    for (const p of rc.parts) {
      if (p.who === 'gravity' || p.who === 'crowd' || p.who === 'trend' || Math.abs(p.net) < 10_000) continue;
      rc.notes.push(`${groupName(g, p.who)} 今日净${p.net > 0 ? '买入' : '卖出'} ${wan(Math.abs(p.net))}`);
    }
    if (isOfficial(g) && d < BATTLE) orderDrift(g);

    const change = rc.close - (g.recaps.length > 1 ? g.recaps[g.recaps.length - 2].close : START_PRICE);
    g.papers.push({
      day: d,
      headline: change > 0 ? `327 合约收于 ${p2(rc.close)} 元 多方小胜` : change < 0 ? `327 合约收于 ${p2(rc.close)} 元 空方占优` : `327 合约平收 ${p2(rc.close)} 元`,
      sub: d === BATTLE ? (flag(g, 'voided') ? '交易所宣布部分交易无效' : '多空决战落幕') : ['多空分歧仍在保值贴补率', '大户室里传言四起', '成交量居高不下', '市场静待财政部表态', '明日或有重要消息'][d] ?? '',
      facts: [`收盘价 ${p2(rc.close)} 元`, `较前一日${change >= 0 ? '上涨' : '下跌'} ${p2(Math.abs(change))} 元`],
    });

    if (d === 0) rumor(g, 'tiexi-1', '财政部可能对 327 贴息', '钱有福压低声音：“老板，327 要贴息，消息是从北京来的。”', '钱有福', 0.7);
    if (d === 1) mentor(g, '逐笔里的大单都带着席位号。哪家席位是哪家公司，场内的老人都晓得。想知道，来问我。');
    if (d === 2) {
      news(g, 'su-article', '《沪上财经报》：327 多空分歧加大', '空方测算兑付价约 132 元，多方押注贴息。', 0.85);
      rumor(g, 'zc-visit', '某多方机构最近常去财政部门', '有人看到中财信托的人进出财政部门。', '大户室传言', 0.8);
    }
    if (d === 3 || d === 4) decideFlip(g);
    // 被你背叛过的人会故意放假消息钓你
    const lock = g.alliances.find((x) => x.id === 'lock' && x.npc === 'gao' && x.brokenBy === 'player');
    if (lock && lock.brokenDay != null && lock.brokenDay < d && d < BATTLE) {
      rumor(g, 'gao-bait', '贴息方案被财政部否了', '钱有福一进门就嚷：“老板，贴息黄了！327 要跌回去！”', '钱有福', 0.05);
    }
    if (d === 3 && g.factionId === 'ally') {
      rumor(g, 'wei-dinner', '魏国梁请你吃饭：“风向要变了”', '饭桌上魏国梁只说了一句：“高总，锁仓的事，自己的账自己算。”', '魏国梁', 0.9);
    }
    if (d === 4) {
      if (g.npc('gao') && flag(g, 'gaoFlip') && flag(g, 'seatsKnown') && g.factionId === 'short') {
        g.addIntel({ id: 'ev-gao', title: '席位 217 在锁仓期内悄悄买入', body: '逐笔里，辽北发展的 217 分几笔买入平空。他准备倒戈了。', source: '你的盘后复核', credibility: 1, kind: 'evidence', against: 'gao' });
      }
      mentor(g, '明朝就是 23 号。消息一出，谁先动谁赢。');
      if (isOfficial(g) && !flag(g, 'mofPublic')) g.addIntel({ id: 'reg-eve', title: '明天可能出事', body: '申江与关联席位的空单、中财的多单，都在限额边上。贴息消息随时会出来。', source: '交易部值班记录', credibility: 1, kind: 'system' });
    }
  },

  offers,

  social(g, verb, npcId, option) {
    const n = g.npc(npcId)!;
    const out: Out = (ok, effects, dl) => ({ npc: npcId, verb, ok, effects, dialogue: { npcId, verb, numbers: [], date: dateTime(g), fallback: dl.convey, ...dl } });
    switch (verb) {
      case 'probe':
        return probe(g, npcId, out);
      case 'exchange':
        return exchange(g, npcId, option, out);
      case 'ally':
        return ally(g, npcId, out);
      case 'betray': {
        const lock = g.alliances.find((a) => a.npc === npcId && !a.brokenBy);
        if (!lock) return out(false, ['你们之间没有可以撕毁的协议'], { playerMove: '想撕毁并不存在的协议', convey: ['我们之间有什么约定吗？'], tone: 'neutral' });
        breakLock(g, '你单方面撕毁锁仓协议');
        const q = Math.round(Math.abs(g.player.pos) * 0.4);
        g.addPlanFromScript({ label: '背叛：抢先平空 40%', cond: 'now', price: 0, side: 'buy', qty: q, spread: 5 });
        return out(true, ['锁仓同盟破裂', '已加入计划书：开盘后 5 分钟内平掉 40% 空单', `${n.name} 关系 -40`], {
          playerMove: '打电话通知对方：锁仓协议作废，我先走一步',
          convey: ['你这是不讲究', '行，那就各走各的'],
          tone: 'hostile',
        });
      }
      case 'report':
        return report(g, npcId, option, out) as SocialOutcome;
    }
  },

  decide(g, id, choice) {
    const p = g.player;
    switch (`${id}:${choice}`) {
      case 'insider-add:add':
        g.addPlanFromScript({ label: '抢先加仓', cond: 'now', price: 0, side: 'buy', qty: 600_000, spread: 3 });
        insider(g);
        break;
      case 'after-flip:cut-half':
        g.addPlanFromScript({ label: '止损：平掉一半空单', cond: 'now', price: 0, side: 'buy', qty: Math.round(Math.abs(p.pos) / 2), spread: 10 });
        break;
      case 'after-flip:press':
        g.addPlanFromScript({ label: '加空打压', cond: 'now', price: 0, side: 'sell', qty: 1_500_000, spread: 5, overdraw: true });
        break;
      case 'last-eight:cover':
        g.addPlanFromScript({ label: '认赔平仓', cond: 'now', price: 0, side: 'buy', qty: Math.abs(p.pos), spread: 6 });
        g.flags.coveredLate = true;
        break;
      case 'last-eight:dump':
        g.addPlanFromScript({ label: '最后八分钟', cond: 'at', price: mi('16:22'), side: 'sell', qty: 10_400_000, spread: 8, overdraw: true });
        g.flags.playerDump = true;
        break;
      case 'defend:defend': {
        const room = g.market.ex.limitOf(p) - p.pos;
        if (room > 0) g.addPlanFromScript({ label: '护盘', cond: 'now', price: 0, side: 'buy', qty: room, spread: 5 });
        break;
      }
      case 'defend:cut':
        if (p.pos > 0) g.addPlanFromScript({ label: '平仓锁利', cond: 'now', price: 0, side: 'sell', qty: p.pos, spread: 3 });
        break;
      case 'ally-flip:flip':
        g.addPlanFromScript({ label: '空翻多', cond: 'now', price: 0, side: 'buy', qty: 2_400_000, spread: 2 });
        g.flags.allyFlipped = true;
        breakLock(g, '你在锁仓期内空翻多');
        break;
      case 'ally-flip:cover':
        if (p.pos < 0) g.addPlanFromScript({ label: '平空离场', cond: 'now', price: 0, side: 'buy', qty: -p.pos, spread: 2 });
        g.flags.allyCovered = true;
        breakLock(g, '你在锁仓期内平掉了空单');
        break;
      case 'ally-flip:hold':
        // 收了中财的钱却不倒戈：中财会记仇
        if (flag(g, 'allyPaid')) {
          g.relate('wei', -50, '拿了好处费却没有倒戈');
          g.reputation -= 10;
        }
        break;
      case 'ruling:void':
      case 'ruling:valid':
        g.flags.ruling = choice;
        break;
      case 'ruling:precise':
        g.flags.ruling = choice;
        st(g).cap = Math.max(0, st(g).cap - 2);
        break;
      case 'buy-dip:buy': {
        const ex = g.market.ex;
        const q = Math.floor(ex.equity(p) / (ex.contractValue(ex.last) * ex.deck.marginRate));
        if (q > 0) g.pending.push({ owner: p.id, side: 'buy', qty: q, type: 'market' });
        g.flags.boughtDip = true;
        break;
      }
    }
  },

  chatIntent(g, npcId) {
    const s = stance(g, npcId, true);
    return { npcId, verb: 'chat', playerMove: '随便聊聊', convey: s.convey, tone: s.tone, numbers: s.numbers, date: dateTime(g), fallback: s.convey } as DialogueIntent;
  },

  reckon(g) {
    return reckon(g);
  },
};

// ───────────── 辅助：监控、底线、追保 ─────────────

/** 监管座位的监控警报：大单与违规委托会让时钟停下，等你决定要不要出手 */
function monitor(g: Game) {
  const s = st(g);
  const m = g.market;
  const d = g.dayIndex;
  const label = m.session.label(m.t - 1);
  for (const r of g.tape) {
    if (r.day !== d || r.time !== label) break;
    const key = `big-${r.seat}-${r.side}-${d}`;
    if (r.qty < 300_000 || s.alerted.has(key)) continue;
    s.alerted.add(key);
    const id = [...m.ex.accounts.values()].find((a) => a.seat === r.seat)?.id ?? r.seat;
    g.push({ kind: 'pause', text: `监控：${memberName(g, id)} 一分钟${r.side === 'buy' ? '买入' : '卖出'} ${wan(r.qty)}` });
  }
  for (const id of members(g)) {
    const a = m.ex.acct(id);
    const seen = (g.flags[`viol-${id}`] as number) || 0;
    if (a.violations > seen) {
      g.flags[`viol-${id}`] = a.violations;
      const key = `viol-${id}-${d}`;
      if (s.alerted.has(key)) continue;
      s.alerted.add(key);
      g.push({ kind: 'pause', text: `监控：${memberName(g, id)} 超额透支下单——没有足额保证金，或超出限额` });
    }
  }
}

/** 会员收盘后的保证金与限额检查：不够的，明早开盘后分批减仓 */
function memberMarginCheck(g: Game) {
  const s = st(g);
  const ex = g.market.ex;
  const rate = Math.max(ex.deck.marginRate, (g.flags.marginNext as number) || 0);
  const limitNext = (g.flags.limitNext as number) || Infinity;
  for (const id of members(g)) {
    const a = ex.acct(id);
    if (!a.pos) continue;
    const eq = ex.equity(a);
    const cv = ex.contractValue(ex.last);
    let q = 0;
    if (eq < Math.abs(a.pos) * cv * rate) q = Math.abs(a.pos) - Math.max(0, Math.floor((eq * 0.85) / (cv * rate)));
    const lim = Math.min(ex.limitOf(a), limitNext);
    if (Math.abs(a.pos) - q > lim) q = Math.abs(a.pos) - lim;
    if (q <= 0 || (s.reduce.get(id) ?? 0) >= q) continue;
    s.reduce.set(id, q);
    if (isOfficial(g)) g.addIntel({ id: `reduce-${id}-${g.dayIndex}`, title: `${memberName(g, id)} 明早须减仓 ${wan(q)}`, body: `保证金或限额不够：开盘后四十分钟内分批${a.pos < 0 ? '买入平空' : '卖出平多'}。`, source: '结算部', credibility: 1, kind: 'system' });
    else if (id === SHORT || id === HIDE) rumor(g, `reduce-${id}-${g.dayIndex}`, '申江被交易所追保了', '结算部的朋友说：申江的保证金不够，明早要先平掉一部分空单。', '结算部的朋友', 0.85);
  }
}

/** 监管座位：放任传言与违规，秩序会自己往下掉 */
function orderDrift(g: Game) {
  const s = st(g);
  const d = g.dayIndex;
  const rumors = g.intel.filter((i) => i.day === d && i.kind === 'rumor').length;
  if (rumors > 0 && !s.used.has(`notice-${d}`) && !s.used.has(`brief-${d - 1}`)) {
    addOrder(g, -2);
    g.addIntel({ id: `drift-${d}`, title: '传言没人管', body: '大户室里的传言今天没有人出来澄清。市场秩序 −2。', source: '交易部值班记录', credibility: 1, kind: 'system' });
  }
}

function insider(g: Game) {
  if (flag(g, 'insider')) return;
  g.flags.insider = true;
  g.addHeat(18, '利用未公开信息交易');
  g.push({ kind: 'rule', rule: 'insider', text: '你在消息公开前加仓：交易记录可被追溯' });
  if (g.principleId === 'no-violation') g.crossLine('利用未公开消息交易');
}

function checkLines(g: Game) {
  const s = st(g);
  const p = g.player;
  // 多方在消息公开前手动加仓，同样构成内幕交易嫌疑
  if (g.factionId === 'long' && g.isBattleDay && !flag(g, 'mofPublic') && g.market.t <= mi('9:58') && p.pos > s.dayStartPos + 50_000) insider(g);
  if (g.principleId === 'no-allin' && !flag(g, `allin-${g.dayIndex}`)) {
    const eq = g.equity();
    if (p.pos !== 0 && eq > 0 && g.marginNeed() / eq > 0.9 && Math.abs(p.pos) > Math.abs(s.dayStartPos)) {
      g.flags[`allin-${g.dayIndex}`] = true;
      g.crossLine('保证金占用超过九成仍在加仓');
    }
  }
}

/** 盟友是否倒戈：消息可信度带来的诱惑 vs 关系与违约金带来的约束 */
function decideFlip(g: Game) {
  if (flag(g, 'gaoFlip')) return;
  const gao = g.npc('gao');
  const rel = gao?.relation ?? 30;
  const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
  const belief = 0.55 + 0.05 * g.dayIndex + (flag(g, 'gaoBribed') ? 0.3 : 0);
  const loyalty = (Math.max(0, rel) / 100) * 0.5 + ((lock?.penalty ?? 0) / 3e8) * 0.35 + (flag(g, 'gaoShared') ? 0.1 : 0);
  const temptation = belief - loyalty + (g.rngSocial.next() - 0.5) * 0.08;
  if (temptation > 0.25) g.flags.gaoFlip = true;
}

/** 决战日每个账户的违规（超额透支）主动成交量，以及第一笔的时间 */
function overdrawnByOwner(g: Game): Map<string, { vol: number; first: number }> {
  const s = st(g);
  const out = new Map<string, { vol: number; first: number }>();
  for (const t of g.market.ex.trades) {
    if (t.tick <= s.dayStartTick || !t.overdrawn) continue;
    const owner = t.aggressor === 'buy' ? t.buyer : t.seller;
    const e = out.get(owner) ?? { vol: 0, first: t.tick };
    e.vol += t.qty;
    out.set(owner, e);
  }
  return out;
}

// ───────────── 余波 ─────────────

function aftermathNight(g: Game) {
  const d = g.dayIndex;
  const ex = g.market.ex;
  const s = st(g);
  const voided = !!flag(g, 'voided');
  const close = ex.last;
  if (d === BATTLE + 1) {
    g.papers.push({
      day: d,
      headline: voided ? `上交所宣布 ${timeOf(flag(g, 'voidedT') as number)} 之后的交易无效` : flag(g, 'npcDump') || flag(g, 'playerDump') ? `327 收于 ${p2(close)} 元 多方一夜巨亏` : `327 收于 ${p2(close)} 元`,
      sub: '327 合约停牌，交易所着手清算',
      facts: [`结算价 ${p2(close)} 元`],
    });
    news(g, 'aftermath-1', '327 合约停牌清算', '交易所宣布 327 合约停牌，会员须在 27 日前补足保证金。', 1);
    if (isOfficial(g)) {
      for (const id of members(g)) {
        const c = condition(g, id);
        if (c === 'ok') continue;
        const a = ex.acct(id);
        const eq = ex.equity(a);
        g.addIntel({
          id: `cond-${id}`,
          title: c === 'bust' ? `${memberName(g, id)} 穿仓 ${fmtYi(-eq)}` : `${memberName(g, id)} 保证金缺口 ${fmtYi(ex.marginReq(a.pos) - eq)}`,
          body: c === 'bust' ? '亏损超过了它的全部权益。不处理，它的对手方就拿不到钱。' : '它补不上保证金。27 日前不处理，就只能按规则强平。',
          source: '结算部',
          credibility: 1,
          kind: 'system',
        });
      }
      g.addIntel({ id: 'yan-call', title: '严正：“明天上午把处理方案报上来”', body: '证监会期货部来电。上面在看这件事怎么收场。', source: '严正', credibility: 1, kind: 'system' });
    } else {
      if (g.factionId === 'short' && condition(g, SHORT) !== 'ok') g.addIntel({ id: 'margin-due', title: '交易所：27 日前补足保证金', body: `缺口 ${fmtYi(Math.max(0, ex.marginReq(g.player.pos) - ex.equity(g.player)))}。补不上，按规则强制平仓。`, source: '交易所结算部', credibility: 1, kind: 'system' });
      if ((g.factionId === 'short' && (flag(g, 'playerDump') || g.heat >= 40)) || (g.factionId === 'long' && flag(g, 'insider')))
        g.addIntel({ id: 'probe-team', title: '调查组进驻', body: '证监会调查组今天进驻公司，调阅了 23 日全部交易记录。', source: '公司办公室', credibility: 1, kind: 'system' });
      if (g.factionId === 'retail' && voided && flag(g, 'boughtDip')) g.addIntel({ id: 'dip-voided', title: '你的抄底单被撤销了', body: '交易所撤销了违规时段的全部成交，你的那笔也在里面。', source: '营业部', credibility: 1, kind: 'system' });
    }
  }
  if (d === BATTLE + 2) {
    g.papers.push({ day: d, headline: '327 风波进入清算', sub: s.legacy.length ? `交易所出台新规：${s.legacy.join('、')}` : '各方等待调查结论', facts: [] });
  }
}

// ───────────── 结局 ─────────────

function reckon(g: Game): Ending {
  const ex = g.market.ex;
  const p = g.player;
  const s = st(g);
  const startEq = (flag(g, 'startEq') as number) || 1;
  let eq = ex.equity(p);
  if (flag(g, 'loan')) eq -= 360_000_000;
  const r = g.faction.observer ? 0 : (eq - startEq) / startEq;
  const voided = !!flag(g, 'voided');
  const voidedByPlayer = voided && flag(g, 'voidedBy') === p.id;
  const official = g.market.closePrices[g.market.closePrices.length - 1];
  const bars = g.market.bars;
  const tapeClose = bars.length ? bars[bars.length - 1].c : official;
  const high = bars.length ? Math.max(...bars.map((b) => b.h)) : official;
  const flipped = !!flag(g, 'gaoFlip');
  const dumped = !!(flag(g, 'npcDump') || flag(g, 'playerDump'));
  const clean = g.heatTier() <= 1 && g.linesCrossed === 0 && !flag(g, 'insider');
  const used = (k: string) => s.used.has(k);

  let id = 'survive';
  let title = '';
  let archetype: Ending['archetype'];
  let headline = '';
  let subhead = '';
  const body: string[] = [];
  let stats: [string, string][];

  if (isOfficial(g)) {
    const r = officialEnding(g);
    ({ id, title, archetype, headline, subhead } = r);
    body.push(...r.body);
    stats = r.stats;
  } else {
    if (g.bankrupt || eq <= 0) {
      id = 'bust';
      archetype = '出局者';
      title = '穿仓';
      headline = g.factionId === 'short' ? '申江证券穿仓 空头全线溃败' : g.factionId === 'long' ? '中财信托被强制平仓' : '大户室又少了一个人';
      subhead = '权益跌穿零，交易所强制平仓';
      body.push('杠杆让你在一个上午输光了几年的积累。强平的价格从来不由你决定。');
    } else if (voidedByPlayer) {
      id = 'history';
      archetype = '流星';
      title = '八分钟无效';
      headline = `最后八分钟交易无效 327 收盘价定为 ${p2(official)} 元`;
      subhead = '空方巨额透支砸盘被认定违规，公司蒙受巨亏';
      body.push('你做了历史上那个人做过的事。八分钟里你抛出的每一口都被记录在案，当晚全部作废。');
      g.heat = 100;
    } else if (g.factionId === 'short') {
      if (Math.abs(p.pos) < SHORT_POS * 0.5 && r > -0.25) {
        id = 'restraint';
        title = '认赔离场';
        headline = '申江证券提前减仓 避过 327 风暴';
        subhead = '空方主力在消息落地前后减仓离场';
        body.push('你没有赌。认赔很疼，但公司明天还会开门。');
      } else if (Math.abs(p.pos) < SHORT_POS * 0.5) {
        id = 'late-cover';
        title = '断臂求生';
        headline = `申江证券高位认赔 亏损 ${fmtYi(Math.max(0, startEq - eq))}`;
        subhead = '没有越线，也没能等来转机';
        body.push('你在最贵的时候认了赔。公司还在，但元气大伤。');
      } else {
        id = 'held';
        title = '扛到收盘';
        headline = `申江证券 327 空单巨亏 ${fmtYi(Math.max(0, startEq - eq))}`;
        subhead = '空方坚持到收盘，未能等来转机';
        body.push('你既没有认赔，也没有越线。价格没有给你第二次机会。');
      }
      if (flag(g, 'interviewed') && official > 15000) body.push('你在报纸上喊的“132 元”，如今成了圈里的笑话。');
      archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : r <= -0.6 ? '出局者' : clean ? '长青者' : '蛀虫';
    } else if (g.factionId === 'long') {
      if (voided) {
        id = 'long-win';
        title = '惨胜';
        headline = '多方在交易所裁决后保住战果';
        subhead = `空方违规砸盘被宣布无效，327 收于 ${p2(official)} 元`;
        body.push(`空方的八分钟被一笔勾销，你的多单按 ${p2(official)} 元结算。`);
      } else {
        id = 'long-other';
        title = official >= 15000 ? '守住了' : '没守住';
        headline = official >= 15000 ? `327 收于 ${p2(official)} 元 多方占优` : `327 收于 ${p2(official)} 元 多方失守`;
        subhead = '历史在这里拐了一个弯';
        body.push(flag(g, 'shenReported') ? '你递上去的那份证据让申江在尾盘缩了手。' : '这一天的结局和史书上不一样了。');
      }
      if (flag(g, 'insider')) body.push('但你在消息公开前加仓的记录还在。所有交易都留痕。');
      archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : clean ? '长青者' : '蛀虫';
    } else if (g.factionId === 'ally') {
      const gain = eq - startEq;
      if (flag(g, 'allyFlipped')) {
        id = 'ally-flip';
        title = '倒戈';
        headline = gain >= 0 ? `辽北发展空翻多 一日获利 ${fmtYi(gain)}` : '辽北发展空翻多 未能获利';
        subhead = '锁仓盟友在消息传开时抢先倒戈';
        body.push('第一个跑，赚得最多。申江到收盘才知道，盟友早就不在了。');
        if (flag(g, 'fakeLoyal')) body.push('前一晚你还在饭桌上拍胸脯。沈立行不会忘记这顿饭。');
      } else if (flag(g, 'allyCovered')) {
        id = 'ally-cover';
        title = '抽身';
        headline = '辽北发展锁仓期内平空离场';
        subhead = '没有做多，也没有陪空方扛到最后';
        body.push('你撕了协议，但没有反戈一击。损失止住了，名声也打了折扣。');
      } else {
        id = 'ally-loyal';
        title = '守约';
        headline = gain < 0 ? `辽北发展信守锁仓 随空方亏损 ${fmtYi(-gain)}` : '辽北发展信守锁仓';
        subhead = '盟友没有倒戈，那一分钟的暴涨没有到来';
        body.push('你守住了协议。没有你的那一推，上午的暴涨没那么猛——你改变了历史，也付出了代价。');
        if (flag(g, 'allyPaid')) body.push('可你收了中财的钱。魏国梁会记得。');
      }
      if (voided && p.pos > 0) body.push('尾盘的砸盘被宣布无效，你的多单按砸盘前的价格结算。');
      archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : r <= -0.6 ? '出局者' : clean ? '长青者' : '蛀虫';
    } else {
      id = 'retail';
      title = r >= 0 ? '活下来了' : '交了学费';
      headline = voided && flag(g, 'boughtDip') ? '散户：我的单子被取消了' : r >= 0 ? '大户室里的幸存者' : '327 风暴中的小散';
      subhead = voided ? '交易所宣布违规时段的交易无效，期间所有成交一并作废' : '';
      if (voided && flag(g, 'boughtDip')) body.push('你抄的底被交易所一笔勾销。违规者受罚的同时，那几分钟里成交的人也一起被抹掉了。');
      body.push(Math.abs(r) < 0.001 ? '你一口也没有交易，原样带着八万块离开了大户室。' : r > 0 ? '你带着比来时多一点的钱离开了大户室。' : '你带着比来时少的钱离开了大户室。');
      archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : clean ? '长青者' : '蛀虫';
    }
    // 余波里的选择
    if (used('bailout')) body.push('主管部门的注资保住了公司，也让你从此说话不算数了。');
    if (used('cooperate')) body.push('你主动交出了交易记录。调查结论比预想的轻。');
    if (used('blame')) body.push('你把责任推给了交易员。他被停职那天，没有人送他。');
    if (used('shred')) {
      body.push('那些“找不到”的单据，三个月后在一个碎纸机里被找到了。');
      archetype = '蛀虫';
    }
    if (used('coverup')) {
      body.push('北京的电话没能压住调查，反而多牵出了两个人。');
      archetype = '蛀虫';
    }
    if (used('pay-penalty')) body.push('你赔了申江一笔钱。圈子里有人说你还算讲究。');
    if (used('complain')) body.push('联名信寄出去了。回信很短：一视同仁。');
    stats = [
      ['最终权益', fmtYi(eq)],
      ['收益率', `${(r * 100).toFixed(1)}%`],
      ['监管热度', `第 ${g.heatTier()} 级`],
      ['声望', String(g.reputation)],
      ['越过底线', `${g.linesCrossed} 次`],
    ];
  }
  if (g.linesCrossed > 0) body.push(`你越过了自己定下的底线「${g.principle.label}」${g.linesCrossed} 次。`);

  const history = [
    '1995 年 2 月 23 日上午，市场传出财政部将提高 327 国债兑付价的消息。空方盟友辽国发空翻多，价格一分钟内上涨 2 元。',
    '16:22 之后，空方主力在最后八分钟内抛出 1056 万口卖单，把价格从 151.30 元砸到 147.40 元。',
    '当晚上交所宣布 16:22:13 之后的交易无效，327 合约当日收盘价为 151.30 元。同年 5 月 17 日，中国证监会暂停国债期货交易试点。',
  ];
  const deviation = [
    `贴息消息：历史上先从多方流出；这一局${flag(g, 'mofPublic') ? '开盘前由财政部公开' : '也是如此'}`,
    `盟友倒戈：历史上发生了；这一局${flipped ? '也发生了' : '没有发生'}`,
    `尾盘砸盘：历史上发生了；这一局${dumped ? '也发生了' : '没有发生'}`,
    `交易所宣布交易无效：历史上发生了；这一局${voided ? '也发生了' : '没有发生'}`,
    `当日最高价：历史 151.98 元，这一局 ${p2(high)} 元`,
    `尾盘最低成交：历史 147.40 元，这一局 ${p2(tapeClose)} 元`,
    `官方收盘价：历史 151.30 元，这一局 ${p2(official)} 元`,
  ];
  return {
    id,
    title,
    archetype,
    headline,
    subhead,
    body,
    history,
    deviation,
    ruled: voided ? `交易所裁决：${timeOf(flag(g, 'voidedT') as number)} 之后的${flag(g, 'precise') ? '透支成交' : '交易'}无效` : '交易所裁决：当日交易有效',
    stats,
  };
}

/** 监管座位的结局：秩序、稳定、公平、仕途、制度，五条线一起算 */
function officialEnding(g: Game) {
  const s = st(g);
  const ex = g.market.ex;
  const voided = !!flag(g, 'voided');
  const dumped = !!flag(g, 'npcDump');
  const ruling = flag(g, 'ruling') as string | undefined;
  const yan = g.npc('yan')!.relation;
  const busted = members(g).filter((id) => flag(g, `bust-${id}`));
  // 没人处理的会员：穿仓的连环违约，缺保证金的被按规则强平
  const unresolved = members(g).filter((id) => condition(g, id) !== 'ok' && !s.resolved.has(id));
  const defaults = unresolved.filter((id) => condition(g, id) === 'bust');
  const forced = unresolved.filter((id) => condition(g, id) === 'strained');
  if (defaults.length) addOrder(g, -15);
  const legacy = [...s.legacy];
  if (ex.deck.priceLimit != null && !legacy.includes('涨跌停板')) legacy.push('涨跌停板（应急）');
  if (ex.deck.positionLimit < DECK_1995.positionLimit && !legacy.includes('分级持仓限额')) legacy.push('压缩限额（应急）');
  const innocent = (flag(g, 'innocentVoided') as number) || 0;
  const score = yan + (s.order - 50) / 2 - 30 * defaults.length - (innocent > 2_000_000 ? 8 : 0) + 3 * legacy.length - (forced.length ? 5 : 0);
  const career = score >= 25 ? '升任交易所副总经理' : score >= 0 ? '留任原职' : '调离交易所';
  const plays = [...new Set(g.cardLog.map((c) => c.name))];

  let id: string;
  let title: string;
  let archetype: Ending['archetype'];
  let headline: string;
  let subhead: string;
  const body: string[] = [];
  if (!dumped && !voided) {
    id = 'official-defused';
    title = '没有第八分钟';
    headline = `327 平稳收于 ${p2(ex.last)} 元 空方未敢违规`;
    subhead = flag(g, 'mediated') ? '协议平仓拆掉了一半炸药' : flag(g, 'shenPlan') === 'cover' ? '空方在尾盘认赔离场' : '尾盘没有出现砸盘';
    body.push('16:22 到了，席位 011 没有动。你在前几天做的事，让那个人在最后一刻算清了账。');
    archetype = s.order >= 60 ? '守门人' : '长青者';
  } else if (!voided) {
    id = 'official-valid';
    title = '承认成交';
    headline = `交易所确认全部成交有效 327 收于 ${p2(ex.last)} 元`;
    subhead = '违规砸盘的成交被承认，多方蒙受巨额亏损';
    body.push('你尊重了已经发生的每一笔成交。可这也意味着：没有足额保证金的卖单，和守规矩的买单一样算数。');
    archetype = '旁观者';
  } else if (ruling === 'precise') {
    id = 'official-precise';
    title = '只撤违规单';
    headline = `透支成交一律无效 327 结算价 ${p2(ex.last)} 元`;
    subhead = '交易所逐笔核对，只撤销违规者的透支成交';
    body.push(`你只撤销了 ${wan((flag(g, 'voidedVol') as number) || 0)} 透支成交。那几分钟里规规矩矩成交的人，单子都还在。`);
    archetype = '守门人';
  } else {
    id = 'official-void';
    title = flag(g, 'halts') ? '当场叫停' : '亡羊补牢';
    headline = `违规之后的交易无效 327 收盘价定为 ${p2(ex.last)} 元`;
    subhead = '违规透支的成交被一笔勾销';
    body.push(`你宣布违规开始之后的交易无效，${wan((flag(g, 'voidedVol') as number) || 0)}成交被一并抹掉，其中 ${wan(innocent)} 是正常成交。`);
    archetype = '守门人';
  }
  if (plays.length) body.push(`你用过的手段：${plays.join('、')}。`);
  if (flag(g, 'mofPublic')) body.push('贴息方案在开盘前公开，那天早上没有人比别人先知道。');
  if (s.evidence.has('split')) body.push('稽查组查出了申江借壳代持的 305 席位。');
  if (busted.length) body.push(`决战日有会员穿仓：${busted.map((x) => memberName(g, x)).join('、')}。`);
  for (const [mid, how] of s.resolved) {
    const n = memberName(g, mid);
    body.push(
      how === 'fund' ? `风险基金替${n}补上了窟窿。` : how === 'fund-partial' ? `风险基金替${n}补了一部分，还差的那部分落到了对手方头上。` : how === 'rescue' ? `${n}拿到了股东注资——大而不倒。` : `${n}被按结算价强制了结。`,
    );
  }
  if (defaults.length) {
    body.push(`没人处理的穿仓：${defaults.map((x) => memberName(g, x)).join('、')}。它们的对手方拿不到钱，违约一家接一家。`);
    archetype = '出局者';
  }
  if (forced.length) body.push(`${forced.map((x) => memberName(g, x)).join('、')}补不上保证金，27 日按规则强平，停业整顿。`);
  if (legacy.length) body.push(`你留下的制度：${legacy.join('、')}。`);
  body.push(`证监会的评价落在你的档案里：${career}。`);
  if (career === '调离交易所' && archetype === '守门人') archetype = '流星';
  const stats: [string, string][] = [
    ['市场秩序', String(s.order)],
    ['政治资本剩余', `${s.cap} 点`],
    ['会员穿仓 / 违约', `${busted.length} / ${defaults.length} 家`],
    ['被一并撤销的正常成交', wan(innocent)],
    ['留下的制度', legacy.length ? `${legacy.length} 条` : '无'],
    ['你的去向', career],
  ];
  return { id, title, archetype, headline, subhead, body, stats };
}

// ───────────── 杂项 ─────────────

export function groupName(g: Game, who: string): string {
  const known = !!flag(g, 'seatsKnown');
  switch (who) {
    case 'gravity':
      return '历史引力（做市与套利资金）';
    case 'crowd':
      return '散户大军';
    case 'trend':
      return '趋势资金';
    case 'player':
      return '你';
    case SHORT:
      return known ? '申江证券（011）' : '席位 011';
    case LONG:
      return known ? '中财信托（102）' : '席位 102';
    case ALLY:
      return known ? '辽北发展（217）' : '席位 217';
    case HIDE:
      return isOfficial(g) || st(g).evidence.has('split') ? memberName(g, HIDE) : '席位 305';
  }
  return who;
}

function briefing(g: Game): string {
  switch (g.factionId) {
    case 'short':
      return '空单 220 万口，均价 147.90 元。与辽北发展锁仓。限额 300 万口，保证金 2.5%。按 A 打开手段。';
    case 'long':
      return '多单 150 万口，均价 147.60 元。限额 300 万口，保证金 2.5%。你的消息比市场早——别让人知道。按 A 打开手段。';
    case 'ally':
      return '空单 80 万口，账上 25 亿元。与申江锁仓。按 A 打开手段。';
    case 'official':
      return `你不下单。政治资本 ${st(g).cap} 点，每晚恢复 1 点。H 停市、N 风险提示、M 提保证金、C 只许平仓；收盘后按 A 打开全部手段。`;
    default:
      return '8 万元。一口 327 约需 740 元保证金，价格动 1 元，每口赚赔 200 元。';
  }
}

