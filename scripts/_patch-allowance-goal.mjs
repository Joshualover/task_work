/**
 * 一次性补丁：零花钱目标同步逻辑
 *  - listTasks / getTask：linkedAllowanceGoal 任务的 currentValue 由余额折算（元）
 *  - syncAllowanceGoals：余额达到目标值 → 自动提交待家长确认
 *  - addGoalProgress：跟随余额的目标不允许手动记进度
 *  - listTasks 中调用同步
 */
import fs from 'node:fs';

const file = 'server/modules/task/task.service.ts';
let s = fs.readFileSync(file, 'utf8');

function rep(from, to, exp = 1) {
  const n = s.split(from).length - 1;
  if (n !== exp) {
    console.error(`❌ 锚点数 ${n} 预期 ${exp}: ${JSON.stringify(from.slice(0, 70))}`);
    process.exit(1);
  }
  s = s.split(from).join(to);
}

// 1) 辅助方法：余额折算的元数 + 覆盖进度 + 自动达成
rep(
  `  async getTask(taskId: string): Promise<TaskInstance> {`,
  `  /** 零花钱余额折算成「元」（向下取整），用于零花钱目标的进度 */
  private async allowanceYuanOf(childId: string): Promise<number> {
    const [row] = await this.db
      .select({ balance: child.allowanceBalance })
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);
    return Math.max(0, Math.floor((row?.balance ?? 0) / 100));
  }

  /** 把「跟随零花钱余额」的目标进度覆盖为当前余额（元） */
  private async applyAllowanceGoalProgress(
    tasks: TaskInstance[],
  ): Promise<TaskInstance[]> {
    const linked = tasks.filter(
      (t) => t.linkedAllowanceGoal && t.type === 'goal',
    );
    if (linked.length === 0) return tasks;
    const yuan = await this.allowanceYuanOf(linked[0].childId);
    const ids = new Set(linked.map((t) => t.id));
    return tasks.map((t) => (ids.has(t.id) ? { ...t, currentValue: yuan } : t));
  }

  /**
   * 零花钱目标自动达成：余额（元）>= 目标值时，自动提交为「待确认」等家长审批。
   * 与逾期标记一样，在读取列表时惰性执行，避免每次余额变动都要扫库。
   */
  async syncAllowanceGoals(childId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(taskInstance)
      .where(
        and(
          eq(taskInstance.childId, childId),
          eq(taskInstance.type, 'goal'),
          eq(taskInstance.linkedAllowanceGoal, true),
          inArray(taskInstance.status, ['pending', 'overdue']),
        ),
      );
    if (rows.length === 0) return 0;

    const yuan = await this.allowanceYuanOf(childId);
    let submitted = 0;
    for (const row of rows) {
      const target = row.targetValue ?? 0;
      if (target <= 0 || yuan < target) continue;
      try {
        await this.submitTask(
          row.id,
          \`零花钱余额已达 \${yuan} 元，自动达成目标\`,
        );
        submitted += 1;
      } catch (err) {
        // 并发下可能已被提交/审核，忽略
        this.logger.warn(\`零花钱目标自动提交失败 \${row.id}: \${String(err)}\`);
      }
    }
    if (submitted > 0) {
      this.logger.log(
        \`零花钱目标自动达成 \${submitted} 个（余额 \${yuan} 元）\`,
      );
    }
    return submitted;
  }

  async getTask(taskId: string): Promise<TaskInstance> {`,
);

// 2) getTask 返回前覆盖进度
rep(
  `    if (rows.length === 0) {
      throw new NotFoundException('任务不存在');
    }

    return this.mapTaskInstance(rows[0]);
  }`,
  `    if (rows.length === 0) {
      throw new NotFoundException('任务不存在');
    }

    const task = this.mapTaskInstance(rows[0]);
    if (task.linkedAllowanceGoal && task.type === 'goal') {
      task.currentValue = await this.allowanceYuanOf(task.childId);
    }
    return task;
  }`,
);

// 3) listTasks：同步 + 覆盖进度
rep(
  `    if (params.date) {
      await this.markOverdueTasks(params.childId, params.date).catch((err: unknown) => {
        this.logger.warn(\`标记逾期任务失败: \${String(err)}\`);
      });
    }`,
  `    if (params.date) {
      await this.markOverdueTasks(params.childId, params.date).catch((err: unknown) => {
        this.logger.warn(\`标记逾期任务失败: \${String(err)}\`);
      });
    }

    // 零花钱目标：余额达标则自动提交待确认（惰性同步，失败不影响查询）
    await this.syncAllowanceGoals(params.childId).catch((err: unknown) => {
      this.logger.warn(\`同步零花钱目标失败: \${String(err)}\`);
    });`,
);

rep(
  `    const mapped = rows.map((row) => this.mapTaskInstance(row));`,
  `    const mapped = await this.applyAllowanceGoalProgress(
      rows.map((row) => this.mapTaskInstance(row)),
    );`,
);

// 4) addGoalProgress：跟随余额的目标禁止手动记进度
rep(
  `    if (task.status !== 'pending' && task.status !== 'overdue') {
      throw new ConflictException('任务状态已变化，请刷新后重试');
    }`,
  `    if (task.linkedAllowanceGoal) {
      throw new BadRequestException(
        '该目标的进度跟随零花钱余额自动更新，无需手动记录',
      );
    }

    if (task.status !== 'pending' && task.status !== 'overdue') {
      throw new ConflictException('任务状态已变化，请刷新后重试');
    }`,
);

fs.writeFileSync(file, s);
console.log('✅ 零花钱目标同步逻辑已加入');
