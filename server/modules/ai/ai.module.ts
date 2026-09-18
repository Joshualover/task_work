import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FamilyModule } from '../family/family.module';
import { ChildModule } from '../child/child.module';
import { TaskModule } from '../task/task.module';

@Module({
  imports: [HttpModule, FamilyModule, ChildModule, TaskModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
