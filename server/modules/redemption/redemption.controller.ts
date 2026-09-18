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
import { RedemptionService } from './redemption.service';
import { FamilyService } from '../family/family.service';

import type {
  RedemptionListResponse,
  CreateRedemptionRequest,
  ReviewRedemptionRequest,
  RedemptionStatus,
} from '@shared/api.interface';

class CreateRedemptionBody implements CreateRedemptionRequest {
  rewardId!: string;
  childId!: string;
}

class ReviewRedemptionBody implements ReviewRedemptionRequest {
  approved!: boolean;
  reviewNote?: string;
}

@Controller('api/redemptions')
export class RedemptionController {
  constructor(
    private readonly redemptionService: RedemptionService,
    private readonly familyService: FamilyService,
  ) {}

  /** 校验孩子属于当前登录用户家庭 */
  private async assertChild(req: Request, childId: string): Promise<void> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);
  }

  @NeedLogin()
  @Get()
  async listRedemptions(
    @Req() req: Request,
    @Query('childId') childId?: string,
    @Query('status') status?: string,
  ): Promise<RedemptionListResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);

    const redemptions = await this.redemptionService.listRedemptions({
      childId,
      status,
      familyId: family.id,
    });

    return {
      items: redemptions.map((r) => ({
        id: r.id,
        childId: r.childId,
        rewardId: r.rewardId,
        rewardName: r.rewardName,
        pointsCost: r.pointsCost,
        status: r.status as RedemptionStatus,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  @NeedLogin()
  @Get(':id')
  async getRedemption(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) redemptionId: string,
  ) {
    const r = await this.redemptionService.getRedemption(redemptionId);
    await this.assertChild(req, r.childId);
    return {
      id: r.id,
      childId: r.childId,
      rewardId: r.rewardId,
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Post()
  async createRedemption(
    @Req() req: Request,
    @Body() body: CreateRedemptionBody,
  ) {
    if (!body.childId) {
      throw new BadRequestException('childId 不能为空');
    }
    if (!body.rewardId) {
      throw new BadRequestException('rewardId 不能为空');
    }

    await this.assertChild(req, body.childId);

    const r = await this.redemptionService.createRedemption(body.childId, body.rewardId);
    return {
      id: r.id,
      childId: r.childId,
      rewardId: r.rewardId,
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Post(':id/review')
  async reviewRedemption(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) redemptionId: string,
    @Body() body: ReviewRedemptionBody,
  ) {
    const { userId } = req.userContext;

    if (body.approved === undefined || body.approved === null) {
      throw new BadRequestException('approved 不能为空');
    }

    const existing = await this.redemptionService.getRedemption(redemptionId);
    await this.assertChild(req, existing.childId);

    const r = await this.redemptionService.reviewRedemption(
      redemptionId,
      body.approved,
      body.reviewNote,
      userId,
    );

    return {
      id: r.id,
      childId: r.childId,
      rewardId: r.rewardId,
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
