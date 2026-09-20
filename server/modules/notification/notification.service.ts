import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, count, desc, eq } from 'drizzle-orm';

import { notification, child } from '@server/database/schema';

export interface NotificationRow {
  id: string;
  familyId: string;
  childId: string | null;
  type: string;
  title: string;
  body: string | null;
  relatedType: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface CreateNotificationInput {
  familyId?: string;
  childId?: string;
  type: string;
  title: string;
  body?: string;
  relatedType?: string;
  relatedId?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 写入一条提醒（familyId 或 childId 二选一，childId 会自动解析家庭） */
  async create(input: CreateNotificationInput): Promise<void> {
    let familyId = input.familyId;
    if (!familyId && input.childId) {
      const [c] = await this.db
        .select({ familyId: child.familyId })
        .from(child)
        .where(eq(child.id, input.childId))
        .limit(1);
      if (!c) {
        this.logger.warn(`提醒写入跳过：孩子不存在 ${input.childId}`);
        return;
      }
      familyId = c.familyId;
    }
    if (!familyId) {
      this.logger.warn(`提醒写入跳过：缺少 familyId/childId (${input.type})`);
      return;
    }

    await this.db.insert(notification).values({
      familyId,
      childId: input.childId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
    });
  }

  async list(
    familyId: string,
    unreadOnly = false,
  ): Promise<{ items: NotificationRow[]; unreadCount: number }> {
    const conditions = [eq(notification.familyId, familyId)];
    if (unreadOnly) conditions.push(eq(notification.isRead, false));

    const rows = await this.db
      .select()
      .from(notification)
      .where(and(...conditions))
      .orderBy(desc(notification.createdAt))
      .limit(50);

    const unreadCount = await this.unreadCount(familyId);

    return {
      items: rows.map((r) => ({
        id: r.id,
        familyId: r.familyId,
        childId: r.childId ?? null,
        type: r.type,
        title: r.title,
        body: r.body,
        relatedType: r.relatedType ?? null,
        relatedId: r.relatedId ?? null,
        isRead: r.isRead,
        createdAt: r.createdAt,
      })),
      unreadCount,
    };
  }

  async unreadCount(familyId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(notification)
      .where(
        and(eq(notification.familyId, familyId), eq(notification.isRead, false)),
      );
    return Number(row?.count ?? 0);
  }

  async markRead(id: string, familyId: string): Promise<void> {
    const updated = await this.db
      .update(notification)
      .set({ isRead: true })
      .where(and(eq(notification.id, id), eq(notification.familyId, familyId)))
      .returning({ id: notification.id });
    if (updated.length === 0) throw new NotFoundException('提醒不存在');
  }

  async markAllRead(familyId: string): Promise<void> {
    await this.db
      .update(notification)
      .set({ isRead: true })
      .where(
        and(eq(notification.familyId, familyId), eq(notification.isRead, false)),
      );
  }
}
