import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Req,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { PointService } from './point.service';
import { FamilyService } from '../family/family.service';

import type {
  PointTransactionListResponse,
  PointTransactionType,
  PointTransactionRelatedType,
  AdjustPointsRequest,
} from '@shared/api.interface';

class AdjustPointsBody implements AdjustPointsRequest {
  childId!: string;
  changeAmount!: number;
  reason!: string;
}

@Controller('api/points')
export class PointController {
  constructor(
    private readonly pointService: PointService,
    private readonly familyService: FamilyService,
  ) {}

  private async assertChild(
    req: Request,
    childId: string,
  ): Promise<void> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);
  }

  @NeedLogin()
  @Get('transactions')
  async listTransactions(
    @Req() req: Request,
    @Query('childId') childId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PointTransactionListResponse> {
    if (!childId) {
      throw new BadRequestException('childId 不能为空');
    }
    await this.assertChild(req, childId);

    const pageNum = page !== undefined ? parseInt(page, 10) : undefined;
    const pageSizeNum = pageSize !== undefined ? parseInt(pageSize, 10) : undefined;

    const result = await this.pointService.listTransactions({
      childId,
      page: pageNum,
      pageSize: pageSizeNum,
    });

    return {
      items: result.items.map((t) => ({
        id: t.id,
        childId: t.childId,
        changeAmount: t.changeAmount,
        balanceAfter: t.balanceAfter,
        type: t.type as PointTransactionType,
        relatedType: t.relatedType as PointTransactionRelatedType | null,
        relatedId: t.relatedId,
        reason: t.reason,
        createdAt: t.createdAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @NeedLogin()
  @Get('transactions/:id')
  async getTransaction(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    const t = await this.pointService.getTransaction(transactionId);
    await this.assertChild(req, t.childId);
    return {
      id: t.id,
      childId: t.childId,
      changeAmount: t.changeAmount,
      balanceAfter: t.balanceAfter,
      type: t.type,
      relatedType: t.relatedType,
      relatedId: t.relatedId,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Get('balance')
  async getBalance(
    @Req() req: Request,
    @Query('childId') childId: string,
  ): Promise<{ balance: number }> {
    if (!childId) {
      throw new BadRequestException('childId 不能为空');
    }
    await this.assertChild(req, childId);
    const balance = await this.pointService.getChildBalance(childId);
    return { balance };
  }

  @NeedLogin()
  @Post('adjust')
  async adjustPoints(
    @Req() req: Request,
    @Body() body: AdjustPointsBody,
  ): Promise<{ newBalance: number }> {
    const { userId } = req.userContext;

    if (!body.childId) {
      throw new BadRequestException('childId 不能为空');
    }
    if (body.changeAmount === undefined || body.changeAmount === null) {
      throw new BadRequestException('changeAmount 不能为空');
    }
    if (!body.reason || body.reason.trim().length === 0) {
      throw new BadRequestException('调整原因不能为空');
    }

    await this.assertChild(req, body.childId);

    const newBalance = await this.pointService.adjustPoints(
      body.childId,
      body.changeAmount,
      body.reason,
      userId,
    );
    return { newBalance };
  }
}
