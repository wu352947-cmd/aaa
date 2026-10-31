import { fmtYi } from '../../engine/exchange';
import type { CardDef, CardResult, Game } from '../../engine/game';
import { FUND, HKMA, TYCOON } from './data';
import { addPressure, hike, hibor, pressure, SQUEEZE_AT } from './peg';

const lot = (q: number) => (q >= 10_000 ? `${(q / 10_000).toFixed(q % 10_000 ? 1 : 0)} 万张` : `${q} 张`);

/** 一张期指的名义价值（港元） */
const notional = (g: Game) => (g.market.last / 100) * 50;

export function hkCards(g: Game): CardDef[] {
  const out: CardDef[] = [];
  const h = hibor(g);
  if (g.factionId === FUND) {
    out.push(
      {
        id: 'hk-attack',
        name: '借港元，砸联系汇率',
        group: '立体做空',
        color: 'grey',
        does: `再去市场上借一批港元，在 7.75 的弱方砸出去。金管局要么接、要么加息——加息就把股市打下去，你的空单照样赚。压力 +12，拆息跟着上去。`,
        cost: '借港元要付利息；砸得太明显会被点名。',
        when: 'trading',
        status: `压力 ${pressure(g)}`,
      },
      {
        id: 'hk-rumor',
        name: '放风：联汇要脱钩',
        group: '立体做空',
        color: 'black',
        does: '让相熟的经纪把话放出去。散户会先跑，成分股跌，期指跟着跌。',
        cost: '造谣。监管热度 +10，留痕。',
        when: 'any',
      },
      {
        id: 'hk-cover',
        name: '回补空单',
        group: '立体做空',
        color: 'white',
        does: '把手里的一部分空单买回来。价格已经跌下来了，落袋为安。',
        cost: '回补本身会把价格推上去，买得越多越贵。',
        when: 'trading',
        blocked: g.player.pos >= 0 ? '手里没有空单' : undefined,
      },
    );
  }
  if (g.factionId === HKMA) {
    out.push(
      {
        id: 'hk-hike',
        name: '抽紧银根：加息',
        group: '守汇率',
        color: 'white',
        does: `把隔夜拆息再抬 5 厘（现在 ${(h * 100).toFixed(1)} 厘）。炒家借港元的成本变高，压力会退——但借钱做多的人也会被一起打。`,
        cost: '拆息越高，本地杠杆盘死得越快，股市跌得越深。',
        when: 'any',
        status: `拆息 ${(h * 100).toFixed(1)} 厘`,
      },
      {
        id: 'hk-buy',
        name: '外汇基金入市买期指',
        group: '守汇率',
        color: 'grey',
        does: `直接下场买。这是 1998 年 8 月 14 日之后才有的做法：用外汇基金的钱托住期指，让空头没法在结算日把价格压下去。`,
        cost: '动用外汇储备；买得越多，将来退出的难度越大。',
        when: 'trading',
        targets: [
          { id: '3000', label: '买 3,000 张' },
          { id: '10000', label: '买 1 万张' },
          { id: '30000', label: '买 3 万张' },
        ],
      },
      {
        id: 'hk-call',
        name: '呼吁银行同业：不要恐慌',
        group: '守汇率',
        color: 'white',
        does: '把几家华资银行的司库请来，让他们别跟着抽资金。压力 −8。',
        cost: '只是把话说出去，挡不住真正缺钱的人。',
        when: 'any',
      },
      {
        id: 'hk-restrict',
        name: '收紧沽空申报',
        group: '守汇率',
        color: 'white',
        does: '要求空头逐笔申报、提高按金。空头没法在暗处建仓，也不敢把仓位做得太大。',
        cost: '市场会骂你干预自由市场。',
        when: 'any',
      },
    );
  }
  if (g.factionId === TYCOON) {
    out.push(
      {
        id: 'hk-add',
        name: '补仓：再买期指',
        group: '保住仓位',
        color: 'white',
        does: `拆息 ${(h * 100).toFixed(1)} 厘。再买一点，把均价摊下来——但保证金也会跟着要更多。`,
        cost: '逆势加仓。拆息还在涨的话，这是加速爆仓。',
        when: 'trading',
        targets: [
          { id: '500', label: '买 500 张' },
          { id: '2000', label: '买 2,000 张' },
        ],
      },
      {
        id: 'hk-cut',
        name: '减仓：卖掉一部分',
        group: '保住仓位',
        color: 'white',
        does: '把仓位降下来，少付一点拆息，也少一点被强平的风险。',
        cost: '卖在低位，账面亏损变成实亏。',
        when: 'trading',
        blocked: g.player.pos <= 0 ? '手里没有多单' : undefined,
      },
      {
        id: 'hk-roll',
        name: '找银行谈展期',
        group: '保住仓位',
        color: 'grey',
        does: '跟司库谈一谈，把融资的利息压一压、期限往后挪。拆息高的时候，这一句话能救一命。',
        cost: '人情要用东西还。',
        when: 'night',
      },
      {
        id: 'hk-hedge',
        name: '买空单对冲',
        group: '保住仓位',
        color: 'white',
        does: '在期指上开一点空单，把方向对冲掉——至少不被单边行情打死。',
        cost: '对冲掉下跌，也对冲掉反弹。',
        when: 'trading',
        targets: [
          { id: '500', label: '空 500 张' },
          { id: '2000', label: '空 2,000 张' },
        ],
      },
    );
  }
  return out;
}

export function hkPlay(g: Game, id: string, target?: string): CardResult {
  const R = (title: string, effects: string[]): CardResult => ({ ok: true, title, effects });
  const q = Number(target) || 0;
  switch (id) {
    case 'hk-attack': {
      addPressure(g, 12, '炒家在 7.75 的弱方砸港元');
      g.addHeat(4, '公开攻击联系汇率');
      return R('砸港元', [`港元压力 ${pressure(g)}`, `隔夜拆息 ${(hibor(g) * 100).toFixed(1)} 厘`]);
    }
    case 'hk-rumor': {
      g.addHeat(10, '散布联汇脱钩的谣言');
      g.market.sentiment = Math.max(-1, g.market.sentiment - 0.35);
      addPressure(g, 5, '市场在传联汇要脱钩');
      if (g.principleId === 'profit') g.crossLine('散布谣言');
      return R('放风', ['市场情绪转差', `港元压力 ${pressure(g)}`]);
    }
    case 'hk-cover': {
      const n = Math.min(Math.abs(g.player.pos), Math.max(1, Math.round(Math.abs(g.player.pos) * 0.4)));
      g.pending.push({ owner: g.player.id, side: 'buy', qty: n, type: 'market', tag: 'cover' });
      return R('回补空单', [`买回 ${lot(n)}`]);
    }
    case 'hk-hike': {
      g.flags.hkHike = hike(g) + 0.05;
      addPressure(g, -10, '金管局抽紧银根');
      return R('加息', [`隔夜拆息 ${(hibor(g) * 100).toFixed(1)} 厘`, `港元压力 ${pressure(g)}`]);
    }
    case 'hk-buy': {
      g.pending.push({ owner: g.player.id, side: 'buy', qty: q, type: 'market', tag: 'hkma' });
      return R('外汇基金入市', [`买入 ${lot(q)} 期指`, `名义 ${fmtYi(q * notional(g))}`]);
    }
    case 'hk-call': {
      addPressure(g, -8, '金管局把银行请去谈话');
      return R('呼吁银行同业', [`港元压力 ${pressure(g)}`]);
    }
    case 'hk-restrict': {
      const a = g.market.ex.accounts.get(FUND);
      if (a) a.limit = Math.max(20_000, Math.round((a.limit ?? 100_000) * 0.6));
      g.addHeat(2, '收紧沽空申报');
      return R('收紧沽空申报', ['空头的持仓上限被压到六成', '按金要求提高']);
    }
    case 'hk-add': {
      g.pending.push({ owner: g.player.id, side: 'buy', qty: q, type: 'market', tag: 'add' });
      return R('补仓', [`买入 ${lot(q)}`]);
    }
    case 'hk-cut': {
      const n = Math.min(g.player.pos, Math.max(1, Math.round(g.player.pos * 0.3)));
      g.pending.push({ owner: g.player.id, side: 'sell', qty: n, type: 'market', tag: 'cut' });
      return R('减仓', [`卖出 ${lot(n)}`]);
    }
    case 'hk-roll': {
      g.flags.hkRoll = Number(g.flags.hkRoll ?? 0) + 1;
      addPressure(g, -3, '银行答应不抽资金');
      return R('谈展期', ['融资利息压下去一截', `港元压力 ${pressure(g)}`]);
    }
    case 'hk-hedge': {
      g.pending.push({ owner: g.player.id, side: 'sell', qty: q, type: 'market', tag: 'hedge' });
      return R('对冲', [`卖出 ${lot(q)} 期指`]);
    }
  }
  return R('没有效果', []);
}

/** 拆息太高时给玩家一句提醒 */
export function hkWarning(g: Game): string | null {
  if (g.factionId !== TYCOON) return null;
  const h = hibor(g);
  if (h < SQUEEZE_AT) return null;
  return `拆息 ${(h * 100).toFixed(1)} 厘：杠杆盘正在被强平，你的持仓每分钟都在被抽血`;
}
