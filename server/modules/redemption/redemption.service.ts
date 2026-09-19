import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, inArray, gte, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { redemption, reward, child, pointTransaction, allowanceTransaction } from '@server/database/schema';
import { periodRangeUtc } from '@server/common/utils/date';
import type { RedemptionStatus } from '@shared/api.interface';

@Injectable()
export class RedemptionService {
  private readonly logger = new Logger(RedemptionService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async listRedemptions(params: {
    childId?: string;
    status?: string;
    familyId?: string;
  }): Promise<Array<{
    id: string;
    childId: string;
    rewardId: string;
    rewardName: string;
    pointsCost: number;
    status: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }>> {
    const conditions = [];

    if (params.familyId) {
      const childIdsResult = await this.db
        .select({ id: child.id })
        .from(child)
        .where(eq(child.familyId, params.familyId));
      const childIds = childIdsResult.map((c) => c.id);
      if (childIds.length === 0) {
        return [];
      }
      conditions.push(inArray(redemption.childId, childIds));
    }

    if (params.childId) {
      conditions.push(eq(redemption.childId, params.childId));
    }
    if (params.status) {
      conditions.push(eq(redemption.status, params.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select()
      .from(redemption)
      .where(whereClause)
      .orderBy(desc(redemption.createdAt));

    return results.map((r) => ({
      id: r.id,
      childId: r.childId,
      rewardId: r.rewardId,
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    }));
  }

  async getRedemption(redemptionId: string): Promise<{
    id: string;
    childId: string;
    rewardId: string;
    rewardName: string;
    pointsCost: number;
    status: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }> {
    const result = await this.db
      .select()
      .from(redemption)
      .where(eq(redemption.id, redemptionId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('兑换记录不存在');
    }

    const r = result[0];
    return {
      id: r.id,
      childId: r.childId,
      rewardId: r.rewardId,
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    };
  }

  async createRedemption(
    childId: string,
    rewardId: string,
  ): Promise<{
    id: string;
    childId: string;
    rewardId: string;
    rewardName: string;
    pointsCost: number;
    status: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }> {
    // 校验奖励是否存在且上架
    const rewardResult = await this.db
      .select()
      .from(reward)
      .where(eq(reward.id, rewardId))
      .limit(1);

    if (rewardResult.length === 0) {
      throw new NotFoundException('奖励不存在');
    }

    const rw = rewardResult[0];
    if (!rw.isActive) {
      throw new BadRequestException('奖励已下架');
    }

    // 兑奖频率与额度校验（每天/每周/每月 次数与积分上限）
    const frequency = rw.frequency ?? 'unlimited';
    if (frequency !== 'unlimited') {
      const range = periodRangeUtc(
        frequency as 'daily' | 'weekly' | 'monthly',
      );
      const used = await this.db
        .select({ pointsCost: redemption.pointsCost })
        .from(redemption)
        .where(
          and(
            eq(redemption.childId, childId),
            eq(redemption.rewardId, rewardId),
            inArray(redemption.status, ['pending', 'approved']),
            gte(redemption.createdAt, range.start),
            lt(redemption.createdAt, range.end),
          ),
        );
      const periodLabel =
        frequency === 'daily' ? '每天' : frequency === 'weekly' ? '每周' : '每月';

      if (rw.limitCount != null && used.length + 1 > rw.limitCount) {
        throw new ConflictException(
          `${periodLabel}最多兑换 ${rw.limitCount} 次「${rw.name}」，本期已兑换 ${used.length} 次`,
        );
      }
      const usedPoints = used.reduce((sum, r) => sum + r.pointsCost, 0);
      if (
        rw.limitPoints != null &&
        usedPoints + rw.pointsRequired > rw.limitPoints
      ) {
        throw new ConflictException(
          `${periodLabel}「${rw.name}」最多消耗 ${rw.limitPoints} 积分，本期已消耗 ${usedPoints} 积分`,
        );
      }
    }

    // 使用事务：原子扣减积分 + 创建兑换记录 + 写入流水
    const result = await this.db.transaction(async (tx) => {
      // 原子扣减并校验余额充足
      const childUpdated = await tx
        .update(child)
        .set({ points: sql<number>`${child.points} - ${rw.pointsRequired}` })
        .where(and(eq(child.id, childId), gte(child.points, rw.pointsRequired)))
        .returning({ points: child.points });

      if (childUpdated.length === 0) {
        // 区分孩子不存在 vs 余额不足
        const childExists = await tx
          .select({ id: child.id })
          .from(child)
          .where(eq(child.id, childId))
          .limit(1);

        if (childExists.length === 0) {
          throw new NotFoundException('孩子不存在');
        }
        throw new ConflictException('积分不足，无法兑换');
      }

      const newBalance = childUpdated[0].points;

      // 创建兑换记录（pending 状态）
      const inserted = await tx
        .insert(redemption)
        .values({
          childId,
          rewardId,
          rewardName: rw.name,
          pointsCost: rw.pointsRequired,
          status: 'pending' as RedemptionStatus,
        })
        .returning();

      const redemptionRecord = inserted[0];

      // 写入积分流水（spend 类型，积分在申请时即扣除，拒绝则退回）
      await tx.insert(pointTransaction).values({
        childId,
        changeAmount: -rw.pointsRequired,
        balanceAfter: newBalance,
        type: 'spend',
        relatedType: 'reward',
        relatedId: redemptionRecord.id,
        reason: `兑换奖励：${rw.name}`,
      });

      return redemptionRecord;
    });

    this.logger.log(
      `提交兑换申请 childId=${childId} rewardId=${rewardId} points=${rw.pointsRequired}`,
    );

    return {
      id: result.id,
      childId: result.childId,
      rewardId: result.rewardId,
      rewardName: result.rewardName,
      pointsCost: result.pointsCost,
      status: result.status,
      reviewNote: result.reviewNote,
      reviewedAt: result.reviewedAt,
      createdAt: result.createdAt,
    };
  }

  async reviewRedemption(
    redemptionId: string,
    approved: boolean,
    reviewNote?: string,
    operatorId?: string,
  ): Promise<{
    id: string;
    childId: string;
    rewardId: string;
    rewardName: string;
    pointsCost: number;
    status: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }> {
    // 获取兑换记录
    const redemptionResult = await this.db
      .select()
      .from(redemption)
      .where(eq(redemption.id, redemptionId))
      .limit(1);

    if (redemptionResult.length === 0) {
      throw new NotFoundException('兑换记录不存在');
    }

    const record = redemptionResult[0];

    if (record.status !== 'pending') {
      throw new BadRequestException('该兑换申请已审核，无法重复操作');
    }

    const newStatus: RedemptionStatus = approved ? 'approved' : 'rejected';
    const now = new Date();

    // 使用事务
    const result = await this.db.transaction(async (tx) => {
      // 更新兑换记录状态（条件更新防并发重复审核 / 重复退款）
      const updated = await tx
        .update(redemption)
        .set({
          status: newStatus,
          reviewNote: reviewNote ?? null,
          reviewedAt: now,
        })
        .where(
          and(
            eq(redemption.id, redemptionId),
            eq(redemption.status, 'pending'),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new ConflictException('该兑换申请已审核，无法重复操作');
      }

      // 如果拒绝，退回积分
      if (!approved) {
        const childUpdated = await tx
          .update(child)
          .set({ points: sql<number>`${child.points} + ${record.pointsCost}` })
          .where(eq(child.id, record.childId))
          .returning({ points: child.points });

        // 写入 refund 流水
        await tx.insert(pointTransaction).values({
          childId: record.childId,
          changeAmount: record.pointsCost,
          balanceAfter: childUpdated[0].points,
          type: 'refund',
          relatedType: 'reward',
          relatedId: record.id,
          reason: reviewNote ? `兑换被拒绝：${reviewNote}` : '兑换申请被拒绝',
          operator: operatorId ?? undefined,
        });
      }

      // 审批通过：若为「零花钱」奖励，同时计入零花钱收入
      if (approved) {
        const [rw] = await tx
          .select()
          .from(reward)
          .where(eq(reward.id, record.rewardId))
          .limit(1);
        if (rw && rw.rewardType === 'allowance' && (rw.allowanceAmount ?? 0) > 0) {
          const amount = rw.allowanceAmount as number;
          const [childRow] = await tx
            .update(child)
            .set({
              allowanceBalance: sql`${child.allowanceBalance} + ${amount}`,
            })
            .where(eq(child.id, record.childId))
            .returning({ balance: child.allowanceBalance });
          if (childRow) {
            await tx.insert(allowanceTransaction).values({
              childId: record.childId,
              changeAmount: amount,
              balanceAfter: childRow.balance,
              type: 'income',
              relatedType: 'reward',
              relatedId: record.id,
              reason: `兑换零花钱：${rw.name}`,
              operator: operatorId ?? null,
            });
          }
        }
      }

      return updated[0];
    });

    this.logger.log(`审核兑换 redemptionId=${redemptionId} approved=${approved}`);

    return {
      id: result.id,
      childId: result.childId,
      rewardId: result.rewardId,
      rewardName: result.rewardName,
      pointsCost: result.pointsCost,
      status: result.status,
      reviewNote: result.reviewNote,
      reviewedAt: result.reviewedAt,
      createdAt: result.createdAt,
    };
  }
}
