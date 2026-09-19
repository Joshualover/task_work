import { Module } from '@nestjs/common';

import { AllowanceController } from './allowance.controller';
import { AllowanceService } from './allowance.service';
import { FamilyModule } from '../family/family.module';

@Module({
  imports: [FamilyModule],
  controllers: [AllowanceController],
  providers: [AllowanceService],
  exports: [AllowanceService],
})
export class AllowanceModule {}
