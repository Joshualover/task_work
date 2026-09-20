import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { FamilyModule } from '../family/family.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [FamilyModule, NotificationModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
