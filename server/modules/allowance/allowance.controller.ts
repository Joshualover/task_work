import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';

import { AllowanceService } from './allowance.service';
import { FamilyService } from '../family/family.service';
import type {
  AllowanceTransactionListResponse,
  AllowanceTransactionType,
  AllowanceRequestListResponse,
  AllowanceRequestStatus,
  CreateAllowanceRequest,
  ReviewAllowanceRequest,
  AdjustAllowanceRequest,
} from '@shared/api.interface';

class CreateAllowanceRequestBody implements CreateAllowanceRequest {
  childId!: string;
  amount!: number;
  purpose?: string;
}

class ReviewAllowanceRequestBody implements ReviewAllowanceRequest {
  approved!: boolean;
  reviewNote?: string;
}

class AdjustAllowanceRequestBody implements AdjustAllowanceRequest {
  childId!: string;
  changeAmount!: number;
  reason!: string;
}

@Controller('api/allowance')
export class AllowanceController {
  constructor(
    private readonly allowanceService: AllowanceService,
    private readonly familyService: FamilyService,
  ) {}

  @NeedLogin()
  @Get('balance')
  async balance(
    @Req() req: Request,
    @Query('childId') childId: string,
  ): Promise<{ balance: number }> {
    if (!childId) throw new BadRequestException('childId 不能为空');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);
    const balance = await this.allowanceService.getBalance(childId);
    return { balance };
  }

  @NeedLogin()
  @Get('transactions')
  async transactions(
    @Req() req: Request,
    @Query('childId') childId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AllowanceTransactionListResponse> {
    if (!childId) throw new BadRequestException('childId 不能为空');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);

    const result = await this.allowanceService.listTransactions({
      childId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return {
      items: result.items.map((t) => ({
        id: t.id,
        childId: t.childId,
        changeAmount: t.changeAmount,
        balanceAfter: t.balanceAfter,
        type: t.type as AllowanceTransactionType,
        relatedType: t.relatedType,
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
  @Get('requests')
  async requests(
    @Req() req: Request,
    @Query('childId') childId?: string,
    @Query('status') status?: string,
  ): Promise<AllowanceRequestListResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    if (childId) {
      await this.familyService.assertChildInFamily(childId, family.id);
    }

    const rows = await this.allowanceService.listRequests({
      childId,
      familyId: family.id,
      status,
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        childId: r.childId,
        amount: r.amount,
        purpose: r.purpose,
        status: r.status as AllowanceRequestStatus,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  @NeedLogin()
  @Post('adjust')
  async adjust(
    @Req() req: Request,
    @Body() body: AdjustAllowanceRequestBody,
  ): Promise<{ balance: number }> {
    if (!body.childId) throw new BadRequestException('childId 不能为空');
    if (body.changeAmount === undefined || body.changeAmount === null) {
      throw new BadRequestException('changeAmount 不能为空');
    }
    if (!body.reason || !body.reason.trim()) {
      throw new BadRequestException('调整原因不能为空');
    }
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(body.childId, family.id);

    const balance = await this.allowanceService.adjustBalance(
      body.childId,
      Number(body.changeAmount),
      body.reason,
      userId,
    );
    return { balance };
  }

  @NeedLogin()
  @Post('requests')
  async createRequest(
    @Req() req: Request,
    @Body() body: CreateAllowanceRequestBody,
  ) {
    if (!body.childId) throw new BadRequestException('childId 不能为空');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(body.childId, family.id);

    const r = await this.allowanceService.createRequest(
      body.childId,
      Number(body.amount),
      body.purpose,
    );
    return {
      id: r.id,
      childId: r.childId,
      amount: r.amount,
      purpose: r.purpose,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Post('requests/:id/review')
  async reviewRequest(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) requestId: string,
    @Body() body: ReviewAllowanceRequestBody,
  ) {
    const { userId } = req.userContext;
    if (body.approved === undefined || body.approved === null) {
      throw new BadRequestException('approved 不能为空');
    }
    const r = await this.allowanceService.reviewRequest(
      requestId,
      body.approved,
      body.reviewNote,
      userId,
    );
    return {
      id: r.id,
      childId: r.childId,
      amount: r.amount,
      purpose: r.purpose,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
