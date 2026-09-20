import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';import { ViewModule } from './modules/view/view.module';
import { FamilyModule } from './modules/family/family.module';
import { ChildModule } from './modules/child/child.module';
import { TaskModule } from './modules/task/task.module';
import { PointModule } from './modules/point/point.module';
import { RewardModule } from './modules/reward/reward.module';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { AiModule } from './modules/ai/ai.module';
import { AllowanceModule } from './modules/allowance/allowance.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ReportModule } from './modules/report/report.module';
import { AuthModule } from './modules/auth/auth.module';

// 提前加载 .env：下方 PlatformModule.forRoot 的配置在“模块装饰器求值”时读取 process.env，
// 而 Nest 的 ConfigModule 要到 AppModule 初始化阶段才加载 .env，时机偏晚。
// 独立部署时 ENABLE_CSRF 等配置写在 .env 里也能生效。
loadEnv();

@Module({
  imports: [
    // 独立部署（NAS / 自有服务器）时可设 ENABLE_CSRF=false 关闭平台网关的 CSRF 校验
    PlatformModule.forRoot({
      enableCsrf: process.env.ENABLE_CSRF !== 'false',
    }),
    // ====== @route-section: business-modules START ======
    AuthModule,
    FamilyModule,
    ChildModule,
    TaskModule,
    PointModule,
    RewardModule,
    RedemptionModule,
    AllowanceModule,
    NotificationModule,
    AiModule,
    ReportModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
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
