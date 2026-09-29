import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { configureApp, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { appUser } from './database/schema';
import {
  SESSION_COOKIE,
  verifySession,
  passwordVersion,
  type SessionPayload,
} from './common/utils/session';
import { isChildAllowed, isChildPage } from './modules/auth/role-policy';
import { createRateLimiter } from './common/middleware/rate-limit';

// 静态资源（带扩展名，如 /assets/index-xxx.js、/favicon.svg）
const STATIC_FILE_RE = /\.[a-z0-9]+$/i;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  const appLoginEnabled = process.env.APP_LOGIN === 'true';

  // 安全：应用登录模式下会话签名密钥必须显式配置。
  // 缺省的硬编码密钥一旦泄露（它就在源码里），任何人可签发任意家长会话。
  if (
    appLoginEnabled &&
    process.env.NODE_ENV !== 'development' &&
    !process.env.SESSION_SECRET
  ) {
    const logger = new Logger('Bootstrap');
    logger.error(
      'SESSION_SECRET 未配置：生产/独立环境使用应用登录时必须显式设置（建议 ≥32 字符随机串）。拒绝启动。',
    );
    throw new Error('SESSION_SECRET is required when APP_LOGIN=true outside development');
  }

  // 独立部署（NAS / 自有服务器）且未开启应用登录时：
  // 通过 STANDALONE_USER_ID 注入一个固定用户身份（单家庭使用）。
  // 平台环境下不要设置该变量。
  if (!appLoginEnabled && process.env.STANDALONE_USER_ID) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // 安全：必须无条件覆盖。若保留"客户端已提供则信任"的逻辑，
      // 攻击者可自带 x-larkgw-suda-webuser 头冒充任意用户（接管任意家庭）。
      const webUser = {
        user_id: process.env.STANDALONE_USER_ID,
        app_id: 'standalone',
        user_name: { zh_cn: process.env.STANDALONE_USER_NAME || '家长' },
        is_system_account: false,
      };
      req.headers['x-larkgw-suda-webuser'] = encodeURIComponent(
        JSON.stringify(webUser),
      );
      next();
    });
  }

  await configureApp(app, {
    disableSwagger: true,
    // 图片识别会以 base64 data URL 上传，默认 1mb 会触发 PayloadTooLargeError
    bodyLimit: process.env.BODY_SIZE_LIMIT || '12mb',
  });

  // 安全：全局 whitelist —— 自动剥离请求体中未在 DTO 上声明的属性，
  // 防止额外字段直通服务层（所有 controller 的 body DTO 均已加 class-validator 装饰器；
  // 以 interface 声明的 body 因 metatype 为 Object 不会被处理，行为不变）。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  // ⚠️ 独立部署补丁（NAS / 自有服务器）——项目更新后需重打：
  // SDK 的 public-assets 中间件把 `assets/` 列入 PLATFORM_PREFIXES 跳过直出
  // （平台环境 hashed 产物走 CDN），本地部署没有 CDN，导致 /assets/* 落到
  // SPA fallback 返回 index.html → 浏览器把 HTML 当 JS 解析 → 白屏。
  // 只接管 /assets/ 前缀：index.html 是 hbs 模板，必须留给 SDK 的 view engine
  // 渲染（否则 {{appId}} / {{{__platform__}}} 不替换，前端 JSON.parse 报错）。
  app.useStaticAssets(join(process.cwd(), 'dist/client/assets'), {
    prefix: '/assets/',
  });

  // 安全：登录/注册/建账号/改密接口限流（防暴力破解密码与枚举邀请码）。
  // 单实例内存桶即可满足家庭应用场景；多实例部署需换共享存储实现。
  app.use(
    '/api/auth/login',
    createRateLimiter({
      windowMs: 60_000,
      max: 10,
      message: '登录尝试过于频繁，请 1 分钟后再试',
    }),
  );
  app.use(
    '/api/auth/register',
    createRateLimiter({
      windowMs: 60 * 60_000,
      max: 10,
      message: '注册请求过于频繁，请 1 小时后再试',
    }),
  );
  app.use(
    '/api/auth/parent-account',
    createRateLimiter({ windowMs: 60_000, max: 10 }),
  );
  app.use(
    '/api/auth/child-account',
    createRateLimiter({ windowMs: 60_000, max: 10 }),
  );
  app.use(
    '/api/auth/password',
    createRateLimiter({
      windowMs: 60_000,
      max: 5,
      message: '密码修改过于频繁，请稍后再试',
    }),
  );

  // 应用级登录（APP_LOGIN=true）：解析会话 → 注入平台身份头 → 按角色拦截。
  // 必须注册在 configureApp 之后（此时 cookieParser 已就绪）。
  if (appLoginEnabled) {
    // 会话密码版本校验用：从 IoC 容器取 Drizzle 实例
    const db = app.get<PostgresJsDatabase>(DRIZZLE_DATABASE);
    const sessionLogger = new Logger('Session');

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      const cookies =
        (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
      const session = verifySession(cookies[SESSION_COOKIE]);

      if (
        session?.pv &&
        req.path.startsWith('/api/') &&
        !req.path.startsWith('/api/auth/')
      ) {
        // 安全：改密后吊销旧会话——校验会话携带的密码版本是否与当前密码一致。
        // 仅对业务 API 校验（豁免 auth 接口，否则带旧 cookie 的登录请求会被卡死）。
        // 旧版本会话（无 pv 字段）在过期前仍有效，平滑迁移。
        try {
          const [row] = await db
            .select({ ph: appUser.passwordHash })
            .from(appUser)
            .where(eq(appUser.id, session.uid))
            .limit(1);
          if (!row || passwordVersion(row.ph) !== session.pv) {
            res.clearCookie(SESSION_COOKIE);
            res.status(401).json({
              error: {
                code: 'UNAUTHORIZED',
                message: '登录状态已失效，请重新登录',
                timestamp: Date.now(),
              },
            });
            return;
          }
        } catch (err) {
          // 会话校验依赖 DB：查询失败按未登录处理（宁可重新登录，不可放行失效会话）
          sessionLogger.warn(`密码版本校验失败: ${String(err)}`);
          res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: '登录状态校验失败，请重新登录',
              timestamp: Date.now(),
            },
          });
          return;
        }
      }

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
        // 安全：必须无条件用会话身份覆盖该头。客户端预置的该头不可信任，
        // 否则孩子账号可借此把 userContext.userId 指向任意用户，绕过家庭隔离。
        const webUser = {
          user_id: session.ownerId || session.uid,
          app_id: 'app',
          user_name: { zh_cn: session.displayName },
          is_system_account: false,
        };
        req.headers['x-larkgw-suda-webuser'] = encodeURIComponent(
          JSON.stringify(webUser),
        );

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
