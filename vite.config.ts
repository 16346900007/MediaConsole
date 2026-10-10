import path from 'path';
import { defineConfig } from '@lark-apaas/coding-preset-vite-react';

// 必须在 defineConfig 调用前设置：preset 按 MIAODA_APP_TYPE=3 启用 fullstack 插件
// （dev 反代 /api、HTML 输出到 dist/client、Nest 渲染等），否则 Vite 按普通前端跑
process.env.MIAODA_APP_TYPE ||= '3';

const config = defineConfig(
  {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'client/src'),
      },
    },
  },
  // 第二个参数：preset 专属配置。serverPort 决定 dev 模式 /api 反代目标（与 server/main.ts 默认值一致）
  { serverPort: 55725 },
);

// 前端 dev 端口：固定 5 位随机端口，不使用默认 8080
config.server = {
  ...(config.server || {}),
  port: 52240,
  strictPort: true,
};

export default config;
