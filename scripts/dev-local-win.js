#!/usr/bin/env node
// ============================================================================
// Windows 本地开发启动器（由 agent 生成，等价于 scripts/dev-local.js 的最终效果）：
// dev-local.js 用 spawn('npx', ...) 未带 shell，在 Windows 上找不到 npx.cmd 而失败；
// 且 package.json 的 dev:server/dev:client 使用 Unix 环境变量语法，cmd 下无法直接
// npm run。本脚本在 Windows 上直接加载 .env/.env.local 后拉起 nest + vite 子进程。
// 用法：node scripts/dev-local-win.js
// ============================================================================
const path = require('node:path');
const { spawn } = require('node:child_process');

process.chdir(path.resolve(__dirname, '..'));

// 与 dev-local.js 保持一致的环境
if (!process.env.MIAODA_APP_TYPE) process.env.MIAODA_APP_TYPE = '3';
process.env.MIAODA_LOCAL_DEV = '1';
process.env.NODE_ENV = 'development';

const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// SUDA_WEBUSER 反斜杠兜底（与 dev-local.js 同口径）
if (process.env.SUDA_WEBUSER) {
  const raw = process.env.SUDA_WEBUSER;
  try {
    JSON.parse(raw);
  } catch {
    try {
      const unescaped = raw.replace(/\\"/g, '"');
      JSON.parse(unescaped);
      process.env.SUDA_WEBUSER = unescaped;
    } catch {
      /* 保持原样 */
    }
  }
}

const BIN_DIR = path.join(process.cwd(), 'node_modules', '.bin');

function run(name, bin, args) {
  const child = spawn(bin, args, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });
  child.on('error', (err) => {
    console.error(`[${name}] spawn error: ${err.message}`);
  });
  return child;
}

console.log('[dev-local-win] 拉起 dev:server（nest start --watch） + dev:client（vite）');
const server = run('server', path.join(BIN_DIR, 'nest.cmd'), ['start', '--watch']);
const client = run('client', path.join(BIN_DIR, 'vite.cmd'), ['--config', 'vite.config.ts']);

process.on('SIGINT', () => {
  server.kill();
  client.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.kill();
  client.kill();
  process.exit(0);
});
