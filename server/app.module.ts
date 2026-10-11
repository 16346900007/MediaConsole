import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { SocialModule } from './modules/social/social.module';
import { ViewModule } from './modules/view/view.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    // enableCsrf: false —— 本地单机桌面工具（固定 local-dev-user 身份、无外部攻击面），
    // 关闭 double-submit CSRF 校验，避免 WebView2 清理缓存后 cookie 丢失导致上传/读取 403。
    PlatformModule.forRoot({ enableCsrf: false }),
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    SocialModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
