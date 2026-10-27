import { fmtYi, newAccount } from '../../engine/exchange';
import type { DialogueIntent, Ending, ExchangeOffer, Game, Scenario, SocialOutcome } from '../../engine/game';
import type { Actor, Market } from '../../engine/market';
import { BATTLE_2021, DAYS_2021, DECK_2021, FACTIONS_2021, NPCS_2021, NYSE, PARAMS_2021, PRINCIPLES_2021, PROLOGUE_2021, RULES_2021, SOURCES_2021, START_2021 } from './data';

const YOU = 'you';
const GW = 'greywolf';
const FT = 'fortress';
const FEATHER = 'feather';
const PANIC = 'panic';
const GW_POS = 10_000_000;

const mi = NYSE.index;
const usd = (c: number) => `${(c / 100).toFixed(2)} 美元`;
const shares = (q: number) => (Math.abs(q) >= 10000 ? `${(q / 10000).toFixed(Math.abs(q) % 10000 ? 1 : 0)} 万股` : `${q.toLocaleString()} 股`);
const flag = (g: Game, k: string) => g.flags[k];
const isPlayer = (g: Game, acct: string) => g.faction.accountId === acct;
/** 借券年费率：逼空越紧，借券越贵 */
const BORROW_RATE = [0.25, 0.4, 0.6, 0.8, 1.0];

// ───────────── NPC 资金 ─────────────

/** 期权做市商的对冲买盘：价格往上冲时，卖出看涨期权的一方被迫买入股票对冲 */
function hedgerActor(): Actor {
  return {
    id: FT,
    onTick(m: Market) {
      if (m.bars.length < 6) return [];
      if (m.day.kind === 'battle' && m.t > mi('10:00')) return [];
      const last = m.last;
      const mom = last - m.bars[m.bars.length - 6].o;
      if (mom <= last * 0.02) return [];
      const q = Math.round((m.day.vDay / NYSE.minutes) * 0.15 * Math.min(2, mom / (last * 0.02)));
      return [{ owner: FT, side: 'buy', qty: q, type: 'market' }];
    },
  };
}

/** 做空基金（玩家不扮演时）：26 日下午开始回补，27 日开盘半小时内平完 */
function greywolfActor(g: Game): Actor {
  return {
    id: GW,
    onTick(m: Market) {
      const a = m.ex.acct(GW);
      if (a.pos >= 0) return [];
      if (g.dayIndex === 2 && m.t >= mi('14:00') && a.pos < -7_000_000) return [{ owner: GW, side: 'buy', qty: 100_000, type: 'market' }];
      if (g.dayIndex === 3 && m.t < mi('10:00')) return [{ owner: GW, side: 'buy', qty: Math.min(-a.pos, 250_000), type: 'market' }];
      return [];
    },
  };
}

/** 被限制只能卖出的散户：把价格砸向史料走势；11:30 之后，其他券商的抄底资金把它托回来 */
function restrictedFlowActor(g: Game): Actor {
  return {
    id: PANIC,
    onTick(m: Market) {
      if (!flag(g, 'restrictActive') || m.day.kind !== 'battle') return [];
      const target = m.hist();
      const need = m.flowToReach(target);
      // 留 3% 的死区，避免来回拉锯触发连环暂停
      if (m.last > target * 1.03 && need < 0) return [{ owner: PANIC, side: 'sell', qty: Math.min(Math.round(-need * 0.5), 4_000_000), type: 'market' }];
      if (m.t > mi('11:30') && m.last < target * 0.97 && need > 0) return [{ owner: PANIC, side: 'buy', qty: Math.min(Math.round(need * 0.4), 1_500_000), type: 'market' }];
      return [];
    },
  };
}

// ───────────── 剧本 ─────────────

export const GME: Scenario = {
  id: 'gme2021',
  title: '散户起义',
  subtitle: '2021 · 纽约 · 游戏零售股逼空',
  era: '2021 年 1 月，纽约',
  deck: DECK_2021,
  params: PARAMS_2021,
  days: DAYS_2021,
  startPrice: START_2021,
  factions: FACTIONS_2021,
  principles: PRINCIPLES_2021,
  npcs: NPCS_2021,
  ruleCards: RULES_2021,
  sources: SOURCES_2021,
  prologue: PROLOGUE_2021,
  session: NYSE,
  instrument: '游戏零售股',
  units: { qty: '股', cur: '美元' },
  eraId: '2021-newyork',
  paperName: '纽约金融快报',
  endingDate: '2021-01-29 星期五',
  setupRules: ['short-squeeze', 'luld', 'no-borrow', 'margin'],
  members: [GW, FT],
  lotPresets: [1_000_000, 5_000_000],
  groupName: (g, who) => groupName(g, who),

  setup(g) {
    const ex = g.market.ex;
    const grp = (id: string) => (isPlayer(g, id) ? 'player' : id);
    ex.add(newAccount({ id: GW, name: '灰狼资本', seat: 'GW', group: grp(GW), cash: 4_000_000_000, pos: -GW_POS, avg: 4000, borrowLimit: 11_000_000 }));
    ex.add(newAccount({ id: FT, name: '堡垒集团', seat: 'FT', group: FT, cash: 50_000_000_000 }));
    ex.add(newAccount({ id: PANIC, name: '被限制的散户', group: 'crowd', exempt: true }));
    if (g.factionId === 'retail') ex.add(newAccount({ id: YOU, name: '你', group: 'player', cash: 5000, pos: 50, avg: 1800, borrowLimit: 0 }));
    if (g.factionId === 'broker') ex.add(newAccount({ id: FEATHER, name: '羽毛证券', group: 'player', exempt: true }));
    g.market.actors.push(hedgerActor());
    if (!isPlayer(g, GW)) g.market.actors.push(greywolfActor(g));
    g.market.actors.push(restrictedFlowActor(g));
    if (g.factionId === 'retail') g.alliances.push({ id: 'diamond', npc: 'jack', terms: '钻石手公约：价格到月球之前，一股不卖', lockUntilDay: BATTLE_2021, penalty: 0 });
    g.flags.startEq = ex.equity(g.player);
    g.flags.startPos = g.player.pos;
    g.seenRules.add('short-squeeze');
    g.addIntel({ id: 'brief', title: '开局简报', body: briefing(g), source: '你的笔记', credibility: 1, kind: 'system' });
  },

  onDayStart(g) {
    const d = g.dayIndex;
    if (d === 0) mentor(g, '记住，这只股票没有涨跌停。价格几分钟内动得太猛，交易所会暂停 5 分钟——那 5 分钟里你什么都做不了。');
    if (d === 3 && g.factionId === 'short' && g.player.pos < 0) {
      g.decision = {
        id: 'gap-open',
        title: '跳空开盘',
        body: `昨晚盘后的一条推文之后，股价跳空开在 ${usd(g.market.last)}。你还有 ${shares(-g.player.pos)} 空单，权益 ${fmtYi(g.equity())}，需要保证金 ${fmtYi(g.marginNeed())}。`,
        choices: [
          { id: 'hold', label: '扛住', detail: '赌这只是疯狂的顶点。' },
          { id: 'cover-all', label: '全部回补', detail: '30 分钟内买回全部空单。每一股都会把价格推得更高。' },
          { id: 'cover-half', label: '回补一半', detail: '先减一半风险。' },
        ],
        countdown: 30,
      };
    }
    if (d === BATTLE_2021) {
      if (g.factionId === 'broker') {
        g.decision = {
          id: 'nscc',
          title: '凌晨五点，清算所来电',
          body: '客户这几天买的股票要到 T+2 才交收。清算所按这只股票的波动重新计算了你的风险押金：今天开盘前要再交 37 亿美元。你的账上只有 7 亿左右。',
          choices: [
            { id: 'restrict', label: '限制买入：客户只能卖出', detail: '押金要求会大幅下降，公司能活下来。客户会愤怒。' },
            { id: 'raise', label: '连夜融资 34 亿美元，保持开放', detail: '股东权益被稀释，但客户想买就能买。' },
            { id: 'nothing', label: '什么都不做', detail: '赌清算所会通融。' },
          ],
        };
      } else {
        g.flags.restrict = true;
      }
      mentor(g, '今天是星期四。不管发生什么，先想清楚：你是在交易，还是在赌一口气。');
    }
  },

  onTick(g) {
    const m = g.market;
    const t = m.t - 1;
    const d = g.dayIndex;
    checkLines(g);
    if (d === 1 && t === mi('10:50')) news(g, 'gme-high-25', '股价盘中冲上 159 美元', '论坛上有人喊：空头开始回补了！随后一个多小时，股价跌回 60 多美元。', 0.9);
    if (d === 3 && t === mi('10:00')) news(g, 'gme-27', '证交会：正在密切关注近期的市场波动', '监管机构表示，正在与其他部门协调，评估近期部分股票的极端波动。', 0.95);
    if (g.isBattleDay && t === mi('10:00')) applyRestriction(g);
    if (g.isBattleDay && t === mi('10:01') && g.factionId === 'retail' && flag(g, 'restrictActive') && g.player.pos > 0) {
      g.decision = {
        id: 'restricted',
        title: '只能卖出',
        body: `你的券商刚刚暂停了这只股票的买入。股价 ${usd(m.last)}。你手里 ${shares(g.player.pos)}，论坛上所有人都在喊：拿住！`,
        choices: [
          { id: 'hold', label: '钻石手：拿着', detail: '守住和社区的约定。' },
          { id: 'sell-all', label: '全部卖出', detail: '锁住利润。论坛会叫你“纸手”。' },
          { id: 'sell-half', label: '卖一半', detail: '先拿回本金。' },
        ],
        countdown: 25,
      };
    }
    if (g.isBattleDay && t === mi('11:00') && g.factionId === 'short' && g.player.pos < 0 && flag(g, 'restrictActive')) {
      g.decision = {
        id: 'restricted-dip',
        title: '暴跌',
        body: `散户被限制买入后，股价从 483 美元一路跌到 ${usd(m.last)}。你还有 ${shares(-g.player.pos)} 空单。`,
        choices: [
          { id: 'hold', label: '不动', detail: '等它跌得更深。' },
          { id: 'cover-all', label: '趁暴跌回补全部', detail: '10 分钟内买回。' },
          { id: 'press', label: '重新加空 300 万股', detail: '借券年费率已经超过 100%。' },
        ],
        countdown: 25,
      };
    }
  },

  onDayEnd(g) {
    // 卖空要付借券费：按收盘市值和当天的借券年费率计
    const ex = g.market.ex;
    const rate = BORROW_RATE[g.dayIndex] ?? 1;
    for (const a of ex.accounts.values()) {
      if (a.exempt || a.pos >= 0) continue;
      const fee = (Math.abs(a.pos) * (ex.last / 100) * rate) / 252;
      a.cash -= fee;
      if (a.id === g.player.id) g.push({ kind: 'intel', text: `借券费：今天付出 ${fmtYi(fee)}（年费率 ${Math.round(rate * 100)}%）` });
    }
    // 散户在约定期内卖出：视同背弃社区
    const pact = g.alliances.find((x) => x.id === 'diamond' && !x.brokenBy);
    if (pact && g.player.pos < (flag(g, 'startPos') as number)) breakPact(g, '你在“到月球”之前卖出了');
  },

  onNight(g) {
    const d = g.dayIndex;
    const rc = g.recaps[g.recaps.length - 1];
    for (const p of rc.parts) {
      if (p.who === 'gravity' || p.who === 'crowd' || p.who === 'trend' || Math.abs(p.net) < 100_000) continue;
      rc.notes.push(`${groupName(g, p.who)} 今日净${p.net > 0 ? '买入' : '卖出'} ${shares(Math.abs(p.net))}`);
    }
    const prev = g.recaps.length > 1 ? g.recaps[g.recaps.length - 2].close : START_2021;
    const pct = ((rc.close - prev) / prev) * 100;
    g.papers.push({
      day: d,
      headline: `游戏零售股收于 ${usd(rc.close)}，${pct >= 0 ? '大涨' : '大跌'} ${Math.abs(pct).toFixed(0)}%`,
      sub: ['论坛散户与空头基金正面交锋', '盘中冲高后巨幅回落', '盘后一条推文点燃新一轮狂热', '监管机构表示正在关注'][d] ?? '',
      facts: [`收盘价 ${(rc.close / 100).toFixed(2)} 美元`, `较前一日${pct >= 0 ? '上涨' : '下跌'} ${Math.abs(pct).toFixed(0)}%`],
    });
    if (d === 0) {
      rumor(g, 'cat-post', '老猫又晒出了账户截图', '浮盈翻了好几倍。他在帖子里只写了一句：“我就是喜欢这只股票。”', '投资论坛', 0.95);
      news(g, 'si', '空单超过流通股', '财经电视援引数据：这只股票被卖空的股数，已经超过了市场上可流通的股数。', 0.85);
    }
    if (d === 1) {
      if (g.factionId === 'short') rumor(g, 'bailout-offer', '堡垒集团愿意注资', '斯通的人打来电话：他们和另一家基金可以一共拿出 27.5 亿美元，条件是分走灰狼资本未来的一部分收益。', '堡垒集团', 1);
      else news(g, 'bailout', '两家大型基金向灰狼资本注资 27.5 亿美元', '市场解读：空头的子弹又多了。论坛上的回应是：“那就让他们再亏一次。”', 0.95);
    }
    if (d === 2) news(g, 'tweet', '一位科技富豪在收盘后发推：“Gamestonk!!”', '盘后交易里，股价应声暴涨。明天开盘会在哪里，没人说得准。', 0.95);
    if (d === 3) {
      if (!isPlayer(g, GW)) rumor(g, 'gw-closed', '传闻灰狼资本已经平掉了空单', '灰狼资本对媒体表示，已经结清了这只股票的空头头寸。论坛上没人相信。', '财经电视', 0.8);
      if (g.factionId === 'retail') rumor(g, 'si-still', '空头一股都没平，还有 140% 的空单', '论坛置顶帖：“他们说平仓了？看数据！空单还是 140%！”', '投资论坛', 0.2);
      if (g.factionId === 'broker') rumor(g, 'nscc-warn', '清算所风险部门来电', '对方提醒：明早的押金要求可能会“大幅上升”。具体数字，凌晨才会出来。', '清算所', 1);
      mentor(g, '1987 年那次，我们也以为今天就是最疯的一天。');
    }
  },

  offers(g, npcId) {
    const d = g.dayIndex;
    const out: ExchangeOffer[] = [];
    if (npcId === 'stone' && g.factionId === 'short' && d >= 1 && !flag(g, 'bailout')) out.push({ id: 'bailout', label: '接受 27.5 亿美元注资', cost: '分走未来收益的一部分；圈内都会知道你被救了' });
    if (npcId === 'cat') out.push({ id: 'dd', label: '读他的研究帖', cost: '一个晚上' });
    if (npcId === 'susan') out.push({ id: 'interview', label: '接受电视采访', cost: '你的话会被所有人听到' });
    if (npcId === 'bill') out.push({ id: 'advice', label: '请他喝一杯，听听老经验', cost: '一杯啤酒' });
    return out;
  },

  social(g, verb, npcId, option) {
    const n = g.npc(npcId)!;
    const date = `${g.day.date} ${g.phase === 'night' ? '晚上' : g.time}`;
    const out = (ok: boolean, effects: string[], d: Pick<DialogueIntent, 'convey' | 'tone' | 'playerMove'> & Partial<DialogueIntent>): SocialOutcome => ({
      npc: npcId,
      verb,
      ok,
      effects,
      dialogue: { npcId, verb, numbers: [], date, fallback: d.convey, ...d },
    });
    if (verb === 'probe') {
      const s = stance(g, npcId);
      g.relate(npcId, 3, '你主动来聊');
      return out(true, [`${n.name} 关系 +3`], { playerMove: `问${n.name}怎么看这只股票`, ...s });
    }
    if (verb === 'exchange') {
      switch (`${npcId}:${option}`) {
        case 'stone:bailout':
          g.player.cash += 2_750_000_000;
          g.flags.bailout = true;
          g.reputation -= 5;
          g.relate('stone', 10, '你接受了注资');
          return out(true, ['现金 +27.5 亿美元', '声望 -5'], { playerMove: '接受注资', convey: ['钱今晚到账', '我们要的是活下来的灰狼，不是一个英雄'], tone: 'neutral' });
        case 'cat:dd':
          g.relate('cat', 8, '你认真读了他的帖子');
          g.addIntel({ id: `cat-dd-${g.dayIndex}`, title: '老猫的研究帖', body: '他算的是公司账上的现金、负债和转型计划，结论是“被低估了”。帖子里一个字都没提逼空。', source: '老猫', credibility: 0.85, kind: 'news' });
          return out(true, [`${n.name} 关系 +8`, '获得情报：老猫的研究帖'], { playerMove: '读完他的研究帖，留言提问', convey: ['我不给投资建议', '我只是喜欢这只股票'], tone: 'warm' });
        case 'susan:interview':
          g.reputation += g.factionId === 'short' ? -5 : 5;
          g.relate('susan', 10);
          return out(true, [g.factionId === 'short' ? '声望 -5（论坛把你的采访做成了表情包）' : '声望 +5'], { playerMove: '接受电视连线', convey: ['这是前所未有的', '观众都想听你怎么说'], tone: 'neutral' });
        case 'bill:advice':
          g.relate('bill', 5);
          mentor(g, '在最疯狂的时候，给自己写下一个价格：到了就卖，不商量。没写下来的，都不算计划。');
          return out(true, ['获得一条老经验'], { playerMove: '请比尔喝一杯', convey: ['写下你的卖出价', '不写下来的都不算计划'], tone: 'warm' });
      }
      return out(false, ['对方没什么可换的'], { playerMove: '想做个交换', convey: ['今天就算了'], tone: 'neutral' });
    }
    if (verb === 'betray') {
      const pact = g.alliances.find((x) => x.npc === npcId && !x.brokenBy);
      if (!pact) return out(false, ['你们之间没有约定'], { playerMove: '想撕毁一个不存在的约定', convey: ['我们约好什么了？'], tone: 'neutral' });
      breakPact(g, '你宣布退出钻石手公约');
      if (g.player.pos > 0) g.addPlanFromScript({ label: '退出公约：卖出全部', cond: 'now', price: 0, side: 'sell', qty: g.player.pos, spread: 3 });
      return out(true, ['钻石手公约破裂', '已加入计划书：开盘后卖出全部持股'], { playerMove: '在论坛上发帖：我卖了', convey: ['纸手', '我们还在，你走吧'], tone: 'hostile' });
    }
    if (verb === 'ally') {
      if (npcId === 'jack' && g.factionId === 'retail') return out(false, ['你已经在公约里了'], { playerMove: '想再签一次', convey: ['我们本来就在一条船上'], tone: 'warm' });
      return out(false, ['对方没有兴趣'], { playerMove: `向${n.name}提议合作`, convey: ['不必了'], tone: 'cold' });
    }
    return out(false, ['你手上没有可以拿出手的证据'], { playerMove: `想举报${n.name}`, convey: ['（你翻遍了截图，没有能拿得出手的证据。）'], tone: 'neutral' });
  },

  decide(g, id, choice) {
    const p = g.player;
    switch (`${id}:${choice}`) {
      case 'gap-open:cover-all':
        g.addPlanFromScript({ label: '全部回补', cond: 'now', price: 0, side: 'buy', qty: -p.pos, spread: 30 });
        g.flags.coveredDay = g.dayIndex;
        break;
      case 'gap-open:cover-half':
        g.addPlanFromScript({ label: '回补一半', cond: 'now', price: 0, side: 'buy', qty: Math.round(-p.pos / 2), spread: 20 });
        break;
      case 'restricted-dip:cover-all':
        g.addPlanFromScript({ label: '趁暴跌回补', cond: 'now', price: 0, side: 'buy', qty: -p.pos, spread: 10 });
        g.flags.coveredDay = g.dayIndex;
        break;
      case 'restricted-dip:press':
        g.addPlanFromScript({ label: '重新加空', cond: 'now', price: 0, side: 'sell', qty: 3_000_000, spread: 5 });
        break;
      case 'restricted:sell-all':
        g.addPlanFromScript({ label: '全部卖出', cond: 'now', price: 0, side: 'sell', qty: p.pos, spread: 1 });
        g.flags.soldAt = g.time;
        break;
      case 'restricted:sell-half':
        g.addPlanFromScript({ label: '卖出一半', cond: 'now', price: 0, side: 'sell', qty: Math.round(p.pos / 2), spread: 1 });
        g.flags.soldAt = g.time;
        break;
      case 'nscc:restrict':
        g.flags.restrict = true;
        break;
      case 'nscc:raise':
        g.flags.raised = true;
        break;
      case 'nscc:nothing':
        g.flags.restrict = true;
        g.flags.failed = true;
        break;
    }
  },

  chatIntent(g, npcId) {
    const s = stance(g, npcId);
    return { npcId, verb: 'chat', playerMove: '随便聊聊', ...s, date: `${g.day.date} ${g.phase === 'night' ? '晚上' : g.time}`, fallback: s.convey };
  },

  reckon(g) {
    return reckon(g);
  },
};

// ───────────── 辅助 ─────────────

// 消息树：每条消息从源头到玩家经过的每一环，结局时揭晓
type Chain = { who: string; said: string; altered?: boolean }[];
const CHAINS: Record<string, Chain> = {
  'cat-post': [
    { who: '老猫', said: '晒出账户截图：“我就是喜欢这只股票”' },
    { who: '论坛', said: '老猫赚翻了，大家一起上！', altered: true },
  ],
  si: [
    { who: '公布的卖空数据', said: '卖空股数约为流通股的一倍多（两周前的统计）' },
    { who: '财经电视', said: '空单超过流通股' },
  ],
  'si-still': [
    { who: '两周前的卖空数据', said: '卖空比例约 140%' },
    { who: '论坛', said: '空头一股都没平，还有 140% 等着我们', altered: true },
  ],
  bailout: [
    { who: '堡垒集团等两家基金', said: '向灰狼资本注资 27.5 亿美元' },
    { who: '财经电视', said: '空头的子弹又多了' },
  ],
  tweet: [
    { who: '一位科技富豪', said: '“Gamestonk!!”' },
    { who: '论坛', said: '连他都站在我们这边了', altered: true },
  ],
  'gw-closed': [
    { who: '灰狼资本', said: '已结清这只股票的空头头寸' },
    { who: '财经电视', said: '灰狼资本已经平仓' },
    { who: '论坛', said: '他们在撒谎，空头还在里面', altered: true },
  ],
};

function news(g: Game, id: string, title: string, body: string, cred: number) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title, body, source: '财经电视', credibility: cred, kind: 'news', chain: CHAINS[id] });
}
function rumor(g: Game, id: string, title: string, body: string, source: string, cred: number) {
  if (g.intel.some((i) => i.id === id)) return;
  g.addIntel({ id, title, body, source, credibility: cred, kind: 'rumor', chain: CHAINS[id] });
}
function mentor(g: Game, text: string) {
  g.addIntel({ id: `bill-${g.dayIndex}-${g.intel.length}`, title: text.slice(0, 22) + (text.length > 22 ? '…' : ''), body: text, source: '比尔', credibility: 0.8, kind: 'mentor' });
}

function applyRestriction(g: Game) {
  if (!flag(g, 'restrict') || flag(g, 'restrictActive')) return;
  g.flags.restrictActive = true;
  g.market.crowdSellOnly = true;
  // 限制买入之后，市场共识本身变了：做市商的估值中枢改回史料走势
  g.market.day = { ...g.market.day, base: undefined };
  if (g.factionId === 'retail') g.player.closeOnly = true;
  g.push({ kind: 'pause', text: flag(g, 'failed') ? '羽毛证券未能缴足押金，客户账户被冻结！' : '券商限制买入：散户只能卖出！' });
  g.push({ kind: 'rule', rule: 'close-only', blocked: true, text: '多家券商暂停了这只股票的买入，只允许卖出' });
}

function breakPact(g: Game, why: string) {
  const pact = g.alliances.find((x) => x.id === 'diamond' && !x.brokenBy);
  if (!pact) return;
  pact.brokenBy = 'player';
  pact.brokenDay = g.dayIndex;
  g.relate('jack', -30, why);
  g.reputation -= 10;
  if (g.principleId === 'no-betrayal') g.crossLine(why);
  g.push({ kind: 'intel', text: `钻石手公约破裂：${why}` });
}

function checkLines(g: Game) {
  if (g.principleId !== 'no-allin' || flag(g, `allin-${g.dayIndex}`)) return;
  const eq = g.equity();
  if (g.player.pos !== 0 && eq > 0 && g.marginNeed() / eq > 0.9) {
    g.flags[`allin-${g.dayIndex}`] = true;
    g.crossLine('保证金占用超过九成');
  }
}

function stance(g: Game, npcId: string): Pick<DialogueIntent, 'convey' | 'tone' | 'numbers'> {
  switch (npcId) {
    case 'cat':
      return { convey: ['我就是喜欢这只股票', '我不给任何人投资建议'], tone: 'warm', numbers: [] };
    case 'jack':
      return { convey: ['钻石手', '我们还在，一股都不卖'], tone: 'warm', numbers: [] };
    case 'rowan':
      return g.dayIndex >= 3 ? { convey: ['我们已经处理好了头寸', '基本面不会说谎'], tone: 'evasive', numbers: [] } : { convey: ['基本面不会说谎', '这家公司撑不过实体零售的寒冬'], tone: 'smug', numbers: [] };
    case 'stone':
      return { convey: ['我们只做市', '波动越大，风险越要算清楚'], tone: 'neutral', numbers: [] };
    case 'tom':
      return { convey: ['我们的使命是让金融民主化', '系统运行一切正常'], tone: 'warm', numbers: [] };
    case 'susan':
      return { convey: ['这是前所未有的', '所有人都在问：散户能赢吗'], tone: 'neutral', numbers: [] };
    case 'bill':
      return { convey: ['写下你的卖出价', '疯狂的时候，最贵的是犹豫'], tone: 'warm', numbers: [] };
  }
  return { convey: ['……'], tone: 'neutral', numbers: [] };
}

export function groupName(_g: Game, who: string): string {
  switch (who) {
    case 'gravity':
      return '历史引力（做市与套利资金）';
    case 'crowd':
      return '散户大军';
    case 'trend':
      return '趋势资金';
    case 'player':
      return '你';
    case GW:
      return '灰狼资本';
    case FT:
      return '堡垒集团（期权对冲）';
  }
  return who;
}

function briefing(g: Game): string {
  switch (g.factionId) {
    case 'short':
      return '灰狼资本空单 1,000 万股，均价 40 美元；管理资金 40 亿美元。卖空要按市值交 50% 保证金，还要每天付借券费。可借的券只剩 100 万股左右。';
    case 'broker':
      return '你是羽毛证券的 CEO。你不下单，但看得到大客户的仓位。你的客户买的股票要 T+2 才交收，在那之前，清算所按风险向你收押金。';
    default:
      return '你有 50 股（成本 18 美元）和 5,000 美元现金。你的券商不提供卖空。你在论坛上签了“钻石手公约”：到月球之前，一股不卖。';
  }
}

function reckon(g: Game): Ending {
  const ex = g.market.ex;
  const p = g.player;
  const startEq = (flag(g, 'startEq') as number) || 1;
  const eq = ex.equity(p);
  const r = g.faction.observer ? 0 : (eq - startEq) / startEq;
  const bars = g.market.bars;
  const high = Math.max(...bars.map((b) => b.h));
  const low = Math.min(...bars.map((b) => b.l));
  const close = g.market.closePrices[g.market.closePrices.length - 1];
  const restricted = !!flag(g, 'restrictActive');
  const clean = g.heatTier() <= 1 && g.linesCrossed === 0;
  let id = '';
  let title = '';
  let headline = '';
  let subhead = '';
  let archetype: Ending['archetype'];
  const body: string[] = [];

  if (g.factionId === 'broker') {
    if (flag(g, 'failed')) {
      id = 'broker-failed';
      archetype = '出局者';
      title = '倒下';
      headline = '羽毛证券未能缴足押金 客户账户遭冻结';
      subhead = '清算所暂停了它的交收，几百万用户一觉醒来什么都做不了';
      body.push('你赌清算所会通融。它没有。一家券商的押金缺口，变成了几百万个冻结的账户。');
    } else if (flag(g, 'raised')) {
      id = 'broker-raised';
      archetype = '守门人';
      title = '硬扛';
      headline = '羽毛证券连夜融资 34 亿美元 拒绝限制交易';
      subhead = `客户照常买入，股价收于 ${usd(close)}`;
      body.push('你用股东的钱换来了客户的信任。老股东被大幅稀释，但这一天，你的用户想买就能买。');
      body.push('没有了被迫卖出的散户，史料里那场一个多小时的暴跌没有发生——空头为此多付了一大笔钱。');
    } else {
      id = 'broker-restrict';
      archetype = '守门人';
      title = '限制买入';
      headline = '羽毛证券限制买入 散户怒火冲天';
      subhead = '押金要求随之大降，公司活了下来';
      body.push('你做了历史上那位 CEO 做过的事：只许卖、不许买。押金要求降了下来，公司活了下来。');
      body.push('代价是：几百万用户在最高点附近被关在门外，只能看着价格从 483 美元跌下去。三周后，你被请到了国会听证会上。');
    }
  } else if (g.bankrupt || eq <= 0) {
    id = 'bust';
    archetype = '出局者';
    title = '被清算';
    headline = g.factionId === 'short' ? '灰狼资本遭逼空 被券商强制平仓' : '散户账户被强制平仓';
    subhead = '权益跌穿零';
    body.push('价格没有上限，空头的亏损也没有上限。这是卖空和买入最不一样的地方。');
  } else if (g.factionId === 'short') {
    const covered = p.pos >= 0;
    id = covered ? 'short-covered' : 'short-held';
    title = covered ? '认赔离场' : '扛过了逼空';
    headline = covered ? `灰狼资本平掉空单 亏损 ${fmtYi(Math.max(0, startEq - eq))}` : `灰狼资本扛过逼空 账面${eq >= startEq ? '盈利' : '亏损'} ${fmtYi(Math.abs(eq - startEq))}`;
    subhead = flag(g, 'bailout') ? '月中接受 27.5 亿美元注资' : '没有接受外部注资';
    body.push(covered ? '你买回了每一股空单。你的每一笔回补，都是这场逼空的一部分燃料。' : '你没有平仓。散户被限制买入，替你挡下了最凶的那一段——这不是你的功劳，是规则的。');
    archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : r <= -0.6 ? '出局者' : clean ? '长青者' : '蛀虫';
  } else {
    const sold = p.pos < ((flag(g, 'startPos') as number) || 0);
    id = 'retail';
    title = r >= 1 ? '赚到真钱' : r >= 0 ? '全身而退' : '交了学费';
    headline = sold ? (r >= 0 ? `散户在逼空中卖出离场 收益 ${(r * 100).toFixed(0)}%` : '散户亏损离场') : `钻石手：一股没卖 账户${r >= 0 ? '盈利' : '亏损'} ${(Math.abs(r) * 100).toFixed(0)}%`;
    subhead = restricted ? '上午十点后，券商只允许卖出' : '';
    if (restricted) body.push('上午十点，你的券商关上了买入的门。你没做错任何事，规则在你最需要它的时候站到了另一边——原因不是阴谋，是 T+2 交收下清算所的押金要求。');
    body.push(sold ? '你卖了。论坛叫你“纸手”，你的账户叫你“赢家”。' : '你守住了公约。这一天之后，价格还会再冲高一次，然后回到 90 美元。');
    archetype = r >= 0.15 ? (clean ? '猎手' : '流星') : clean ? '长青者' : '蛀虫';
  }
  if (g.linesCrossed > 0) body.push(`你越过了自己定下的底线「${g.principle.label}」${g.linesCrossed} 次。`);

  return {
    id,
    title,
    archetype,
    headline,
    subhead,
    body,
    ruled: restricted ? '多家券商当日限制买入' : '券商未限制买入',
    history: [
      '2021 年 1 月 28 日上午，这只股票冲到 483 美元。随后多家券商限制买入、只许卖出，股价一个多小时里跌到 112.25 美元，收于 193.60 美元。',
      '一家券商在国会听证中说明：清算所当天凌晨要求它追加约 30 亿美元押金，限制买入后这一要求大幅下降；它随后几天融资约 34 亿美元。',
      '次日股价收于 325 美元，2 月 2 日收于 90 美元。同年 10 月，证交会员工报告认为，暴涨主要来自看多买盘，空头回补只占一小部分。',
    ],
    deviation: [
      `券商限制买入：历史上发生了；这一局${restricted ? '也发生了' : '没有发生'}`,
      `当日最高价：历史 483.00 美元，这一局 ${usd(high)}`,
      `当日最低价：历史 112.25 美元，这一局 ${usd(low)}`,
      `收盘价：历史 193.60 美元，这一局 ${usd(close)}`,
    ],
    stats: g.faction.observer
      ? [
          ['凌晨的决定', flag(g, 'failed') ? '什么都不做' : flag(g, 'raised') ? '融资保持开放' : '限制买入'],
          ['当日收盘', usd(close)],
          ['当日最低', usd(low)],
          ['声望', String(g.reputation)],
          ['越过底线', `${g.linesCrossed} 次`],
        ]
      : [
          ['最终权益', fmtYi(eq)],
          ['收益率', `${(r * 100).toFixed(1)}%`],
          ['声望', String(g.reputation)],
          ['越过底线', `${g.linesCrossed} 次`],
        ],
  };
}
