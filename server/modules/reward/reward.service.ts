import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, asc, and, gte, lt, inArray } from 'drizzle-orm';

import { reward, redemption } from '@server/database/schema';
import { periodRangeUtc } from '@server/common/utils/date';
import type {
  CreateRewardRequest,
  UpdateRewardRequest,
  RewardFrequency,
  RewardUsage,
} from '@shared/api.interface';

export interface RewardRow {
  id: string;
  familyId: string;
  name: string;
  pointsRequired: number;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  frequency: RewardFrequency;
  limitCount: number | null;
  limitPoints: number | null;
  rewardType: 'item' | 'allowance';
  allowanceAmount: number | null;
  createdAt: Date;
}

const FREQUENCIES: RewardFrequency[] = [
  'unlimited',
  'daily',
  'weekly',
  'monthly',
];

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private mapReward(row: typeof reward.$inferSelect): RewardRow {
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      pointsRequired: row.pointsRequired,
      description: row.description,
      imageUrl: row.imageUrl,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      frequency: (row.frequency ?? 'unlimited') as RewardFrequency,
      limitCount: row.limitCount ?? null,
      limitPoints: row.limitPoints ?? null,
      rewardType: (row.rewardType ?? 'item') as 'item' | 'allowance',
      allowanceAmount: row.allowanceAmount ?? null,
      createdAt: row.createdAt,
    };
  }

  private normalizeFrequency(value?: string): RewardFrequency {
    if (!value) return 'unlimited';
    if (!FREQUENCIES.includes(value as RewardFrequency)) {
      throw new BadRequestException('兑奖频率不合法');
    }
    return value as RewardFrequency;
  }

  private normalizeLimit(
    value: number | null | undefined,
    label: string,
  ): number | null {
    if (value === undefined || value === null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException(`${label}必须为正整数`);
    }
    return Math.floor(n);
  }

  /** 零花钱金额（分），必须为正整数 */
  private normalizeAllowanceAmount(value: number | null | undefined): number | null {
    if (value === undefined || value === null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('零花钱金额必须大于 0');
    }
    return Math.floor(n);
  }

  async listRewards(
    familyId: string,
    includeInactive = false,
  ): Promise<RewardRow[]> {
    const conditions = [eq(reward.familyId, familyId)];
    if (!includeInactive) {
      conditions.push(eq(reward.isActive, true));
    }

    const results = await this.db
      .select()
      .from(reward)
      .where(and(...conditions))
      .orderBy(asc(reward.sortOrder), asc(reward.createdAt));

    return results.map((r) => this.mapReward(r));
  }

  async getReward(rewardId: string): Promise<RewardRow> {
    const result = await this.db
      .select()
      .from(reward)
      .where(eq(reward.id, rewardId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('奖励不存在');
    }
    return this.mapReward(result[0]);
  }

  async createReward(
    familyId: string,
    data: CreateRewardRequest,
  ): Promise<RewardRow> {
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('奖励名称不能为空');
    }
    if (data.pointsRequired <= 0) {
      throw new BadRequestException('所需积分数必须为正数');
    }

    const frequency = this.normalizeFrequency(data.frequency);
    const unlimited = frequency === 'unlimited';
    const rewardType = data.rewardType === 'allowance' ? 'allowance' : 'item';

    const inserted = await this.db
      .insert(reward)
      .values({
        familyId,
        name: data.name.trim(),
        pointsRequired: data.pointsRequired,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        sortOrder: data.sortOrder ?? 0,
        frequency,
        limitCount: unlimited
          ? null
          : this.normalizeLimit(data.limitCount, '兑换次数上限'),
        limitPoints: unlimited
          ? null
          : this.normalizeLimit(data.limitPoints, '积分上限'),
        rewardType,
        allowanceAmount:
          rewardType === 'allowance'
            ? this.normalizeAllowanceAmount(data.allowanceAmount)
            : null,
      })
      .returning();

    const r = inserted[0];
    this.logger.log(`创建奖励 familyId=${familyId} rewardId=${r.id} name=${r.name}`);

    return this.mapReward(r);
  }

  async updateReward(
    rewardId: string,
    data: UpdateRewardRequest,
  ): Promise<RewardRow> {
    const existing = await this.db
      .select()
      .from(reward)
      .where(eq(reward.id, rewardId))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('奖励不存在');
    }

    const patch: Partial<typeof reward.$inferInsert> = {};

    if (data.name !== undefined) {
      if (data.name.trim().length === 0) {
        throw new BadRequestException('奖励名称不能为空');
      }
      patch.name = data.name.trim();
    }
    if (data.pointsRequired !== undefined) {
      if (data.pointsRequired <= 0) {
        throw new BadRequestException('所需积分数必须为正数');
      }
      patch.pointsRequired = data.pointsRequired;
    }
    if (data.description !== undefined) {
      patch.description = data.description || null;
    }
    if (data.imageUrl !== undefined) {
      patch.imageUrl = data.imageUrl || null;
    }
    if (data.isActive !== undefined) {
      patch.isActive = data.isActive;
    }
    if (data.sortOrder !== undefined) {
      patch.sortOrder = data.sortOrder;
    }
    if (data.frequency !== undefined) {
      patch.frequency = this.normalizeFrequency(data.frequency);
    }
    if (data.limitCount !== undefined) {
      patch.limitCount = this.normalizeLimit(data.limitCount, '兑换次数上限');
    }
    if (data.limitPoints !== undefined) {
      patch.limitPoints = this.normalizeLimit(data.limitPoints, '积分上限');
    }
    if (data.rewardType !== undefined) {
      patch.rewardType = data.rewardType === 'allowance' ? 'allowance' : 'item';
    }
    if (data.allowanceAmount !== undefined) {
      patch.allowanceAmount = this.normalizeAllowanceAmount(data.allowanceAmount);
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    // 频率为不限时，清空额度限制
    const effectiveFrequency = (patch.frequency ??
      existing[0].frequency ??
      'unlimited') as RewardFrequency;
    if (effectiveFrequency === 'unlimited') {
      patch.frequency = 'unlimited';
      patch.limitCount = null;
      patch.limitPoints = null;
    }

    // 非零花钱奖励清空金额
    const effectiveRewardType =
      (patch.rewardType ?? existing[0].rewardType ?? 'item') as 'item' | 'allowance';
    if (effectiveRewardType !== 'allowance') {
      patch.allowanceAmount = null;
    }

    const updated = await this.db
      .update(reward)
      .set(patch)
      .where(eq(reward.id, rewardId))
      .returning();

    this.logger.log(`更新奖励 rewardId=${rewardId}`);
    return this.mapReward(updated[0]);
  }

  async deleteReward(rewardId: string): Promise<void> {
    const deleted = await this.db
      .delete(reward)
      .where(eq(reward.id, rewardId))
      .returning({ id: reward.id });

    if (deleted.length === 0) {
      throw new NotFoundException('奖励不存在');
    }

    this.logger.log(`删除奖励 rewardId=${rewardId}`);
  }

  /** 某孩子在当前周期内对各奖励的兑换用量（仅返回设置了限制的奖励） */
  async getUsage(familyId: string, childId: string): Promise<RewardUsage[]> {
    const rewards = (await this.listRewards(familyId, false)).filter(
      (r) => r.frequency !== 'unlimited',
    );

    const items: RewardUsage[] = [];
    for (const rw of rewards) {
      const range = periodRangeUtc(rw.frequency as 'daily' | 'weekly' | 'monthly');
      const rows = await this.db
        .select({ pointsCost: redemption.pointsCost })
        .from(redemption)
        .where(
          and(
            eq(redemption.childId, childId),
            eq(redemption.rewardId, rw.id),
            inArray(redemption.status, ['pending', 'approved']),
            gte(redemption.createdAt, range.start),
            lt(redemption.createdAt, range.end),
          ),
        );

      items.push({
        rewardId: rw.id,
        frequency: rw.frequency,
        count: rows.length,
        points: rows.reduce((sum, r) => sum + r.pointsCost, 0),
        limitCount: rw.limitCount,
        limitPoints: rw.limitPoints,
        periodStart: range.startDate,
        periodEnd: range.endDate,
      });
    }
    return items;
  }
}
