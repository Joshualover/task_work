import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, gte, inArray, count, sql } from 'drizzle-orm';

import { allowanceRequest, allowanceTransaction, child } from '@server/database/schema';

export interface AllowanceTransactionRow {
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

export interface AllowanceRequestRow {
  id: string;
  childId: string;
  amount: number;
  purpose: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AllowanceService {
  private readonly logger = new Logger(AllowanceService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 零花钱余额（分） */
  async getBalance(childId: string): Promise<number> {
    const rows = await this.db
      .select({ balance: child.allowanceBalance })
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException('孩子不存在');
    return rows[0].balance;
  }

  async listTransactions(params: {
    childId: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: AllowanceTransactionRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { childId } = params;
    const pageNum = Math.max(1, params.page ?? 1);
    const pageSizeNum = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const offset = (pageNum - 1) * pageSizeNum;

    const [items, totalRows] = await Promise.all([
      this.db
        .select()
        .from(allowanceTransaction)
        .where(eq(allowanceTransaction.childId, childId))
        .orderBy(desc(allowanceTransaction.createdAt))
        .limit(pageSizeNum)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(allowanceTransaction)
        .where(eq(allowanceTransaction.childId, childId)),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        childId: t.childId,
        changeAmount: t.changeAmount,
        balanceAfter: t.balanceAfter,
        type: t.type,
        relatedType: t.relatedType ?? null,
        relatedId: t.relatedId ?? null,
        reason: t.reason,
        createdAt: t.createdAt,
      })),
      total: Number(totalRows[0]?.count ?? 0),
      page: pageNum,
      pageSize: pageSizeNum,
    };
  }

  /** 查询使用申请；familyId 用于家长端按家庭过滤 */
  async listRequests(params: {
    childId?: string;
    familyId?: string;
    status?: string;
  }): Promise<AllowanceRequestRow[]> {
    const conditions = [];
    if (params.familyId) {
      const childIds = (
        await this.db
          .select({ id: child.id })
          .from(child)
          .where(eq(child.familyId, params.familyId))
      ).map((c) => c.id);
      if (childIds.length === 0) return [];
      conditions.push(inArray(allowanceRequest.childId, childIds));
    }
    if (params.childId) {
      conditions.push(eq(allowanceRequest.childId, params.childId));
    }
    if (params.status) {
      conditions.push(eq(allowanceRequest.status, params.status));
    }

    const rows = await this.db
      .select()
      .from(allowanceRequest)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(allowanceRequest.createdAt));

    return rows.map((r) => ({
      id: r.id,
      childId: r.childId,
      amount: r.amount,
      purpose: r.purpose,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    }));
  }

  /** 孩子发起零花钱使用申请 */
  async createRequest(
    childId: string,
    amount: number,
    purpose?: string,
  ): Promise<AllowanceRequestRow> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('申请金额必须大于 0');
    }
    const balance = await this.getBalance(childId);
    if (amount > balance) {
      throw new ConflictException('零花钱余额不足');
    }

    const [row] = await this.db
      .insert(allowanceRequest)
      .values({
        childId,
        amount: Math.floor(amount),
        purpose: purpose?.trim() || null,
      })
      .returning();

    this.logger.log(`零花钱申请 childId=${childId} amount=${amount}`);
    return {
      id: row.id,
      childId: row.childId,
      amount: row.amount,
      purpose: row.purpose,
      status: row.status,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
    };
  }

  /** 家长审批：通过则扣减零花钱并记流水 */
  async reviewRequest(
    requestId: string,
    approved: boolean,
    reviewNote?: string,
    operatorId?: string,
  ): Promise<AllowanceRequestRow> {
    const [existing] = await this.db
      .select()
      .from(allowanceRequest)
      .where(eq(allowanceRequest.id, requestId))
      .limit(1);
    if (!existing) throw new NotFoundException('申请不存在');
    if (existing.status !== 'pending') {
      throw new BadRequestException('该申请已处理');
    }

    const row = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(allowanceRequest)
        .set({
          status: approved ? 'approved' : 'rejected',
          reviewNote: reviewNote ?? null,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(allowanceRequest.id, requestId),
            eq(allowanceRequest.status, 'pending'),
          ),
        )
        .returning();
      if (updated.length === 0) throw new ConflictException('该申请已处理');

      if (approved) {
        const [childRow] = await tx
          .update(child)
          .set({
            allowanceBalance: sql`${child.allowanceBalance} - ${existing.amount}`,
          })
          .where(
            and(
              eq(child.id, existing.childId),
              gte(child.allowanceBalance, existing.amount),
            ),
          )
          .returning({ balance: child.allowanceBalance });
        if (!childRow) throw new ConflictException('零花钱余额不足');

        await tx.insert(allowanceTransaction).values({
          childId: existing.childId,
          changeAmount: -existing.amount,
          balanceAfter: childRow.balance,
          type: 'spend',
          relatedType: 'request',
          relatedId: existing.id,
          reason: existing.purpose
            ? `零花钱使用：${existing.purpose}`
            : '零花钱使用',
          operator: operatorId ?? null,
        });
      }

      return updated[0];
    });

    this.logger.log(`零花钱申请审批 id=${requestId} approved=${approved}`);

    return {
      id: row.id,
      childId: row.childId,
      amount: row.amount,
      purpose: row.purpose,
      status: row.status,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
    };
  }
}
