import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { TaskService } from './task.service';
import { NotificationService } from '../notification/notification.service';
import { FamilyService } from '../family/family.service';
import type {
  TaskTemplate,
  TaskTemplateListResponse,
  CreateTaskTemplateRequest,
  UpdateTaskTemplateRequest,
  TaskListResponse,
  TaskListQuery,
  CreateHomeworkTaskRequest,
  CreateGoalTaskRequest,
  CreateHabitTaskRequest,
  HabitCheckResponse,
  HabitCheckinListResponse,
  HabitCheckinStatus,
  HabitCheckin,
  UpdateHomeworkTaskRequest,
  SubmitTaskRequest,
  ReviewTaskRequest,
  BatchSubmitTasksRequest,
  BatchReviewTasksRequest,
  BatchTaskResultResponse,
  TaskInstance,
  TaskStatus,
  TaskType,
} from '@shared/api.interface';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { getAppUser } from '@server/common/utils/session';
import type { TaskCreator } from './task.service';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsIn,
  IsArray,
  ArrayNotEmpty,
  MaxLength,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// --- DTOs ---

class CreateTaskTemplateDto implements Omit<CreateTaskTemplateRequest, 'familyId'> {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  defaultPoints!: number;

    @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowanceAmount?: number;

  @IsBoolean()
  @Type(() => Boolean)
  isDaily!: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'])
  frequency?: 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  weekDays?: number[];

  @IsOptional()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  monthDays?: number[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

class UpdateTaskTemplateDto implements UpdateTaskTemplateRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  defaultPoints?: number;

    @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowanceAmount?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDaily?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'])
  frequency?: 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  weekDays?: number[];

  @IsOptional()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  monthDays?: number[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

class GenerateDailyTasksDto {
  @IsString()
  @IsNotEmpty()
  childId!: string;

  @IsString()
  @IsNotEmpty()
  date!: string;
}

class TaskListQueryDto implements TaskListQuery {
  @IsString()
  @IsNotEmpty()
  childId!: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @IsIn(['pending', 'submitted', 'completed', 'overdue', 'rejected'])
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @IsIn(['daily', 'homework', 'goal'])
  type?: TaskType;
}

class CreateHomeworkTaskDto implements CreateHomeworkTaskRequest {
  @IsString()
  @IsNotEmpty()
  childId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points!: number;

    @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowanceAmount?: number;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsString()
  @IsNotEmpty()
  taskDate!: string;
}

class SubmitTaskDto implements SubmitTaskRequest {
  @IsOptional()
  @IsString()
  completionNote?: string;
}

class BatchTaskIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  taskIds!: string[];

  @IsOptional()
  @IsString()
  completionNote?: string;
}

class UpdateHomeworkTaskDto implements UpdateHomeworkTaskRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points?: number;

    @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowanceAmount?: number;

  @IsOptional()
  @IsString()
  deadline?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  extendDays?: number;

  @IsOptional()
  @IsString()
  taskDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  targetValue?: number | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  linkedAllowanceGoal?: boolean;

  /** 习惯任务：打卡是否需要家长确认 */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  habitNeedApproval?: boolean;
}

class CreateHabitTaskDto implements CreateHabitTaskRequest {
  @IsString()
  @IsNotEmpty()
  childId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  /** 每次完成奖励积分 */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowanceAmount?: number;

  /** 每日次数上限，0/不填=不限 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  dailyLimit?: number;

  /** 打卡是否需要家长确认后才发奖 */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  needApproval?: boolean;

  @IsString()
  @IsNotEmpty()
  taskDate!: string;
}

class ReviewHabitCheckinDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  rejectReason?: string;
}

class CreateGoalTaskDto implements CreateGoalTaskRequest {
  @IsString()
  @IsNotEmpty()
  childId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points!: number;

    @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowanceAmount?: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  targetValue!: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  linkedAllowanceGoal?: boolean;

  /** 习惯任务：打卡是否需要家长确认 */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  habitNeedApproval?: boolean;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  extendDays?: number;

  @IsString()
  @IsNotEmpty()
  taskDate!: string;
}

class GoalProgressDto {
  @IsNumber()
  @Type(() => Number)
  delta!: number;
}

class ReviewTaskDto implements ReviewTaskRequest {
  @IsBoolean()
  @Type(() => Boolean)
  approved!: boolean;

  @IsOptional()
  @IsString()
  rejectReason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  finalPoints?: number;
}

@Controller('api/tasks')
export class TaskController {
  private readonly logger = new Logger(TaskController.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly familyService: FamilyService,
    private readonly notificationService: NotificationService,
  ) {}

  /** 校验孩子属于当前登录用户家庭 */
  private async assertChild(req: Request, childId: string): Promise<void> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);
  }

  /** 当前操作人（用于记录「谁布置的任务」） */
  private creatorOf(req: Request): TaskCreator {
    const appUser = getAppUser(req);
    return { userId: appUser?.uid ?? null, name: appUser?.displayName ?? null };
  }

  /** 批量接口：校验所有任务都属于本家庭的孩子（防越权） */
  private async assertTasksOfOwnChild(
    req: Request,
    taskIds: string[],
  ): Promise<void> {
    const tasks = await Promise.all(taskIds.map((id) => this.taskService.getTask(id)));
    const childIds = [...new Set(tasks.map((t) => t.childId))];
    for (const childId of childIds) {
      await this.assertChild(req, childId);
    }
  }

  // ==================== 任务模板接口 ====================

  @NeedLogin()
  @Get('templates')
  async listTemplates(@Req() req: Request): Promise<TaskTemplateListResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const items = await this.taskService.listTemplates(family.id);
    return { items };
  }

  @NeedLogin()
  @Post('templates')
  async createTemplate(
    @Req() req: Request,
    @Body() dto: CreateTaskTemplateDto,
  ): Promise<{ template: TaskTemplate }> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const template = await this.taskService.createTemplate(family.id, dto, this.creatorOf(req));
    return { template };
  }

  @NeedLogin()
  @Patch('templates/:id')
  async updateTemplate(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateTaskTemplateDto,
  ): Promise<{ template: TaskTemplate }> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const template = await this.taskService.updateTemplate(id, dto, family.id);
    return { template };
  }

  @NeedLogin()
  @Delete('templates/:id')
  async deleteTemplate(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.taskService.deleteTemplate(id, family.id);
    return { ok: true };
  }

  // ==================== 任务实例接口 ====================

  @NeedLogin()
  @Post('generate-daily')
  async generateDailyTasks(
    @Req() req: Request,
    @Body() dto: GenerateDailyTasksDto,
  ): Promise<{ items: TaskInstance[] }> {
    await this.assertChild(req, dto.childId);
    const items = await this.taskService.generateDailyTasks(dto.childId, dto.date, this.creatorOf(req));
    return { items };
  }

  @NeedLogin()
  @Get()
  async listTasks(
    @Req() req: Request,
    @Query() query: TaskListQueryDto,
  ): Promise<TaskListResponse> {
    await this.assertChild(req, query.childId);
    const items = await this.taskService.listTasks(query);
    const total = await this.taskService.countTasks(query);
    return { items, total };
  }

  @NeedLogin()
  /** 家长：习惯打卡待确认列表 */
  @Get('habit-checkins')
  async listHabitCheckins(
    @Req() req: Request,
    @Query('childId') childId: string,
    @Query('status') status?: string,
  ): Promise<HabitCheckinListResponse> {
    if (!childId) throw new BadRequestException('childId 不能为空');
    await this.assertChild(req, childId);
    const items = await this.taskService.listHabitCheckins(
      childId,
      (status as HabitCheckinStatus) ?? 'pending',
    );
    return { items };
  }

  @Get(':id')
  async getTask(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ task: TaskInstance }> {
    const task = await this.taskService.getTask(id);
    await this.assertChild(req, task.childId);
    return { task };
  }

  @NeedLogin()
  @Post('homework')
  async createHomeworkTask(
    @Req() req: Request,
    @Body() dto: CreateHomeworkTaskDto,
  ): Promise<{ task: TaskInstance }> {
    await this.assertChild(req, dto.childId);
    const task = await this.taskService.createHomeworkTask(dto, this.creatorOf(req));
    return { task };
  }

  @NeedLogin()
  @Post('goal')
  async createGoalTask(
    @Req() req: Request,
    @Body() dto: CreateGoalTaskDto,
  ): Promise<{ task: TaskInstance }> {
    await this.assertChild(req, dto.childId);
    const task = await this.taskService.createGoalTask(dto, this.creatorOf(req));
    return { task };
  }

  @NeedLogin()
  @Post('habit')
  async createHabitTask(
    @Req() req: Request,
    @Body() dto: CreateHabitTaskDto,
  ): Promise<{ task: TaskInstance }> {
    await this.assertChild(req, dto.childId);
    const task = await this.taskService.createHabitTask(dto, this.creatorOf(req));
    return { task };
  }

  /** 家长：审核习惯打卡（通过后发放奖励） */
  @Post('habit-checkins/:id/review')
  async reviewHabitCheckin(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewHabitCheckinDto,
  ): Promise<{ checkin: HabitCheckin }> {
    const { userId } = req.userContext;
    const checkin = await this.taskService.reviewHabitCheckin(
      id,
      dto.approved,
      dto.rejectReason,
      userId,
    );
    await this.assertChild(req, checkin.childId);
    return { checkin };
  }

  /** 习惯任务打卡一次（孩子端） */
  @Post(':id/habit-check')
  async checkHabit(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<HabitCheckResponse> {
    const existing = await this.taskService.getTask(id);
    await this.assertChild(req, existing.childId);
    const result = await this.taskService.checkHabit(id);

    // 需家长确认的习惯：打一条提醒，家长端铃铛能看到
    if (result.pendingApproval) {
      await this.notificationService
        .create({
          childId: result.task.childId,
          type: 'habit_checkin',
          title: '孩子完成了习惯打卡，待确认',
          body: `${result.task.name}（第 ${result.count} 次）`,
          relatedType: 'task',
          relatedId: result.task.id,
        })
        .catch((err: unknown) =>
          this.logger.warn(`写入提醒失败: ${String(err)}`),
        );
    }
    return result;
  }

  @Post(':id/goal-progress')
  async addGoalProgress(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: GoalProgressDto,
  ): Promise<{ task: TaskInstance }> {
    const existing = await this.taskService.getTask(id);
    await this.assertChild(req, existing.childId);
    const task = await this.taskService.addGoalProgress(id, dto.delta);
    return { task };
  }

  @NeedLogin()
  @Patch(':id')
  async updateHomeworkTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateHomeworkTaskDto,
  ): Promise<{ task: TaskInstance }> {
    const existing = await this.taskService.getTask(id);
    await this.assertChild(req, existing.childId);
    const task = await this.taskService.updateHomeworkTask(id, dto);
    return { task };
  }

  @NeedLogin()
  @Post('batch-submit')
  async batchSubmitTasks(
    @Req() req: Request,
    @Body() dto: BatchTaskIdsDto,
  ): Promise<BatchTaskResultResponse> {
    await this.assertTasksOfOwnChild(req, dto.taskIds);
    return this.taskService.batchSubmitTasks(dto.taskIds, dto.completionNote);
  }

  @Post('batch-review')
  async batchReviewTasks(
    @Req() req: Request,
    @Body() dto: BatchTaskIdsDto,
  ): Promise<BatchTaskResultResponse> {
    const { userId } = req.userContext;
    await this.assertTasksOfOwnChild(req, dto.taskIds);
    return this.taskService.batchReviewTasks(dto.taskIds, userId);
  }

  @Post(':id/submit')
  async submitTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: SubmitTaskDto,
  ): Promise<{ task: TaskInstance }> {
    const existing = await this.taskService.getTask(id);
    await this.assertChild(req, existing.childId);
    const task = await this.taskService.submitTask(id, dto.completionNote);
    return { task };
  }

  @NeedLogin()
  @Post(':id/review')
  async reviewTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ReviewTaskDto,
  ): Promise<{ task: TaskInstance }> {
    const { userId } = req.userContext;
    const existing = await this.taskService.getTask(id);
    await this.assertChild(req, existing.childId);
    const task = await this.taskService.reviewTask(
      id,
      dto.approved,
      dto.rejectReason,
      dto.finalPoints,
      userId,
    );
    return { task };
  }

  @NeedLogin()
  @Delete(':id')
  async deleteTask(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    const existing = await this.taskService.getTask(id);
    await this.assertChild(req, existing.childId);
    await this.taskService.deleteTask(id);
    return { ok: true };
  }
}
