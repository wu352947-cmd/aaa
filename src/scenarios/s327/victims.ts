import type { DarkDeed, Game, Victim } from '../../engine/game';
import { letterFrom, pick, type Persona } from '../../engine/victims';

/** 1995 年上海：大户室里、营业部里，327 对面那些没有名字的人 */
const PEOPLE: Persona[] = [
  {
    from: '王阿姨',
    who: '她是杨浦一家纺织厂的退休女工，三万块积蓄，营业部经理说“国债期货稳当”，又给她垫了三倍',
    stake: 30_000,
    lev: 160,
    says: {
      lost: (loss, mv) => `价格被推了 ${mv}，她亏掉 ${loss}。她在营业部门口坐了一下午，问每个出来的人：国债不是国家的吗？`,
      bust: (mv) => `价格被推了 ${mv}，营业部没打招呼就把她平了仓。三万块，一分没剩。她的儿子明年结婚。`,
    },
  },
  {
    from: '钱科长',
    who: '他是闸北一家国营厂的财务科长，挪了二十万厂里的周转金，想在年底前悄悄补回去',
    stake: 200_000,
    lev: 40,
    says: {
      lost: (loss, mv) => `价格被推了 ${mv}，他亏了 ${loss}。下个月审计进厂。他托人问你们公司还缺不缺会计。`,
      bust: (mv) => `价格被推了 ${mv}，二十万全没了。三天后他没来上班，厂里报了案。`,
    },
  },
  {
    from: '小张',
    who: '他在四川北路开一爿五金店，八万块是店面的押金和进货钱，每天中午关了店门来大户室看盘',
    stake: 80_000,
    lev: 40,
    says: {
      lost: (loss, mv) => `价格被推了 ${mv}，他亏了 ${loss}。他给大户室里的人散了一圈烟，说明天还来，要翻本。`,
      bust: (mv) => `价格被推了 ${mv}，他的八万块被强平了。五金店下个礼拜盘了出去。`,
    },
  },
  {
    from: '一位不肯留名的读者',
    who: '寄到《沪上财经报》编辑部的信，没有署名，字写得很用力',
    stake: 50_000,
    lev: 40,
    says: {
      lost: (loss, mv) => `“327 被推了 ${mv}。我亏了 ${loss}，不是我看错了方向，是有人把价格做出来给我们看。你们报社敢不敢查？”`,
      bust: (mv) => `“327 被推了 ${mv}，我被强平了。我想知道是哪个席位干的。你们报社敢不敢登？”`,
    },
  },
];

const OPENING: Record<string, (label: string) => string> = {
  card: (l) => `你打出了「${l}」。没人知道是你，可价格知道。`,
  overdraw: () => '你没有足额保证金的那几笔单子成交了。交易所的系统放了过去，对面接单的人不知道这些单子本来不该存在。',
  'wash-trade': () => '你对敲出来的成交量挂在行情板上。有人看见量放大了，以为来了大资金，跟了进去。',
  spoofing: () => '你挂出去又撤掉的那些大单，让盘口看起来很厚。有人照着它挂了单。',
  'marking-close': () => '收盘前那几分钟的价格是你做出来的。结算价按它算，保证金也按它追。',
  insider: () => '消息还没公开，你已经先买了。卖给你的人，是在不知情的情况下卖的。',
  press: () => '你超出限额加空，把价格往下压。对面是还在扛着的多头。',
  dump: () => '最后八分钟，你的卖单砸穿了每一档买盘。挂在那里接单的，大多是不知道发生了什么的人。',
  'valid-ruling': () => '你宣布违规砸盘的成交全部有效。规规矩矩挂着买单的人，接下了那些本不该存在的卖单。',
};

export function victim327(g: Game, deed: DarkDeed): Victim | null {
  const open = (OPENING[deed.cause] ?? OPENING.card)(deed.label);
  const p = pick(g, deed, PEOPLE);
  return letterFrom(
    g,
    p,
    open,
    (x) => `${x.toLocaleString()} 元`,
    (f) => `${(f / 100).toFixed(2)} 元`,
  );
}
