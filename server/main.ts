import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import type { Request, Response, NextFunction } from 'express';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  // 独立部署（NAS / 自有服务器）时平台网关不存在：
  // 通过 STANDALONE_USER_ID 注入一个固定用户身份（单家庭使用）。
  // 平台环境下不要设置该变量。
  if (process.env.STANDALONE_USER_ID) {
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
