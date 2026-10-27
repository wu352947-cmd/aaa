import type { LlmSettings } from './settings';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function endpoint(baseUrl: string): string {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (b.endsWith('/chat/completions')) return b;
  return `${b}/chat/completions`;
}

/** 调用任意 OpenAI 兼容的 /chat/completions 接口（DeepSeek、OpenCode Go、本地模型等） */
export async function chat(s: LlmSettings, messages: ChatMessage[], opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(endpoint(s.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: s.model,
        messages,
        temperature: s.temperature,
        max_tokens: opts.maxTokens ?? 200,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('响应里没有 choices[0].message.content');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
