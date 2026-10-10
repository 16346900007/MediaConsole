import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { existsSync } from 'fs';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  const logger = new Logger('Bootstrap');
  // 默认双栈监听（IPv4+IPv6），dev 模式 vite 反代走 127.0.0.1 也要能连通
  const host = process.env.SERVER_HOST || '::';
  const port = Number(process.env.SERVER_PORT || '55725');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  // preset 构建产物可能在 dist/client 或 dist/client/client（多一层），兼容两种布局
  const clientDir = join(process.cwd(), 'dist/client');
  const viewsDir = existsSync(join(clientDir, 'index.html'))
    ? clientDir
    : join(clientDir, 'client');
  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  // 关键修复：configureApp 的 publicAssetsMiddleware 会跳过 /assets/ 前缀（平台设计走 CDN），
  // 在纯本机/桌面端环境下 assets 请求会落到 SPA fallback，返回 text/html 导致模块脚本
  // MIME 检查失败而白屏。这里在 configureApp 之前注册 express.static 直接服务 assets，
  // 保证 .js/.css 以正确 MIME 返回。
  app.useStaticAssets(join(viewsDir, 'assets'), {
    prefix: '/assets/',
    index: false,
    maxAge: '1h',
  });

  // 关键修复2：basename 归位。ViewContextMiddleware 通过请求头判断注入的 basename：
  //   带 x-miaoda-tenant-host → /app/{appId}；带 x-miaoda-custom-host → "/"。
  // 平台默认无自定义头时注入 /app/，与桌面端根路径 URL 不匹配，React Router 不渲染导致白屏。
  // 这里强制注入 custom-host 头，使 basename="/"（前端路由与 API 路径随之全部归位）。
  //
  // 关键修复3：本地身份注入。@NeedLogin 守卫读取 x-larkgw-suda-webuser 身份头；
  // web dev 由 Vite 在 MIAODA_LOCAL_DEV=1 时注入，桌面端无 Vite，需后端兜底注入，
  // 否则所有写接口/受保护接口返回 401 未登录。
  app.use((req, res, next) => {
    req.headers['x-miaoda-custom-host'] = req.headers['x-miaoda-custom-host'] || '1';
    req.headers['x-larkgw-suda-webuser'] =
      req.headers['x-larkgw-suda-webuser'] ||
      '{"user_id":"local-dev-user","tenant_id":"local-dev-tenant","app_id":"","user_name":{"zh_cn":"本地开发者","en_us":"Local Dev"},"user_type":"member","env":"local","is_system_account":false,"roles":[]}';
    // 页面 HTML 不缓存：桌面端 webview 若缓存旧 index.html 会持续加载旧前端 bundle
    // （assets 带内容哈希可长缓存，但 index.html 必须实时引用最新哈希）
    if (
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/assets') &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  await configureApp(app, { 
    disableSwagger: true,
  });

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
