import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { sql, eq } from 'drizzle-orm';
import { taskInstance, pointTransaction, redemption, child } from '@server/database/schema';
import type { ReportRange, ReportStatsResponse } from '@shared/api.interface';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getStats(childId: string, familyId: string, range: ReportRange = 'week'): Promise<ReportStatsResponse> {
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

    // 5. Daily trend for the selected range (week = 近7天, month = 近30天)
    //    按「上海自然日」聚合：每天获得积分 + 每天任务完成率
    const days = range === 'month' ? 30 : 7;
    const trendDates = this.getRecentDates(shanghaiNow, days); // oldest -> newest
    const oldestDate = trendDates[0];
    const newestDate = trendDates[trendDates.length - 1];

    const dailyTasksRows = await this.db.execute(sql<{ day: string; completed: string; total_final: string }>`
      SELECT
        to_char(${taskInstance.taskDate}, 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE ${taskInstance.status} = 'completed')::bigint AS completed,
        count(*) FILTER (WHERE ${taskInstance.status} IN ('completed', 'overdue', 'rejected'))::bigint AS total_final
      FROM ${taskInstance}
      WHERE ${taskInstance.childId} = ${childId}::uuid
        AND ${taskInstance.taskDate} >= ${oldestDate}::date
        AND ${taskInstance.taskDate} <= ${newestDate}::date
      GROUP BY day
      ORDER BY day
    `);

    const dailyPointsRows = await this.db.execute(sql<{ day: string; points: string }>`
      SELECT
        to_char((${pointTransaction.createdAt} AT TIME ZONE 'Asia/Shanghai')::date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(${pointTransaction.changeAmount}), 0)::bigint AS points
      FROM ${pointTransaction}
      WHERE ${pointTransaction.childId} = ${childId}::uuid
        AND ${pointTransaction.type} = 'earn'
        AND (${pointTransaction.createdAt} AT TIME ZONE 'Asia/Shanghai')::date >= ${oldestDate}::date
        AND (${pointTransaction.createdAt} AT TIME ZONE 'Asia/Shanghai')::date <= ${newestDate}::date
      GROUP BY day
      ORDER BY day
    `);

    const dailyTaskMap = new Map<string, { completed: number; totalFinal: number }>();
    for (const row of dailyTasksRows as unknown as Array<{ day: string; completed: string; total_final: string }>) {
      dailyTaskMap.set(row.day, {
        completed: Number(row.completed),
        totalFinal: Number(row.total_final),
      });
    }
    const dailyPointsMap = new Map<string, number>();
    for (const row of dailyPointsRows as unknown as Array<{ day: string; points: string }>) {
      dailyPointsMap.set(row.day, Number(row.points));
    }

    const trend = trendDates.map((date) => {
      const taskData = dailyTaskMap.get(date);
      const totalFinal = taskData?.totalFinal ?? 0;
      const completed = taskData?.completed ?? 0;
      return {
        date,
        points: dailyPointsMap.get(date) ?? 0,
        completionRate: totalFinal > 0 ? completed / totalFinal : 0,
      };
    });

    this.logger.log(`Report stats loaded for child ${childId} (range=${range})`);

    return {
      lastWeekCompletedTasks,
      dailyTaskCompletionRate,
      totalPointsEarned,
      totalRedemptions,
      trend,
    };
  }

  /**
   * 返回最近 N 个「上海自然日」的日期串（oldest -> newest）
   */
  private getRecentDates(shanghaiNow: Date, days: number): string[] {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(shanghaiNow);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(this.toDateString(d));
    }
    return dates;
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
