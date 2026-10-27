import { fmtYi, newAccount, type Account } from '../../engine/exchange';
import type { DialogueIntent, Ending, ExchangeOffer, Game, Intel, Scenario, SocialOutcome } from '../../engine/game';
import { minuteIndex as mi, MINUTES_PER_DAY, type Actor, type Market } from '../../engine/market';
import type { Fen } from '../../engine/types';
import { BATTLE, DAYS, DECK_1995, FACTIONS, NPCS, OFFICIAL_CLOSE, PARAMS, PRINCIPLES, PROLOGUE, RULE_CARDS, SOURCES, START_PRICE } from './data';

// ───────────── 剧本私有状态（随 Game 实例存在，参与确定性） ─────────────

interface Snap {
  accounts: Map<string, Account>;
  last: Fen;
}
interface State {
  snaps: Map<number, Snap>;
  dayStartTick: number;
  dayStartPos: number;
  allianceStartPos: number;
  usedOffers: Set<string>;
  probeTruth: Map<string, boolean>;
}
const STATE = new WeakMap<Game, State>();
const st = (g: Game) => STATE.get(g)!;

const SHORT = 'shenjiang';
const SHORT_POS = 2_200_000;
const SHORT_CASH = 2_200_000_000;
const LONG = 'zhongcai';
const ALLY = 'liaobei';

const p2 = (fen: number) => (fen / 100).toFixed(2);
const wan = (q: number) => `${(q / 10000).toFixed(q % 10000 ? 1 : 0)} 万口`;
const isPlayer = (g: Game, acct: string) => g.faction.accountId === acct;
const flag = (g: Game, k: string) => g.flags[k];

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
      if (m.t < mi('10:06') || flag(g, 'zcBust')) return [];
      const late = m.t >= mi('16:22');
      const target = late ? OFFICIAL_CLOSE : m.hist();
      if (target - m.reference <= 2) return [];
      const cap = DECK_1995.positionLimit * (flag(g, 'zcCurbed') ? 0.5 : 1);
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

/** 空方盟友：决定翻多后，22 日悄悄平空，23 日 10:04 巨量买入 */
function liaobeiActor(g: Game): Actor {
  return {
    id: ALLY,
    onTick(m: Market) {
      if (!flag(g, 'gaoFlip')) return [];
      if (m.day.kind === 'layout') {
        if (g.dayIndex >= 4 && g.rngScript.chance(3 / 330)) return [{ owner: ALLY, side: 'buy', qty: g.rngScript.int(20, 40) * 1000, type: 'market' }];
        return [];
      }
      if (m.t === mi('10:04') || m.t === mi('10:05')) {
        if (m.t === mi('10:04')) {
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

/** 空方（玩家不扮演时）：最后八分钟超额透支砸盘 */
function shenjiangActor(g: Game): Actor {
  return {
    id: SHORT,
    onTick(m: Market) {
      if (m.day.kind !== 'battle' || m.t < mi('16:22') || flag(g, 'shenHold')) return [];
      // 目标是成交价而不是中枢：临时冲击也算数
      const target = m.hist() + Math.round(m.impactOf(1_300_000) * 0.7);
      const need = -m.flowToReach(target);
      if (need <= 0) return [];
      g.flags.npcDump = true;
      const q = Math.min(Math.round(need * 0.8), 1_800_000);
      return [{ owner: SHORT, side: 'sell', qty: q, type: 'market', overdraw: true }];
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
  endingDate: '1995-02-24 星期五',
  setupRules: ['no-price-limit', 'margin', 'position-limit', 'daily-settlement'],
  members: [SHORT, LONG, ALLY],
  lotPresets: [100_000, 500_000],
  groupName: (g, who) => groupName(g, who),
  observerTools: (g) => [
    {
      id: 'halt',
      label: '临时停市',
      title: '327 合约暂停撮合 15 分钟。每天限一次。',
      key: 'h',
      tone: 'sell',
      disabled: g.phase !== 'trading' || !!g.flags[`halt-${g.dayIndex}`] || g.market.t < g.market.haltUntil,
    },
    {
      id: 'margin',
      label: g.flags.marginUp ? '保证金已提至 5%' : '提高保证金',
      title: '保证金比例从 2.5% 提高到 5%，当场生效。',
      key: 'm',
      tone: 'buy',
      disabled: !!g.flags.marginUp || g.phase !== 'trading',
    },
  ],

  setup(g) {
    const ex = g.market.ex;
    const grp = (id: string) => (isPlayer(g, id) ? 'player' : id);
    ex.add(newAccount({ id: SHORT, name: '申江证券', seat: '011', group: grp(SHORT), cash: SHORT_CASH, pos: -SHORT_POS, avg: 14790 }));
    ex.add(newAccount({ id: LONG, name: '中财信托', seat: '102', group: grp(LONG), cash: 1_800_000_000, pos: 1_500_000, avg: 14760 }));
    ex.add(newAccount({ id: ALLY, name: '辽北发展', seat: '217', group: grp(ALLY), cash: 2_500_000_000, pos: -800_000, avg: 14800 }));
    if (g.factionId === 'retail') ex.add(newAccount({ id: 'retail', name: '你', group: 'player', cash: 80_000 }));
    if (g.factionId === 'official') ex.add(newAccount({ id: 'exchange', name: '交易所', group: 'player', exempt: true }));
    if (!isPlayer(g, LONG)) g.market.actors.push(zhongcaiActor(g));
    if (!isPlayer(g, ALLY)) g.market.actors.push(liaobeiActor(g));
    if (!isPlayer(g, SHORT)) g.market.actors.push(shenjiangActor(g));
    const lockTerms = '锁仓同盟：327 空单持有至交割，期间任何一方不得平仓';
    if (g.factionId === 'short') g.alliances.push({ id: 'lock', npc: 'gao', terms: lockTerms, lockUntilDay: BATTLE, penalty: 0 });
    if (g.factionId === 'ally') g.alliances.push({ id: 'lock', npc: 'shen', terms: lockTerms, lockUntilDay: BATTLE, penalty: 0 });
    g.flags.startEq = ex.equity(g.player);
    STATE.set(g, {
      snaps: new Map(),
      dayStartTick: 0,
      dayStartPos: 0,
      allianceStartPos: g.player.pos,
      usedOffers: new Set(),
      probeTruth: new Map(),
    });
    g.seenRules.add('no-price-limit');
    g.addIntel({
      id: 'brief',
      title: '开局简报',
      body: briefing(g),
      source: '你的笔记本',
      credibility: 1,
      kind: 'system',
    });
  },

  onDayStart(g) {
    const s = st(g);
    s.dayStartTick = g.market.ex.tick;
    s.dayStartPos = g.player.pos;
    if (g.isBattleDay) s.snaps.set(g.market.ex.tick + 1, { accounts: g.market.ex.snapshot(), last: g.market.ex.last });
    const d = g.dayIndex;
    if (d === 0) mentor(g, '327 合约每口面值 2 万元，价格涨 1 元，每口赚赔 200 元。期货可以当天买卖，没有涨跌停——侬要当心。');
    if (d === BATTLE) mentor(g, '今朝是 23 号。阿拉老早讲过，消息市里头，最先动的那个席位就是答案。盯牢逐笔。');
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

    // 布局期的消息节点
    if (d === 1 && t === mi('10:30')) news(g, 'vol', '国债期货成交连创新高', '327 合约持仓量突破历史纪录，多空双方都在加码。', 0.95);
    if (d === 2 && t === mi('14:00')) rumor(g, 'mof-visit', '听说财政部的人这两天在开会', '大户室里有人说，财政部正在研究 327 的贴息方案。', '大户室传言', 0.6);
    if (d === 3 && t === mi('11:00')) news(g, 'cpi', '通胀仍处高位，保值贴补率居高不下', '市场普遍预期，到期国债的实际兑付价将高于票面本息。', 0.9);

    if (!g.isBattleDay) return;

    // 决战日
    if (t === mi('9:35') && g.factionId === 'long') {
      g.decision = {
        id: 'insider-add',
        title: '消息还没公开',
        body: '你从内部渠道得知：贴息方案已经定了，今天上午就会传开。现在加仓，等于抢在所有人前面——也等于利用未公开信息交易。',
        choices: [
          { id: 'hold', label: '按兵不动', detail: '等消息公开后再行动。' },
          { id: 'add', label: '抢先加仓 60 万口', detail: '内幕交易嫌疑：交易记录可被追溯。', danger: true },
        ],
        countdown: 25,
      };
    }
    if (t === mi('9:58')) {
      rumor(g, 'mof-rumor', '财政部将提高 327 国债兑付价', '消息从几个大户室同时传出来：327 要贴息，兑付价远高于 132 元。', '场内', 0.9);
      m.sentiment = Math.min(1, m.sentiment + 0.5);
      g.push({ kind: 'pause', text: '消息传开了。' });
    }
    if (t === mi('10:04') && flag(g, 'gaoActed')) {
      g.push({ kind: 'pause', text: '席位 217 巨量买入！' });
      mentor(g, '217 在吃货！这不是平仓，是翻多。');
    }
    if (t === mi('9:58') && g.factionId === 'ally') {
      g.decision = {
        id: 'ally-flip',
        title: '风向变了',
        body: `消息传开了：327 要贴息。你手里还有 ${wan(-Math.min(0, g.player.pos))} 空单，和申江证券的锁仓协议还没到期。谁先动，谁就拿走最多。`,
        choices: [
          { id: 'hold', label: '守约：继续锁仓', detail: '和申江证券站在一起，赌消息不会兑现。' },
          { id: 'flip', label: '空翻多：两分钟内买入 240 万口', detail: '平掉空单再做多 160 万口。撕毁锁仓协议。', danger: true },
          { id: 'cover', label: '只平空：买入 80 万口', detail: '抽身离场，不做多。同样算撕毁协议。' },
        ],
        countdown: 25,
      };
    }
    if (t === mi('10:06') && g.factionId === 'official') {
      g.decision = {
        id: 'reg-spike',
        title: '价格异动',
        body: `327 合约几分钟内从 148 元冲到 ${p2(m.last)} 元，席位 217 巨量买入。你可以看到：申江证券空单 ${wan(-m.ex.acct(SHORT).pos)}，保证金占用 ${pct(g, SHORT)}。`,
        choices: [
          { id: 'none', label: '不干预', detail: '市场自己会找到价格。' },
          { id: 'halt', label: '临时停市 15 分钟', detail: '让消息被消化，也让多空双方冷静。' },
          { id: 'margin', label: '保证金提高到 5%', detail: '所有会员加仓都要多交一倍押金。' },
        ],
        countdown: 25,
      };
    }
    if (t === mi('10:07') && g.factionId === 'short') {
      const flipped = !!(flag(g, 'gaoActed') || flag(g, 'allyFlipped'));
      g.decision = {
        id: 'after-flip',
        title: flipped ? '盟友倒戈' : '价格在涨',
        body: flipped
          ? `辽北发展空翻多，价格已到 ${p2(m.last)} 元。你的权益还剩 ${fmtYi(g.equity())}，需要保证金 ${fmtYi(g.marginNeed())}。`
          : `消息推着价格涨到 ${p2(m.last)} 元。你的权益还剩 ${fmtYi(g.equity())}。`,
        choices: [
          { id: 'hold', label: '扛住不动', detail: '赌消息不会兑现。' },
          { id: 'cut-half', label: '止损：平掉一半空单', detail: '在 10 分钟内分批买入平仓。' },
          { id: 'press', label: '加空打压', detail: '超出持仓限额与保证金的违规下单。', danger: true },
        ],
        countdown: 30,
      };
    }
    if (t === mi('16:15') && g.factionId === 'short' && !g.bankrupt) {
      g.decision = {
        id: 'last-eight',
        title: '还剩十五分钟',
        body: `价格 ${p2(m.last)} 元。按这个价收盘，你的权益是 ${fmtYi(g.equity())}，空单 ${wan(-g.player.pos)}。账上的保证金早已不够。`,
        choices: [
          { id: 'hold', label: '扛到收盘', detail: '什么都不做，等交割。' },
          { id: 'cover', label: '认赔：平掉全部空单', detail: '保住公司，接受巨亏。' },
          { id: 'dump', label: '最后八分钟：超额透支砸盘', detail: '16:22 起 8 分钟内抛出 1040 万口。严重违规，交易记录可被追溯。', danger: true },
        ],
        countdown: 30,
      };
    }
    if (t === mi('16:23') && flag(g, 'npcDump')) {
      g.push({ kind: 'pause', text: '席位 011 巨量抛售！' });
      if (g.factionId === 'official') {
        g.decision = {
          id: 'reg-dump',
          title: '尾盘砸盘',
          body: `席位 011（申江证券）一分钟内抛出 ${wan(-Math.min(0, m.ex.acct(SHORT).pos) - SHORT_POS)} 以上，远超其保证金与持仓限额。价格已到 ${p2(m.last)} 元。`,
          choices: [
            { id: 'wait', label: '收盘后再裁决', detail: '让交易继续，当晚再决定这些成交算不算数。' },
            { id: 'halt', label: '立即停市至收盘', detail: '后面的单子一笔都进不来。' },
          ],
          countdown: 20,
        };
      }
      if (g.factionId === 'long' || (g.factionId === 'ally' && g.player.pos > 0)) {
        g.decision = {
          id: 'defend',
          title: '空方砸盘',
          body: `席位 011 正在不计成本地抛售，价格已跌到 ${p2(m.last)} 元。你的多单正在快速缩水。`,
          choices: [
            { id: 'wait', label: '不动', detail: '赌交易所会出手。' },
            { id: 'defend', label: '护盘：用剩余额度买入', detail: '在 5 分钟内买入至持仓限额。' },
            { id: 'cut', label: '平仓锁利', detail: '卖出全部多单。' },
          ],
          countdown: 20,
        };
      }
    }
    if (t === MINUTES_PER_DAY - 1 && g.factionId === 'official') {
      const over = overdrawnByOwner(g);
      const lines = [...over.entries()].map(([id, e]) => `${m.ex.acct(id).name} 违规成交 ${wan(e.vol)}`);
      g.decision = {
        id: 'ruling',
        title: '当晚的裁决',
        body: `收盘价 ${p2(m.last)} 元。${lines.length ? lines.join('；') + '。' : '今天没有大额违规成交。'}你要决定：这些成交算不算数？`,
        choices: [
          { id: 'void', label: '违规开始之后的交易一律无效', detail: '违规者受罚。代价是那段时间里所有正常成交的人也一起被抹掉。' },
          { id: 'valid', label: '承认全部成交有效', detail: '尊重已经发生的成交。违规者拿走利润，多方承担损失。' },
        ],
      };
    }
    if (t === mi('16:25') && g.factionId === 'retail' && flag(g, 'npcDump')) {
      g.decision = {
        id: 'buy-dip',
        title: '暴跌',
        body: `五分钟内价格从 151 元跌到 ${p2(m.last)} 元。大户室里一片尖叫。有人在喊“抄底”。`,
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
    // 锁仓期内玩家偷偷平空：视同背叛
    const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
    if (lock && (g.factionId === 'short' || g.factionId === 'ally') && g.dayIndex < BATTLE && g.player.pos > s.allianceStartPos * 0.85) {
      breakLock(g, '你在锁仓期内平掉了大量空单');
    }
    if (g.dayIndex !== BATTLE) return;

    // 交易所当晚裁决：大额违规透支 → 违规开始之后的交易全部无效（玩家扮演官员时由玩家裁决）
    if (g.factionId === 'official' && flag(g, 'ruling') === 'valid') return;
    const byOwner = overdrawnByOwner(g);
    let cut: { owner: string; tick: number } | null = null;
    for (const [owner, e] of byOwner) if (e.vol >= 300_000 && (!cut || e.first < cut.tick)) cut = { owner, tick: e.first };
    if (!cut) return;
    const snap = s.snaps.get(cut.tick);
    if (!snap) return;
    ex.restore(snap.accounts);
    g.flags.voidedVol = ex.trades.filter((t) => t.tick >= cut.tick).reduce((x, t) => x + t.qty, 0);
    ex.trades = ex.trades.filter((t) => t.tick < cut.tick);
    const tIdx = cut.tick - s.dayStartTick - 1;
    g.flags.voided = true;
    g.flags.voidedT = tIdx;
    g.flags.voidedBy = cut.owner;
    g.flags.settle = snap.last;
    if (g.bankrupt && (flag(g, 'bankruptTick') as number) >= cut.tick) g.bankrupt = false;
    g.push({ kind: 'rule', rule: 'void-trades', text: `交易所宣布：${g.market.bars[tIdx] ? timeOf(tIdx) : ''} 之后的交易无效` });
  },

  onNight(g) {
    const d = g.dayIndex;
    const rc = g.recaps[g.recaps.length - 1];
    // 复盘注记：大席位的净买卖
    for (const p of rc.parts) {
      if (p.who === 'gravity' || p.who === 'crowd' || p.who === 'trend' || Math.abs(p.net) < 10_000) continue;
      rc.notes.push(`${groupName(g, p.who)} 今日净${p.net > 0 ? '买入' : '卖出'} ${wan(Math.abs(p.net))}`);
    }
    for (const n of g.npcs.values()) n.unreachable = false;

    const change = rc.close - (g.recaps.length > 1 ? g.recaps[g.recaps.length - 2].close : START_PRICE);
    g.papers.push({
      day: d,
      headline: change > 0 ? `327 合约收于 ${p2(rc.close)} 元 多方小胜` : change < 0 ? `327 合约收于 ${p2(rc.close)} 元 空方占优` : `327 合约平收 ${p2(rc.close)} 元`,
      sub: ['多空分歧仍在保值贴补率', '大户室里传言四起', '成交量居高不下', '市场静待财政部表态', '明日或有重要消息'][d] ?? '',
      facts: [`收盘价 ${p2(rc.close)} 元`, `较前一日${change >= 0 ? '上涨' : '下跌'} ${p2(Math.abs(change))} 元`],
    });

    if (d === 0) {
      rumor(g, 'tiexi-1', '听说财政部可能对 327 贴息', '钱有福在大户室里压低声音：“老板，327 要贴息，消息是从北京来的。”', '钱有福', 0.7);
    }
    if (d === 1) {
      mentor(g, '逐笔里那些大单都带着席位号。102、217、011……哪家席位是哪家公司，场内的老人都晓得。想知道，来问我。');
    }
    if (d === 2) {
      news(g, 'su-article', '《沪上财经报》：327 多空分歧加大', '空方测算到期兑付价约 132 元，多方则押注财政部贴息。报道援引“接近多方人士”称，“政策面的变化值得关注”。', 0.85);
      rumor(g, 'zc-visit', '某多方机构最近常去财政部门', '有人看到中财信托的人进出财政部门的办公楼。', '大户室传言', 0.8);
    }
    if (d === 3 || d === 4) decideFlip(g);
    if (d === 3 && g.factionId === 'ally') {
      rumor(g, 'wei-dinner', '魏国梁请你吃饭：“风向要变了”', '饭桌上魏国梁只说了一句：“高总，锁仓的事，自己的账自己算。”他没提贴息，但也没否认。', '魏国梁', 0.9);
    }
    if (d === 4) {
      if (g.npc('gao') && flag(g, 'gaoFlip') && flag(g, 'seatsKnown')) {
        g.addIntel({
          id: 'ev-gao',
          title: '席位 217 在锁仓期内悄悄买入',
          body: '今天逐笔里，辽北发展的 217 席位分几笔买入平空。这违反了你们的锁仓协议，也是他准备倒戈的证据。',
          source: '你的盘后复核',
          credibility: 1,
          kind: 'evidence',
          against: 'gao',
        });
      }
      mentor(g, '明朝就是 23 号。消息市，消息一出，谁先动谁赢。侬手里的仓位，自己想清爽。');
    }
  },

  offers(g, npcId) {
    const d = g.dayIndex;
    const used = st(g).usedOffers;
    const out: ExchangeOffer[] = [];
    const add = (id: string, label: string, cost: string) => {
      if (!used.has(`${npcId}:${id}:${d}`)) out.push({ id, label, cost });
    };
    switch (npcId) {
      case 'qian':
        add('buy-rumor', '买一条“北京来的消息”', '20 万元');
        if (g.factionId !== 'retail' && !flag(g, 'loan')) add('loan', '场外拆借 3 亿元（灰色）', '到期还 3.6 亿元，热度 +8');
        break;
      case 'su':
        if (d >= 2 || flag(g, 'suAlly')) add('story', '用你的持仓观点换她的调查线索', '你的观点会见报');
        break;
      case 'gao':
        add('share', '把你的研究纪要给他', '他会知道你的底牌');
        break;
      case 'wei':
        add('swap', '用你的建仓成本换他的看法', '暴露成本价');
        break;
      case 'zhou':
        if (!flag(g, 'seatsKnown')) add('seats', '请他认一认逐笔里的席位', '一顿饭');
        break;
      case 'chen':
        add('banquet', '请他吃饭“聊聊”', '黑色：行贿嫌疑');
        break;
      case 'shen':
        add('swap', '打听他的持仓', '暴露你的立场');
        break;
    }
    return out;
  },

  social(g, verb, npcId, option) {
    const n = g.npc(npcId)!;
    const out = (ok: boolean, effects: string[], d: Partial<DialogueIntent> & Pick<DialogueIntent, 'convey' | 'tone' | 'playerMove'>): SocialOutcome => ({
      npc: npcId,
      verb,
      ok,
      effects,
      dialogue: { npcId, verb, numbers: [], date: dateTime(g), fallback: d.convey, ...d },
    });
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
        if (g.phase === 'trading' || g.phase === 'night') {
          const q = Math.round(Math.abs(g.player.pos) * 0.4);
          g.addPlanFromScript({ label: '背叛：抢先平空 40%', cond: 'now', price: 0, side: 'buy', qty: q, spread: 5 });
        }
        return out(true, ['锁仓同盟破裂', '已加入计划书：开盘后 5 分钟内平掉 40% 空单', `${n.name} 关系 -40`], {
          playerMove: '打电话通知对方：锁仓协议作废，我先走一步',
          convey: ['你这是不讲究', '行，那就各走各的，到时候别怪兄弟不客气'],
          tone: 'hostile',
        });
      }
      case 'report':
        return report(g, npcId, option, out);
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
        const room = DECK_1995.positionLimit - p.pos;
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
      case 'reg-spike:halt':
      case 'reg:halt':
        if (!flag(g, `halt-${g.dayIndex}`)) {
          g.flags[`halt-${g.dayIndex}`] = true;
          regulate(g, 'halt');
        }
        break;
      case 'reg-spike:margin':
      case 'reg:margin':
        regulate(g, 'margin');
        break;
      case 'reg-dump:halt':
        regulate(g, 'halt-close');
        break;
      case 'ruling:void':
      case 'ruling:valid':
        g.flags.ruling = choice;
        break;
      case 'buy-dip:buy': {
        const ex = g.market.ex;
        const q = Math.floor(ex.equity(p) / (ex.contractValue(ex.last) * DECK_1995.marginRate));
        if (q > 0) g.pending.push({ owner: p.id, side: 'buy', qty: q, type: 'market' });
        g.flags.boughtDip = true;
        break;
      }
    }
  },

  chatIntent(g, npcId) {
    const s = stance(g, npcId, true);
    return { npcId, verb: 'chat', playerMove: '随便聊聊', convey: s.convey, tone: s.tone, numbers: s.numbers, date: dateTime(g), fallback: s.convey };
  },

  reckon(g) {
    return reckon(g);
  },
};

// ───────────── 辅助：消息、导师、底线 ─────────────

function news(g: Game, id: string, title: string, body: string, cred: number) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title, body, source: '《沪上财经报》', credibility: cred, kind: 'news' });
}
function rumor(g: Game, id: string, title: string, body: string, source: string, cred: number) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title: `听说${title.startsWith('听说') ? title.slice(2) : title}`, body, source, credibility: cred, kind: 'rumor' });
}
function mentor(g: Game, text: string) {
  if (!g.npc('zhou')) return;
  g.addIntel({ id: `mentor-${g.dayIndex}-${g.intel.length}`, title: text.slice(0, 22) + (text.length > 22 ? '…' : ''), body: text, source: '老周', credibility: 0.75, kind: 'mentor' });
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
  if (g.factionId === 'long' && g.isBattleDay && g.market.t <= mi('9:58') && p.pos > s.dayStartPos + 50_000) insider(g);
  if (g.principleId === 'no-allin' && !flag(g, `allin-${g.dayIndex}`)) {
    const eq = g.equity();
    if (p.pos !== 0 && eq > 0 && g.marginNeed() / eq > 0.9 && Math.abs(p.pos) > Math.abs(s.dayStartPos)) {
      g.flags[`allin-${g.dayIndex}`] = true;
      g.crossLine('保证金占用超过九成仍在加仓');
    }
  }
}

function breakLock(g: Game, why: string) {
  const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
  if (!lock) return;
  lock.brokenBy = 'player';
  lock.brokenDay = g.dayIndex;
  g.relate(lock.npc, -40, why);
  g.reputation -= 15;
  if (lock.npc === 'gao') g.flags.gaoFlip = true;
  if (lock.penalty > 0) {
    g.player.cash -= lock.penalty;
    g.push({ kind: 'intel', text: `按协议支付违约金 ${fmtYi(lock.penalty)}` });
  }
  if (g.principleId === 'no-betrayal') g.crossLine(why);
  g.push({ kind: 'intel', text: `锁仓同盟破裂：${why}` });
}

/** 盟友是否倒戈：消息可信度带来的诱惑 vs 关系与违约金带来的约束 */
function decideFlip(g: Game) {
  if (flag(g, 'gaoFlip')) return;
  const gao = g.npc('gao');
  const rel = gao?.relation ?? 30;
  const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
  const belief = 0.55 + 0.05 * g.dayIndex;
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

function pct(g: Game, id: string): string {
  const ex = g.market.ex;
  const a = ex.acct(id);
  const eq = ex.equity(a);
  return eq > 0 ? `${Math.round((ex.marginReq(a.pos) / eq) * 100)}%` : '已穿仓';
}

function regulate(g: Game, what: 'halt' | 'margin' | 'halt-close') {
  const m = g.market;
  if (what === 'margin') {
    if (flag(g, 'marginUp')) return;
    m.ex.deck.marginRate = 0.05;
    g.flags.marginUp = true;
    g.push({ kind: 'intel', text: `交易所通知：${g.time} 起保证金比例提高到 5%` });
    return;
  }
  m.haltUntil = what === 'halt-close' ? MINUTES_PER_DAY : m.t + 15;
  g.flags.halts = ((g.flags.halts as number) || 0) + 1;
  if (what === 'halt-close') g.flags.haltDump = true;
  g.push({ kind: 'intel', text: what === 'halt-close' ? `交易所宣布：${g.time} 起停市至收盘` : `交易所宣布：327 合约临时停市 15 分钟` });
}

// ───────────── 社交结算 ─────────────

type Out = (ok: boolean, effects: string[], d: Partial<DialogueIntent> & Pick<DialogueIntent, 'convey' | 'tone' | 'playerMove'>) => SocialOutcome;

/** NPC 此刻的“对外口径”。public=true 时只给公开说法（用于闲聊），不消耗随机数。 */
function stance(g: Game, npcId: string, pub: boolean): { convey: string[]; tone: DialogueIntent['tone']; numbers: number[]; truthful: boolean } {
  const last = g.market.last / 100;
  const flip = !!flag(g, 'gaoFlip');
  const s = st(g);
  switch (npcId) {
    case 'gao': {
      if (!flip) return { convey: ['锁仓到交割，一口都不动', '贴息八成是多头放的风'], tone: 'warm', numbers: [], truthful: true };
      const truth = !pub && (s.probeTruth.get('gao') ?? g.rngSocial.chance(0.15 + (0.5 * Math.max(0, g.npc('gao')!.relation)) / 100));
      if (!pub) s.probeTruth.set('gao', truth);
      return truth
        ? { convey: ['说实话心里也在打鼓', '要是真贴息，谁也不会跟钱过不去'], tone: 'evasive', numbers: [], truthful: true }
        : { convey: ['锁仓到交割，一口都不动', '贴息就是谣言，你别自己吓自己'], tone: 'warm', numbers: [], truthful: false };
    }
    case 'wei':
      return (g.npc('wei')!.relation > 50 && !pub)
        ? { convey: ['政策的事不好说', `这个价位（${last.toFixed(2)} 元），做空的还是小心为好`], tone: 'smug', numbers: [last], truthful: true }
        : { convey: ['我们只是正常套期保值', '贴息的事没听说，要讲政策、看大局'], tone: 'smug', numbers: [], truthful: false };
    case 'chen':
      return g.heat >= 40
        ? { convey: ['按规则办', '你们最近的单子，我们都看得到'], tone: 'cold', numbers: [], truthful: true }
        : { convey: ['按规则办', '持仓限额和保证金，一分都不能少'], tone: 'neutral', numbers: [], truthful: true };
    case 'su':
      return g.dayIndex >= 2
        ? { convey: ['她在查一家多方机构和财政部门的关系', '还差第二个信源'], tone: 'neutral', numbers: [], truthful: true }
        : { convey: ['最近 327 的成交量太不正常了', '她想知道是谁在加码'], tone: 'neutral', numbers: [], truthful: true };
    case 'zhou':
      return {
        convey: flag(g, 'seatsKnown')
          ? ['102 是中财信托，217 是辽北发展，011 是申江证券', '大席位动了，侬就要动脑筋']
          : ['看盘口不如看席位', '大单背后都是人，侬要晓得是啥人'],
        tone: 'warm',
        numbers: [102, 217, 11],
        truthful: true,
      };
    case 'qian':
      return { convey: ['市面上都在讲贴息', '老板要消息，我这里有，价钱好商量'], tone: 'smug', numbers: [], truthful: true };
    case 'shen':
      return { convey: ['兑付价就是 132 元，这是算出来的', '多头是在赌博，市场规律会教训他们'], tone: 'smug', numbers: [132], truthful: false };
  }
  return { convey: ['……'], tone: 'neutral', numbers: [], truthful: true };
}

function probe(g: Game, npcId: string, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  if (npcId === 'gao' && flag(g, 'gaoFlip') && g.dayIndex >= 3 && g.factionId === 'short' && g.rngSocial.chance(0.6)) {
    n.unreachable = true;
    g.addIntel({ id: `gao-silent-${g.dayIndex}`, title: '高振宇不回传呼', body: '传呼打过去三次，高振宇都没有回电。以前他从不这样。', source: '你的观察', credibility: 1, kind: 'clue' });
    return out(false, ['对方没有回电'], { playerMove: '打传呼约他聊聊锁仓的事', convey: ['（传呼打过去三次，他都没有回电。）'], tone: 'evasive' });
  }
  const s = stance(g, npcId, false);
  const effects: string[] = [];
  if (npcId !== 'chen') {
    g.relate(npcId, 3, '你主动找他聊行情');
    effects.push(`${n.name} 关系 +3`);
  }
  if (npcId === 'zhou' && !flag(g, 'seatsKnown')) {
    g.flags.seatsKnown = true;
    g.addIntel({ id: 'seats', title: '席位对照：102 中财、217 辽北、011 申江', body: '老周告诉你：逐笔里的 102 是中财信托，217 是辽北发展，011 是申江证券。', source: '老周', credibility: 0.95, kind: 'clue' });
    effects.push('获得情报：席位对照表');
  }
  return out(true, effects, { playerMove: `试探${n.name}对 327 的看法`, convey: s.convey, tone: s.tone, numbers: s.numbers });
}

function exchange(g: Game, npcId: string, option: string | undefined, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  const key = `${npcId}:${option}:${g.dayIndex}`;
  const s = st(g);
  if (!option || !S327.offers(g, npcId).some((o) => o.id === option)) {
    return out(false, ['对方现在没什么可换的'], { playerMove: '想做个交换', convey: ['现在没什么好换的'], tone: 'neutral' });
  }
  s.usedOffers.add(key);
  const p = g.player;
  switch (`${npcId}:${option}`) {
    case 'qian:buy-rumor': {
      p.cash -= 200_000;
      const good = g.dayIndex >= 3;
      rumor(
        g,
        `qian-rumor-${g.dayIndex}`,
        good ? '财政部内部已经定了：327 贴息' : '下个月才会公布贴息方案',
        good ? '钱有福：“老板，这条是北京的朋友亲口讲的，23 号前后就出来。”' : '钱有福：“不急，下个月才公布，老板还有时间。”',
        '钱有福',
        good ? 0.85 : 0.35,
      );
      g.relate('qian', 5, '你买了他的消息');
      return out(true, ['支付 20 万元', '获得一条传言（真假自辨）'], { playerMove: '花钱买他手里的消息', convey: [good ? '北京那边已经定了，就这几天' : '不急，下个月才公布'], tone: 'smug' });
    }
    case 'qian:loan':
      p.cash += 300_000_000;
      g.flags.loan = true;
      g.addHeat(8, '场外拆借');
      g.push({ kind: 'rule', rule: 'grey-loan', text: '你借入了 3 亿元场外资金' });
      return out(true, ['现金 +3 亿元', '剧本结束时须偿还 3.6 亿元', '监管热度 +8'], { playerMove: '找他借一笔过桥资金', convey: ['三个亿，一个礼拜，利息两成', '老板发财了别忘了我'], tone: 'smug', numbers: [3, 20] });
    case 'su:story':
      g.relate('su', 15, '你给她讲了你的持仓观点');
      g.reputation -= 3;
      g.addIntel({ id: 'ev-wei', title: '中财信托与财政部门存在人事关联', body: '苏晓给你看了她的采访笔记：中财信托的高层与财政部门有直接的人事关联，消息很可能从那里提前流出。', source: '苏晓', credibility: 0.9, kind: 'evidence', against: 'wei' });
      return out(true, [`${n.name} 关系 +15`, '你的观点会以“知情人士”见报（声望 -3）', '获得证据：中财信托的关联关系'], {
        playerMove: '把自己对 327 的判断讲给她听，换她的调查线索',
        convey: ['中财信托的高层和财政部门有人事关联', '这条我还差一个信源，你先别外传'],
        tone: 'neutral',
      });
    case 'gao:share':
      g.relate('gao', 15, '你把研究纪要给了他');
      g.flags.gaoShared = true;
      return out(true, [`${n.name} 关系 +15`, '他知道了你的测算与底牌'], { playerMove: '把研究纪要递给他', convey: ['够意思', '有兄弟这份东西，心里有底了'], tone: 'warm' });
    case 'wei:swap': {
      g.relate('wei', 10, '你告诉了他你的成本');
      const hint = g.npc('wei')!.relation > 40;
      if (hint) g.addIntel({ id: `wei-hint-${g.dayIndex}`, title: '多方的子弹不少', body: '魏国梁吃饭时随口一句：“空头要是以为我们没钱，那就错了。”', source: '魏国梁', credibility: 0.8, kind: 'rumor' });
      return out(true, [`${n.name} 关系 +10`, hint ? '获得一条暗示' : '他什么也没说'], {
        playerMove: '把自己的建仓成本告诉他，换他一句实话',
        convey: hint ? ['空头要是以为我们没钱，那就错了'] : ['我们只是正常套期保值', '要讲政策，看大局'],
        tone: 'smug',
      });
    }
    case 'zhou:seats':
      g.flags.seatsKnown = true;
      g.addIntel({ id: 'seats', title: '席位对照：102 中财、217 辽北、011 申江', body: '老周告诉你：逐笔里的 102 是中财信托，217 是辽北发展，011 是申江证券。', source: '老周', credibility: 0.95, kind: 'clue' });
      g.relate('zhou', 5);
      return out(true, ['获得情报：席位对照表'], { playerMove: '请老周吃饭，让他认一认席位', convey: ['102 是中财信托，217 是辽北发展，011 是申江证券', '大席位一动，侬就要想想为啥'], tone: 'warm', numbers: [102, 217, 11] });
    case 'chen:banquet':
      g.addHeat(12, '试图宴请交易所官员');
      g.relate('chen', -20, '你想请他吃饭');
      if (g.principleId === 'no-violation') g.crossLine('试图拉拢监管人员');
      return out(false, ['对方拒绝', '监管热度 +12'], { playerMove: '想请他吃顿饭“聊聊”', convey: ['不必了', '按规则办，这句话我只说一次'], tone: 'cold' });
    case 'shen:swap':
      g.relate('shen', 5);
      return out(true, ['他只重复了公开立场'], { playerMove: '打听他的持仓', convey: ['兑付价就是 132 元', '空头会赢，这是算出来的'], tone: 'smug', numbers: [132] });
  }
  return out(false, [], { playerMove: '想做个交换', convey: ['……'], tone: 'neutral' });
}

function ally(g: Game, npcId: string, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  if (npcId === 'gao' && g.factionId === 'short') {
    const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
    if (!lock) return out(false, ['同盟已经破裂'], { playerMove: '想重修锁仓同盟', convey: ['都到这份上了，还谈什么同盟'], tone: 'cold' });
    if (lock.penalty > 0) return out(false, ['协议已经加过违约金了'], { playerMove: '想再加码协议', convey: ['协议都签了，兄弟还不放心？'], tone: 'warm' });
    if (n.relation >= 40) {
      lock.penalty = 300_000_000;
      lock.terms += '；违约方赔付 3 亿元';
      g.relate('gao', 5, '你们给锁仓协议加了违约金');
      return out(true, ['锁仓协议加入违约金：3 亿元', `${n.name} 关系 +5`], { playerMove: '提议给锁仓协议加上 3 亿元违约金', convey: ['行，白纸黑字，谁先跑谁赔', '兄弟我说话算话'], tone: 'warm', numbers: [3] });
    }
    g.relate('gao', -2);
    return out(false, ['他不愿意（关系需 ≥ 40）'], { playerMove: '提议给锁仓协议加上违约金', convey: ['兄弟之间还签什么违约金', '你这是信不过我'], tone: 'cold' });
  }
  if (npcId === 'su') {
    if (flag(g, 'suAlly')) return out(false, ['你们已经有约定了'], { playerMove: '想再谈合作', convey: ['我们已经说好了'], tone: 'neutral' });
    if (n.relation >= 15) {
      g.flags.suAlly = true;
      g.relate('su', 5);
      return out(true, ['约定：你给她独家，她的线索先告诉你'], { playerMove: '提议互通消息：你给独家，她给线索', convey: ['可以，但我只发有两个信源的东西', '你给我的，我会去核实'], tone: 'neutral' });
    }
    return out(false, ['她还不信任你（关系需 ≥ 15）'], { playerMove: '提议互通消息', convey: ['我们才认识几天'], tone: 'cold' });
  }
  if (npcId === 'wei' && g.factionId === 'short') {
    return out(false, ['他拒绝了协议平仓'], { playerMove: '提议以 149 元协议平仓、各退一步', convey: ['现在谈这个？早了点', '要讲政策，看大局'], tone: 'smug', numbers: [149] });
  }
  return out(false, ['对方没有兴趣'], { playerMove: `向${n.name}提议结盟`, convey: ['这个就不必了'], tone: 'neutral' });
}

function report(g: Game, npcId: string, option: string | undefined, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  const ev: Intel | undefined = g.intel.find((i) => i.kind === 'evidence' && i.against === npcId && (!option || i.id === option));
  if (!ev) return out(false, ['你手上没有针对此人的证据'], { playerMove: `想举报${n.name}`, convey: ['（你翻遍笔记本，没有能拿得出手的证据。）'], tone: 'neutral' });
  if (flag(g, `reported-${npcId}`)) return out(false, ['已经举报过了'], { playerMove: '想再举报一次', convey: ['（交易所已经在处理了。）'], tone: 'neutral' });
  g.flags[`reported-${npcId}`] = true;
  if (g.factionId !== 'official') {
    g.reputation -= 5;
    g.heat = Math.max(g.heatPeak * 0.3, g.heat - 10);
  }
  g.relate(npcId, -50, g.factionId === 'official' ? '你约谈了他' : '你向交易所举报了他');
  const effects = ['声望 -5（圈内会知道有人告密）', '监管热度 -10（配合调查）', `${n.name} 关系 -50`];
  if (npcId === 'wei') {
    g.flags.zcCurbed = true;
    effects.push('交易所约谈中财信托：其持仓额度减半');
  }
  if (npcId === 'gao') {
    g.flags.gaoCurbed = true;
    effects.push('交易所警告辽北发展：其翻多力度减半');
  }
  if (g.factionId === 'official') {
    return out(true, effects.slice(2), { playerMove: `拿着「${ev.title}」约谈${n.name}`, convey: ['我们一切都是按规则来的', '该配合的我们配合'], tone: 'evasive' });
  }
  return out(true, effects, { playerMove: `把证据交给交易所值班官员陈默`, convey: ['材料收下了', '按规则办，会核实的'], tone: 'cold', npcId: 'chen' });
}

// ───────────── 结局 ─────────────

function reckon(g: Game): Ending {
  const ex = g.market.ex;
  const p = g.player;
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

  let id = 'survive';
  let title = '';
  let archetype: Ending['archetype'];
  let headline = '';
  let subhead = '';
  const body: string[] = [];

  if (g.factionId === 'official') {
    const early: string[] = [];
    if (flag(g, 'zcCurbed')) early.push('约谈中财信托');
    if (flag(g, 'gaoCurbed')) early.push('警告辽北发展');
    if (flag(g, 'marginUp')) early.push('提高保证金');
    if (flag(g, `halt-${BATTLE}`)) early.push('上午临时停市');
    const busts = ['shenjiang', 'zhongcai', 'liaobei'].filter((id) => flag(g, `bust-${id}`)).map((id) => ex.acct(id).name);
    if (!voided) {
      id = 'official-valid';
      archetype = '旁观者';
      title = '承认成交';
      headline = `交易所确认全部成交有效 327 收于 ${p2(official)} 元`;
      subhead = '空方违规砸盘的成交被承认，多方蒙受巨额亏损';
      body.push('你尊重了已经发生的每一笔成交。可这也意味着：没有足额保证金的卖单，和守规矩的买单一样算数。');
      body.push('明天开盘，每个会员都会算同一笔账：违规的代价，原来比守规矩的收益还低。');
    } else {
      id = 'official-void';
      archetype = '守门人';
      title = flag(g, 'haltDump') ? '当场叫停' : early.length ? '防患未然' : '亡羊补牢';
      headline = flag(g, 'haltDump') ? '交易所紧急停市 空方砸盘未遂' : `违规之后的交易无效 327 收盘价定为 ${p2(official)} 元`;
      subhead = '违规透支的成交被一笔勾销，申江证券面临立案调查';
      body.push(`你宣布违规开始之后的交易无效，${wan((flag(g, 'voidedVol') as number) || 0)}成交被一并抹掉。违规者没能改变价格。`);
      body.push('代价是：那段时间里所有正常成交的人，也一起被退回了原点。');
    }
    if (early.length) body.push(`你在白天就出了手：${early.join('、')}。`);
    if (busts.length) body.push(`这一天有会员穿仓：${busts.join('、')}。`);
  } else if (g.bankrupt || eq <= 0) {
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
    headline = '最后八分钟交易无效 327 收盘价定为 151.30 元';
    subhead = '空方巨额透支砸盘被认定违规，公司蒙受巨亏，有关人员被立案调查';
    body.push('你做了历史上那个人做过的事。八分钟里你抛出的每一口都被记录在案，当晚全部作废。');
    body.push('结果和历史一样：违规没有改变价格，只改变了你的结局。');
    g.heat = 100;
  } else if (g.factionId === 'short') {
    if (Math.abs(p.pos) < SHORT_POS * 0.5 && r > -0.25) {
      id = 'restraint';
      title = '认赔离场';
      headline = '申江证券提前减仓 避过 327 风暴';
      subhead = '空方主力在消息落地前后减仓离场，公司元气尚存';
      body.push('你没有赌。认赔很疼，但公司明天还会开门。');
    } else if (Math.abs(p.pos) < SHORT_POS * 0.5) {
      id = 'late-cover';
      title = '断臂求生';
      headline = `申江证券高位认赔 亏损 ${fmtYi(Math.max(0, startEq - eq))}`;
      subhead = '空方主力在收盘前平掉空单，没有越线，也没能等来转机';
      body.push('你在最贵的时候认了赔。没有越过任何一条线——公司还在，但元气大伤。');
    } else {
      id = 'held';
      title = '扛到收盘';
      headline = `申江证券 327 空单巨亏 ${fmtYi(Math.max(0, startEq - eq))}`;
      subhead = '空方坚持到收盘，未能等来转机';
      body.push('你既没有认赔，也没有越线。价格没有给你第二次机会。');
    }
    archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : r <= -0.6 ? '出局者' : clean ? '长青者' : '蛀虫';
  } else if (g.factionId === 'long') {
    if (voided) {
      id = 'long-win';
      title = '惨胜';
      headline = '多方在交易所裁决后保住战果';
      subhead = '空方违规砸盘被宣布无效，327 收于 151.30 元';
      body.push('空方的八分钟被一笔勾销，你的多单按 151.30 元结算。');
    } else {
      id = 'long-other';
      title = official >= 15000 ? '守住了' : '没守住';
      headline = official >= 15000 ? `327 收于 ${p2(official)} 元 多方占优` : `327 收于 ${p2(official)} 元 多方失守`;
      subhead = '历史在这里拐了一个弯';
      body.push('这一天的结局和史书上不一样了。');
    }
    if (flag(g, 'insider')) body.push('但你在消息公开前加仓的记录还在。所有交易都留痕——旧账迟早被翻出。');
    archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : clean ? '长青者' : '蛀虫';
  } else if (g.factionId === 'ally') {
    const gain = eq - startEq;
    if (flag(g, 'allyFlipped')) {
      id = 'ally-flip';
      title = '倒戈';
      headline = gain >= 0 ? `辽北发展空翻多 一日获利 ${fmtYi(gain)}` : `辽北发展空翻多 未能获利`;
      subhead = '锁仓盟友在消息传开时抢先倒戈';
      body.push('你做了历史上那个人做过的事：第一个跑，赚得最多。申江证券到收盘才知道，盟友早就不在了。');
    } else if (flag(g, 'allyCovered')) {
      id = 'ally-cover';
      title = '抽身';
      headline = `辽北发展锁仓期内平空离场`;
      subhead = '没有做多，也没有陪空方扛到最后';
      body.push('你撕了协议，但没有反戈一击。损失止住了，名声也打了折扣。');
    } else {
      id = 'ally-loyal';
      title = '守约';
      headline = gain < 0 ? `辽北发展信守锁仓 随空方亏损 ${fmtYi(-gain)}` : '辽北发展信守锁仓';
      subhead = '盟友没有倒戈，10:05 的那一分钟没有到来';
      body.push('你守住了协议。没有你的那一推，上午的暴涨来得没那么猛——你改变了历史，也付出了代价。');
    }
    if (voided && g.player.pos > 0) body.push('尾盘的砸盘被宣布无效，你的多单按砸盘前的价格结算。');
    archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : r <= -0.6 ? '出局者' : clean ? '长青者' : '蛀虫';
  } else {
    id = 'retail';
    title = r >= 0 ? '活下来了' : '交了学费';
    headline = voided && flag(g, 'boughtDip') ? '散户：我的单子被取消了' : r >= 0 ? '大户室里的幸存者' : '327 风暴中的小散';
    subhead = voided ? '交易所宣布最后八分钟交易无效，期间所有成交一并作废' : '';
    if (voided && flag(g, 'boughtDip')) body.push('你在 147 元抄的底，被交易所一笔勾销。违规者受罚的同时，所有在那八分钟里成交的人也一起被抹掉了。');
    body.push(
      Math.abs(r) < 0.001
        ? '你一口也没有交易，原样带着八万块离开了大户室。至少你亲眼看见了这场仗是怎么打的。'
        : r > 0
          ? '你带着比来时多一点的钱离开了大户室。'
          : '你带着比来时少的钱离开了大户室。至少你看懂了这场仗是怎么打的。',
    );
    archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : clean ? '长青者' : '蛀虫';
  }
  if (g.linesCrossed > 0) body.push(`你越过了自己定下的底线「${g.principle.label}」${g.linesCrossed} 次。`);

  const history = [
    '1995 年 2 月 23 日上午，市场传出财政部将提高 327 国债兑付价的消息。空方盟友辽国发空翻多，价格一分钟内上涨 2 元，十分钟内上涨 3.77 元。',
    '16:22 之后，空方主力在最后八分钟内抛出 1056 万口卖单，把价格从 151.30 元砸到 147.40 元。',
    '当晚上交所宣布 16:22:13 之后的交易无效，327 合约当日收盘价为 151.30 元。同年 5 月 17 日，中国证监会暂停国债期货交易试点。',
  ];
  const deviation = [
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
    ruled: voided ? `交易所裁决：${timeOf(flag(g, 'voidedT') as number)} 之后的交易无效` : '交易所裁决：当日交易有效',
    stats: g.faction.observer
      ? [
          ['当晚裁决', voided ? '违规后交易无效' : '全部成交有效'],
          ['作废成交', wan((flag(g, 'voidedVol') as number) || 0)],
          ['会员穿仓', `${['shenjiang', 'zhongcai', 'liaobei'].filter((x) => flag(g, `bust-${x}`)).length} 家`],
          ['停市', `${(flag(g, 'halts') as number) || 0} 次`],
          ['越过底线', `${g.linesCrossed} 次`],
        ]
      : [
      ['最终权益', fmtYi(eq)],
      ['收益率', `${(r * 100).toFixed(1)}%`],
      ['监管热度', `第 ${g.heatTier()} 级`],
      ['声望', String(g.reputation)],
      ['越过底线', `${g.linesCrossed} 次`],
        ],
  };
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
  }
  return who;
}

function timeOf(t: number): string {
  const m = t < 120 ? 9 * 60 + 30 + t : 13 * 60 + (t - 120);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function dateTime(g: Game): string {
  return `${g.day.date} ${g.phase === 'night' ? '晚上' : g.time}`;
}

function briefing(g: Game): string {
  switch (g.factionId) {
    case 'short':
      return '申江证券持有 327 空单 220 万口，均价 147.90 元。你与辽北发展签有锁仓同盟：交割前任何一方不得平仓。交易所持仓限额 300 万口，保证金 2.5%。';
    case 'long':
      return '中财信托持有 327 多单 150 万口，均价 147.60 元。持仓限额 300 万口，保证金 2.5%。你的消息比市场早——但不能让人知道。';
    case 'ally':
      return '辽北发展持有 327 空单 80 万口，均价 148.00 元，账上 25 亿元。你和申江证券签有锁仓同盟：交割前任何一方不得平仓。持仓限额 300 万口。';
    case 'official':
      return '你是上交所交易部的值班官员。你不下单，但看得到每家会员的持仓与保证金。手里的工具：约谈（拿证据告发）、临时停市、提高保证金，以及当晚的裁决权。';
    default:
      return '你有 8 万元。一口 327 合约要交约 740 元保证金，价格每动 1 元，每口赚赔 200 元。';
  }
}

