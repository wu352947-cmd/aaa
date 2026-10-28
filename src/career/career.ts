import type { Ending, Game, GameOpts } from '../engine/game';
import { Rng } from '../engine/rng';

/**
 * 生涯模式（设计文档第九章）：一个人从 1995 年的大户室走到 2021 年。
 *
 * 两章能玩的剧本，中间是“那些年”：真实年份上的几个转折点，每个都要做一个选择。
 * 钱、声望、监管档案、越过的底线、收到的信，一路带下去；旧账会在后面的年份里被翻出来。
 * 走的路决定 2021 年坐哪个座位。最后生成一页生涯传记：风光的是报纸头版，栽了的是讣告。
 *
 * 这里只有纯逻辑和数据：同一个种子、同样的选择 = 同一段人生，可以测试、可以重放。
 */

export type Path = 'retail' | 'short' | 'mm' | 'broker';

export interface CareerEvent {
  id: string;
  year: string;
  title: string;
  choice: string;
  note: string;
  /** 这一步之后的身家（元） */
  wealth: number;
}

export interface ChapterResult {
  scenario: string;
  seat: string;
  year: string;
  title: string;
  headline: string;
  archetype?: string;
  r: number;
  /** 这一章打完时的身家 */
  wealth: number;
}

export interface Career {
  v: 1;
  seed: string;
  principle: string;
  difficulty: string;
  step: 'ch1' | 'interlude' | 'ch2' | 'done';
  /** 身家（人民币元；2021 年那一章按 6.5 折算） */
  wealth: number;
  reputation: number;
  /** 监管档案：只降不清零，带进下一章 */
  heat: number;
  lines: number;
  letters: number;
  /** 留了痕的事：年份 + 做了什么 */
  dirty: { year: string; what: string }[];
  path: Path | null;
  /** 1996–2020 的转折点走到第几个 */
  next: number;
  events: CareerEvent[];
  chapters: ChapterResult[];
  /** 散户本金在 1995 年的起点 */
  start: number;
  /** 跟过庄、做过配资这类会在后面被翻出来的事 */
  marks: string[];
}

export const START_WEALTH = 80_000;
const USD = 6.5;

export function newCareer(seed: string, principle: string, difficulty: string): Career {
  return { v: 1, seed, principle, difficulty, step: 'ch1', wealth: START_WEALTH, reputation: 10, heat: 0, lines: 0, letters: 0, dirty: [], path: null, next: 0, events: [], chapters: [], start: START_WEALTH, marks: [] };
}

// ───────────── 两章剧本 ─────────────

/** 第一章：1995 年的大户室，从散户起步 */
export function chapter1(): { scenario: 's327'; seat: 'retail'; opts: GameOpts } {
  return { scenario: 's327', seat: 'retail', opts: { career: true } };
}

/** 第二章：2021 年，座位由这些年走的路决定；钱、声望、档案带进去 */
export function chapter2(c: Career): { scenario: 'gme2021'; seat: Path; opts: GameOpts } {
  const seat = c.path ?? 'retail';
  return {
    scenario: 'gme2021',
    seat,
    opts: {
      career: true,
      cash: seat === 'retail' ? Math.max(5_900, Math.round(c.wealth / USD)) : undefined,
      reputation: c.reputation,
      heat: Math.min(60, Math.round(c.heat * 0.6)),
    },
  };
}

export const SEAT_NAME: Record<Path, string> = { retail: '论坛散户', short: '做空基金经理', mm: '做市商交易台', broker: '零佣金券商 CEO' };

const ret = (e: Ending) => {
  const s = e.stats.find(([k]) => k === '收益率')?.[1];
  return s ? Number(s.replace('%', '')) / 100 : null;
};

/** 一章打完：把结果记进生涯 */
export function recordChapter(c: Career, g: Game): Career {
  const e = g.ending!;
  const n = { ...c, dirty: [...c.dirty], marks: [...c.marks], chapters: [...c.chapters] };
  const year = g.scenario.id === 's327' ? '1995' : '2021';
  let r = ret(e);
  if (g.scenario.id === 's327') {
    // 散户的八万块就是全部身家；输光了，家里凑两万让你从头来过
    n.wealth = Math.max(0, Math.round(START_WEALTH * (1 + (r ?? 0))));
    if (n.wealth < 5_000) n.marks.push('broke-1995');
  } else if (g.factionId === 'retail') {
    n.wealth = Math.max(0, Math.round((r == null ? n.wealth : (n.wealth / USD) * (1 + r)) * USD));
  } else {
    // 机构座位：输赢是公司的，落到个人身上的是分红或者被扫地出门
    if (r == null) r = (Number(e.stats.find(([k]) => k === '用户信任')?.[1]) || 50) >= 60 ? 0.3 : -0.2;
    n.wealth = Math.round(n.wealth * (r >= 0 ? 1 + Math.min(3, r) : 0.7));
  }
  n.reputation = g.reputation;
  n.heat = Math.max(n.heat, Math.round(g.heatPeak));
  n.lines += g.linesCrossed;
  n.letters += g.intel.filter((i) => i.kind === 'victim').length;
  for (const d of g.darkDeeds) n.dirty.push({ year, what: d.label });
  n.chapters.push({ scenario: g.scenario.id, seat: g.factionId, year, title: e.title, headline: e.headline, archetype: e.archetype, r: r ?? 0, wealth: n.wealth });
  n.step = g.scenario.id === 's327' ? 'interlude' : 'done';
  if (n.step === 'interlude' && n.wealth < 20_000) {
    n.events = [...n.events, { id: 'restart', year: '1995', title: '家里凑了两万块', choice: '从头来过', note: '八万块没了。母亲把存折塞给你：“最后一次。”', wealth: 20_000 }];
    n.wealth = 20_000;
  }
  return n;
}

// ───────────── 那些年 ─────────────

export interface Choice {
  id: string;
  label: string;
  detail: string;
  /** 黑色或灰色的路：会进档案 */
  color?: 'grey' | 'black';
}

export interface Turn {
  id: string;
  year: string;
  title: string;
  body: string;
  choices: Choice[];
}

interface Outcome {
  mult: number;
  note: string;
  rep?: number;
  heat?: number;
  dirty?: string;
  mark?: string;
  path?: Path;
}

/** 本事：第一章打得好的人，后面的年份里运气也略好一点（最多 ±10%） */
const skill = (c: Career) => Math.max(-0.1, Math.min(0.1, (c.chapters[0]?.r ?? 0) * 0.1));
const roll = (c: Career, id: string, lo: number, hi: number) => {
  const x = new Rng(`${c.seed}/career/${id}`).next();
  return lo + (hi - lo) * Math.min(1, Math.max(0, x + skill(c)));
};
const has = (c: Career, m: string) => c.marks.includes(m);

const TURNS: { turn: (c: Career) => Turn; resolve: (c: Career, choice: string) => Outcome }[] = [
  {
    turn: () => ({
      id: '1996',
      year: '1996',
      title: '国债期货停了，大户室散了',
      body: '1995 年 5 月，国债期货试点暂停。第二年 12 月，股票有了涨跌停板。大户室里的人各奔东西。',
      choices: [
        { id: 'stay', label: '留在上海，做职业散户', detail: '一个人，一台行情机。' },
        { id: 'south', label: '南下深圳，跟着游资坐庄', detail: '来钱快。你会认识很多人，也会被很多人记住。', color: 'grey' },
        { id: 'broker', label: '进券商自营部，从交易员做起', detail: '拿工资，学规矩。' },
      ],
    }),
    resolve: (c, ch) =>
      ch === 'south'
        ? { mult: roll(c, '1996', 1.3, 2.2), note: '你在深圳跟着一伙游资拉了三只股票。钱来得很快。', rep: 5, heat: 12, dirty: '跟着游资坐庄', mark: 'zhuang' }
        : ch === 'broker'
          ? { mult: 1.08, note: '自营部的工资不高，但你学会了看席位、看资金。', rep: 8, mark: 'desk' }
          : { mult: roll(c, '1996s', 0.95, 1.25), note: '你在家里装了一条电话线，每天盯盘到收市。' },
  },
  {
    turn: (c) => ({
      id: '1999',
      year: '1999',
      title: '5·19 行情',
      body: `1999 年 5 月 19 日，网络科技股一飞冲天。你手里有 ${fmtWealth(c.wealth)}。`,
      choices: [
        { id: 'all', label: '满仓网络股', detail: '名字里带“网”的都在涨。' },
        { id: 'pump', label: '跟庄拉一只科技股', detail: '庄家已经备好了资金和消息。你负责接力。', color: 'black' },
        { id: 'half', label: '只拿一半', detail: '留一半现金，睡得着觉。' },
      ],
    }),
    resolve: (c, ch) =>
      ch === 'all'
        ? { mult: roll(c, '1999', 1.8, 2.6), note: '两年里你的账户翻了一倍多。', mark: 'dotcom' }
        : ch === 'pump'
          ? { mult: roll(c, '1999p', 2.0, 3.2), note: '那只股票一年涨了九倍。你在里面赚了三倍。', heat: 18, dirty: '操纵股价（科技股）', mark: 'pump' }
          : { mult: 1.35, note: '你赚得不多，但每一分都踏实。' },
  },
  {
    turn: (c) => ({
      id: '2001',
      year: '2001',
      title: '泡沫破了',
      body: has(c, 'pump')
        ? '2001 年，你跟过的那只庄股连续十几个跌停，庄家被立案。稽查的人在查当年的资金往来。'
        : has(c, 'dotcom')
          ? '2001 年，纳斯达克腰斩，国有股减持，A 股一路向下。你的网络股还在手里。'
          : '2001 年，国有股减持，A 股一路向下。身边的人都在割肉。',
      choices: has(c, 'pump')
        ? [
            { id: 'confess', label: '主动去说明情况', detail: '把账户和资金往来交出去。' },
            { id: 'hide', label: '把钱转到亲戚名下', detail: '账上干净了，事情还在。', color: 'black' },
          ]
        : [
            { id: 'hold', label: '扛着', detail: '好公司总会涨回来。' },
            { id: 'cut', label: '割肉离场', detail: '认了，换点现金过冬。' },
            { id: 'bottom', label: '分批抄底', detail: '别人恐惧的时候……' },
          ],
    }),
    resolve: (c, ch) => {
      if (ch === 'confess') return { mult: 0.55, note: '你被罚没了违法所得，免于刑事追究。圈子里有人说你不讲究，也有人说你还算干净。', rep: -10, heat: -10 };
      if (ch === 'hide') return { mult: 0.9, note: '钱保住了。那几个亲戚的名字，从此记在了别人的本子上。', heat: 20, dirty: '转移违法所得' };
      if (ch === 'hold') return { mult: has(c, 'dotcom') ? 0.35 : 0.6, note: has(c, 'dotcom') ? '网络股跌掉了七成。你扛到了 2005 年。' : '你扛过了四年熊市，账户少了四成。' };
      if (ch === 'cut') return { mult: has(c, 'dotcom') ? 0.6 : 0.8, note: '你割在了半山腰。后来证明，那还不是底。' };
      return { mult: roll(c, '2001', 0.55, 1.1), note: '你买早了，但在 998 点前后补上了最后一笔。' };
    },
  },
  {
    turn: (c) => ({
      id: '2007',
      year: '2007',
      title: '6124 点',
      body: `股权分置改革之后，牛市来了。2007 年秋天，上证指数冲向 6000 点。你手里有 ${fmtWealth(c.wealth)}，营业部又在劝人配资。`,
      choices: [
        { id: 'ride', label: '满仓坐到顶', detail: '这一次真的不一样。' },
        { id: 'trim', label: '五千点卖掉一半', detail: '少赚一点，留个后手。' },
        { id: 'lever', label: '找配资，加三倍杠杆', detail: '赚得最快，也最快归零。', color: 'grey' },
      ],
    }),
    resolve: (c, ch) =>
      ch === 'lever'
        ? { mult: roll(c, '2007', 2.4, 3.6), note: '三倍杠杆，三个月翻了三倍。', heat: 6, mark: 'lever' }
        : ch === 'trim'
          ? { mult: roll(c, '2007t', 1.5, 1.9), note: '你在五千点卖掉了一半。剩下的一半，跟着指数冲到了顶。', mark: 'trim' }
          : { mult: roll(c, '2007r', 1.9, 2.5), note: '你坐到了 6124 点。那天大户室里有人放了鞭炮。' },
  },
  {
    turn: (c) => ({
      id: '2008',
      year: '2008',
      title: '一年跌掉七成',
      body: has(c, 'lever') ? '2008 年，指数从 6124 跌到 1664。配资公司的电话一天打来三次。' : '2008 年，雷曼兄弟倒了，指数从 6124 跌到 1664。',
      choices: [
        { id: 'hold', label: '硬扛', detail: '跌了这么多，总该到底了。' },
        { id: 'stop', label: '止损离场', detail: '活下来比什么都重要。' },
        { id: 'short', label: '去香港做空恒指', detail: '既然要跌，就站到跌的那一边。' },
      ],
    }),
    resolve: (c, ch) => {
      if (has(c, 'lever') && ch === 'hold') return { mult: 0.08, note: '配资公司没等你扛到底，在 3000 点把你强平了。一年前的三倍，一夜之间还了回去，还倒欠一截。', rep: -5 };
      if (ch === 'hold') return { mult: has(c, 'trim') ? 0.6 : 0.4, note: '你扛到了 2009 年的反弹。账户还在，只是薄了很多。' };
      if (ch === 'stop') return { mult: has(c, 'lever') ? 0.35 : 0.65, note: '你在 4000 点认了赔。后来才知道那只是半山腰。' };
      return { mult: roll(c, '2008', 1.0, 1.7), note: '恒指期货的空单让你在别人恐慌的时候赚了一笔。', rep: 5 };
    },
  },
  {
    turn: (c) => ({
      id: '2013',
      year: '2013',
      title: '下半辈子做什么',
      body: `你四十三岁，身家 ${fmtWealth(c.wealth)}，声望 ${c.reputation}。有几条路摆在面前。`,
      choices: [
        { id: 'retail', label: '还是自己炒，顺手开个美股账户', detail: '2021 年：论坛散户。' },
        { id: 'short', label: '去纽约，进一家做空基金做研究', detail: '2021 年：做空基金经理。' },
        { id: 'mm', label: '去芝加哥，做量化做市', detail: '2021 年：做市商交易台。' },
        { id: 'broker', label: '加入一家零佣金券商创业', detail: '2021 年：券商 CEO。' },
      ],
    }),
    resolve: (c, ch) => {
      const path = ch as Path;
      if (path === 'retail') return { mult: roll(c, '2013', 1.2, 1.8), note: '你继续一个人炒股。开美股账户的那天，你想起了 1995 年的大户室。', path };
      if (path === 'short') return { mult: 1.1, note: '面试你的合伙人看完你 2008 年的空单记录，说：“你懂恐慌。”', rep: 5, path };
      if (path === 'mm') return { mult: 1.15, note: '你在芝加哥学会了一件事：做市商不猜方向，只收过路费。', rep: 5, path };
      return { mult: 0.9, note: '你把一部分身家投进了这家券商。创始人说：“我们要让交易免费。”', rep: 8, path };
    },
  },
  {
    turn: (c) => ({
      id: '2015',
      year: '2015',
      title: c.heat >= 30 ? '查场外配资，也查旧账' : '股灾',
      body:
        c.heat >= 30
          ? `2015 年夏天，股灾之后监管查场外配资。你的档案里有这些事：${c.dirty.map((d) => `${d.year} 年${d.what}`).join('、') || '一些说不清的资金往来'}。稽查局的人约你谈话。`
          : '2015 年 6 月，杠杆牛市崩塌，千股跌停。国家队入场救市。',
      choices:
        c.heat >= 30
          ? [
              { id: 'talk', label: '如实说明', detail: '旧账翻出来，该认的认。' },
              { id: 'fix', label: '找人把事情压下去', detail: '这一次压住了，下一次呢？', color: 'black' },
            ]
          : [
              { id: 'cut', label: '减仓观望', detail: '这一次，你没有跟着冲。' },
              { id: 'hold', label: '满仓扛住', detail: '国家队都进场了。' },
              { id: 'buy', label: '跟着国家队抄底', detail: '跟着最大的那笔钱走。' },
            ],
    }),
    resolve: (c, ch) => {
      if (ch === 'talk') return { mult: 0.7, note: '你交了罚款，档案上多了一行字，但事情了结了。', rep: -5, heat: -15 };
      if (ch === 'fix') return { mult: 0.85, note: '电话打出去，谈话取消了。你欠下了一个人情，档案还在。', heat: 15, dirty: '找关系压下稽查' };
      if (ch === 'cut') return { mult: 0.92, note: '你躲过了最狠的那几天。' };
      if (ch === 'hold') return { mult: 0.6, note: '你扛住了，只是比以前更穷。' };
      return { mult: roll(c, '2015', 0.75, 1.25), note: '国家队托住了你买的那几只大盘股。' };
    },
  },
  {
    turn: () => ({
      id: '2020',
      year: '2020',
      title: '一个月四次熔断',
      body: '2020 年 3 月，美股十天里四次熔断。你五十岁了。',
      choices: [
        { id: 'buy', label: '在恐慌里买', detail: '你见过 1995、2008 和 2015。' },
        { id: 'wait', label: '拿着现金等', detail: '等一切明朗。' },
      ],
    }),
    resolve: (c, ch) => (ch === 'buy' ? { mult: roll(c, '2020', 1.3, 1.8), note: '你在最恐慌的那周买入，一年后翻了一倍。', rep: 3 } : { mult: 1.02, note: '等一切明朗的时候，价格已经回去了。' }),
  },
];

export const TURN_COUNT = TURNS.length;

/** 眼下要做的那个选择；那些年走完了返回 null */
export function currentTurn(c: Career): Turn | null {
  return c.step === 'interlude' && c.next < TURNS.length ? TURNS[c.next].turn(c) : null;
}

/** 做出选择：身家、声望、档案跟着变；走完那些年就进入第二章 */
export function choose(c: Career, choiceId: string): Career {
  const t = currentTurn(c);
  if (!t) return c;
  const ch = t.choices.find((x) => x.id === choiceId);
  if (!ch) return c;
  const o = TURNS[c.next].resolve(c, choiceId);
  const n: Career = { ...c, dirty: [...c.dirty], marks: [...c.marks], events: [...c.events] };
  n.wealth = Math.max(0, Math.round(c.wealth * o.mult));
  n.reputation = c.reputation + (o.rep ?? 0);
  n.heat = Math.max(Math.round(c.heat * 0.5), c.heat + (o.heat ?? 0));
  if (o.dirty) n.dirty.push({ year: t.year, what: o.dirty });
  if (o.mark) n.marks.push(o.mark);
  if (o.path) n.path = o.path;
  if (ch.color === 'black' && c.principle === 'no-violation') n.lines++;
  n.events.push({ id: t.id, year: t.year, title: t.title, choice: ch.label, note: o.note, wealth: n.wealth });
  n.next = c.next + 1;
  if (n.next >= TURNS.length) n.step = 'ch2';
  return n;
}

// ───────────── 生涯传记 ─────────────

export interface Biography {
  kind: 'front' | 'obituary';
  headline: string;
  sub: string;
  archetype: string;
  paragraphs: string[];
  stats: [string, string][];
  curve: { year: string; wealth: number }[];
}

export function fmtWealth(x: number): string {
  if (x >= 1e8) return `${(x / 1e8).toFixed(2)} 亿元`;
  if (x >= 1e4) return `${(x / 1e4).toFixed(x >= 1e6 ? 0 : 1)} 万元`;
  return `${Math.round(x)} 元`;
}

export function biography(c: Career): Biography {
  const mult = c.wealth / c.start;
  const dirty = c.dirty.length;
  const clean = c.heat < 30 && c.lines === 0;
  const ch2 = c.chapters[1];
  const busted = c.wealth < 10_000;
  // 速度 × 合规：四个象限（第七章的致富路径地图）
  const archetype = busted ? '出局者' : mult >= 20 ? (clean ? '猎手' : '流星') : clean ? '长青者' : '蛀虫';
  const kind: Biography['kind'] = busted || (!clean && c.heat >= 60) ? 'obituary' : 'front';
  const seat = ch2 ? SEAT_NAME[ch2.seat as Path] ?? ch2.seat : '';
  const headline =
    kind === 'obituary'
      ? busted
        ? '一个交易员的讣告：从大户室来，回大户室去'
        : '一个交易员的讣告：账做得很干净，档案没有'
      : archetype === '猎手'
        ? `从八万块到 ${fmtWealth(c.wealth)}：一个散户的二十六年`
        : archetype === '长青者'
          ? '大户室走出来的长青者'
          : archetype === '流星'
            ? `${fmtWealth(c.wealth)} 的背后：一份越翻越厚的档案`
            : '赚到了钱，也留下了痕';
  const paragraphs: string[] = [];
  const c1 = c.chapters[0];
  if (c1) paragraphs.push(`1995 年，你二十五岁，带着八万块挤进上海的证券营业部大户室。327 那一仗，你的结局是「${c1.title}」：${c1.headline}。`);
  for (const e of c.events) paragraphs.push(`${e.year} 年，${e.title}。你选择${e.choice}。${e.note}`);
  if (ch2) paragraphs.push(`2021 年，你五十一岁，坐在${seat}的位子上，遇上了那场逼空。结局是「${ch2.title}」：${ch2.headline}。`);
  if (c.letters) paragraphs.push(`这些年里，有 ${c.letters} 个人因为你的单子写过信。你留着其中几封。`);
  if (dirty) paragraphs.push(`你的档案里记着：${c.dirty.map((d) => `${d.year} 年${d.what}`).join('；')}。所有交易都留痕。`);
  if (c.lines) paragraphs.push(`你越过了自己当初定下的底线 ${c.lines} 次。`);
  paragraphs.push(
    kind === 'obituary'
      ? busted
        ? '最后一次有人见到你，是在一家营业部的大户室里。你已经不下单了，只是看。'
        : '你的最后一笔交易，是和稽查局签的那份认罚协议。'
      : archetype === '长青者'
        ? '你没有成为传奇。你只是一直都在。'
        : archetype === '猎手'
          ? '你赚了很多钱，而且每一笔都经得起翻查。这在这一行里，比赚钱更难。'
          : '钱还在。档案也还在。',
  );
  const curve = [
    { year: '1995', wealth: c.start },
    ...(c1 ? [{ year: '1995 末', wealth: c1.wealth }] : []),
    ...c.events.map((e) => ({ year: e.id === 'restart' ? '1996 初' : e.year, wealth: e.wealth })),
    ...(ch2 ? [{ year: '2021', wealth: ch2.wealth }] : []),
  ];
  return {
    kind,
    headline,
    sub: `${c.principle === 'no-violation' ? '“绝不违规下单”' : c.principle === 'no-betrayal' ? '“绝不背弃盟友”' : '“绝不押上全部身家”'}——这是你当年给自己定的规矩`,
    archetype,
    paragraphs,
    stats: [
      ['身家', fmtWealth(c.wealth)],
      ['二十六年', `${mult >= 1 ? '×' : '剩'} ${mult >= 1 ? mult.toFixed(1) : `${(mult * 100).toFixed(0)}%`}`],
      ['声望', String(c.reputation)],
      ['监管档案', `${c.heat}`],
      ['留痕的事', `${dirty} 件`],
      ['收到的信', `${c.letters} 封`],
      ['越过底线', `${c.lines} 次`],
    ],
    curve,
  };
}

// ───────────── 存取 ─────────────

const KEY = 'chouma.career';

export function saveCareer(c: Career | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* 存储不可用时静默放弃 */
  }
}

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(KEY);
    const c = raw ? (JSON.parse(raw) as Career) : null;
    return c?.v === 1 ? c : null;
  } catch {
    return null;
  }
}
