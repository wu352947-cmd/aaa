import type { CardDef, CardResult, Clock, Directive } from '../../engine/game';
import { COUNCIL, EVENINGS, TULIP_NPCS } from './data';
import { RULE_NAME, type TulipGame, type TulipRule } from './game';

/**
 * 酒馆里的花：对手动向、市政官的交代、每晚选卡。
 * 交易座位的手牌换算成盾，议员的手牌换算成影响力；对手的牌换得多，但会替对手把事办了。
 */

const R = (ok: boolean, title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok, title, effects, reply });
const CRASH = EVENINGS.findIndex((e) => e.kind === 'crash');
const npcName = (id: string) => TULIP_NPCS.find((n) => n.id === id)?.name ?? COUNCIL.find((c) => c.id === id)?.name ?? id;

// ───────────── 对手动向 ─────────────

export function tulipClocks(g: TulipGame): Clock[] {
  const out: Clock[] = [];
  const e = g.evening;
  const council = g.faction === 'council';
  const crashKnown = council || g.know.has('haarlem');
  const ruling = g.phase !== 'table';
  out.push({
    id: 'haarlem',
    who: 'gerrit',
    name: crashKnown ? '哈勒姆的拍卖会' : '酒馆里的风声',
    segs: CRASH,
    filled: Math.min(CRASH, e),
    known: crashKnown,
    then: '2 月 3 日，哈勒姆的拍卖会上，一个买家都没来。之后的价，会掉到零头。',
    now: e >= CRASH ? '已经发生了。' : `还剩 ${CRASH - e} 次碰面。`,
    counter: council ? '告示、定金、印花钱都能让最后那一跤摔得轻一点；救济金要钱箱里有钱才设得起来。' : '在那之前，把买来的约转手出去——或者别再买。',
    tone: g.faction === 'grower' ? 'neutral' : 'threat',
    state: e >= CRASH ? 'fired' : 'running',
  });
  if (!council) {
    // 老花农科内利斯：每晚都在卖
    const sold = g.npcBook.filter((d) => d.seller === 'cornelis').length + g.contracts.filter((c) => c.npc === 'cornelis' && c.side === 'buy').length;
    out.push({
      id: 'cornelis',
      who: 'cornelis',
      name: g.know.has('cornelis') ? '科内利斯：悄悄出货' : '科内利斯在盘算什么',
      segs: CRASH,
      filled: Math.min(CRASH, e),
      known: g.know.has('cornelis'),
      then: '崩盘之前，他会把手里的约全部转手出去，然后再也不来酒馆。',
      now: `到现在，他已经卖出 ${sold} 份约。`,
      counter: '他卖给谁，谁就接了最后一棒。',
      tone: g.faction === 'speculator' ? 'threat' : 'neutral',
      state: e >= CRASH ? 'fired' : 'running',
    });
  }
  if (council) {
    const t = g.tally(g.proposal ?? 'option');
    const blocs: [TulipRule, string, string][] = [
      ['forward', 'meer', '买了高价约的人，要按合约价付清。'],
      ['option', 'bloc', '买方付 3.5% 就能解约。'],
      ['void', 'goes', '所有的约一笔勾销。'],
    ];
    for (const [rule, who, then] of blocs) {
      const backers = COUNCIL.filter((c) => t.votes[c.id] === rule).map((c) => c.name);
      out.push({
        id: `vote-${rule}`,
        who,
        name: `议会：${RULE_NAME[rule]}`,
        segs: 4,
        filled: Math.min(4, t.count[rule]),
        known: true,
        then: `凑够 4 票，二月底的表决就${RULE_NAME[rule]}：${then}`,
        now: `照眼下，${t.count[rule]} 票${backers.length ? `（${backers.join('、')}${t.votes.you === rule ? '，加上你' : ''}）` : t.votes.you === rule ? '（只有你）' : ''}。`,
        counter: '登门游说、收礼、设救济金，都会挪动票数。你提交的规则，你自己那一票算在里面。',
        tone: rule === (g.proposal ?? 'option') ? 'friend' : 'neutral',
        state: ruling && g.phase === 'ending' ? (g.rule === rule ? 'fired' : 'defused') : 'running',
      });
    }
  }
  return out;
}

// ───────────── 市政官的交代（行会议员） ─────────────

interface Spec {
  id: string;
  evening: number;
  from: string;
  text: string;
  /** 什么时候见分晓：下一次碰面开始时，或者表决时 */
  at: 'next' | 'vote';
  check(g: TulipGame): boolean;
}

const SPECS: Spec[] = [
  { id: 'know', evening: 0, from: 'witt', text: '酒馆里到底签了多少约，城里没人说得清。下次碰面之前，要么让约定到行会登记，要么把花商们召集起来问清楚。', at: 'next', check: (g) => g.registered || g.assembled },
  { id: 'tax', evening: 1, from: 'witt', text: '城里的钱箱是空的。下次碰面之前，开始收印花钱。', at: 'next', check: (g) => g.tax },
  { id: 'hands-off', evening: 2, from: 'meer', text: '花农靠这个冬天吃饭。别贴告示，别收定金。', at: 'next', check: () => true },
  { id: 'count', evening: 3, from: 'witt', text: '风声不对。下次碰面之前，至少登门拜访两位议员，先把票数摸清楚。', at: 'next', check: (g) => g.lobbyVisits >= 2 },
  { id: 'relief', evening: CRASH, from: 'witt', text: '有人开始躲债了。表决之前把救济金设起来，别让倾家荡产的人冻死在街上。', at: 'vote', check: (g) => g.relief },
  { id: 'few-ruined', evening: CRASH + 1, from: 'witt', text: '表决时我只看一件事：倾家荡产的人不能超过两个。', at: 'vote', check: (g) => g.ruined(g.rule).length <= 2 },
];

/** 每晚开场：先结算上一晚的交代，再下新的 */
export function tulipDirectivesOpen(g: TulipGame): void {
  if (g.faction !== 'council') return;
  for (const dir of g.dirs) {
    const spec = SPECS.find((x) => x.id === dir.id)!;
    if (dir.status === 'open' && spec.at === 'next' && dir.day < g.evening) settle(g, dir, spec.check(g));
  }
  for (const spec of SPECS.filter((x) => x.evening === g.evening)) {
    if (g.dirs.some((x) => x.id === spec.id)) continue;
    g.dirs.push({ id: spec.id, day: spec.evening, from: spec.from, text: spec.text, stakes: '办到：当晚影响力 +1，威望 +3。办砸：威望 −3。', status: 'open' });
  }
}

export function tulipDirectivesVote(g: TulipGame): void {
  for (const dir of g.dirs) {
    const spec = SPECS.find((x) => x.id === dir.id)!;
    if (dir.status === 'open') settle(g, dir, spec.check(g));
  }
}

export function breakTulipDirective(g: TulipGame, id: string, why: string): void {
  const dir = g.dirs.find((x) => x.id === id && x.status === 'open');
  if (dir) settle(g, dir, false, why);
}

function settle(g: TulipGame, dir: Directive, ok: boolean, why?: string): void {
  dir.status = ok ? 'met' : 'failed';
  if (ok) {
    if (g.phase === 'table') g.influence += 1;
    dir.verdict = `办到了：${g.phase === 'table' ? '当晚影响力 +1，' : ''}威望 +3`;
  } else dir.verdict = `${why ?? '没办到'}：威望 −3`;
}

export function tulipDirectives(g: TulipGame): Directive[] {
  return g.dirs.filter((x) => x.day >= g.evening - 1 || x.status === 'open');
}

// ───────────── 每晚选卡 ─────────────

type Deal = CardDef & { ok(g: TulipGame): boolean; pts: number };

function deck(g: TulipGame): Deal[] {
  const normal = (g: TulipGame) => g.night.kind === 'normal';
  if (g.faction === 'council') {
    const base = { group: '手牌', convert: '+1 点影响力', pts: 1 } as const;
    return [
      { ...base, id: 'x-clerk', name: '抄写员', color: 'white', does: '行会的抄写员连夜抄好告示，贴遍城里的酒馆：之后每晚的价低一截。不花影响力。', cost: '花农不高兴。', when: 'any', ok: normal },
      { ...base, id: 'x-ledger', name: '公证人的登记簿', color: 'white', does: '斯皮格尔把他经手的约都抄给你：到今晚为止的每一份约，你都知道。', cost: '无。', when: 'any', ok: (g) => g.npcBook.some((d) => !d.heard) },
      {
        ...base,
        id: 'x-witt',
        name: '市政官的便条',
        color: 'white',
        does: '德·维特在便条上写：“你提什么，我先听你说。”他对你选的那条规则倾向 +2。',
        cost: '无。',
        when: 'any',
        targets: (['forward', 'option', 'void'] as TulipRule[]).map((r) => ({ id: r, label: RULE_NAME[r] })),
        ok: (g) => g.evening >= 2,
      },
      { ...base, id: 'x-sermon', name: '胡斯的布道', color: 'white', does: '礼拜天，胡斯长老在讲坛上讲“风中的买卖”：之后每晚的价低一截，胡斯对“一律作废”更坚定。', cost: '无。', when: 'any', ok: normal },
      {
        ...base,
        id: 'x-foe-petition',
        name: '花农的请愿书',
        color: 'grey',
        does: '四十个花农签了名，要求二月底照约履行。',
        cost: '这是对手的牌。',
        when: 'any',
        foe: '换算：你把请愿书递上去，替自己在议会里攒了人情，影响力 +2。但请愿书也让范·德·梅尔和斯哈普更坚定：他们对“照约履行”的倾向各 +1。',
        convert: '+2 点影响力',
        pts: 2,
        ok: (g) => g.evening >= 2,
      },
    ];
  }
  const base = { group: '手牌', convert: '+3 盾', pts: 3 } as const;
  const open = g.quotes.filter((q) => !q.done && g.revealed[q.npc] == null);
  const out: Deal[] = [
    {
      ...base,
      id: 'x-notary',
      name: '公证人的抄本',
      color: 'white',
      does: '斯皮格尔欠你一个人情：他把一个人签约时的底价念给你听。比老板说得准。',
      cost: '无。',
      when: 'any',
      targets: open.map((q) => ({ id: q.npc, label: npcName(q.npc) })),
      blocked: open.length === 0 ? '桌上没有可打听的人了' : undefined,
      ok: () => true,
    },
    { ...base, id: 'x-letter', name: '哈勒姆来的信', color: 'white', does: '表哥从哈勒姆写信来：那边的拍卖会，买家一次比一次少。', cost: '无。', when: 'any', ok: (g) => g.evening >= 2 && g.evening < CRASH && !g.know.has('haarlem') },
    { ...base, id: 'x-credit', name: '老板的赊账', color: 'grey', does: '赫里特让你先赊 10 盾。', cost: '四月结账时还 12 盾。', when: 'any', ok: (g) => g.evening < CRASH },
    { ...base, id: 'x-host', name: '老板的眼色', color: 'white', does: '赫里特朝角落努努嘴：科内利斯这几晚在干什么，他看得清清楚楚。', cost: '无。', when: 'any', ok: (g) => !g.know.has('cornelis') },
    {
      ...base,
      id: 'x-foe-dump',
      name: '科内利斯的转让',
      color: 'grey',
      does: '科内利斯想把一份约转给你，还倒贴你一笔“辛苦费”。',
      cost: '这是对手的牌。',
      when: 'any',
      foe: '换算：你收下辛苦费，口袋里 +6 盾。但你也接下了他的约：按今晚的价，买入一份春天交货的球茎。',
      convert: '+6 盾',
      pts: 6,
      ok: (g) => g.evening >= 3 && g.evening < CRASH,
    },
  ];
  if (g.faction === 'grower')
    out.push({ ...base, id: 'x-sample', name: '一株开得好的样本', color: 'white', does: '温室里提前开了一株“瑞士人”。带去酒馆给大家看：下一晚大家心里的价高 6%。', cost: '无。', when: 'any', ok: (g) => g.evening < CRASH - 1 });
  return out;
}

export function tulipDeck(g: TulipGame): CardDef[] {
  return deck(g);
}
export function tulipOfferable(g: TulipGame, c: CardDef): boolean {
  return (c as Deal).ok(g);
}

export function tulipConvert(g: TulipGame, id: string): CardResult {
  const c = deck(g).find((x) => x.id === id)!;
  const fx: string[] = [];
  if (g.faction === 'council') {
    g.influence += c.pts;
    fx.push(`影响力 +${c.pts}`);
  } else {
    g.cash += c.pts;
    fx.push(`口袋里 +${c.pts} 盾`);
  }
  if (id === 'x-foe-petition') {
    g.lobbyAdd('meer', 'forward', 1);
    g.lobbyAdd('schaep', 'forward', 1);
    fx.push('范·德·梅尔、斯哈普对“照约履行”更坚定');
  }
  if (id === 'x-foe-dump') {
    g.addContract('cornelis', 'buy', g.price);
    fx.push(`接下科内利斯的约：按 ${g.price} 盾买入一份`);
  }
  return R(true, `${c.name}：换算`, fx);
}

export function tulipDraftPlay(g: TulipGame, id: string, target?: string): CardResult {
  switch (id) {
    case 'x-clerk':
      g.cool += g.cool > 0 ? 0.04 : 0.08;
      return R(true, '告示贴遍了城里的酒馆', ['之后每晚的价低一截'], { who: '范·德·梅尔', text: '连抄写员都派出来了？' });
    case 'x-ledger':
      for (const d of g.npcBook) d.heard = true;
      return R(true, '登记簿抄来了', ['到今晚为止的每一份约，你都知道']);
    case 'x-witt': {
      const rule = target as TulipRule;
      g.lobbyAdd('witt', rule, 2);
      return R(true, `德·维特对“${RULE_NAME[rule]}”更有好感`, ['市政官倾向 +2'], { who: '德·维特', text: '我先听你说。但到了表决，我只看这座城里会有多少人倾家荡产。' });
    }
    case 'x-sermon':
      g.cool += 0.04;
      g.lobbyAdd('goes', 'void', 1);
      return R(true, '胡斯长老讲了“风中的买卖”', ['之后每晚的价低一截', '胡斯对“一律作废”更坚定']);
    case 'x-notary': {
      const q = g.quote(target!)!;
      g.revealed[q.npc] = q.reservation;
      return R(true, `${npcName(q.npc)}心里的价：${q.reservation} 盾`, ['公证人的抄本，一盾不差'], { who: '斯皮格尔', text: '这话出了这个门，我就没说过。' });
    }
    case 'x-letter':
      g.know.add('haarlem');
      return R(true, '表哥的信', ['你知道了哈勒姆那边会发生什么（见“对手动向”）'], { who: '表哥的信', text: '上个礼拜的拍卖会，来的买家只有前一次的一半。他们说是天冷。我看不是。' });
    case 'x-credit':
      g.cash += 10;
      g.debt += 12;
      return R(true, '赊到 10 盾', ['口袋里 +10 盾', '四月结账时还 12 盾']);
    case 'x-host':
      g.know.add('cornelis');
      return R(true, '你顺着老板的眼色看过去', ['摸清了科内利斯的盘算（见“对手动向”）'], { who: '赫里特', text: '老科内利斯？他这几晚只卖不买。种了四十年花的人，比谁都清楚花值多少。' });
    case 'x-sample':
      g.boost += 0.06;
      return R(true, '样本在桌上传了一圈', ['下一晚大家心里的价 +6%']);
  }
  return R(false, '没有效果', []);
}
