import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import type { Request, Response, NextFunction } from 'express';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  SESSION_COOKIE,
  verifySession,
  type SessionPayload,
} from './common/utils/session';
import { isChildAllowed, isChildPage } from './modules/auth/role-policy';

// 静态资源（带扩展名，如 /assets/index-xxx.js、/favicon.svg）
const STATIC_FILE_RE = /\.[a-z0-9]+$/i;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  const appLoginEnabled = process.env.APP_LOGIN === 'true';

  // 独立部署（NAS / 自有服务器）且未开启应用登录时：
  // 通过 STANDALONE_USER_ID 注入一个固定用户身份（单家庭使用）。
  // 平台环境下不要设置该变量。
  if (!appLoginEnabled && process.env.STANDALONE_USER_ID) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (!req.headers['x-larkgw-suda-webuser']) {
        const webUser = {
          user_id: process.env.STANDALONE_USER_ID,
          app_id: 'standalone',
          user_name: { zh_cn: process.env.STANDALONE_USER_NAME || '家长' },
          is_system_account: false,
        };
        req.headers['x-larkgw-suda-webuser'] = encodeURIComponent(
          JSON.stringify(webUser),
        );
      }
      next();
    });
  }

  await configureApp(app, {
    disableSwagger: true,
    // 图片识别会以 base64 data URL 上传，默认 1mb 会触发 PayloadTooLargeError
    bodyLimit: process.env.BODY_SIZE_LIMIT || '12mb',
  });

  // ⚠️ 独立部署补丁（NAS / 自有服务器）——项目更新后需重打：
  // SDK 的 public-assets 中间件把 `assets/` 列入 PLATFORM_PREFIXES 跳过直出
  // （平台环境 hashed 产物走 CDN），本地部署没有 CDN，导致 /assets/* 落到
  // SPA fallback 返回 index.html → 浏览器把 HTML 当 JS 解析 → 白屏。
  // 只接管 /assets/ 前缀：index.html 是 hbs 模板，必须留给 SDK 的 view engine
  // 渲染（否则 {{appId}} / {{{__platform__}}} 不替换，前端 JSON.parse 报错）。
  app.useStaticAssets(join(process.cwd(), 'dist/client/assets'), {
    prefix: '/assets/',
  });

  // 应用级登录（APP_LOGIN=true）：解析会话 → 注入平台身份头 → 按角色拦截。
  // 必须注册在 configureApp 之后（此时 cookieParser 已就绪）。
  if (appLoginEnabled) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const cookies =
        (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
      const session = verifySession(cookies[SESSION_COOKIE]);

      if (!session) {
        // 未登录：仅拦截 API（登录相关接口与页面/静态资源放行）
        if (
          req.path.startsWith('/api/') &&
          !req.path.startsWith('/api/auth/')
        ) {
          res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: '未登录或登录已过期',
              timestamp: Date.now(),
            },
          });
          return;
        }
        next();
        return;
      }

      {
        (req as Request & { appUser?: SessionPayload }).appUser = session;
        if (!req.headers['x-larkgw-suda-webuser']) {
          const webUser = {
            user_id: session.ownerId || session.uid,
            app_id: 'app',
            user_name: { zh_cn: session.displayName },
            is_system_account: false,
          };
          req.headers['x-larkgw-suda-webuser'] = encodeURIComponent(
            JSON.stringify(webUser),
          );
        }

        // 孩子账号：页面/静态资源放行，家长页面重定向，接口走白名单
        if (session.role === 'child') {
          const path = req.path;

          if (path.startsWith('/api/')) {
            if (!isChildAllowed(req.method, path)) {
              res.status(403).json({
                error: {
                  code: 'FORBIDDEN',
                  message: '孩子账号无权访问该功能',
                  timestamp: Date.now(),
                },
              });
              return;
            }
            const bodyChildId = (req.body as { childId?: string } | undefined)
              ?.childId;
            const provided =
              (req.query?.childId as string | undefined) ?? bodyChildId;
            if (provided && session.childId && provided !== session.childId) {
              res.status(403).json({
                error: {
                  code: 'FORBIDDEN',
                  message: '只能查看自己的数据',
                  timestamp: Date.now(),
                },
              });
              return;
            }
          } else if (!isChildPage(path) && !STATIC_FILE_RE.test(path)) {
            // 直接访问家长页面路由（如 /children）→ 重定向到孩子端，
            // 避免返回 JSON 被当成 HTML 渲染（白屏）
            res.redirect('/child-dashboard');
            return;
          }
        }
      }
      next();
    });
  }

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(
    process.env.VIEWS_DIR || join(process.cwd(), 'dist/client'),
  );
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
