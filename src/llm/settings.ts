/** 台词 AI 的连接设置。只存在本机浏览器里，不进存档、不参与模拟。 */
export interface LlmSettings {
  enabled: boolean;
  /** OpenAI 兼容接口地址，例如 https://api.deepseek.com 或开发代理 /llm */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export const DEFAULT_LLM: LlmSettings = {
  enabled: false,
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.9,
};

const KEY = 'chouma.llm';

export function loadLlm(): LlmSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_LLM, ...JSON.parse(raw) };
  } catch {
    /* 隐私模式等情况下拿不到存储，使用默认值 */
  }
  return { ...DEFAULT_LLM };
}

export function saveLlm(s: LlmSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 忽略 */
  }
}
