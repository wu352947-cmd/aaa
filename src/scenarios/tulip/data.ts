import type { NpcDef, RuleCardDef, SourceCard } from '../../engine/game';

// ───────────── 酒馆里的花：1636–37 年冬，哈勒姆 ─────────────
// 价格单位：荷兰盾 / 份（一份约合一磅普通品种“瑞士人”球茎）。
// 走势参照 Thompson (2007) 价格指数的形状：1636 年 12 月起加速上涨，
// 1637 年 2 月 3 日哈勒姆的买家突然消失，随后崩落。具体数字为游戏重建。

export type EveningKind = 'normal' | 'crash' | 'after';

export interface Evening {
  date: string;
  label: string;
  kind: EveningKind;
  /** 当晚市场共识价（重建），荷兰盾 / 份 */
  anchor: number;
  /** 买家情绪：>0 买家多、出价高；<0 卖家多 */
  mood: number;
  intro: string[];
}

export const EVENINGS: Evening[] = [
  {
    date: '1636-12-01',
    label: '第一夜',
    kind: 'normal',
    anchor: 120,
    mood: 0.05,
    intro: [
      '金鹿酒馆的后屋里生着炉火。几张长桌，一壶啤酒，一块块写着粉笔字的石板。这里就是花商们说的“学院”。',
      '没有人带着球茎来——球茎还埋在城外的花田里，要到四月开过花才能挖出来。今晚大家买卖的，是一张张“春天交货”的约定。',
    ],
  },
  {
    date: '1636-12-20',
    label: '第二夜',
    kind: 'normal',
    anchor: 170,
    mood: 0.12,
    intro: ['桌边的人比上次多了。织布匠扬说，他的表哥上个月倒手两份“瑞士人”，赚的钱够一家人吃半年。'],
  },
  {
    date: '1637-01-12',
    label: '第三夜',
    kind: 'normal',
    anchor: 320,
    mood: 0.2,
    intro: ['新年过后，价格几乎每周都在翻。面包师彼得把店交给了学徒，天天泡在酒馆里。'],
  },
  {
    date: '1637-01-26',
    label: '第四夜',
    kind: 'normal',
    anchor: 620,
    mood: 0.28,
    intro: ['一份普通的“瑞士人”，已经抵得上一个手艺人两年多的工钱。没有人问花本身值多少，大家只问：下个礼拜能卖多少。'],
  },
  {
    date: '1637-02-02',
    label: '第五夜',
    kind: 'normal',
    anchor: 1150,
    mood: 0.32,
    intro: ['酒馆里挤得转不开身。石板上的数字已经写到四位数。老花农科内利斯坐在角落里，一言不发。'],
  },
  {
    date: '1637-02-03',
    label: '第六夜',
    kind: 'crash',
    anchor: 1150,
    mood: -0.9,
    intro: ['今晚的拍卖照常开始。第一份球茎报价，没有人接。第二份，还是没有人接。', '有人小声说：买家都没来。'],
  },
  {
    date: '1637-02-10',
    label: '第七夜',
    kind: 'after',
    anchor: 110,
    mood: -0.5,
    intro: ['一个礼拜，什么都变了。石板上全是卖价。几个月前签下高价合约的人，开始挨家挨户地躲债主。'],
  },
];

/** 1637 年 4 月，球茎挖出来交货时，一份球茎实际能卖的价钱（重建） */
export const APRIL_VALUE = 60;
/** 1637 年 2 月 24 日行会裁决：买方付合约价的 3.5% 即可解约 */
export const OPTION_FEE = 0.035;
/** 酒钱：成交时买方付给卖方的小额费用 */
export const WINE_MONEY = 1;
/** 一个手艺人一年的大致收入（用来给数字找参照） */
export const ANNUAL_WAGE = 250;

export const TULIP_NPCS: NpcDef[] = [
  {
    id: 'jan',
    name: '扬',
    title: '织布匠',
    org: '哈勒姆',
    style: '追涨',
    persona: '三十岁的织布匠，嗓门大，急性子，坚信价格还会涨，喜欢拍着桌子说“明天就不是这个价了”。',
    secretGoal: '翻本',
    bottomLine: '无',
    honesty: 0.6,
    relation: 10,
    avatar: '扬',
  },
  {
    id: 'pieter',
    name: '彼得',
    title: '面包师',
    org: '哈勒姆',
    style: '跟风',
    persona: '四十岁的面包师，憨厚、爱算小账，说话总要扯到面粉和炉子，跟着别人的出价走。',
    secretGoal: '跟大家一样发财',
    bottomLine: '不借钱',
    honesty: 0.7,
    relation: 10,
    avatar: '彼',
  },
  {
    id: 'cornelis',
    name: '科内利斯',
    title: '老花农',
    org: '城外花田',
    style: '惜售',
    persona: '六十岁的老花农，种了一辈子郁金香，话少、慢吞吞，看不惯酒馆里的喧闹，但也舍不得少卖一个斯蒂弗。',
    secretGoal: '把花田里的球茎卖个好价钱',
    bottomLine: '不卖没有的东西',
    honesty: 0.85,
    relation: 10,
    avatar: '科',
  },
  {
    id: 'maritje',
    name: '玛丽克',
    title: '寡妇',
    org: '哈勒姆',
    style: '谨慎',
    persona: '五十岁的寡妇，丈夫留下一点积蓄，说话客气、精明，总在问“万一呢”。',
    secretGoal: '守住家底',
    bottomLine: '不签付不起的约',
    honesty: 0.8,
    relation: 10,
    avatar: '玛',
  },
  {
    id: 'dirck',
    name: '迪尔克',
    title: '布商',
    org: '哈勒姆',
    style: '老练',
    persona: '四十五岁的布商，见过世面，说话带着笑，却从不吃亏；两头都做，买得进也卖得出。',
    secretGoal: '在最高处脱手',
    bottomLine: '无',
    honesty: 0.5,
    relation: 10,
    avatar: '迪',
  },
  {
    id: 'hendrick',
    name: '亨德里克',
    title: '画匠',
    org: '哈勒姆',
    style: '浪漫',
    persona: '二十五岁的年轻画匠，爱花也爱钱，说话带点诗意，常把球茎比作“春天的金子”。',
    secretGoal: '买得起一份真正的好花',
    bottomLine: '无',
    honesty: 0.65,
    relation: 10,
    avatar: '亨',
  },
];

export const HOST = { name: '赫里特', title: '金鹿酒馆老板' };

/** 每个桌边人能拿出来的家底（盾）：亏损超过它就倾家荡产 */
export const MEANS: Record<string, number> = { jan: 120, pieter: 300, cornelis: 500, maritje: 600, dirck: 1500, hendrick: 80 };

export type CouncilRule = 'forward' | 'option' | 'void';

/** 行会里的其他六位议员（虚构）。pref 是他们对三条规则的天然倾向 */
export interface Councillor {
  id: string;
  name: string;
  title: string;
  pref: Record<CouncilRule, number>;
  /** 他替哪一边说话：收了这一边的礼，他会更信你 */
  side?: 'grower' | 'speculator';
  /** 一句话立场 */
  stance: string;
}

export const COUNCIL: Councillor[] = [
  { id: 'meer', name: '范·德·梅尔', title: '大花农', pref: { forward: 3, option: 0, void: -2 }, side: 'grower', stance: '卖出去的花，钱就得收回来。' },
  { id: 'schaep', name: '斯哈普', title: '放贷人', pref: { forward: 2, option: 1, void: -3 }, side: 'grower', stance: '契约就是契约。今天作废，明天谁还借钱给你？' },
  { id: 'bloc', name: '布洛克', title: '酒商', pref: { forward: -1, option: 3, void: 0 }, side: 'speculator', stance: '酒馆里的客人要是全破产了，谁来喝酒？' },
  { id: 'spiegel', name: '斯皮格尔', title: '公证人', pref: { forward: 0, option: 2, void: 0 }, stance: '各让一步，总比打一百场官司强。' },
  { id: 'goes', name: '胡斯', title: '教会长老', pref: { forward: -1, option: 0, void: 3 }, stance: '赌债不是债。这个冬天本就不该发生。' },
  { id: 'witt', name: '德·维特', title: '市政官', pref: { forward: 1, option: 1, void: 1 }, stance: '我只看一件事：这座城里会有多少人倾家荡产。' },
];

export const TULIP_RULES: RuleCardDef[] = [
  {
    id: 'forward',
    title: '远期合约',
    plain: '你刚才签的不是买花，而是一个约定：现在谈好价格，春天球茎挖出来时，一手交钱一手交货。今晚除了一点酒钱，一分钱都不用付。',
    why: '球茎冬天埋在地里，没法当场交货。远期合约让人们可以先交易“未来的花”——也让人可以签下远超自己口袋的约定。',
    source: '1636–37 年荷兰的球茎交易大多在冬季以“春季交货”的约定进行，史称“风中交易”。',
  },
  {
    id: 'wine-money',
    title: '酒钱',
    plain: '每成交一份，买方按惯例付给卖方一点“酒钱”。这几乎是这场交易里唯一当场付出的真钱。',
    why: '酒钱让一句口头约定有了仪式感，但它太少了，挡不住任何人签下付不起的约。',
    source: '据记载，酒馆“学院”里的交易按惯例收取少量酒钱（游戏取每份 1 荷兰盾）。',
  },
  {
    id: 'leverage',
    title: '合约比口袋大',
    plain: '你签下的合约总额，已经是你手里现金的好几倍。价格涨，你在纸面上发财；价格跌，你欠下的是真金白银。',
    why: '远期合约不需要当场付钱，所以没有任何东西拦着一个人签下自己永远付不起的约定。这就是杠杆。',
    source: '游戏设定的教学卡。',
  },
  {
    id: 'counterparty',
    title: '对手风险',
    plain: '合约只是一纸承诺。价格崩了，跟你签约的人可能根本付不起——你账上的“利润”，可能只是一个数字。',
    why: '没有交易所、没有保证金，履约只能靠对方的良心和财力。现代期货市场的保证金与结算所，就是为了解决这个问题。',
    source: '1637 年 2 月崩盘后，大量买方拒绝履约。',
  },
  {
    id: 'option',
    title: '期权',
    plain: '期权是一种权利，不是义务：买方付一笔小钱，换来“到时候可以买，也可以不买”。价格跌了，他只损失那笔小钱。',
    why: '把远期改成期权，等于让买方用 3.5% 的代价走开，剩下的损失全部落到卖方头上。',
    source: '1637 年 2 月 24 日，花商行会在阿姆斯特丹开会，宣布此前签下的远期合约可按期权处理：买方付合约价 3.5% 即可解约（Thompson, 2007）。',
  },
];

export const TULIP_SOURCES: SourceCard[] = [
  {
    id: 'tulip-thompson',
    title: '郁金香狂热：事实还是假象？',
    body: '经济学家 Earl Thompson 认为，1637 年 2 月 24 日行会把远期合约改释为期权（买方付 3.5% 即可解约），这一预期本身就解释了此前看似疯狂的价格：买方以为自己买的是“最多只赔 3.5%”的期权。',
    cite: 'Thompson, The tulipmania: Fact or artifact? Public Choice (2007)',
    url: 'https://ideas.repec.org/a/kap/pubcho/v130y2007i1p99-114.html',
  },
  {
    id: 'tulip-data',
    title: '本剧本的数据是怎么来的',
    body: '价格走势参照 Thompson 价格指数的形状：冬季加速上涨、2 月 3 日哈勒姆的买家突然消失、随后崩落。每一晚的具体数字与四月交货价为游戏重建，人物为虚构。',
    cite: '《筹码》设计文档 第十二章',
  },
];
