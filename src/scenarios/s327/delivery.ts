import { fmtYi } from '../../engine/exchange';
import type { CardDef, CardResult, Game } from '../../engine/game';
import { BATTLE } from './data';

/**
 * 92(3) 现券与 327 的实物交割。
 *
 * 327 合约交割的是 1992 年发行的三年期国库券，发行量 240 亿元，折合约 120 万口；
 * 市场上真正买得到的只有一小部分。可 327 的持仓远远大于这个数——申江一家的空单就有 220 万口。
 * 真走到交割，空头根本找不到那么多券：这就是“逼仓”。
 *
 * 价格单位与期货一样，是每百元面值的“分”；一口对应面值 2 万元，所以每口每 1 分价差 = 2 元。
 */

/** 市场上真正在流通、买得到的 92(3) 现券（口当量）：大部分在银行和保险公司手里拿到期 */
export const FLOAT = 150_000;
/** 持有流通现券超过这个比例，交易所就认定是逼仓 */
const CORNER = 0.3;
/** 现券对期货的正常升水（分） */
const BASIS = 20;
/** 每买进 1 万口，现券报价被推高几分 */
const IMPACT = 3;

interface Spot {
  /** 你手里的现券（口当量） */
  held: number;
  /** 买入花的钱（元） */
  cost: number;
  /** 买卖推出来的临时溢价（分），每晚消退三成 */
  premium: number;
  /** 合约怎么了结：协议平仓 / 坚持交割 */
  choice?: 'agree' | 'deliver';
}

const STATE = new WeakMap<Game, Spot>();
export function spot(g: Game): Spot {
  let s = STATE.get(g);
  if (!s) STATE.set(g, (s = { held: 0, cost: 0, premium: 0 }));
  return s;
}

/** 囤得越多，市面上越缺券：稀缺溢价随你持有的份额平方上升 */
function scarcity(g: Game): number {
  return 600 * Math.pow(spot(g).held / FLOAT, 2);
}

/** 现券报价（分） */
export function spotPrice(g: Game): number {
  return g.market.last + BASIS + spot(g).premium + scarcity(g);
}

/** 现券市值（元），计入权益 */
export function spotValue(g: Game): number {
  return spot(g).held * spotPrice(g) * 2;
}

export function spotNight(g: Game): void {
  spot(g).premium *= 0.7;
}

const lots = (q: number) => (q >= 10_000 ? `${(q / 10_000).toFixed(q % 10_000 ? 1 : 0)} 万口` : `${q} 口`);

export function deliveryCards(g: Game): CardDef[] {
  const s = spot(g);
  const p = g.player;
  const unit = spotPrice(g) * 2;
  const afford = (q: number) => q * (spotPrice(g) + (q / 10_000) * IMPACT * 0.5) * 2 <= Math.max(0, p.cash);
  const sizes = (g.factionId === 'retail' ? [1, 5] : [5_000, 20_000, 50_000]).filter((q) => afford(q) && s.held + q <= FLOAT);
  const out: CardDef[] = [
    {
      id: 'dlv-buy',
      name: '买入 92(3) 现券',
      group: '现券与交割',
      color: 'white',
      does: `327 交割的就是这只国库券。市面上能买到的大约 ${lots(FLOAT)}，现价 ${(spotPrice(g) / 100).toFixed(2)} 元（每口 ${fmtYi(unit)}）。真走到交割，空头得拿它交货；囤得越多，市面上越缺。`,
      cost: '全额付现金，不能加杠杆；买得越多，价格被你推得越高。',
      when: 'any',
      targets: sizes.map((q) => ({ id: String(q), label: `买 ${lots(q)}` })),
      status: s.held ? `持有 ${lots(s.held)}` : undefined,
      blocked: s.choice ? '合约已经了结' : !sizes.length ? '现金不够' : undefined,
    },
  ];
  if (s.held > 0)
    out.push({
      id: 'dlv-sell',
      name: '卖出现券',
      group: '现券与交割',
      color: 'white',
      does: `按 ${((spotPrice(g) - (s.held / 10_000) * IMPACT * 0.5) / 100).toFixed(2)} 元左右卖掉手里的 ${lots(s.held)}。`,
      cost: '卖得多，价格被你压低。',
      when: 'any',
      blocked: s.choice === 'deliver' ? '已经申请交割：现券要用来交割' : undefined,
    });
  // 余波：327 停牌清算，持仓怎么了结
  if (g.dayIndex > BATTLE && p.pos !== 0) {
    const long = p.pos > 0;
    out.push(
      {
        id: 'dlv-agree',
        name: '接受协议平仓',
        group: '现券与交割',
        color: 'white',
        does: '按交易所的结算价和对手方了结，不再走实物交割。历史上 327 就是这样收场的。',
        cost: '没有逼仓的额外收益，也没有交不出券的风险。',
        when: 'night',
        status: s.choice === 'agree' ? '已选择' : undefined,
        blocked: s.choice ? '已经选过' : undefined,
      },
      {
        id: 'dlv-deliver',
        name: long ? '坚持实物交割：要现券' : '坚持实物交割：交现券',
        group: '现券与交割',
        color: long ? 'grey' : 'white',
        does: long
          ? `要求空头交出 92(3) 现券。市面上流通的只有 ${lots(FLOAT)}，交易所最多安排这么多走交割，其余协议平仓。其中 ${lots(s.held)} 在你手里：空头要交货，就得高价从你这里买——这就是逼仓。`
          : `按 ${lots(-p.pos)} 交出 92(3) 现券。你手里有 ${lots(s.held)}，不够的部分要去市面上买；市面上买不到的部分，就是交割违约。`,
        cost: long ? `手里的现券超过流通量的 ${Math.round(CORNER * 100)}%，交易所会认定逼仓：溢价打对折，监管热度 +25，记入档案。` : '买不到券要付违约金：每百元面值 10 元，监管热度 +20。',
        when: 'night',
        status: s.choice === 'deliver' ? '已申请' : undefined,
        blocked: s.choice ? '已经选过' : undefined,
      },
    );
  }
  return out;
}

export function deliveryPlay(g: Game, id: string, target?: string): CardResult {
  const s = spot(g);
  const p = g.player;
  const R = (title: string, effects: string[], reply?: CardResult['reply']): CardResult => ({ ok: true, title, effects, reply });
  switch (id) {
    case 'dlv-buy': {
      const q = Number(target) || 0;
      const avg = spotPrice(g) + (q / 10_000) * IMPACT * 0.5;
      const cost = q * avg * 2;
      p.cash -= cost;
      s.held += q;
      s.cost += cost;
      s.premium += (q / 10_000) * IMPACT;
      return R(`买进 ${lots(q)} 现券`, [`均价 ${(avg / 100).toFixed(2)} 元，付 ${fmtYi(cost)}`, `现券报价升到 ${(spotPrice(g) / 100).toFixed(2)} 元`]);
    }
    case 'dlv-sell': {
      const q = s.held;
      s.premium -= (q / 10_000) * IMPACT;
      const avg = spotPrice(g) + (q / 10_000) * IMPACT * 0.5;
      const got = q * avg * 2;
      p.cash += got;
      s.held = 0;
      s.cost = 0;
      return R(`卖掉 ${lots(q)} 现券`, [`均价 ${(avg / 100).toFixed(2)} 元，收回 ${fmtYi(got)}`]);
    }
    case 'dlv-agree':
      s.choice = 'agree';
      return R('同意协议平仓', ['按结算价了结，不走交割']);
    case 'dlv-deliver':
      s.choice = 'deliver';
      return R(p.pos > 0 ? '申请实物交割：要空头交券' : '申请实物交割：按期交券', ['结局时按交割结算'], { who: '交易所结算部', text: p.pos > 0 ? '你要的券，市面上没有那么多。我们会看着办。' : '券准备好了吗？' });
  }
  return R('没有效果', []);
}

/**
 * 结局时的交割结算。返回要加到权益上的盈亏（元）与结局文字。
 * settle 是 327 最后的结算价（分）。现券此前按市价计入了权益，这里把它改按交割时的价值重估。
 */
export function deliverySettle(g: Game, settle: number): { pnl: number; lines: string[]; dirty: boolean } {
  const s = spot(g);
  const p = g.player;
  const lines: string[] = [];
  const marked = s.held * spotPrice(g) * 2;
  let pnl = 0;
  let dirty = false;
  if (s.choice === 'deliver' && p.pos > 0) {
    // 交易所最多安排流通量那么多走交割；空头要交的券，你手里的那一份只能高价从你这里买
    const delivered = Math.min(p.pos, FLOAT);
    const share = s.held / FLOAT;
    const premium = 100 + 4000 * share * share;
    const cornered = share > CORNER;
    const eff = cornered ? premium / 2 : premium;
    const fromYou = Math.min(s.held, delivered);
    pnl += delivered * BASIS * 2;
    pnl += fromYou * (settle + eff) * 2 + (s.held - fromYou) * (settle + BASIS) * 2 - marked;
    if (cornered) {
      dirty = true;
      g.addHeat(25, '利用现券短缺逼仓');
      if (g.principleId === 'no-violation') g.crossLine('逼仓');
    }
    lines.push(
      `你坚持实物交割。交易所安排了 ${lots(delivered)} 走交割，其余协议平仓。${fromYou ? `空头要交的券里有 ${lots(fromYou)} 在你手里，只能按每百元高出 ${(eff / 100).toFixed(2)} 元的价格从你这里买。` : ''}${cornered ? '你囤的现券超过了流通量的三成，交易所出面干预，把逼仓溢价压了一半，并记入档案。' : ''}交割多拿了 ${fmtYi(pnl)}。`,
    );
  } else if (s.choice === 'deliver' && p.pos < 0) {
    const need = -p.pos;
    const own = Math.min(s.held, need);
    const buy = need - own;
    const got = Math.min(buy, FLOAT);
    const short = buy - got;
    const squeeze = Math.min(600, Math.max(0, 200 * (buy / FLOAT - 0.5)));
    // 自己的现券按结算价交出去；剩下的高价买；买不到的付违约金
    pnl += own * settle * 2 - own * spotPrice(g) * 2;
    pnl -= got * (BASIS + squeeze) * 2;
    pnl -= short * 1000 * 2;
    pnl += (s.held - own) * (settle + BASIS) * 2 - (s.held - own) * spotPrice(g) * 2;
    lines.push(`你要交出 ${lots(need)} 现券：自己有 ${lots(own)}，去市面上买了 ${lots(got)}，每百元多付 ${((BASIS + squeeze) / 100).toFixed(2)} 元。`);
    if (short > 0) {
      dirty = true;
      g.addHeat(20, '交割违约');
      lines.push(`还有 ${lots(short)} 怎么也买不到：交割违约，按每百元面值 10 元付违约金。`);
    }
  } else {
    // 协议平仓：逼仓的溢价随之消失，手里的现券回到正常升水
    pnl += s.held * (settle + BASIS) * 2 - marked;
    if (s.held) lines.push(`327 协议平仓，现券的逼仓溢价随之消失。你手里的 ${lots(s.held)} 现券按 ${((settle + BASIS) / 100).toFixed(2)} 元计。`);
  }
  return { pnl, lines, dirty };
}
