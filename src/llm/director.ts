import type { DialogueIntent, NpcDef } from '../engine/game';
import { chat, type ChatMessage } from './client';
import type { EraPack } from './era';
import type { LlmSettings } from './settings';
import { clean, validate } from './validate';

/**
 * 台词导演：把引擎给出的意图包写成一句话。
 *
 * 引擎已经决定了 NPC 说真话还是谎话、透露什么、语气如何；这里只负责措辞。
 * LLM 拿不到任何秘密（意图包里没有），所以它无论怎么“发挥”都泄露不了；
 * 输出再经过确定性校验，不合格就重写一次，还不合格就退回模板。
 * 台词不写回游戏状态，因此不影响确定性与重放。
 */

export interface Line {
  text: string;
  source: 'llm' | 'template';
  rejected?: string[];
}

const TONE: Record<DialogueIntent['tone'], string> = {
  warm: '热络、亲近',
  neutral: '平常、就事论事',
  cold: '冷淡、简短',
  evasive: '躲闪、含糊其辞、话里有话',
  hostile: '恼火、带刺',
  panicked: '慌乱、急促',
  smug: '笃定、有点居高临下',
};

const VERB: Record<DialogueIntent['verb'], string> = {
  probe: '试探',
  exchange: '交换',
  ally: '结盟',
  betray: '背叛',
  report: '告发',
  chat: '闲聊',
  decision: '决断',
};

export function systemPrompt(npc: NpcDef, era: EraPack, intent: DialogueIntent): string {
  const nums = [...intent.numbers, ...era.safeNumbers].join('、');
  return [
    '你是一款历史金融叙事游戏的台词写手。引擎已经决定了角色这一回合要表达什么，你只负责把它写成一句符合人物与年代的中文口语台词。',
    '',
    '【硬性规则】',
    '1. 只能表达「要传达的内容」里的意思。不得增加新的消息、价格、仓位或判断；不知道的事就说不知道或岔开话题。',
    `2. 阿拉伯数字只允许使用：${nums}；其余只能用“一两句”“几天”这类不具体的口语。`,
    `3. 现在是 ${intent.date}，地点是${era.place}。不得出现这之后才有的事物或说法，也不得暗示未来会发生什么。`,
    '4. 角色可能在撒谎或回避——照着「要传达的内容」演，不要替他澄清，也不要加旁白解释。',
    `5. 语气：${TONE[intent.tone]}。长度 15–70 字。只输出台词本身：不要引号、不要人名前缀、不要括号旁白。`,
    '',
    `【人物】${npc.name}，${npc.org}${npc.title}。${npc.persona}`,
    `【年代用语参考】${era.lexicon.join('、')}`,
  ].join('\n');
}

export function userPrompt(intent: DialogueIntent, playerText?: string): string {
  return [
    `对方（${VERB[intent.verb]}）：${intent.playerMove}${playerText ? `，原话是：「${playerText.slice(0, 120)}」` : ''}`,
    '要传达的内容：',
    ...intent.convey.map((c) => `- ${c}`),
  ].join('\n');
}

/** 模板兜底：没有配置 LLM、调用失败或校验不合格时使用 */
const FLAVOR: Record<string, { pre: string[]; post: string[] }> = {
  gao: { pre: ['兄弟，', '我跟你说，', '嗨，', ''], post: ['，没毛病。', '。', '，你就把心放肚子里。'] },
  wei: { pre: ['呵呵，', '这个嘛，', '小同志，', ''], post: ['。', '，你说是不是？', '，啊。'] },
  chen: { pre: ['', '', '嗯。'], post: ['。', '。'] },
  su: { pre: ['我直说吧，', '你听我说，', ''], post: ['。', '，这个你别外传。'] },
  zhou: { pre: ['侬听我讲，', '老早阿拉在场里，', '小朋友，', ''], post: ['。', '，侬自家想想。', '，晓得伐？'] },
  qian: { pre: ['老板，', '哎呀老板，', ''], post: ['。', '，发财发财。', '，价钱好商量。'] },
  shen: { pre: ['', '我告诉你，', ''], post: ['。', '，这是规律。'] },
  jan: { pre: ['嘿！', '朋友，', ''], post: ['！', '，明天就不是这个价了！'] },
  pieter: { pre: ['唉，', '这个嘛，', ''], post: ['。', '，够买好几袋面粉了。'] },
  cornelis: { pre: ['……', '年轻人，', ''], post: ['。', '，花是不会说谎的。'] },
  maritje: { pre: ['先生，', '容我想想，', ''], post: ['。', '，万一呢？'] },
  dirck: { pre: ['哈哈，', '朋友，', ''], post: ['。', '，生意就是生意。'] },
  hendrick: { pre: ['啊，', '你瞧，', ''], post: ['。', '，这可是春天的金子。'] },
};

export function templateLine(intent: DialogueIntent, salt = 0): string {
  if (intent.convey.length === 1 && intent.convey[0].startsWith('（')) return intent.convey[0];
  const f = FLAVOR[intent.npcId] ?? { pre: [''], post: ['。'] };
  let h = salt;
  for (const c of intent.convey.join('')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pre = f.pre[h % f.pre.length];
  const post = f.post[(h >> 3) % f.post.length];
  return pre + intent.convey.join('，') + post;
}

const cache = new Map<string, Line>();

export async function speak(
  settings: LlmSettings,
  npc: NpcDef,
  era: EraPack,
  intent: DialogueIntent,
  opts: { playerText?: string; history?: ChatMessage[]; salt?: number } = {},
): Promise<Line> {
  const fallback: Line = { text: templateLine(intent, opts.salt), source: 'template' };
  if (!settings.enabled || !settings.baseUrl) return fallback;
  const key = JSON.stringify([intent, opts.playerText ?? '', opts.history?.length ?? 0]);
  const hit = cache.get(key);
  if (hit && !opts.playerText) return hit;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(npc, era, intent) },
    ...(opts.history ?? []).slice(-6),
    { role: 'user', content: userPrompt(intent, opts.playerText) },
  ];
  const rejected: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chat(settings, messages, { maxTokens: 160 });
      const v = validate(clean(raw, npc.name), intent, era);
      if (v.ok) {
        const line: Line = { text: v.text, source: 'llm', rejected: rejected.length ? rejected : undefined };
        cache.set(key, line);
        return line;
      }
      rejected.push(...v.reasons);
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `这句不合格：${v.reasons.join('；')}。请严格按规则重写。` });
    } catch (e) {
      rejected.push(`调用失败：${(e as Error).message}`);
      break;
    }
  }
  return { ...fallback, rejected };
}

/** 报纸标题：引擎给事实，模型给年代腔调；数字只能来自事实 */
export async function headline(settings: LlmSettings, era: EraPack, base: { headline: string; sub: string; facts: string[] }, date: string): Promise<{ headline: string; sub: string; source: 'llm' | 'template' }> {
  const tpl = { headline: base.headline, sub: base.sub, source: 'template' as const };
  if (!settings.enabled) return tpl;
  const numbers = [...base.facts.join(' ').matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
  const intent: DialogueIntent = { npcId: 'paper', verb: 'chat', playerMove: '', convey: base.facts, tone: 'neutral', numbers, date, fallback: [] };
  try {
    const raw = await chat(
      settings,
      [
        {
          role: 'system',
          content: `你是${era.place}一家财经报纸的编辑，日期 ${date}。根据给定事实写一条当年风格的报纸标题和副题，用“｜”分隔，例如：327 合约多空激战｜空方坚称兑付价有限。只能使用事实里的数字，不得出现当年没有的说法，不得暗示未来。只输出这一行。`,
        },
        { role: 'user', content: base.facts.join('；') },
      ],
      { maxTokens: 80 },
    );
    const [h, s] = clean(raw).split(/[｜|]/);
    const v1 = validate(h ?? '', intent, era, { min: 4, max: 24 });
    const v2 = validate(s ?? base.sub, intent, era, { min: 2, max: 30 });
    if (v1.ok && v2.ok) return { headline: v1.text, sub: v2.text, source: 'llm' };
  } catch {
    /* 退回模板 */
  }
  return tpl;
}
