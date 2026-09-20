import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { FamilyModule } from '../family/family.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [FamilyModule, NotificationModule],
  controllers: [RedemptionController],
  providers: [RedemptionService],
  exports: [RedemptionService],
})
export class RedemptionModule {}
