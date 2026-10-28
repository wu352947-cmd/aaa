import type { Game, Negotiation, NegReply } from '../../engine/game';
import { flag, LONG, p2, sd, st, wan } from './common';
import { mofScore, verdictOf, VERDICTS } from './world';

/**
 * 多轮谈判。对方的底价不是写死的，是从这一局的局面里算出来的：
 * - 申江找中财协议平仓：魏国梁要多少溢价，看他从部里听到的风声——贴息稳了，他要价高；风向不对，他巴不得走。
 * - 多方给辽北递好处费：高振宇要多少，看违约金、他信不信贴息、和你的交情。
 */

const yuan = (fen: number) => `${(fen / 100).toFixed(2)} 元`;
const wanYuan = (x: number) => `${Math.round(x / 10_000).toLocaleString()} 万元`;

export function openMediation(g: Game): Negotiation {
  const n: Negotiation = {
    id: `med-${sd(g)}`,
    npc: 'wei',
    title: '与中财谈协议平仓',
    intro: `交易所出面，把魏国梁请到了一张桌上。你想从中财手里按收盘价 ${p2(g.market.ex.last)} 元加一点溢价，买回一部分空单，不经过订单簿。他肯不肯、要多少，看他心里那本账。`,
    terms: [
      { id: 'qty', label: '买回多少', min: 200_000, max: 1_200_000, step: 50_000, unit: 'lots' },
      { id: 'prem', label: '比收盘价高多少', min: 0, max: 300, step: 5, unit: 'fen' },
    ],
    rounds: 0,
    maxRounds: 4,
    history: [{ who: 'them', say: '交易所的面子要给。不过你也知道，现在谈这个，价钱可不一样。' }],
    status: 'open',
  };
  g.negotiations.push(n);
  return n;
}

/** 魏国梁的底价（分）：按他心里的兑付前景，扣掉一点落袋为安的折扣 */
export function weiFloor(g: Game, qty: number): number {
  const v = VERDICTS[verdictOf(mofScore(g))].after;
  const edge = v - g.market.ex.last;
  const sure = 0.5 + 0.1 * Math.max(0, sd(g));
  const rel = g.npc('wei')?.relation ?? 0;
  const big = Math.max(0, (qty - 800_000) / 1_000_000) * 40;
  return Math.max(0, Math.round(edge * 0.55 * sure + big - rel * 0.8));
}

export function openGaoFee(g: Game): Negotiation {
  const n: Negotiation = {
    id: `gao-${sd(g)}`,
    npc: 'gao',
    title: '给辽北递好处费',
    intro: '高振宇约你在宾馆的茶室见面。你要的是他在消息出来时空翻多；他要的是一个数字，和一个让他睡得着觉的理由。',
    terms: [{ id: 'fee', label: '“咨询费”', min: 5_000_000, max: 120_000_000, step: 5_000_000, unit: 'yuan' }],
    rounds: 0,
    maxRounds: 4,
    history: [{ who: 'them', say: '锁仓是签了字的。撕协议要赔钱，还要在圈子里落个名声。魏总说个数吧。' }],
    status: 'open',
  };
  g.negotiations.push(n);
  return n;
}

/** 高振宇的底价（元）：违约金、贴息的把握、交情 */
export function gaoFloor(g: Game): number {
  const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
  const rel = g.npc('gao')?.relation ?? 0;
  const doubt = Math.max(0, 0.9 - mofScore(g));
  return Math.max(10_000_000, Math.round(25_000_000 + (lock?.penalty ?? 0) * 0.15 + doubt * 150_000_000 - rel * 200_000));
}

export function negotiate327(g: Game, n: Negotiation, offer: Record<string, number>): NegReply {
  const left = n.maxRounds - n.rounds;
  if (n.npc === 'wei') {
    const floor = weiFloor(g, offer.qty);
    if (offer.prem >= floor) return { accept: true, say: offer.prem > floor + 40 ? '爽快。就这么定。' : '行吧，看在交易所的面子上。' };
    const gap = floor - offer.prem;
    if (gap > 150 && n.rounds >= 2) {
      g.relate('wei', -3, '谈协议平仓时出价太难看');
      return { accept: false, walk: true, say: '你这是来谈的，还是来消遣我的？' };
    }
    const ask = Math.min(300, Math.round((floor + left * 25) / 5) * 5);
    const qty = Math.min(offer.qty, Math.max(200_000, Math.floor(g.market.ex.acct(LONG).pos / 50_000) * 50_000));
    return {
      accept: false,
      counter: { qty, prem: ask },
      say: left <= 1 ? `最后一句：${wan(qty)}，加 ${yuan(ask)}。不行就算了。` : `${yuan(offer.prem)}？差得远。${yuan(ask)}，我们再谈数量。`,
    };
  }
  // 高振宇
  const floor = gaoFloor(g);
  if (offer.fee >= floor) return { accept: true, say: '兄弟够意思。到时候看我的。' };
  if (floor - offer.fee > 50_000_000 && n.rounds >= 2) {
    g.relate('gao', -5, '递好处费时出价太低');
    return { accept: false, walk: true, say: '这个数，不值得我撕协议。' };
  }
  const ask = Math.round((floor + left * 5_000_000) / 5_000_000) * 5_000_000;
  return { accept: false, counter: { fee: ask }, say: left <= 1 ? `${wanYuan(ask)}，一分不能少。` : `${wanYuan(offer.fee)}？我替你担的是撕协议的名声。${wanYuan(ask)}。` };
}

export function closeDeal327(g: Game, n: Negotiation, t: Record<string, number>, agreedClose: (g: Game, s: string, l: string, q: number, px: number) => number): string[] {
  const s = st(g);
  const p = g.player;
  if (n.npc === 'wei') {
    const price = g.market.ex.last + t.prem;
    const q = agreedClose(g, p.id, LONG, t.qty, price);
    s.used.add('mediated');
    g.flags.mediated = true;
    return [`协议平仓 ${wan(q)}，价格 ${p2(price)} 元`, `空单降到 ${wan(-p.pos)}`];
  }
  p.cash -= t.fee;
  g.addHeat(6, '利益输送');
  g.flags.gaoBribed = true;
  g.flags.gaoFee = t.fee;
  g.relate('gao', 15);
  s.used.add('tip-gao');
  return [`支付 ${wanYuan(t.fee)}`, '监管热度 +6', '高振宇 关系 +15'];
}

/** 好处费给得越多，他越坚决（3000 万是“够意思”的那条线） */
export const bribeWeight = (g: Game) => (flag(g, 'gaoBribed') ? 0.3 * Math.min(1.5, ((g.flags.gaoFee as number) ?? 30_000_000) / 30_000_000) : 0);
