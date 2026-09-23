import { Inject, Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, asc, count, lt, ne, inArray, sql, gte, lte, or } from 'drizzle-orm';
import type {
  TaskTemplate,
  TaskInstance,
  CreateTaskTemplateRequest,
  UpdateTaskTemplateRequest,
  TaskListQuery,
  CreateHomeworkTaskRequest,
  CreateGoalTaskRequest,
  UpdateHomeworkTaskRequest,
  TaskStatus,
  HomeworkSubtask,
} from '@shared/api.interface';
import { taskTemplate, taskInstance, child, pointTransaction, homeworkSubtask } from '@server/database/schema';
import { isUniqueViolation } from '@server/common/utils/pg-error';
import { todayString } from '@server/common/utils/date';
import { NotificationService } from '../notification/notification.service';

/**
 * 补提交期限（天）：任务逾期后仍可在该天数内申请补提交。
 * 超过期限后任务不再展示、也无法再提交。
 */
export const LATE_SUBMIT_WINDOW_DAYS = 1;

/** 任务创建者（哪位家长布置的） */
export interface TaskCreator {
  userId: string | null;
  name: string | null;
}

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly notificationService: NotificationService,
  ) {}

  // ==================== 任务模板部分 ====================

  async listTemplates(familyId: string): Promise<TaskTemplate[]> {
    const rows = await this.db
      .select()
      .from(taskTemplate)
      .where(eq(taskTemplate.familyId, familyId))
      .orderBy(asc(taskTemplate.sortOrder), asc(taskTemplate.createdAt));

    return rows.map((row) => ({
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      defaultPoints: row.defaultPoints,
      isDaily: row.isDaily,
      frequency: (row as any).frequency ?? 'daily',
      weekDays: (row as any).weekDays ?? [],
      monthDays: (row as any).monthDays ?? [],
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createTemplate(
    familyId: string,
    data: CreateTaskTemplateRequest,
    creator?: TaskCreator,
  ): Promise<TaskTemplate> {
    const frequency = data.frequency ?? (data.isDaily ? 'daily' : 'daily');
    const [row] = await this.db
      .insert(taskTemplate)
      .values({
        familyId,
        name: data.name,
        defaultPoints: data.defaultPoints,
        isDaily: data.isDaily,
        frequency,
        weekDays: data.weekDays ?? [],
        monthDays: data.monthDays ?? [],
        sortOrder: data.sortOrder ?? 0,
        creatorUserId: creator?.userId ?? null,
        creatorName: creator?.name ?? null,
      })
      .returning();

    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      defaultPoints: row.defaultPoints,
      isDaily: row.isDaily,
      frequency: (row as any).frequency ?? 'daily',
      weekDays: (row as any).weekDays ?? [],
      monthDays: (row as any).monthDays ?? [],
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateTemplate(
    templateId: string,
    data: UpdateTaskTemplateRequest,
    familyId?: string,
  ): Promise<TaskTemplate> {
    const patch: Partial<typeof taskTemplate.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.defaultPoints !== undefined) patch.defaultPoints = data.defaultPoints;
    if (data.isDaily !== undefined) patch.isDaily = data.isDaily;
    if (data.frequency !== undefined) (patch as any).frequency = data.frequency;
    if (data.weekDays !== undefined) (patch as any).weekDays = data.weekDays;
    if (data.monthDays !== undefined) (patch as any).monthDays = data.monthDays;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    const updated = await this.db
      .update(taskTemplate)
      .set(patch)
      .where(
        familyId
          ? and(eq(taskTemplate.id, templateId), eq(taskTemplate.familyId, familyId))
          : eq(taskTemplate.id, templateId),
      )
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException('任务模板不存在');
    }

    const row = updated[0];
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      defaultPoints: row.defaultPoints,
      isDaily: row.isDaily,
      frequency: (row as any).frequency ?? 'daily',
      weekDays: (row as any).weekDays ?? [],
      monthDays: (row as any).monthDays ?? [],
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteTemplate(templateId: string, familyId?: string): Promise<void> {
    const deleted = await this.db
      .delete(taskTemplate)
      .where(
        familyId
          ? and(eq(taskTemplate.id, templateId), eq(taskTemplate.familyId, familyId))
          : eq(taskTemplate.id, templateId),
      )
      .returning({ id: taskTemplate.id });

    if (deleted.length === 0) {
      throw new NotFoundException('任务模板不存在');
    }
  }

  // ==================== 任务实例部分 ====================

  async generateDailyTasks(
    childId: string,
    date: string,
    creator?: TaskCreator,
  ): Promise<TaskInstance[]> {
    const childRecord = await this.db
      .select({ familyId: child.familyId })
      .from(child)
      .where(eq(child.id, childId));

    if (childRecord.length === 0) {
      throw new NotFoundException('孩子不存在');
    }

    const familyId = childRecord[0].familyId;

    const allTemplates = await this.db
      .select()
      .from(taskTemplate)
      .where(
        and(
          eq(taskTemplate.familyId, familyId),
          eq(taskTemplate.isActive, true),
        ),
      );

    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    const dayOfMonth = dateObj.getDate();

    const templates = allTemplates.filter((t: any) => {
      const freq: string = t.frequency ?? 'daily';
      if (freq === 'daily') return t.isDaily === true;
      if (freq === 'weekly') {
        const days: number[] = t.weekDays ?? [];
        return days.includes(dayOfWeek);
      }
      if (freq === 'monthly') {
        const days: number[] = t.monthDays ?? [];
        return days.includes(dayOfMonth);
      }
      return false;
    });

    if (templates.length === 0) {
      this.logger.log(`家庭 ${familyId} 在 ${date} 没有匹配的任务模板`);
      return this.listTasks({ childId, date, type: 'daily' });
    }

    // 查询当天已有的每日任务，避免重复生成
    const existing = await this.db
      .select({ taskTemplateId: taskInstance.taskTemplateId })
      .from(taskInstance)
      .where(
        and(
          eq(taskInstance.childId, childId),
          eq(taskInstance.taskDate, date),
          eq(taskInstance.type, 'daily'),
        ),
      );

    const existingTemplateIds = new Set(
      existing
        .map((r) => r.taskTemplateId)
        .filter((id): id is string => id !== null),
    );

    const newTemplates = templates.filter(
      (t) => !existingTemplateIds.has(t.id),
    );

    if (newTemplates.length === 0) {
      this.logger.log(`孩子 ${childId} 在 ${date} 的每日任务已全部生成`);
      return this.listTasks({ childId, date, type: 'daily' });
    }

    const insertValues = newTemplates.map((t) => ({
      childId,
      taskTemplateId: t.id,
      type: 'daily' as const,
      name: t.name,
      subject: null,
      points: t.defaultPoints,
      difficultyMultiplier: '1.0',
      finalPoints: null,
      deadline: null,
      taskDate: date,
      status: 'pending' as const,
      submitTime: null,
      rejectReason: null,
      completionNote: null,
      // 必要任务：布置人取自模板创建者（模板未记录时回退到本次操作人）
      creatorUserId: t.creatorUserId ?? creator?.userId ?? null,
      creatorName: t.creatorName ?? creator?.name ?? null,
    }));

    let inserted: (typeof taskInstance.$inferSelect)[];
    try {
      inserted = await this.db
        .insert(taskInstance)
        .values(insertValues)
        .returning();
    } catch (error) {
      // 并发 generate-daily：唯一索引(idx_task_instance_daily_unique)生效时，
      // 重复插入会报 23505，此时直接回读当天任务即可。
      if (isUniqueViolation(error)) {
        this.logger.warn(`检测到并发重复生成每日任务，回读已有数据 childId=${childId} date=${date}`);
        return this.listTasks({ childId, date, type: 'daily' });
      }
      throw error;
    }

    this.logger.log(`为孩子 ${childId} 在 ${date} 生成了 ${inserted.length} 个每日任务`);

    return inserted.map((row) => this.mapTaskInstance(row));
  }

  async listTasks(params: TaskListQuery): Promise<TaskInstance[]> {
    // 惰性更新逾期状态：查看某天任务时，顺带把该孩子此前未完成的任务标记为逾期。
    // 失败不影响正常查询。
    if (params.date) {
      await this.markOverdueTasks(params.childId, params.date).catch((err: unknown) => {
        this.logger.warn(`标记逾期任务失败: ${String(err)}`);
      });
    }

    const conditions = [eq(taskInstance.childId, params.childId)];

    if (params.date) {
      // 当天任务；此外，此前仍未完成的任务（待完成/待确认/逾期）也跨天保留显示：
      // 1) 目标型任务不限时间，未达成前一直显示；
      // 2) 逾期任务需要让孩子申请补提交、让家长能看到并审批。
      conditions.push(
        or(
          eq(taskInstance.taskDate, params.date),
          and(
            lt(taskInstance.taskDate, params.date),
            inArray(taskInstance.status, ['pending', 'submitted', 'overdue']),
          ),
        ),
      );
    }
    if (params.date) {
      // 超过补提交期限的逾期任务不再展示（任务记录里仍可按日期查看）
      conditions.push(
        or(
          ne(taskInstance.status, 'overdue'),
          sql`(
            case when ${taskInstance.type} = 'daily'
              then ${taskInstance.taskDate}
              else coalesce(${taskInstance.deadline}, ${taskInstance.taskDate})
            end
          ) + (${taskInstance.extendDays} + ${LATE_SUBMIT_WINDOW_DAYS}) >= ${params.date}::date`,
        ),
      );
    }
    if (params.startDate) {
      conditions.push(gte(taskInstance.taskDate, params.startDate));
    }
    if (params.endDate) {
      conditions.push(lte(taskInstance.taskDate, params.endDate));
    }
    if (params.status) {
      conditions.push(eq(taskInstance.status, params.status));
    }
    if (params.type) {
      conditions.push(eq(taskInstance.type, params.type));
    }

    const rows = await this.db
      .select()
      .from(taskInstance)
      .where(and(...conditions))
      .orderBy(taskInstance.createdAt);

    const mapped = rows.map((row) => this.mapTaskInstance(row));

    // 附带子任务（多项任务）：按 suggestionId 关联 homework_subtask
    const suggestionIds = [
      ...new Set(
        mapped
          .map((t) => t.suggestionId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (suggestionIds.length === 0) {
      return mapped;
    }

    const subtaskRows = await this.db
      .select()
      .from(homeworkSubtask)
      .where(inArray(homeworkSubtask.suggestionId, suggestionIds))
      .orderBy(homeworkSubtask.sortOrder);

    const bySuggestion = new Map<string, HomeworkSubtask[]>();
    for (const st of subtaskRows) {
      const list = bySuggestion.get(st.suggestionId) ?? [];
      list.push({
        id: st.id,
        suggestionId: st.suggestionId,
        content: st.content,
        points: st.points,
        sortOrder: st.sortOrder,
        isCompleted: st.isCompleted,
        createdAt: st.createdAt.toISOString(),
      });
      bySuggestion.set(st.suggestionId, list);
    }

    return mapped.map((t) => {
      const subtasks = t.suggestionId ? bySuggestion.get(t.suggestionId) : undefined;
      return subtasks ? { ...t, subtasks } : t;
    });
  }

  async countTasks(params: TaskListQuery): Promise<number> {
    const conditions = [eq(taskInstance.childId, params.childId)];

    if (params.date) {
      // 与 listTasks 保持一致：当天任务 + 此前未完成的任务
      conditions.push(
        or(
          eq(taskInstance.taskDate, params.date),
          and(
            lt(taskInstance.taskDate, params.date),
            inArray(taskInstance.status, ['pending', 'submitted', 'overdue']),
          ),
        ),
      );
    }
    if (params.date) {
      // 超过补提交期限的逾期任务不再展示（任务记录里仍可按日期查看）
      conditions.push(
        or(
          ne(taskInstance.status, 'overdue'),
          sql`(
            case when ${taskInstance.type} = 'daily'
              then ${taskInstance.taskDate}
              else coalesce(${taskInstance.deadline}, ${taskInstance.taskDate})
            end
          ) + (${taskInstance.extendDays} + ${LATE_SUBMIT_WINDOW_DAYS}) >= ${params.date}::date`,
        ),
      );
    }
    if (params.startDate) {
      conditions.push(gte(taskInstance.taskDate, params.startDate));
    }
    if (params.endDate) {
      conditions.push(lte(taskInstance.taskDate, params.endDate));
    }
    if (params.status) {
      conditions.push(eq(taskInstance.status, params.status));
    }
    if (params.type) {
      conditions.push(eq(taskInstance.type, params.type));
    }

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(taskInstance)
      .where(and(...conditions));

    return Number(total);
  }

  async getTask(taskId: string): Promise<TaskInstance> {
    const rows = await this.db
      .select()
      .from(taskInstance)
      .where(eq(taskInstance.id, taskId));

    if (rows.length === 0) {
      throw new NotFoundException('任务不存在');
    }

    return this.mapTaskInstance(rows[0]);
  }

  async createHomeworkTask(
    data: CreateHomeworkTaskRequest,
    creator?: TaskCreator,
  ): Promise<TaskInstance> {
    const [row] = await this.db
      .insert(taskInstance)
      .values({
        childId: data.childId,
        taskTemplateId: null,
        type: 'homework',
        name: data.name,
        subject: data.subject || null,
        points: data.points,
        difficultyMultiplier: '1.0',
        finalPoints: null,
        deadline: data.deadline ?? null,
        extendDays: data.extendDays ?? 0,
        taskDate: data.taskDate,
        status: 'pending',
        submitTime: null,
        rejectReason: null,
        completionNote: null,
        creatorUserId: creator?.userId ?? null,
        creatorName: creator?.name ?? null,
      })
      .returning();

    this.logger.log(`创建作业任务: ${row.id}, 名称: ${data.name}`);
    return this.mapTaskInstance(row);
  }

  /** 编辑作业任务（仅任务实例字段；子任务由 AI 建议接口处理） */
  async updateHomeworkTask(
    taskId: string,
    data: UpdateHomeworkTaskRequest,
  ): Promise<TaskInstance> {
    const task = await this.getTask(taskId);
    if (task.type !== 'homework' && task.type !== 'goal') {
      throw new BadRequestException('仅作业/目标任务可编辑');
    }

    const patch: Partial<typeof taskInstance.$inferInsert> = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new BadRequestException('任务名称不能为空');
      patch.name = data.name.trim();
    }
    if (data.subject !== undefined) patch.subject = data.subject || null;
    if (data.points !== undefined) {
      if (data.points < 0) throw new BadRequestException('积分不能为负数');
      patch.points = data.points;
    }
    if (data.deadline !== undefined) patch.deadline = data.deadline || null;
    if (data.extendDays !== undefined) {
      patch.extendDays = Math.max(0, Math.floor(Number(data.extendDays) || 0));
    }
    if (data.taskDate !== undefined) patch.taskDate = data.taskDate;
    if (data.targetValue !== undefined) {
      const target = Math.floor(Number(data.targetValue));
      if (!Number.isFinite(target) || target <= 0) {
        throw new BadRequestException('目标值必须为正整数');
      }
      patch.targetValue = target;
    }
    if (data.unit !== undefined) patch.unit = data.unit?.trim() || null;

    if (Object.keys(patch).length === 0) return task;

    const updated = await this.db
      .update(taskInstance)
      .set(patch)
      .where(eq(taskInstance.id, taskId))
      .returning();

    this.logger.log(`更新作业任务 ${taskId}`);
    return this.mapTaskInstance(updated[0]);
  }

  /** 新建目标型任务（不限时间时可省略 deadline） */
  async createGoalTask(
    data: CreateGoalTaskRequest,
    creator?: TaskCreator,
  ): Promise<TaskInstance> {
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('任务名称不能为空');
    }
    const target = Math.floor(Number(data.targetValue));
    if (!Number.isFinite(target) || target <= 0) {
      throw new BadRequestException('目标值必须为正整数');
    }

    const [row] = await this.db
      .insert(taskInstance)
      .values({
        childId: data.childId,
        taskTemplateId: null,
        type: 'goal',
        name: data.name.trim(),
        subject: null,
        points: data.points,
        difficultyMultiplier: '1.0',
        finalPoints: null,
        deadline: data.deadline ?? null,
        extendDays: data.extendDays ?? 0,
        targetValue: target,
        currentValue: 0,
        unit: data.unit?.trim() || null,
        taskDate: data.taskDate,
        status: 'pending',
        submitTime: null,
        rejectReason: null,
        completionNote: null,
        creatorUserId: creator?.userId ?? null,
        creatorName: creator?.name ?? null,
      })
      .returning();

    this.logger.log(`创建目标任务: ${row.id}, ${data.name} 目标 ${target}`);
    return this.mapTaskInstance(row);
  }

  /**
   * 目标型任务记录进度；达到目标后自动提交为「待审核」（需家长审批才算完成）。
   * delta 可为负（撤销）。
   */
  async addGoalProgress(taskId: string, delta: number): Promise<TaskInstance> {
    const task = await this.getTask(taskId);
    if (task.type !== 'goal') {
      throw new BadRequestException('仅目标任务可记录进度');
    }
    if (task.status === 'submitted') {
      throw new BadRequestException('任务已提交，等待家长确认');
    }
    if (task.status === 'completed') {
      throw new BadRequestException('任务已完成');
    }
    if (task.status !== 'pending' && task.status !== 'overdue') {
      throw new BadRequestException(`任务状态为 ${task.status}，无法记录进度`);
    }

    const target = task.targetValue ?? 0;
    const step = Math.round(Number(delta) || 0);
    const next = Math.max(0, Math.min(target, (task.currentValue ?? 0) + step));
    const reached = target > 0 && next >= target;

    const updated = await this.db
      .update(taskInstance)
      .set({
        currentValue: next,
        ...(reached
          ? { status: 'submitted', submitTime: new Date() }
          : {}),
      })
      .where(
        and(
          eq(taskInstance.id, taskId),
          inArray(taskInstance.status, ['pending', 'overdue']),
        ),
      )
      .returning();

    if (updated.length === 0) {
      throw new ConflictException('任务状态已变化，请刷新后重试');
    }

    this.logger.log(
      `目标任务进度 ${taskId}: ${task.currentValue ?? 0} -> ${next}/${target}${reached ? '（已达成，待审核）' : ''}`,
    );

    // 达成目标 -> 提醒家长待确认
    if (reached) {
      await this.notificationService
        .create({
          childId: task.childId,
          type: 'task_submitted',
          title: '孩子达成了目标，待确认',
          body: `${task.name}（${task.points} 积分）`,
          relatedType: 'task',
          relatedId: taskId,
        })
        .catch((err: unknown) =>
          this.logger.warn(`写入提醒失败: ${String(err)}`),
        );
    }
    return this.mapTaskInstance(updated[0]);
  }

  /**
   * 提交任务完成（含逾期补提交）。
   * 任务已逾期时标记 isLateSubmit=true，家长端会显示「补提交」标识，仍需家长审批。
   */
  /** `YYYY-MM-DD` 加天数（UTC 计算，避免时区偏移） */
  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * 补提交截止日（含当天，上海时区）。
   * - 必要任务：任务日期 + 1 天（次日逾期，逾期当天就是最后机会）
   * - 作业/目标：截止日 + 顺延天数 + 1 天
   * - 作业/目标未设截止日：视为不限时间，返回 null
   */
  lateSubmitDeadlineOf(
    task: Pick<TaskInstance, 'type' | 'taskDate' | 'deadline' | 'extendDays'>,
  ): string | null {
    if (task.type === 'daily') {
      return this.addDays(task.taskDate, LATE_SUBMIT_WINDOW_DAYS);
    }
    if (!task.deadline) return null;
    return this.addDays(
      task.deadline,
      (task.extendDays ?? 0) + LATE_SUBMIT_WINDOW_DAYS,
    );
  }

  async submitTask(
    taskId: string,
    completionNote?: string,
    options: { silent?: boolean } = {},
  ): Promise<TaskInstance> {
    // 先读取当前状态，用于判断是否为逾期补提交
    const existing = await this.getTask(taskId);
    const isLateSubmit = existing.status === 'overdue';

    // 逾期任务必须在逾期后 LATE_SUBMIT_WINDOW_DAYS 天内补提交，超期不再接受
    const lateDeadline = this.lateSubmitDeadlineOf(existing);
    if (isLateSubmit && lateDeadline && todayString() > lateDeadline) {
      throw new BadRequestException(
        `补提交期限已过（逾期后 ${LATE_SUBMIT_WINDOW_DAYS} 天内可补提交，已截止 ${lateDeadline}）`,
      );
    }

    // 条件更新避免并发重复提交（check-then-update 之间存在竞态）
    const updated = await this.db
      .update(taskInstance)
      .set({
        status: 'submitted',
        submitTime: new Date(),
        completionNote: completionNote ?? null,
        isLateSubmit,
      })
      .where(
        and(
          eq(taskInstance.id, taskId),
          inArray(taskInstance.status, ['pending', 'overdue']),
        ),
      )
      .returning();

    if (updated.length === 0) {
      const task = await this.getTask(taskId);
      throw new BadRequestException(`任务状态为 ${task.status}，无法提交完成`);
    }

    this.logger.log(
      `任务 ${taskId} ${isLateSubmit ? '逾期补提交' : '提交完成'}，状态变为 submitted`,
    );
    // 批量提交时由调用方汇总成一条提醒（silent）
    if (options.silent) return this.mapTaskInstance(updated[0]);

    // 提醒家长待确认（失败不影响提交结果）
    const noteText = completionNote ? `：${completionNote}` : '';
    await this.notificationService
      .create({
        childId: updated[0].childId,
        type: 'task_submitted',
        title: isLateSubmit
          ? '孩子申请补提交逾期任务，待确认'
          : '孩子提交了任务，待确认',
        body: `${updated[0].name}（${updated[0].points} 积分）${noteText}`,
        relatedType: 'task',
        relatedId: taskId,
      })
      .catch((err: unknown) =>
        this.logger.warn(`写入提醒失败: ${String(err)}`),
      );
    return this.mapTaskInstance(updated[0]);
  }

  /**
   * 批量提交（孩子端多选一起交）：逐个尝试，返回成功/失败明细。
   * 成功的任务合并为一条家长提醒，避免一次弹出多条。
   */
  async batchSubmitTasks(
    taskIds: string[],
    completionNote?: string,
  ): Promise<{
    submitted: TaskInstance[];
    failed: Array<{ taskId: string; reason: string }>;
  }> {
    const submitted: TaskInstance[] = [];
    const failed: Array<{ taskId: string; reason: string }> = [];

    for (const taskId of taskIds) {
      try {
        submitted.push(
          await this.submitTask(taskId, completionNote, { silent: true }),
        );
      } catch (error) {
        failed.push({
          taskId,
          reason:
            error instanceof Error ? error.message : '提交失败，请重试',
        });
      }
    }

    if (submitted.length > 0) {
      const names = submitted.map((t) => t.name);
      const totalPoints = submitted.reduce((sum, t) => sum + t.points, 0);
      const lateCount = submitted.filter((t) => t.isLateSubmit).length;
      const title =
        lateCount === submitted.length
          ? `孩子申请补提交 ${submitted.length} 个任务，待确认`
          : `孩子提交了 ${submitted.length} 个任务，待确认`;
      const noteText = completionNote ? `：${completionNote}` : '';
      await this.notificationService
        .create({
          childId: submitted[0].childId,
          type: 'task_submitted',
          title,
          body: `${names.join('、')}（共 ${totalPoints} 积分）${
            lateCount > 0 ? `，其中 ${lateCount} 个为逾期补提交` : ''
          }${noteText}`,
          relatedType: 'task',
          relatedId: submitted[0].id,
        })
        .catch((err: unknown) =>
          this.logger.warn(`写入提醒失败: ${String(err)}`),
        );
      this.logger.log(`批量提交完成：${submitted.length} 个成功，${failed.length} 个失败`);
    }

    return { submitted, failed };
  }

  /**
   * 批量审核通过（家长端「全部通过」）：逐个走单条审核事务，返回明细。
   */
  async batchReviewTasks(
    taskIds: string[],
    operatorUserId?: string,
  ): Promise<{
    approved: TaskInstance[];
    failed: Array<{ taskId: string; reason: string }>;
  }> {
    const approved: TaskInstance[] = [];
    const failed: Array<{ taskId: string; reason: string }> = [];

    for (const taskId of taskIds) {
      try {
        approved.push(
          await this.reviewTask(taskId, true, undefined, undefined, operatorUserId),
        );
      } catch (error) {
        failed.push({
          taskId,
          reason: error instanceof Error ? error.message : '审核失败',
        });
      }
    }

    if (approved.length > 0) {
      this.logger.log(`批量审核通过 ${approved.length} 个任务，${failed.length} 个失败`);
    }
    return { approved, failed };
  }

  async reviewTask(
    taskId: string,
    approved: boolean,
    rejectReason?: string,
    finalPoints?: number,
    operatorUserId?: string,
  ): Promise<TaskInstance> {
    const task = await this.getTask(taskId);

    if (task.status !== 'submitted') {
      throw new BadRequestException(
        `任务状态为 ${task.status}，无法审核`,
      );
    }

    if (approved) {
      // 审核通过：更新状态 + 发放积分（事务保证原子性）
      const calculatedFinalPoints = finalPoints ?? Math.round(
        task.points * task.difficultyMultiplier,
      );

      const result = await this.db.transaction(async (tx) => {
        // 1. 条件更新任务状态，避免并发重复审核导致积分重复发放
        const taskUpdated = await tx
          .update(taskInstance)
          .set({
            status: 'completed',
            finalPoints: calculatedFinalPoints,
          })
          .where(
            and(
              eq(taskInstance.id, taskId),
              eq(taskInstance.status, 'submitted'),
            ),
          )
          .returning();

        if (taskUpdated.length === 0) {
          throw new ConflictException('任务状态已变化，无法重复审核');
        }

        // 2. 获取当前积分余额
        const childRecord = await tx
          .select({ points: child.points })
          .from(child)
          .where(eq(child.id, task.childId));

        if (childRecord.length === 0) {
          throw new NotFoundException('孩子不存在');
        }

        const currentBalance = childRecord[0].points;
        const newBalance = currentBalance + calculatedFinalPoints;

        // 3. 更新孩子积分余额
        await tx
          .update(child)
          .set({ points: newBalance })
          .where(eq(child.id, task.childId));

        // 4. 写入积分流水
        await tx.insert(pointTransaction).values({
          childId: task.childId,
          changeAmount: calculatedFinalPoints,
          balanceAfter: newBalance,
          type: 'earn',
          relatedType: 'task',
          relatedId: taskId,
          reason: `完成任务：${task.name}`,
          operator: operatorUserId ?? null,
        });

        return taskUpdated[0];
      });

      this.logger.log(
        `任务 ${taskId} 审核通过，发放 ${calculatedFinalPoints} 积分`,
      );
      return this.mapTaskInstance(result);
    } else {
      // 审核驳回：状态变为 rejected，记录驳回原因（条件更新防并发）
      const updated = await this.db
        .update(taskInstance)
        .set({
          status: 'rejected',
          rejectReason: rejectReason ?? null,
        })
        .where(
          and(
            eq(taskInstance.id, taskId),
            eq(taskInstance.status, 'submitted'),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new ConflictException('任务状态已变化，无法重复审核');
      }

      this.logger.log(`任务 ${taskId} 审核驳回，原因: ${rejectReason ?? '无'}`);
      return this.mapTaskInstance(updated[0]);
    }
  }

  /**
   * 子任务全部完成后，自动把作业任务置为「待审核」，等待家长审批。
   * 注意：所有作业任务都必须家长审批通过才算完成（不再自动完成/发分）。
   */
  async autoSubmitBySubtasks(taskId: string): Promise<TaskInstance | null> {
    const task = await this.getTask(taskId);
    if (task.status !== 'pending' && task.status !== 'overdue') return null;
    try {
      return await this.submitTask(taskId, '子任务已全部完成，等待家长确认');
    } catch (error) {
      // 并发下可能已被其他请求提交/审核
      const latest = await this.getTask(taskId).catch(() => null);
      if (latest && latest.status !== 'pending' && latest.status !== 'overdue') {
        return latest;
      }
      throw error;
    }
  }

  async markOverdueTasks(childId: string, date: string): Promise<number> {
    // 作业/目标任务：截止日 + 顺延天数 已过仍未提交（顺延期内不算逾期）
    const homeworkOverdue = await this.db
      .update(taskInstance)
      .set({ status: 'overdue' })
      .where(
        and(
          eq(taskInstance.childId, childId),
          inArray(taskInstance.type, ['homework', 'goal']),
          eq(taskInstance.status, 'pending'),
          sql`(${taskInstance.deadline} + make_interval(days => ${taskInstance.extendDays})) < ${date}::date`,
        ),
      )
      .returning({ id: taskInstance.id });

    // 必要任务：任务日期早于指定日期仍未完成
    const dailyOverdue = await this.db
      .update(taskInstance)
      .set({ status: 'overdue' })
      .where(
        and(
          eq(taskInstance.childId, childId),
          eq(taskInstance.type, 'daily'),
          eq(taskInstance.status, 'pending'),
          lt(taskInstance.taskDate, date),
        ),
      )
      .returning({ id: taskInstance.id });

    const total = homeworkOverdue.length + dailyOverdue.length;
    if (total > 0) {
      this.logger.log(`标记了 ${total} 个逾期任务`);
    }
    return total;
  }

  async deleteTask(taskId: string): Promise<void> {
    const deleted = await this.db
      .delete(taskInstance)
      .where(eq(taskInstance.id, taskId))
      .returning({ id: taskInstance.id });

    if (deleted.length === 0) {
      throw new NotFoundException('任务不存在');
    }
  }

  // ==================== 辅助方法 ====================

  private mapTaskInstance(row: typeof taskInstance.$inferSelect): TaskInstance {
    return {
      id: row.id,
      childId: row.childId,
      taskTemplateId: row.taskTemplateId ?? null,
      suggestionId: row.suggestionId ?? null,
      type: row.type as TaskInstance['type'],
      name: row.name,
      subject: row.subject ?? null,
      points: row.points,
      difficultyMultiplier: Number(row.difficultyMultiplier),
      targetValue: row.targetValue ?? null,
      currentValue: row.currentValue ?? 0,
      unit: row.unit ?? null,
      finalPoints: row.finalPoints ?? null,
      deadline: row.deadline ? String(row.deadline) : null,
      extendDays: row.extendDays ?? 0,
      taskDate: String(row.taskDate),
      status: row.status as TaskStatus,
      submitTime: row.submitTime ? row.submitTime.toISOString() : null,
      rejectReason: row.rejectReason ?? null,
      completionNote: row.completionNote ?? null,
      isLateSubmit: row.isLateSubmit ?? false,
      creatorUserId: row.creatorUserId ?? null,
      creatorName: row.creatorName ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
