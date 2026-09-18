import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';import { ViewModule } from './modules/view/view.module';
import { FamilyModule } from './modules/family/family.module';
import { ChildModule } from './modules/child/child.module';
import { TaskModule } from './modules/task/task.module';
import { PointModule } from './modules/point/point.module';
import { RewardModule } from './modules/reward/reward.module';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { AiModule } from './modules/ai/ai.module';
import { ReportModule } from './modules/report/report.module';

@Module({
  imports: [
    // 独立部署（NAS / 自有服务器）时可设 ENABLE_CSRF=false 关闭平台网关的 CSRF 校验
    PlatformModule.forRoot({
      enableCsrf: process.env.ENABLE_CSRF !== 'false',
    }),
    // ====== @route-section: business-modules START ======
    FamilyModule,
    ChildModule,
    TaskModule,
    PointModule,
    RewardModule,
    RedemptionModule,
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
