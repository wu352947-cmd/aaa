import { fmtYi } from '../../engine/exchange';
import type { DialogueIntent, ExchangeOffer, Game, Intel, SocialOutcome } from '../../engine/game';
import { addDeter, evidence, flag, HIDE, rumor, st } from './common';

export function offers(g: Game, npcId: string): ExchangeOffer[] {
  const d = g.dayIndex;
  const used = st(g).usedOffers;
  const out: ExchangeOffer[] = [];
  const add = (id: string, label: string, cost: string) => {
    if (!used.has(`${npcId}:${id}:${d}`)) out.push({ id, label, cost });
  };
  switch (npcId) {
    case 'qian':
      add('buy-rumor', '买一条“北京来的消息”', '20 万元');
      if (g.factionId !== 'retail' && !flag(g, 'loan')) add('loan', '场外拆借 3 亿元（灰色）', '到期还 3.6 亿元，热度 +8');
      break;
    case 'su':
      if (d >= 2 || flag(g, 'suAlly')) add('story', '用你的持仓观点换她的调查线索', '你的观点会见报');
      break;
    case 'gao':
      add('share', '把你的研究纪要给他', '他会知道你的底牌');
      break;
    case 'wei':
      add('swap', '用你的建仓成本换他的看法', '暴露成本价');
      break;
    case 'zhou':
      if (!flag(g, 'seatsKnown')) add('seats', '请他认一认逐笔里的席位', '一顿饭');
      break;
    case 'chen':
      add('banquet', '请他吃饭“聊聊”', '黑色：行贿嫌疑');
      break;
    case 'shen':
      add('swap', '打听他的持仓', '暴露你的立场');
      break;
  }
  return out;
}

export function breakLock(g: Game, why: string) {
  const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
  if (!lock) return;
  lock.brokenBy = 'player';
  lock.brokenDay = g.dayIndex;
  g.relate(lock.npc, -40, why);
  g.reputation -= 15;
  if (lock.npc === 'gao') g.flags.gaoFlip = true;
  if (lock.penalty > 0) {
    g.player.cash -= lock.penalty;
    g.push({ kind: 'intel', text: `按协议支付违约金 ${fmtYi(lock.penalty)}` });
  }
  if (g.principleId === 'no-betrayal') g.crossLine(why);
  g.push({ kind: 'intel', text: `锁仓同盟破裂：${why}` });
}


export type Out = (ok: boolean, effects: string[], d: Partial<DialogueIntent> & Pick<DialogueIntent, 'convey' | 'tone' | 'playerMove'>) => SocialOutcome;

/** NPC 此刻的“对外口径”。public=true 时只给公开说法（用于闲聊），不消耗随机数。 */
export function stance(g: Game, npcId: string, pub: boolean): { convey: string[]; tone: DialogueIntent['tone']; numbers: number[]; truthful: boolean } {
  const last = g.market.last / 100;
  const flip = !!flag(g, 'gaoFlip');
  const s = st(g);
  switch (npcId) {
    case 'gao': {
      if (!flip) return { convey: ['锁仓到交割，一口都不动', '贴息八成是多头放的风'], tone: 'warm', numbers: [], truthful: true };
      const truth = !pub && (s.probeTruth.get('gao') ?? g.rngSocial.chance(0.15 + (0.5 * Math.max(0, g.npc('gao')!.relation)) / 100));
      if (!pub) s.probeTruth.set('gao', truth);
      return truth
        ? { convey: ['说实话心里也在打鼓', '要是真贴息，谁也不会跟钱过不去'], tone: 'evasive', numbers: [], truthful: true }
        : { convey: ['锁仓到交割，一口都不动', '贴息就是谣言，你别自己吓自己'], tone: 'warm', numbers: [], truthful: false };
    }
    case 'wei':
      return (g.npc('wei')!.relation > 50 && !pub)
        ? { convey: ['政策的事不好说', `这个价位（${last.toFixed(2)} 元），做空的还是小心为好`], tone: 'smug', numbers: [last], truthful: true }
        : { convey: ['我们只是正常套期保值', '贴息的事没听说，要讲政策、看大局'], tone: 'smug', numbers: [], truthful: false };
    case 'chen':
      return g.heat >= 40
        ? { convey: ['按规则办', '你们最近的单子，我们都看得到'], tone: 'cold', numbers: [], truthful: true }
        : { convey: ['按规则办', '持仓限额和保证金，一分都不能少'], tone: 'neutral', numbers: [], truthful: true };
    case 'su':
      return g.dayIndex >= 2
        ? { convey: ['她在查一家多方机构和财政部门的关系', '还差第二个信源'], tone: 'neutral', numbers: [], truthful: true }
        : { convey: ['最近 327 的成交量太不正常了', '她想知道是谁在加码'], tone: 'neutral', numbers: [], truthful: true };
    case 'zhou':
      return {
        convey: flag(g, 'seatsKnown')
          ? ['102 是中财信托，217 是辽北发展，011 是申江证券', '大席位动了，侬就要动脑筋']
          : ['看盘口不如看席位', '大单背后都是人，侬要晓得是啥人'],
        tone: 'warm',
        numbers: [102, 217, 11],
        truthful: true,
      };
    case 'qian':
      return { convey: ['市面上都在讲贴息', '老板要消息，我这里有，价钱好商量'], tone: 'smug', numbers: [], truthful: true };
    case 'shen':
      return { convey: ['兑付价就是 132 元，这是算出来的', '多头是在赌博，市场规律会教训他们'], tone: 'smug', numbers: [132], truthful: false };
    case 'lu':
      return { convey: ['方案要按程序走', '什么时候公布，部里统筹考虑'], tone: 'neutral', numbers: [], truthful: true };
    case 'yan':
      return g.factionId === 'official'
        ? { convey: ['你的方案是什么', '该出手就出手，出了事第一时间报'], tone: 'cold', numbers: [], truthful: true }
        : { convey: ['期货试点要规范', '违规的要严肃处理'], tone: 'cold', numbers: [], truthful: true };
  }
  return { convey: ['……'], tone: 'neutral', numbers: [], truthful: true };
}

export function probe(g: Game, npcId: string, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  if (npcId === 'gao' && flag(g, 'gaoFlip') && g.dayIndex >= 3 && g.factionId === 'short' && g.rngSocial.chance(0.6)) {
    n.unreachable = true;
    g.addIntel({ id: `gao-silent-${g.dayIndex}`, title: '高振宇不回传呼', body: '传呼打过去三次，高振宇都没有回电。以前他从不这样。', source: '你的观察', credibility: 1, kind: 'clue' });
    return out(false, ['对方没有回电'], { playerMove: '打传呼约他聊聊锁仓的事', convey: ['（传呼打过去三次，他都没有回电。）'], tone: 'evasive' });
  }
  const s = stance(g, npcId, false);
  const effects: string[] = [];
  // 当面聊过，才摸得清他在盘算什么
  if (!st(g).know.has(npcId) && ['shen', 'gao', 'wei', 'lu'].includes(npcId)) {
    st(g).know.add(npcId);
    effects.push(`摸清了${n.name}的盘算（见“对手动向”）`);
  }
  if (npcId !== 'chen') {
    g.relate(npcId, 3, '你主动找他聊行情');
    effects.push(`${n.name} 关系 +3`);
  }
  if (npcId === 'zhou' && !flag(g, 'seatsKnown')) {
    g.flags.seatsKnown = true;
    g.addIntel({ id: 'seats', title: '席位对照：102 中财、217 辽北、011 申江', body: '老周告诉你：逐笔里的 102 是中财信托，217 是辽北发展，011 是申江证券。', source: '老周', credibility: 0.95, kind: 'clue' });
    effects.push('获得情报：席位对照表');
  } else if (npcId === 'zhou' && g.dayIndex >= 2 && g.market.ex.accounts.has(HIDE) && !g.intel.some((i) => i.id === 'ev-split')) {
    evidence(g, 'ev-split', '席位 305 跟着 011 同进同出', '老周：“305 浦江实业，交易员是申江的人。011 卖，305 也卖，一口不差。侬想想，申江的空单到底有多少？”', '老周', 'shen');
    effects.push('获得证据：申江借壳分仓');
    return out(true, effects, { playerMove: '问老周最近盘面上有什么怪事', convey: ['305 浦江实业的交易员是申江的人', '011 卖，305 也卖，一口不差'], tone: 'warm', numbers: [305, 11] });
  }
  return out(true, effects, { playerMove: `试探${n.name}对 327 的看法`, convey: s.convey, tone: s.tone, numbers: s.numbers });
}

export function exchange(g: Game, npcId: string, option: string | undefined, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  const key = `${npcId}:${option}:${g.dayIndex}`;
  const s = st(g);
  if (!option || !offers(g, npcId).some((o) => o.id === option)) {
    return out(false, ['对方现在没什么可换的'], { playerMove: '想做个交换', convey: ['现在没什么好换的'], tone: 'neutral' });
  }
  s.usedOffers.add(key);
  const p = g.player;
  switch (`${npcId}:${option}`) {
    case 'qian:buy-rumor': {
      p.cash -= 200_000;
      const good = g.dayIndex >= 3;
      rumor(
        g,
        `qian-rumor-${g.dayIndex}`,
        good ? '财政部内部已经定了：327 贴息' : '下个月才会公布贴息方案',
        good ? '钱有福：“老板，这条是北京的朋友亲口讲的，23 号前后就出来。”' : '钱有福：“不急，下个月才公布，老板还有时间。”',
        '钱有福',
        good ? 0.85 : 0.35,
        good
          ? [
              { who: '北京的“朋友”', said: '贴息定了，23 号前后公布' },
              { who: '钱有福', said: '北京的朋友亲口讲的' },
            ]
          : [{ who: '钱有福', said: '下个月才公布——没有任何来源，是他顺口编的', altered: true }],
      );
      g.relate('qian', 5, '你买了他的消息');
      return out(true, ['支付 20 万元', '获得一条传言（真假自辨）'], { playerMove: '花钱买他手里的消息', convey: [good ? '北京那边已经定了，就这几天' : '不急，下个月才公布'], tone: 'smug' });
    }
    case 'qian:loan':
      p.cash += 300_000_000;
      g.flags.loan = true;
      g.addHeat(8, '场外拆借');
      g.push({ kind: 'rule', rule: 'grey-loan', text: '你借入了 3 亿元场外资金' });
      return out(true, ['现金 +3 亿元', '剧本结束时须偿还 3.6 亿元', '监管热度 +8'], { playerMove: '找他借一笔过桥资金', convey: ['三个亿，一个礼拜，利息两成', '老板发财了别忘了我'], tone: 'smug', numbers: [3, 20] });
    case 'su:story':
      g.relate('su', 15, '你给她讲了你的持仓观点');
      g.reputation -= 3;
      g.addIntel({ id: 'ev-wei', title: '中财信托与财政部门存在人事关联', body: '苏晓给你看了她的采访笔记：中财信托的高层与财政部门有直接的人事关联，消息很可能从那里提前流出。', source: '苏晓', credibility: 0.9, kind: 'evidence', against: 'wei' });
      return out(true, [`${n.name} 关系 +15`, '你的观点会以“知情人士”见报（声望 -3）', '获得证据：中财信托的关联关系'], {
        playerMove: '把自己对 327 的判断讲给她听，换她的调查线索',
        convey: ['中财信托的高层和财政部门有人事关联', '这条我还差一个信源，你先别外传'],
        tone: 'neutral',
      });
    case 'gao:share':
      g.relate('gao', 15, '你把研究纪要给了他');
      g.flags.gaoShared = true;
      return out(true, [`${n.name} 关系 +15`, '他知道了你的测算与底牌'], { playerMove: '把研究纪要递给他', convey: ['够意思', '有兄弟这份东西，心里有底了'], tone: 'warm' });
    case 'wei:swap': {
      g.relate('wei', 10, '你告诉了他你的成本');
      const hint = g.npc('wei')!.relation > 40;
      if (hint) g.addIntel({ id: `wei-hint-${g.dayIndex}`, title: '多方的子弹不少', body: '魏国梁吃饭时随口一句：“空头要是以为我们没钱，那就错了。”', source: '魏国梁', credibility: 0.8, kind: 'rumor' });
      return out(true, [`${n.name} 关系 +10`, hint ? '获得一条暗示' : '他什么也没说'], {
        playerMove: '把自己的建仓成本告诉他，换他一句实话',
        convey: hint ? ['空头要是以为我们没钱，那就错了'] : ['我们只是正常套期保值', '要讲政策，看大局'],
        tone: 'smug',
      });
    }
    case 'zhou:seats':
      g.flags.seatsKnown = true;
      g.addIntel({ id: 'seats', title: '席位对照：102 中财、217 辽北、011 申江', body: '老周告诉你：逐笔里的 102 是中财信托，217 是辽北发展，011 是申江证券。', source: '老周', credibility: 0.95, kind: 'clue' });
      g.relate('zhou', 5);
      return out(true, ['获得情报：席位对照表'], { playerMove: '请老周吃饭，让他认一认席位', convey: ['102 是中财信托，217 是辽北发展，011 是申江证券', '大席位一动，侬就要想想为啥'], tone: 'warm', numbers: [102, 217, 11] });
    case 'chen:banquet':
      g.addHeat(12, '试图宴请交易所官员');
      g.relate('chen', -20, '你想请他吃饭');
      if (g.principleId === 'no-violation') g.crossLine('试图拉拢监管人员');
      return out(false, ['对方拒绝', '监管热度 +12'], { playerMove: '想请他吃顿饭“聊聊”', convey: ['不必了', '按规则办，这句话我只说一次'], tone: 'cold' });
    case 'shen:swap':
      g.relate('shen', 5);
      return out(true, ['他只重复了公开立场'], { playerMove: '打听他的持仓', convey: ['兑付价就是 132 元', '空头会赢，这是算出来的'], tone: 'smug', numbers: [132] });
  }
  return out(false, [], { playerMove: '想做个交换', convey: ['……'], tone: 'neutral' });
}

export function ally(g: Game, npcId: string, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  if (npcId === 'gao' && g.factionId === 'short') {
    const lock = g.alliances.find((a) => a.id === 'lock' && !a.brokenBy);
    if (!lock) return out(false, ['同盟已经破裂'], { playerMove: '想重修锁仓同盟', convey: ['都到这份上了，还谈什么同盟'], tone: 'cold' });
    if (lock.penalty > 0) return out(false, ['协议已经加过违约金了'], { playerMove: '想再加码协议', convey: ['协议都签了，兄弟还不放心？'], tone: 'warm' });
    if (n.relation >= 40) {
      lock.penalty = 300_000_000;
      lock.terms += '；违约方赔付 3 亿元';
      g.relate('gao', 5, '你们给锁仓协议加了违约金');
      return out(true, ['锁仓协议加入违约金：3 亿元', `${n.name} 关系 +5`], { playerMove: '提议给锁仓协议加上 3 亿元违约金', convey: ['行，白纸黑字，谁先跑谁赔', '兄弟我说话算话'], tone: 'warm', numbers: [3] });
    }
    g.relate('gao', -2);
    return out(false, ['他不愿意（关系需 ≥ 40）'], { playerMove: '提议给锁仓协议加上违约金', convey: ['兄弟之间还签什么违约金', '你这是信不过我'], tone: 'cold' });
  }
  if (npcId === 'su') {
    if (flag(g, 'suAlly')) return out(false, ['你们已经有约定了'], { playerMove: '想再谈合作', convey: ['我们已经说好了'], tone: 'neutral' });
    if (n.relation >= 15) {
      g.flags.suAlly = true;
      g.relate('su', 5);
      return out(true, ['约定：你给她独家，她的线索先告诉你'], { playerMove: '提议互通消息：你给独家，她给线索', convey: ['可以，但我只发有两个信源的东西', '你给我的，我会去核实'], tone: 'neutral' });
    }
    return out(false, ['她还不信任你（关系需 ≥ 15）'], { playerMove: '提议互通消息', convey: ['我们才认识几天'], tone: 'cold' });
  }
  if (npcId === 'wei' && g.factionId === 'short') {
    return out(false, ['他拒绝了协议平仓'], { playerMove: '提议以 149 元协议平仓、各退一步', convey: ['现在谈这个？早了点', '要讲政策，看大局'], tone: 'smug', numbers: [149] });
  }
  return out(false, ['对方没有兴趣'], { playerMove: `向${n.name}提议结盟`, convey: ['这个就不必了'], tone: 'neutral' });
}

export function report(g: Game, npcId: string, option: string | undefined, out: Out): SocialOutcome {
  const n = g.npc(npcId)!;
  const ev: Intel | undefined = g.intel.find((i) => i.kind === 'evidence' && i.against === npcId && (!option || i.id === option));
  if (!ev) return out(false, ['你手上没有针对此人的证据'], { playerMove: `想举报${n.name}`, convey: ['（你翻遍笔记本，没有能拿得出手的证据。）'], tone: 'neutral' });
  if (flag(g, `reported-${npcId}`)) return out(false, ['已经举报过了'], { playerMove: '想再举报一次', convey: ['（交易所已经在处理了。）'], tone: 'neutral' });
  g.flags[`reported-${npcId}`] = true;
  if (g.factionId !== 'official') {
    g.reputation -= 5;
    g.heat = Math.max(g.heatPeak * 0.3, g.heat - 10);
  }
  g.relate(npcId, -50, g.factionId === 'official' ? '你约谈了他' : '你向交易所举报了他');
  const effects = ['声望 -5（圈内会知道有人告密）', '监管热度 -10（配合调查）', `${n.name} 关系 -50`];
  if (npcId === 'wei') {
    g.flags.zcCurbed = true;
    effects.push('交易所约谈中财信托：其持仓额度减半');
  }
  if (npcId === 'shen') {
    addDeter(g, 'shenjiang', 3);
    g.flags.shenReported = true;
    effects.push('交易所盯上申江：尾盘砸盘的胆子小了');
  }
  if (npcId === 'gao') {
    g.flags.gaoCurbed = true;
    effects.push('交易所警告辽北发展：其翻多力度减半');
  }
  if (g.factionId === 'official') {
    return out(true, effects.slice(2), { playerMove: `拿着「${ev.title}」约谈${n.name}`, convey: ['我们一切都是按规则来的', '该配合的我们配合'], tone: 'evasive' });
  }
  return out(true, effects, { playerMove: `把证据交给交易所值班官员陈默`, convey: ['材料收下了', '按规则办，会核实的'], tone: 'cold', npcId: 'chen' });
}
