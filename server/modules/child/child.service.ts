import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, sql, asc } from 'drizzle-orm';

import { child } from '@server/database/schema';
import type { Child, CreateChildRequest, UpdateChildRequest } from '@shared/api.interface';

@Injectable()
export class ChildService {
  private readonly logger = new Logger(ChildService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async listChildren(familyId: string): Promise<Child[]> {
    const rows = await this.db
      .select()
      .from(child)
      .where(eq(child.familyId, familyId))
      .orderBy(asc(child.createdAt));

    return rows.map((row) => ({
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      points: row.points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getChild(childId: string): Promise<Child> {
    const rows = await this.db
      .select()
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('孩子不存在');
    }

    const row = rows[0];
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      points: row.points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createChild(
    familyId: string,
    data: CreateChildRequest,
    userId: string,
  ): Promise<Child> {
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('孩子姓名不能为空');
    }

    this.logger.log(`Creating child in family ${familyId}: ${data.name}`);
    const created = await this.db
      .insert(child)
      .values({
        familyId,
        name: data.name.trim(),
        avatarUrl: data.avatarUrl || null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    const row = created[0];
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      points: row.points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateChild(
    childId: string,
    data: UpdateChildRequest,
    userId: string,
  ): Promise<Child> {
    const patch: Partial<typeof child.$inferInsert> = {};

    if (data.name !== undefined) {
      if (data.name.trim().length === 0) {
        throw new BadRequestException('孩子姓名不能为空');
      }
      patch.name = data.name.trim();
    }
    if (data.avatarUrl !== undefined) {
      patch.avatarUrl = data.avatarUrl || null;
    }
    if (data.isActive !== undefined) {
      patch.isActive = data.isActive;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    this.logger.log(`Updating child ${childId}`);
    const updated = await this.db
      .update(child)
      .set(patch)
      .where(eq(child.id, childId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException('孩子不存在');
    }

    const row = updated[0];
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      points: row.points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updatePoints(childId: string, changeAmount: number): Promise<Child> {
    this.logger.log(`Updating points for child ${childId}: ${changeAmount}`);

    const updated = await this.db
      .update(child)
      .set({
        points: sql<number>`${child.points} + ${changeAmount}`,
      })
      .where(eq(child.id, childId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException('孩子不存在');
    }

    const row = updated[0];
    return {
      id: row.id,
      familyId: row.familyId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      points: row.points,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
