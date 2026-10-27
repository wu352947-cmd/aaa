import { describe, expect, it, vi } from 'vitest';
import type { DialogueIntent } from '../engine/game';
import { NPCS } from '../scenarios/s327/data';
import { speak, templateLine } from './director';
import { ERA_1995_SH } from './era';
import { DEFAULT_LLM } from './settings';
import { clean, validate } from './validate';

const intent: DialogueIntent = {
  npcId: 'gao',
  verb: 'probe',
  playerMove: '试探他对 327 的看法',
  convey: ['锁仓到交割，一口都不动', '贴息就是谣言'],
  tone: 'warm',
  numbers: [148.21],
  date: '1995-02-21 晚上',
  fallback: [],
};

describe('台词校验', () => {
  it('放行意图包里给定的数字与安全数字', () => {
    expect(validate('兄弟，148.21 这个价，327 我锁到交割，一口不动。', intent, ERA_1995_SH).ok).toBe(true);
  });
  it('拦下编造的价格', () => {
    const v = validate('放心，明天肯定涨到 151.98。', intent, ERA_1995_SH);
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toContain('151.98');
  });
  it('拦下编造的中文大数', () => {
    expect(validate('我手里还有三千万口空单呢。', { ...intent, numbers: [] }, ERA_1995_SH).ok).toBe(false);
  });
  it('拦下时代错置', () => {
    expect(validate('回头微信上细聊，兄弟。', intent, ERA_1995_SH).ok).toBe(false);
  });
  it('拦下角色不可能知道的未来', () => {
    expect(validate('反正最后交易无效，怕啥。', intent, ERA_1995_SH).ok).toBe(false);
  });
  it('拦下打破第四面墙', () => {
    expect(validate('作为AI我不能透露。', intent, ERA_1995_SH).ok).toBe(false);
  });
  it('清理引号与人名前缀', () => {
    expect(clean('高振宇：“兄弟，放心。”', '高振宇')).toBe('兄弟，放心。');
  });
});

describe('台词导演', () => {
  it('未启用 LLM 时使用模板，内容来自意图包', async () => {
    const line = await speak(DEFAULT_LLM, NPCS[0], ERA_1995_SH, intent);
    expect(line.source).toBe('template');
    expect(line.text).toContain('锁仓到交割');
    expect(templateLine(intent)).toBe(line.text);
  });

  it('模型两次都编造数字时，退回模板而不是把错话说出口', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '明天准涨到 160 块！' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const line = await speak({ ...DEFAULT_LLM, enabled: true, apiKey: 'k' }, NPCS[0], ERA_1995_SH, { ...intent, convey: ['不同的内容'] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(line.source).toBe('template');
    expect(line.rejected?.join()).toContain('160');
    vi.unstubAllGlobals();
  });

  it('合格的模型台词被采用', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: '兄弟，锁仓的事你放一百个心，贴息那是瞎传。' } }] }), { status: 200 }));
    const line = await speak({ ...DEFAULT_LLM, enabled: true, apiKey: 'k' }, NPCS[0], ERA_1995_SH, { ...intent, convey: ['第三种内容'] });
    expect(line.source).toBe('llm');
    vi.unstubAllGlobals();
  });
});
