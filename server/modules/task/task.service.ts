import { Inject, Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, asc, count, lt, inArray, sql, gte, lte, or } from 'drizzle-orm';
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
import { NotificationService } from '../notification/notification.service';

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

  async generateDailyTasks(childId: string, date: string): Promise<TaskInstance[]> {
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
      // 当天任务；此外，目标型任务只要未完成（待完成/待确认/逾期）就跨天保留显示，
      // 避免“不限时间”的目标因日期变化而从任务池/孩子端消失。
      conditions.push(
        or(
          eq(taskInstance.taskDate, params.date),
          and(
            eq(taskInstance.type, 'goal'),
            inArray(taskInstance.status, ['pending', 'submitted', 'overdue']),
          ),
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
      conditions.push(
        or(
          eq(taskInstance.taskDate, params.date),
          and(
            eq(taskInstance.type, 'goal'),
            inArray(taskInstance.status, ['pending', 'submitted', 'overdue']),
          ),
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

  async createHomeworkTask(data: CreateHomeworkTaskRequest): Promise<TaskInstance> {    const [row] = await this.db
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
  async createGoalTask(data: CreateGoalTaskRequest): Promise<TaskInstance> {
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

  async submitTask(taskId: string, completionNote?: string): Promise<TaskInstance> {
    // 条件更新避免并发重复提交（check-then-update 之间存在竞态）
    const updated = await this.db
      .update(taskInstance)
      .set({
        status: 'submitted',
        submitTime: new Date(),
        completionNote: completionNote ?? null,
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

    this.logger.log(`任务 ${taskId} 提交完成，状态变为 submitted`);
    // 提醒家长待确认（失败不影响提交结果）
    await this.notificationService
      .create({
        childId: updated[0].childId,
        type: 'task_submitted',
        title: '孩子提交了任务，待确认',
        body: `${updated[0].name}（${updated[0].points} 积分）`,
        relatedType: 'task',
        relatedId: taskId,
      })
      .catch((err: unknown) =>
        this.logger.warn(`写入提醒失败: ${String(err)}`),
      );
    return this.mapTaskInstance(updated[0]);
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
      createdAt: row.createdAt.toISOString(),
    };
  }
}
