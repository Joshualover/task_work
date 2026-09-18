import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';

import { family, child } from '@server/database/schema';
import { isUniqueViolation } from '@server/common/utils/pg-error';
import type { Family } from '@shared/api.interface';

@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getOrCreateFamily(userId: string): Promise<Family> {
    this.logger.log(`getOrCreateFamily for user: ${userId}`);
    const existing = await this.db
      .select()
      .from(family)
      .where(eq(family.createdBy, userId))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      return {
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      };
    }

    this.logger.log(`Creating default family for user: ${userId}`);
    try {
      const created = await this.db
        .insert(family)
        .values({
          name: '我的家庭',
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      const row = created[0];
      return {
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error) {
      // 并发首次请求：唯一索引(idx_family_created_by)生效时，重复插入会报 23505，
      // 此时回查已存在的家庭即可。未建索引时保持原有行为。
      if (isUniqueViolation(error)) {
        const again = await this.db
          .select()
          .from(family)
          .where(eq(family.createdBy, userId))
          .limit(1);
        if (again.length > 0) {
          const row = again[0];
          return {
            id: row.id,
            name: row.name,
            createdAt: row.createdAt.toISOString(),
          };
        }
      }
      throw error;
    }
  }

  async getFamily(familyId: string): Promise<Family> {
    const rows = await this.db
      .select()
      .from(family)
      .where(eq(family.id, familyId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('家庭不存在');
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 校验孩子属于指定家庭（纵深防御，避免仅依赖平台 RLS）。
   * 不存在或不属于该家庭时统一抛 NotFound，避免泄露资源是否存在。
   */
  async assertChildInFamily(childId: string, familyId: string): Promise<void> {
    const rows = await this.db
      .select({ familyId: child.familyId })
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);

    if (rows.length === 0 || rows[0].familyId !== familyId) {
      throw new NotFoundException('孩子不存在');
    }
  }

  async updateFamily(familyId: string, name: string, userId: string): Promise<Family> {
    this.logger.log(`Updating family ${familyId} name to: ${name}`);
    const updated = await this.db
      .update(family)
      .set({
        name,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(family.id, familyId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException('家庭不存在');
    }

    const row = updated[0];
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
