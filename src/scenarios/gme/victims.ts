import type { DarkDeed, Game, Victim } from '../../engine/game';
import { letterFrom, pick, type Persona } from '../../engine/victims';

/** 2021 年：手机屏幕另一头的人 */
const PEOPLE: Persona[] = [
  {
    from: '梅根',
    who: '她是俄亥俄一家医院的夜班护士，四千美元，全买了下周到期的看涨期权，论坛上说“这次不一样”',
    stake: 4_000,
    lev: 8,
    says: {
      lost: (loss, mv) => `股价被推了 ${mv}，她的期权亏了 ${loss}。她在论坛上发帖：“下班才看到。我还拿着。”`,
      bust: (mv) => `股价被推了 ${mv}，她的期权归零了。四千美元是她这个月的房租。`,
    },
  },
  {
    from: '戴夫',
    who: '他开了二十年长途货车，把退休账户里的两万两千美元转进了券商，开了两倍融资',
    stake: 22_000,
    lev: 2,
    says: {
      lost: (loss, mv) => `股价被推了 ${mv}，他亏了 ${loss}。他给券商客服打了四十分钟电话，没人能说清价格为什么这样走。`,
      bust: (mv) => `股价被推了 ${mv}，券商追保，他没来得及补，账户被强平。二十年的退休金，剩下一个零头。`,
    },
  },
  {
    from: '泰勒',
    who: '他是密歇根的大二学生，一千二百美元，是刚到账的助学贷款',
    stake: 1_200,
    lev: 5,
    says: {
      lost: (loss, mv) => `股价被推了 ${mv}，他亏了 ${loss}。他截图发给室友：“没事，钻石手。”`,
      bust: (mv) => `股价被推了 ${mv}，一千二百美元没了。他问论坛：助学贷款能不能延期还。`,
    },
  },
  {
    from: '康涅狄格州教师养老基金',
    who: '一封写给证监会的投诉信，抄送了你。这家养老基金把持有的股票借给了卖空者，换一点借券费',
    stake: 3_000_000,
    lev: 1,
    says: {
      lost: (loss, mv) => `“股价被推了 ${mv}，借出去的券和抵押品之间的差额让基金承担了约 ${loss} 的风险敞口。受益人是四万名退休教师。我们要求调查当日的交易。”`,
      bust: (mv) => `“股价被推了 ${mv}，借券对手方违约。损失将由四万名退休教师承担。我们要求调查当日的交易。”`,
    },
  },
];

const OPENING: Record<string, (label: string) => string> = {
  card: (l) => `你打出了「${l}」。手机屏幕另一头，有人在盯着同一根 K 线。`,
  overdraw: () => '你超出保证金的那几笔单子成交了。接盘的人不知道这些单子本来不该存在。',
  'wash-trade': () => '你对敲出来的成交量挂在行情软件上。有人看见量放大了，以为“大家都在买”，跟了进去。',
  spoofing: () => '你挂出去又撤掉的那些大单，让盘口看起来很厚。有人的算法和有人的手指，都照着它下了单。',
  'marking-close': () => '收盘价是你在最后几分钟做出来的。所有人的保证金都按它追。',
  'pull-quotes': () => '你撤掉了报价。价格断崖式下跌，止损单一张接一张地在空档里成交。',
};

export function victimGme(g: Game, deed: DarkDeed): Victim | null {
  const open = (OPENING[deed.cause] ?? OPENING.card)(deed.label);
  return letterFrom(
    g,
    pick(g, deed, PEOPLE),
    open,
    (x) => `${x.toLocaleString()} 美元`,
    (f) => `${(f / 100).toFixed(2)} 美元`,
  );
}
