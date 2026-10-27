/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 浏览器直连部分 LLM 服务会被 CORS 拦下。开发时可在 .env.local 里设置
// LLM_PROXY_TARGET=https://api.deepseek.com，然后在游戏设置里把接口地址填成 /llm。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.LLM_PROXY_TARGET;
  return {
    base: './',
    plugins: [react()],
    server: target
      ? {
          proxy: {
            '/llm': {
              target,
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/llm/, ''),
            },
          },
        }
      : undefined,
    test: { environment: 'node' },
  };
});
