import type { DialogueIntent } from '../engine/game';
import type { EraPack } from './era';

export interface Verdict {
  ok: boolean;
  text: string;
  reasons: string[];
}

const FOURTH_WALL = ['作为AI', '作为一个AI', 'AI', '人工智能', '游戏', '玩家', '引擎', '提示词'];

/** 清理模型输出：去掉引号、人名前缀、旁白括号外的多余换行 */
export function clean(raw: string, speaker?: string): string {
  let t = raw.trim();
  t = t.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
  if (speaker) t = t.replace(new RegExp(`^${speaker}[：:]\\s*`), '');
  t = t.replace(/^[^：:\n]{1,6}[：:]\s*/, (m) => (m.length <= 7 ? '' : m));
  t = t.replace(/^[“"「『]+|[”"」』]+$/g, '').trim();
  t = t.split('\n').filter(Boolean).slice(0, 3).join('');
  return t;
}

/**
 * 校验一句台词。规则全部是确定性的，不依赖模型自觉：
 * 1. 数字必须来自意图包（引擎给的）或安全数字表——防止编造价格和仓位；
 * 2. 不得出现当年没有的事物（时代错置）；
 * 3. 不得出现角色此刻不可能知道的未来事件；
 * 4. 不得打破第四面墙；长度在范围内；必须是中文。
 */
export function validate(text: string, intent: DialogueIntent, era: EraPack, opts: { min?: number; max?: number } = {}): Verdict {
  const reasons: string[] = [];
  const min = opts.min ?? 4;
  const max = opts.max ?? 120;
  const len = [...text].length;
  if (len < min) reasons.push('太短');
  if (len > max) reasons.push(`太长（${len} 字，上限 ${max}）`);
  if (!/[一-鿿]/.test(text)) reasons.push('不是中文');

  for (const w of era.anachronisms) if (text.includes(w)) reasons.push(`时代错置：“${w}”`);
  for (const w of era.foreknowledge) if (text.includes(w)) reasons.push(`说出了未来的事：“${w}”`);
  for (const w of FOURTH_WALL) if (text.includes(w)) reasons.push(`打破第四面墙：“${w}”`);

  const allowed = [...intent.numbers, ...era.safeNumbers];
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    const v = parseFloat(m[0]);
    if (v <= 10 && Number.isInteger(v)) continue; // 口语里的小数目
    if (!allowed.some((a) => Math.abs(a - v) <= Math.max(0.02, Math.abs(a) * 0.002))) reasons.push(`编造了数字：${m[0]}`);
  }
  // 中文大数（一百五十一、三千万……）同样不许凭空出现
  if (/[一二三四五六七八九两]+[十百千万亿][一二三四五六七八九十百千万亿零点]*/.test(text) && !intent.numbers.length) {
    const m = text.match(/[一二三四五六七八九两]+[百千万亿][一二三四五六七八九十百千万亿零点]*/);
    if (m) reasons.push(`编造了数字：${m[0]}`);
  }
  return { ok: reasons.length === 0, text, reasons };
}
