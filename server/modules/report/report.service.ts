import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { sql, eq } from 'drizzle-orm';
import { taskInstance, pointTransaction, redemption, child } from '@server/database/schema';
import type { ReportStatsResponse } from '@shared/api.interface';

interface WeeklyRow {
  weekStart: string;
  points: number;
  completed: number;
  totalFinal: number;
  completionRate: number;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getStats(childId: string, familyId: string): Promise<ReportStatsResponse> {
    // 校验孩子归属，避免跨家庭读取报表
    const childRows = await this.db
      .select({ familyId: child.familyId })
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);
    if (childRows.length === 0 || childRows[0].familyId !== familyId) {
      throw new NotFoundException('孩子不存在');
    }

    const now = new Date();
    // Compute week boundaries in Asia/Shanghai (UTC+8). We work with "natural week = Mon..Sun".
    // All date strings passed into raw SQL are ISO date strings (yyyy-mm-dd).
    const { weekStarts } = this.getRecentWeekStarts(now, 4);

    // Range for "last week" = weekStarts[1] (inclusive) to weekStarts[0] (exclusive)
    // weekStarts[0] = this Monday, weekStarts[1] = last Monday ...
    const lastWeekStart = weekStarts[1];
    const lastWeekEnd = weekStarts[0];

    // Last 7 days (for dailyTaskCompletionRate, as per spec "近7天")
    // Use Shanghai time for natural day boundaries
    const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStr = this.toDateString(shanghaiNow);
    const sevenDaysAgoShanghai = new Date(shanghaiNow);
    sevenDaysAgoShanghai.setUTCDate(sevenDaysAgoShanghai.getUTCDate() - 6);
    const sevenDaysAgoStr = this.toDateString(sevenDaysAgoShanghai);

    // 1. Last week completed tasks count
    const lastWeekCompletedRows = await this.db.execute(sql<{ count: string }>`
      SELECT count(*)::bigint AS count
      FROM ${taskInstance}
      WHERE ${taskInstance.childId} = ${childId}::uuid
        AND ${taskInstance.status} = 'completed'
        AND ${taskInstance.taskDate} >= ${lastWeekStart}::date
        AND ${taskInstance.taskDate} < ${lastWeekEnd}::date
    `);
    const lastWeekCompletedTasks = Number(lastWeekCompletedRows[0]?.count ?? 0);

    // 2. Daily task completion rate for last 7 days (daily tasks only)
    //    rate = completed / (completed + overdue + rejected)
    const rateRows = await this.db.execute(sql<{ completed: string; total_final: string }>`
      SELECT
        count(*) FILTER (WHERE ${taskInstance.status} = 'completed')::bigint AS completed,
        count(*) FILTER (WHERE ${taskInstance.status} IN ('completed', 'overdue', 'rejected'))::bigint AS total_final
      FROM ${taskInstance}
      WHERE ${taskInstance.childId} = ${childId}::uuid
        AND ${taskInstance.type} = 'daily'
        AND ${taskInstance.taskDate} >= ${sevenDaysAgoStr}::date
        AND ${taskInstance.taskDate} <= ${todayStr}::date
    `);
    const completedCount = Number(rateRows[0]?.completed ?? 0);
    const totalFinalCount = Number(rateRows[0]?.total_final ?? 0);
    const dailyTaskCompletionRate = totalFinalCount > 0 ? completedCount / totalFinalCount : 0;

    // 3. Total points earned (type = 'earn')
    const pointsEarnedRows = await this.db.execute(sql<{ total: string }>`
      SELECT COALESCE(SUM(${pointTransaction.changeAmount}), 0)::bigint AS total
      FROM ${pointTransaction}
      WHERE ${pointTransaction.childId} = ${childId}::uuid
        AND ${pointTransaction.type} = 'earn'
    `);
    const totalPointsEarned = Number(pointsEarnedRows[0]?.total ?? 0);

    // 4. Total approved redemptions
    const redemptionRows = await this.db.execute(sql<{ count: string }>`
      SELECT count(*)::bigint AS count
      FROM ${redemption}
      WHERE ${redemption.childId} = ${childId}::uuid
        AND ${redemption.status} = 'approved'
    `);
    const totalRedemptions = Number(redemptionRows[0]?.count ?? 0);

    // 5. Weekly trend for last 4 weeks (including current partial week)
    //    weekStart (Monday), points earned that week, task completion rate that week
    const oldestWeekStart = weekStarts[weekStarts.length - 1];
    // thisWeekEnd = this Monday + 7 days = next Monday (exclusive end)
    const thisWeekEndDate = new Date(`${weekStarts[0]}T00:00:00Z`);
    thisWeekEndDate.setUTCDate(thisWeekEndDate.getUTCDate() + 7);
    const thisWeekEnd = this.toDateString(thisWeekEndDate);

    const weeklyTasksRows = await this.db.execute(sql<{ week_start: string; completed: string; total_final: string }>`
      SELECT
        to_char(date_trunc('week', ${taskInstance.taskDate}::timestamp)::date, 'YYYY-MM-DD') AS week_start,
        count(*) FILTER (WHERE ${taskInstance.status} = 'completed')::bigint AS completed,
        count(*) FILTER (WHERE ${taskInstance.status} IN ('completed', 'overdue', 'rejected'))::bigint AS total_final
      FROM ${taskInstance}
      WHERE ${taskInstance.childId} = ${childId}::uuid
        AND ${taskInstance.taskDate} >= ${oldestWeekStart}::date
        AND ${taskInstance.taskDate} < ${thisWeekEnd}::date
      GROUP BY date_trunc('week', ${taskInstance.taskDate}::timestamp)::date
      ORDER BY week_start DESC
    `);

    const weeklyPointsRows = await this.db.execute(sql<{ week_start: string; points: string }>`
      SELECT
        to_char(date_trunc('week', ${pointTransaction.createdAt})::date, 'YYYY-MM-DD') AS week_start,
        COALESCE(SUM(${pointTransaction.changeAmount}), 0)::bigint AS points
      FROM ${pointTransaction}
      WHERE ${pointTransaction.childId} = ${childId}::uuid
        AND ${pointTransaction.type} = 'earn'
        AND ${pointTransaction.createdAt} >= ${oldestWeekStart}::date
        AND ${pointTransaction.createdAt} < ${thisWeekEnd}::date
      GROUP BY date_trunc('week', ${pointTransaction.createdAt})::date
      ORDER BY week_start DESC
    `);

    interface WeeklyTaskRow {
      week_start: string;
      completed: string;
      total_final: string;
    }
    interface WeeklyPointsRow {
      week_start: string;
      points: string;
    }

    const taskMap = new Map<string, { completed: number; totalFinal: number }>();
    for (const row of weeklyTasksRows as unknown as WeeklyTaskRow[]) {
      taskMap.set(row.week_start, {
        completed: Number(row.completed),
        totalFinal: Number(row.total_final),
      });
    }
    const pointsMap = new Map<string, number>();
    for (const row of weeklyPointsRows as unknown as WeeklyPointsRow[]) {
      pointsMap.set(row.week_start, Number(row.points));
    }

    // weekStarts is ordered from latest (this week) to oldest (3 weeks ago)
    const weeklyTrend: WeeklyRow[] = weekStarts.map((weekStart: string) => {
      const taskData = taskMap.get(weekStart) ?? { completed: 0, totalFinal: 0 };
      const points = pointsMap.get(weekStart) ?? 0;
      const completionRate = taskData.totalFinal > 0 ? taskData.completed / taskData.totalFinal : 0;
      return {
        weekStart,
        points,
        completed: taskData.completed,
        totalFinal: taskData.totalFinal,
        completionRate,
      };
    });

    this.logger.log(`Report stats loaded for child ${childId}`);

    return {
      lastWeekCompletedTasks,
      dailyTaskCompletionRate,
      totalPointsEarned,
      totalRedemptions,
      weeklyTrend: [...weeklyTrend].reverse().map((item) => ({
        week: item.weekStart,
        points: item.points,
        completionRate: item.completionRate,
      })),
    };
  }

  /**
   * Returns recent Monday dates (week start), ordered from newest to oldest.
   * count=4 returns [thisMonday, lastMonday, twoWeeksAgoMonday, threeWeeksAgoMonday]
   */
  private getRecentWeekStarts(now: Date, count: number): { weekStarts: string[] } {
    const weekStarts: string[] = [];
    // Adjust to Asia/Shanghai (UTC+8) for "natural day" calculation
    const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    // In JS: 0 = Sunday, 1 = Monday. We want Monday as start of week.
    const day = shanghaiNow.getUTCDay();
    const daysSinceMonday = (day + 6) % 7; // 0 on Monday, 6 on Sunday

    // This Monday (start of current week)
    const thisMonday = new Date(shanghaiNow);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);
    thisMonday.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < count; i++) {
      const d = new Date(thisMonday);
      d.setUTCDate(d.getUTCDate() - i * 7);
      weekStarts.push(this.toDateString(d));
    }
    return { weekStarts };
  }

  private toDateString(d: Date): string {
    // Output as YYYY-MM-DD in UTC (Shanghai-adjusted dates come in already shifted)
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }


}
