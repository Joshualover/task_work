import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, count, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { pointTransaction, child } from '@server/database/schema';
import type {
  PointTransactionType,
  PointTransactionRelatedType,
} from '@shared/api.interface';

interface TransactionRecord {
  id: string;
  childId: string;
  changeAmount: number;
  balanceAfter: number;
  type: string;
  relatedType: string | null;
  relatedId: string | null;
  reason: string | null;
  createdAt: Date;
}

@Injectable()
export class PointService {
  private readonly logger = new Logger(PointService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async listTransactions(params: {
    childId: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: TransactionRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { childId, page = 1, pageSize = 20 } = params;
    const pageNum = Math.max(1, page);
    const pageSizeNum = Math.max(1, Math.min(100, pageSize));
    const offset = (pageNum - 1) * pageSizeNum;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(pointTransaction)
        .where(eq(pointTransaction.childId, childId))
        .orderBy(desc(pointTransaction.createdAt))
        .limit(pageSizeNum)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(pointTransaction)
        .where(eq(pointTransaction.childId, childId)),
    ]);

    const items: TransactionRecord[] = itemsResult.map((t) => ({
      id: t.id,
      childId: t.childId,
      changeAmount: t.changeAmount,
      balanceAfter: t.balanceAfter,
      type: t.type,
      relatedType: t.relatedType,
      relatedId: t.relatedId ?? null,
      reason: t.reason,
      createdAt: t.createdAt,
    }));

    const total = countResult[0]?.count ?? 0;

    return { items, total, page: pageNum, pageSize: pageSizeNum };
  }

  async getTransaction(transactionId: string): Promise<TransactionRecord> {
    const result = await this.db
      .select()
      .from(pointTransaction)
      .where(eq(pointTransaction.id, transactionId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('积分流水不存在');
    }

    const t = result[0];
    return {
      id: t.id,
      childId: t.childId,
      changeAmount: t.changeAmount,
      balanceAfter: t.balanceAfter,
      type: t.type,
      relatedType: t.relatedType,
      relatedId: t.relatedId ?? null,
      reason: t.reason,
      createdAt: t.createdAt,
    };
  }

  async addPoints(
    childId: string,
    amount: number,
    type: string,
    relatedType?: string,
    relatedId?: string,
    reason?: string,
    operatorId?: string,
  ): Promise<number> {
    if (amount <= 0) {
      throw new BadRequestException('增加积分数必须为正数');
    }

    return this.db.transaction(async (tx) => {
      // 原子更新积分余额
      const updated = await tx
        .update(child)
        .set({ points: sql<number>`${child.points} + ${amount}` })
        .where(eq(child.id, childId))
        .returning({ points: child.points });

      if (updated.length === 0) {
        throw new NotFoundException('孩子不存在');
      }

      const newBalance = updated[0].points;

      // 写入流水
      await tx.insert(pointTransaction).values({
        childId,
        changeAmount: amount,
        balanceAfter: newBalance,
        type: type as PointTransactionType,
        relatedType: relatedType as PointTransactionRelatedType | undefined,
        relatedId: relatedId ?? undefined,
        reason: reason ?? undefined,
        operator: operatorId ?? undefined,
      });

      this.logger.log(
        `积分增加 childId=${childId} amount=${amount} type=${type} newBalance=${newBalance}`,
      );
      return newBalance;
    });
  }

  async deductPoints(
    childId: string,
    amount: number,
    type: string,
    relatedType?: string,
    relatedId?: string,
    reason?: string,
    operatorId?: string,
  ): Promise<number> {
    if (amount <= 0) {
      throw new BadRequestException('扣减积分数必须为正数');
    }

    return this.db.transaction(async (tx) => {
      // 原子扣减并校验余额充足
      const updated = await tx
        .update(child)
        .set({ points: sql<number>`${child.points} - ${amount}` })
        .where(and(eq(child.id, childId), gte(child.points, amount)))
        .returning({ points: child.points });

      if (updated.length === 0) {
        // 区分孩子不存在 vs 余额不足
        const childResult = await tx
          .select({ id: child.id, points: child.points })
          .from(child)
          .where(eq(child.id, childId))
          .limit(1);

        if (childResult.length === 0) {
          throw new NotFoundException('孩子不存在');
        }

        throw new ConflictException('积分余额不足');
      }

      const newBalance = updated[0].points;

      // 写入流水
      await tx.insert(pointTransaction).values({
        childId,
        changeAmount: -amount,
        balanceAfter: newBalance,
        type: type as PointTransactionType,
        relatedType: relatedType as PointTransactionRelatedType | undefined,
        relatedId: relatedId ?? undefined,
        reason: reason ?? undefined,
        operator: operatorId ?? undefined,
      });

      this.logger.log(
        `积分扣减 childId=${childId} amount=${amount} type=${type} newBalance=${newBalance}`,
      );
      return newBalance;
    });
  }

  async adjustPoints(
    childId: string,
    changeAmount: number,
    reason: string,
    operatorId: string,
  ): Promise<number> {
    if (changeAmount === 0) {
      throw new BadRequestException('调整积分数不能为零');
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('调整原因不能为空');
    }

    const type: PointTransactionType = changeAmount > 0 ? 'adjust_add' : 'adjust_sub';
    const absAmount = Math.abs(changeAmount);

    if (changeAmount > 0) {
      return this.addPoints(childId, absAmount, type, 'manual', undefined, reason, operatorId);
    } else {
      return this.deductPoints(childId, absAmount, type, 'manual', undefined, reason, operatorId);
    }
  }

  async getChildBalance(childId: string): Promise<number> {
    const result = await this.db
      .select({ points: child.points })
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('孩子不存在');
    }

    return result[0].points;
  }
}
