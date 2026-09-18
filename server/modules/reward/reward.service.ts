import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, asc, and } from 'drizzle-orm';

import { reward } from '@server/database/schema';
import type { CreateRewardRequest, UpdateRewardRequest } from '@shared/api.interface';

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async listRewards(
    familyId: string,
    includeInactive = false,
  ): Promise<Array<{
    id: string;
    familyId: string;
    name: string;
    pointsRequired: number;
    description: string | null;
    imageUrl: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
  }>> {
    const conditions = [eq(reward.familyId, familyId)];
    if (!includeInactive) {
      conditions.push(eq(reward.isActive, true));
    }

    const results = await this.db
      .select()
      .from(reward)
      .where(and(...conditions))
      .orderBy(asc(reward.sortOrder), asc(reward.createdAt));

    return results.map((r) => ({
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    }));
  }

  async getReward(rewardId: string): Promise<{
    id: string;
    familyId: string;
    name: string;
    pointsRequired: number;
    description: string | null;
    imageUrl: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
  }> {
    const result = await this.db
      .select()
      .from(reward)
      .where(eq(reward.id, rewardId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException('奖励不存在');
    }

    const r = result[0];
    return {
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    };
  }

  async createReward(
    familyId: string,
    data: CreateRewardRequest,
  ): Promise<{
    id: string;
    familyId: string;
    name: string;
    pointsRequired: number;
    description: string | null;
    imageUrl: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
  }> {
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('奖励名称不能为空');
    }
    if (data.pointsRequired <= 0) {
      throw new BadRequestException('所需积分数必须为正数');
    }

    const inserted = await this.db
      .insert(reward)
      .values({
        familyId,
        name: data.name.trim(),
        pointsRequired: data.pointsRequired,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    const r = inserted[0];
    this.logger.log(`创建奖励 familyId=${familyId} rewardId=${r.id} name=${r.name}`);

    return {
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    };
  }

  async updateReward(
    rewardId: string,
    data: UpdateRewardRequest,
  ): Promise<{
    id: string;
    familyId: string;
    name: string;
    pointsRequired: number;
    description: string | null;
    imageUrl: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
  }> {
    // 先确认存在
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

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    const updated = await this.db
      .update(reward)
      .set(patch)
      .where(eq(reward.id, rewardId))
      .returning();

    const r = updated[0];
    this.logger.log(`更新奖励 rewardId=${rewardId}`);

    return {
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    };
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
}
