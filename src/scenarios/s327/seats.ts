import type { Game, Puzzle, PuzzleResult } from '../../engine/game';
import { ALLY, evidence, flag, HIDE, isPlayer, LONG, mentor, sd, SHORT, st } from './common';
import { BATTLE } from './data';

/**
 * 夜里的推理：逐笔里只有席位号。011、102、217、305 各是哪家？305 的钱又是谁的？
 * 证据是一月以来每个席位每天的净买卖，加上你听到的消息。
 * 推对了：逐笔里就有了公司名；看穿 305 的人，手里多了一份申江借壳超仓的证据。
 */

const ORGS = [
  { id: SHORT, label: '申江证券' },
  { id: LONG, label: '中财信托' },
  { id: ALLY, label: '辽北发展' },
  { id: HIDE, label: '浦江实业' },
];
const BACKERS = [
  { id: 'self', label: '浦江自己的钱' },
  { id: SHORT, label: '申江证券' },
  { id: LONG, label: '中财信托' },
  { id: ALLY, label: '辽北发展' },
];

/** 要猜的席位：自己的那个不用猜 */
function seats(g: Game): { id: string; seat: string }[] {
  return [SHORT, LONG, ALLY, HIDE].filter((id) => g.market.ex.accounts.has(id) && !isPlayer(g, id)).map((id) => ({ id, seat: g.market.ex.acct(id).seat! }));
}

export function seatPuzzle(g: Game): Puzzle | null {
  // 监管座位认得每一个席位；申江自己就是 011，305 是它的壳
  if (g.factionId === 'official' || g.factionId === 'short' || g.isAftermath || sd(g) >= BATTLE) return null;
  const days = g.recaps.filter((r) => r.parts.length);
  if (days.length < 2) return null;
  const list = seats(g);
  const wan = (q: number) => (q === 0 ? '·' : `${q > 0 ? '+' : '−'}${(Math.abs(q) / 10000).toFixed(0)}`);
  const rows = days.map((r) => [r.date.slice(5), ...list.map((x) => wan(r.parts.find((p) => p.who === x.id)?.net ?? 0))]);
  const hide = list.some((x) => x.id === HIDE);
  return {
    id: 'seats',
    title: '对着成交单认席位',
    intro:
      '逐笔里只有席位号。下面是一月以来每个席位每天的净买卖（万口，买为正）。对着它、再想想这些天听到的消息：哪个席位是哪家？' +
      (hide ? '305 平时没什么动静，它的钱又是谁的？' : ''),
    evidence: { head: ['日期', ...list.map((x) => `席位 ${x.seat}`)], rows, note: '申江是最大的空头，中财是从北京来的多头，辽北和申江签了锁仓，浦江是个小会员。' },
    questions: [
      ...list.map((x) => ({ id: x.id, label: `席位 ${x.seat} 是`, options: ORGS.filter((o) => !isPlayer(g, o.id)) })),
      ...(hide ? [{ id: 'backer', label: '305 的钱是', options: BACKERS }] : []),
    ],
    reward: hide ? '逐笔和复盘里显示公司名；看穿 305 的人，拿到申江借壳超仓的证据。' : '逐笔和复盘里显示公司名。',
    solved: !!flag(g, 'seatsSolved'),
  };
}

export function solveSeats(g: Game, answers: Record<string, string>): PuzzleResult {
  const list = seats(g);
  let right = 0;
  for (const x of list) if (answers[x.id] === x.id) right++;
  const hide = list.some((x) => x.id === HIDE);
  if (hide && answers.backer === SHORT) right++;
  const total = list.length + (hide ? 1 : 0);
  const solved = right === total;
  const text: string[] = [];
  if (solved) {
    g.flags.seatsSolved = true;
    g.flags.seatsKnown = true;
    text.push('逐笔里的席位号都对上了公司。');
    if (hide) {
      st(g).evidence.add('split');
      evidence(
        g,
        'ev-split',
        '你从成交单里推出：305 的空单是申江的',
        '305 跟着 011 的节奏卖，被追保的那天钱是从申江那边划过去的。两家的空单合起来，早就超过了 300 万口的持仓限额。',
        '你的推理',
        'shen',
      );
      text.push('305 背后是申江：两家合计超出持仓限额。这是一份能交给交易所的证据。');
    }
  } else {
    text.push(`对了 ${right} / ${total}。哪几个对，你得自己想。`);
    // 试了两次还不对，老周会点一句
    const tries = (g.puzzleTries.seats?.length ?? 0) + 1;
    if (tries === 2) mentor(g, '认席位，先找最笨的那个：天天买、从来不卖的，是押贴息的；卖得最凶的，是空头的头。剩下两个，看谁跟着谁的节奏。');
  }
  return { right, total, solved, text };
}
