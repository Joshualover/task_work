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
import { FamilyService } from '../family/family.service';
import type {
  TaskTemplate,
  TaskTemplateListResponse,
  CreateTaskTemplateRequest,
  UpdateTaskTemplateRequest,
  TaskListResponse,
  TaskListQuery,
  CreateHomeworkTaskRequest,
  UpdateHomeworkTaskRequest,
  SubmitTaskRequest,
  ReviewTaskRequest,
  TaskInstance,
  TaskStatus,
  TaskType,
} from '@shared/api.interface';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsIn,
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
  @Type(() => String)
  @IsIn(['pending', 'submitted', 'completed', 'overdue', 'rejected'])
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @IsIn(['daily', 'homework'])
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
  ) {}

  /** 校验孩子属于当前登录用户家庭 */
  private async assertChild(req: Request, childId: string): Promise<void> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);
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
    const template = await this.taskService.createTemplate(family.id, dto);
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
    const items = await this.taskService.generateDailyTasks(dto.childId, dto.date);
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
    const task = await this.taskService.createHomeworkTask(dto);
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
