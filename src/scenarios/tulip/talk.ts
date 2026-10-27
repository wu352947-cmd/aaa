import type { DialogueIntent } from '../../engine/game';
import type { Talk, TulipGame } from './game';

/** 把引擎的还价结果变成台词意图包：说什么由引擎定，怎么说交给模板或模型 */
export function tulipIntent(g: TulipGame, t: Talk): DialogueIntent {
  const q = g.quote(t.npc);
  const npcBuys = q?.side === 'buy';
  const [a, b] = t.prices;
  const base = { npcId: t.npc, numbers: t.prices, date: `${g.night.date} 晚上`, fallback: [] as string[] };
  switch (t.kind) {
    case 'deal':
      return {
        ...base,
        verb: 'exchange',
        playerMove: npcBuys ? `答应以 ${a} 盾把一份球茎卖给他，春天交货` : `答应以 ${a} 盾向他买一份球茎，春天交货`,
        convey: npcBuys ? [`成交，${a} 盾一份`, '四月花开了，钱货两清'] : [`成交，${a} 盾一份`, '四月到花田里来取'],
        tone: 'warm',
      };
    case 'counter':
      return {
        ...base,
        verb: 'exchange',
        playerMove: `还价 ${a} 盾`,
        convey: npcBuys ? [`${a} 盾太贵了`, `我最多出 ${b} 盾`] : [`${a} 盾太低了`, `少于 ${b} 盾不卖`],
        tone: 'neutral',
      };
    case 'deposit':
      return {
        ...base,
        verb: 'exchange',
        playerMove: `想以 ${a} 盾卖给他一份自己并没有的球茎`,
        convey: [`你手里一个球茎都没有`, `先押 ${b} 盾定金再说`],
        tone: 'cold',
      };
    case 'refuse':
      return { ...base, verb: 'exchange', playerMove: `又还价 ${a} 盾`, convey: ['不谈了', '今晚就到这里吧'], tone: 'cold', numbers: [] };
    default:
      return { ...base, verb: 'exchange', playerMove: '想再谈一谈', convey: ['（他已经离开了桌子。）'], tone: 'neutral', numbers: [] };
  }
}
