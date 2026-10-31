import { fmtYi } from '../../engine/exchange';
import { Game, holdReturn, traderArchetype, type DialogueIntent, type Ending, type Scenario, type SocialOutcome } from '../../engine/game';
import { newAccount } from '../../engine/exchange';
import { HSI_GROUPS, HSI_NPC_LINES } from './social';
import { hkCards, hkPlay, hkWarning } from './cards';
import {
  BATTLE_LAST,
  DAYS_HK,
  DECK_HK,
  FACTIONS_HK,
  FUND,
  HKEX,
  HKMA,
  LOCALS,
  NPCS_HK,
  PARAMS_HK,
  PRINCIPLES_HK,
  PROLOGUE_HK,
  RULES_HK,
  SOURCES_HK,
  START_HK,
  TYCOON,
} from './data';
import { forcedSellerActor, hibor, pegDayStart, pegMeters, pressure, squeezeRate } from './peg';

const isFund = (g: Game) => g.factionId === FUND;
const isHkma = (g: Game) => g.factionId === HKMA;
const isTycoon = (g: Game) => g.factionId === TYCOON;

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

export const HK1998: Scenario = {
  id: 'hk1998',
  title: '港元保卫战',
  subtitle: '1998 · 香港 · 联系汇率与期指',
  era: '1998 年 8 月，香港',
  deck: DECK_HK,
  params: PARAMS_HK,
  days: DAYS_HK,
  startPrice: START_HK,
  factions: FACTIONS_HK,
  principles: PRINCIPLES_HK,
  npcs: NPCS_HK,
  ruleCards: RULES_HK,
  sources: SOURCES_HK,
  prologue: PROLOGUE_HK,
  session: HKEX,
  instrument: '恒生指数期货',
  units: { qty: '张', cur: '港元' },
  eraId: '1998-hongkong',
  paperName: '香港经济日报',
  endingDate: '1998-08-28 星期五',
  setupRules: ['peg', 'hibor', 'settle', 'margin-hk'],
  members: [FUND, HKMA],
  lotPresets: [500, 2_000, 10_000],

  groupName: (_g, who) => HSI_GROUPS[who] ?? who,
  cards: (g) => hkCards(g),
  playCard: (g, id, target) => hkPlay(g, id, target),
  meters: (g) => pegMeters(g),
  focus: (g) => {
    if (g.phase !== 'trading') return null;
    const h = hibor(g);
    if (isTycoon(g)) return hkWarning(g);
    if (isHkma(g) && h >= 0.15) return `拆息 ${(h * 100).toFixed(1)} 厘：守住了汇率，但杠杆盘正在被自己人打死`;
    if (isFund(g) && h >= 0.18) return `拆息 ${(h * 100).toFixed(1)} 厘：你的空单在赚，可本地那批人快撑不住了`;
    return null;
  },

  setup(g) {
    const ex = g.market.ex;
    // 先把账户建出来，再判断哪个是玩家——g.player 在账户存在之前会抛错
    ex.add(newAccount({ id: FUND, name: '远岸资本', seat: 'FAR', group: FUND, cash: 2_000_000_000, pos: -30_000, avg: 820_000 }));
    ex.add(newAccount({ id: HKMA, name: '外汇基金', seat: 'HKMA', group: HKMA, cash: 90_000_000_000, pos: 0, avg: 0 }));
    ex.add(newAccount({ id: TYCOON, name: '何氏家族', seat: 'HEC', group: TYCOON, cash: 2_600_000_000, pos: 18_000, avg: 800_000 }));
    ex.add(newAccount({ id: LOCALS, name: '本地杠杆盘', group: 'locals', cash: 2_400_000_000, pos: 60_000, avg: 815_000 }));
    // 玩家坐的那个账户归到 player 组
    ex.acct(g.faction.accountId).group = 'player';
    g.market.actors.push(forcedSellerActor(g));
    g.flags.startEq = ex.equity(g.player);
    g.flags.startPos = g.player.pos;
    g.flags.startMark = ex.last;
    g.addIntel({
      id: 'brief',
      title: '开局简报',
      body: `恒生指数期货 ${(g.market.last / 100).toFixed(0)} 点。炒家在沽空，金管局在守 7.75。你现在隔夜拆息 ${(hibor(g) * 100).toFixed(1)} 厘，港元压力 ${pressure(g)}。`,
      source: '你的笔记',
      credibility: 1,
      kind: 'system',
    });
  },

  onDayStart(g) {
    pegDayStart(g);
    const d = g.dayIndex;
    if (d === 0) g.addIntel({ id: 'rule-peg', title: '联系汇率不是自由浮动', body: '港元被夹在 7.75 到 7.85 之间。金管局没有“让汇率跌一点”这个选项——它只能加息，或者拿外汇基金的钱去买。', source: '金管局', credibility: 1, kind: 'news' });
    if (d === 4) g.addIntel({ id: 'aug5', title: '炒家开始砸港元', body: '今天早上有人在 7.75 的弱方大额沽港元。拆息开盘就往上跳。', source: '交易室', credibility: 1, kind: 'news' });
    if (d === 9) {
      g.addIntel({ id: 'aug14', title: '金管局进场', body: '外汇基金今天第一次在期指上买入。市场在传“政府托市”。', source: '交易室', credibility: 1, kind: 'news' });
      g.decision = {
        id: 'enter',
        title: '要不要跟着买',
        body: `金管局进场了。恒生指数期货 ${(g.market.last / 100).toFixed(0)} 点。有人说是政策底，有人说是送钱给炒家出局。`,
        choices: [
          { id: 'follow', label: '跟着买', detail: '相信政府托得住，加多单。' },
          { id: 'wait', label: '先看着', detail: '不动，等方向明确。' },
          { id: 'fade', label: '反着做', detail: '政府买不了一辈子，赌它撑不住。', danger: true },
        ],
      };
    }
    if (d === BATTLE_LAST - 1) g.addIntel({ id: 'aug27', title: '明天是八月合约结算日', body: '空头要在结算前把价格压下去。明天的成交会非常难看。', source: '期货交易所', credibility: 1, kind: 'news' });
  },

  onTick(g) {
    if (g.dayIndex === 9 && g.market.t === 0) g.flags.hkmaEntered = true;
    if (g.flags.hkmaEntered && g.dayIndex === 9 && g.market.t > 0 && !g.flags.hkmaBuy) {
      g.flags.hkmaBuy = true;
      const a = g.market.ex.accounts.get(HKMA);
      if (a && !isHkma(g)) g.pending.push({ owner: HKMA, side: 'buy', qty: 6_000, type: 'market' });
    }
  },

  onDayEnd(g) {
    // 拆息太高，杠杆盘在收盘前被结算所清一批
    if (squeezeRate(g) > 0) {
      const a = g.market.ex.accounts.get(LOCALS);
      if (a && a.pos > 0) {
        const qty = Math.min(a.pos, Math.round(a.pos * squeezeRate(g) * 30));
        if (qty > 0) g.market.ex.liquidate(LOCALS, qty / Math.max(1, a.pos));
        if (a.pos === 0) g.addIntel({ id: 'locals-bust', title: '本地杠杆盘被打光', body: '拆息把借钱做多的人清空了。今天收盘前，最后一批按金也补不上。', source: '结算所', credibility: 1, kind: 'news' });
      }
    }
  },

  onNight(g) {
    if (g.dayIndex >= BATTLE_LAST - 1 && !g.flags.finalNight) {
      g.flags.finalNight = true;
      g.addIntel({ id: 'final', title: '明早就是结算日', body: '八月合约明天结算。今晚的每一个决定，明天都会按结算价结账。', source: '你的笔记', credibility: 1, kind: 'system' });
    }
  },

  offers: () => [],

  social(g, verb, npcId, _option): SocialOutcome {
    const n = g.npc(npcId);
    const out = (ok: boolean, effects: string[], convey: string[], tone: DialogueIntent['tone']): SocialOutcome => ({
      npc: npcId,
      verb,
      ok,
      effects,
      dialogue: { npcId, verb, playerMove: `对${n?.name ?? npcId}${verb === 'probe' ? '试探' : verb === 'exchange' ? '交换' : verb === 'ally' ? '结盟' : verb === 'betray' ? '背叛' : '告发'}`, convey, tone, numbers: [], date: g.day.date, fallback: convey },
    });
    if (!n) return out(false, ['找不到这个人'], ['……'], 'neutral');
    switch (verb) {
      case 'probe': {
        g.relate(npcId, 2);
        const line = HSI_NPC_LINES[npcId]?.[0] ?? '现在这个市，谁都不敢说实话。';
        return out(true, ['关系 +2'], [line], 'neutral');
      }
      case 'exchange': {
        g.relate(npcId, 5);
        g.addIntel({ id: `hk-${npcId}-${g.dayIndex}`, title: `${n.name}的话`, body: HSI_NPC_LINES[npcId]?.[1] ?? '他只说了一半。', source: n.name, credibility: 0.6, kind: 'rumor' });
        return out(true, ['获得一条情报', '关系 +5'], [HSI_NPC_LINES[npcId]?.[1] ?? '这话我只能说到这儿。'], 'warm');
      }
      case 'ally': {
        if (g.alliances.some((a) => a.npc === npcId && !a.brokenBy)) return out(false, ['已经有约在先'], ['我们不是已经说好了？'], 'neutral');
        g.alliances.push({ id: `a-${npcId}`, npc: npcId, terms: '结算日之前，谁也不许先跑', lockUntilDay: BATTLE_LAST, penalty: 50_000_000 });
        g.relate(npcId, 10);
        return out(true, ['结盟：结算日之前不先跑', '关系 +10'], ['好。二十八号之前，谁先动谁是小狗。'], 'warm');
      }
      case 'betray': {
        const a = g.alliances.find((x) => x.npc === npcId && !x.brokenBy);
        if (!a) return out(false, ['没有可以撕的约'], ['我们之间有什么约定吗？'], 'neutral');
        a.brokenBy = 'player';
        a.brokenDay = g.dayIndex;
        g.relate(npcId, -40);
        g.player.cash -= a.penalty;
        return out(true, ['撕毁协议', `违约金 ${fmtYi(a.penalty)}`, '关系 −40'], ['你记住今天。'], 'hostile');
      }
      case 'report':
      default: {
        g.addHeat(6, `向监管举报${n.name}`);
        return out(true, ['监管热度 +6'], ['我会去查。'], 'cold');
      }
    }
  },

  decide(g, id, choice) {
    if (id === 'enter') {
      if (choice === 'follow') {
        g.market.sentiment = Math.min(1, g.market.sentiment + 0.3);
        g.addIntel({ id: 'follow', title: '你跟着买了', body: '政府的买盘接住了你的单。', source: '你的笔记', credibility: 1, kind: 'system' });
      } else if (choice === 'fade') {
        g.market.sentiment = Math.max(-1, g.market.sentiment - 0.2);
        g.addHeat(8, '逆着政府的买盘做');
      }
    }
  },

  chatIntent(g, npcId): DialogueIntent {
    const n = g.npc(npcId);
    return {
      npcId,
      verb: 'chat',
      playerMove: '找他说几句话',
      convey: [HSI_NPC_LINES[npcId]?.[0] ?? '现在这个市，谁都不敢说实话。'],
      tone: (n?.relation ?? 0) > 40 ? 'warm' : (n?.relation ?? 0) < -10 ? 'cold' : 'neutral',
      numbers: [],
      date: g.day.date,
      fallback: [HSI_NPC_LINES[npcId]?.[0] ?? '……'],
    };
  },

  reckon(g): Ending {
    const px = g.market.last;
    const points = Math.round(px / 100);
    const r = isHkma(g) ? 0 : holdReturn(g, px);
    const eq = g.equity();
    const start = Number(g.flags.startEq) || 1;
    const ret = isHkma(g) ? (eq - start) / Math.abs(start) : r;
    const h = hibor(g);
    const clean = g.heat <= 20 && g.linesCrossed === 0;
    const archetype = isHkma(g) ? (points >= 7800 ? '守门人' : '出局者') : traderArchetype(ret, 0, clean, true);

    let id = 'hk-held';
    let title = '结算日收在 7,829';
    if (isFund(g)) {
      id = ret > 0.15 ? 'hk-fund-win' : ret > 0 ? 'hk-fund-thin' : 'hk-fund-loss';
      title = ret > 0.15 ? '空头赢了' : ret > 0 ? '空头小胜' : '空头被逼退';
    } else if (isHkma(g)) {
      id = points >= 7800 ? 'hk-defended' : 'hk-broken';
      title = points >= 7800 ? '联汇守住了' : '守住了汇率，丢掉了市场';
    } else {
      id = eq > 0 ? 'hk-survived' : 'hk-bust';
      title = eq > 0 ? '活过了八月' : '被拆息清空';
    }

    return {
      id,
      title,
      archetype,
      headline: title,
      subhead: `恒生指数期货收在 ${points} 点，你的权益 ${fmtYi(eq)}。`,
      body: [
        isHkma(g)
          ? '联系汇率没有破。代价是隔夜拆息一度抽到 ' + (h * 100).toFixed(1) + ' 厘，本地借钱做多的人被清了一批。'
          : '炒家的做法从来不是赌汇率会跌。他们赌的是你会为了守汇率而加息，而加息会杀死股市——他们的空单就在股市里。',
        isFund(g)
          ? '你赚的钱不是从汇率上来的，是从那些被迫平仓的人手里来的。'
          : isTycoon(g)
            ? '你没有输给方向，你输给了利息。'
            : '你买的不是股票，是时间。',
      ],
      history: [
        '1998 年 8 月 14 日，金管局首次动用外汇基金在股票与期指市场买入，恒生指数当日回升。',
        '8 月 28 日八月合约结算日，成交额创下约 790 亿港元的历史纪录，恒生指数收于 7,829 点。',
      ],
      deviation: [
        `历史上恒生指数期货在 8 月 28 日结算于 7,829 点；这一局收在 ${points} 点（偏离 ${points - 7829 > 0 ? '+' : ''}${points - 7829} 点）。`,
        `历史上的隔夜拆息在攻击高峰期一度升破 20 厘；这一局最高 ${(h * 100).toFixed(1)} 厘。`,
      ],
      stats: [
        ['结局', title],
        ['权益', fmtYi(eq)],
        ['收益率', isHkma(g) ? '—' : pct(ret)],
        ['恒指期货', `${points} 点`],
        ['隔夜拆息', `${(h * 100).toFixed(1)} 厘`],
        ['港元压力', `${pressure(g)}`],
        ['监管热度', `第 ${g.heatTier()} 级`],
        ['越过底线', `${g.linesCrossed} 次`],
      ],
      ruled: '人物与机构均为化名与原型合成；日线取自公开史料，分钟走势为受约束的重建。',
    };
  },
};

export { hkCards };
