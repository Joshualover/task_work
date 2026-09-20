import { Module } from '@nestjs/common';

import { AllowanceController } from './allowance.controller';
import { AllowanceService } from './allowance.service';
import { FamilyModule } from '../family/family.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [FamilyModule, NotificationModule],
  controllers: [AllowanceController],
  providers: [AllowanceService],
  exports: [AllowanceService],
})
export class AllowanceModule {}
