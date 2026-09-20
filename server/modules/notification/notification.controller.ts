import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';

import { NotificationService } from './notification.service';
import { FamilyService } from '../family/family.service';
import type {
  NotificationListResponse,
  AppNotification,
} from '@shared/api.interface';

@Controller('api/notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly familyService: FamilyService,
  ) {}

  private toResponse(r: {
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
  }): AppNotification {
    return {
      id: r.id,
      familyId: r.familyId,
      childId: r.childId,
      type: r.type,
      title: r.title,
      body: r.body,
      relatedType: r.relatedType,
      relatedId: r.relatedId,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Get()
  async list(
    @Req() req: Request,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<NotificationListResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const result = await this.notificationService.list(
      family.id,
      unreadOnly === 'true',
    );
    return {
      items: result.items.map((r) => this.toResponse(r)),
      unreadCount: result.unreadCount,
    };
  }

  @NeedLogin()
  @Get('unread-count')
  async unreadCount(@Req() req: Request): Promise<{ unreadCount: number }> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const unreadCount = await this.notificationService.unreadCount(family.id);
    return { unreadCount };
  }

  @NeedLogin()
  @Post(':id/read')
  async markRead(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: boolean }> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.notificationService.markRead(id, family.id);
    return { ok: true };
  }

  @NeedLogin()
  @Post('read-all')
  async markAllRead(@Req() req: Request): Promise<{ ok: boolean }> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.notificationService.markAllRead(family.id);
    return { ok: true };
  }
}
