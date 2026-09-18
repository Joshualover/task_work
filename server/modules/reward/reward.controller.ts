import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Param,
  Req,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { RewardService, type RewardRow } from './reward.service';
import { FamilyService } from '../family/family.service';

import type {
  RewardListResponse,
  CreateRewardRequest,
  UpdateRewardRequest,
  RewardFrequency,
  RewardUsageResponse,
} from '@shared/api.interface';

class CreateRewardBody implements CreateRewardRequest {
  name!: string;
  pointsRequired!: number;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  frequency?: RewardFrequency;
  limitCount?: number | null;
  limitPoints?: number | null;
}

class UpdateRewardBody implements UpdateRewardRequest {
  name?: string;
  pointsRequired?: number;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
  frequency?: RewardFrequency;
  limitCount?: number | null;
  limitPoints?: number | null;
}

function toResponse(r: RewardRow) {
  return {
    id: r.id,
    familyId: r.familyId,
    name: r.name,
    pointsRequired: r.pointsRequired,
    description: r.description,
    imageUrl: r.imageUrl,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    frequency: r.frequency,
    limitCount: r.limitCount,
    limitPoints: r.limitPoints,
    createdAt: r.createdAt.toISOString(),
  };
}

@Controller('api/rewards')
export class RewardController {
  constructor(
    private readonly rewardService: RewardService,
    private readonly familyService: FamilyService,
  ) {}

  /** 校验奖励属于当前登录用户家庭 */
  private async assertReward(req: Request, rewardId: string): Promise<void> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const reward = await this.rewardService.getReward(rewardId);
    if (reward.familyId !== family.id) {
      throw new NotFoundException('奖励不存在');
    }
  }

  @NeedLogin()
  @Get()
  async listRewards(
    @Req() req: Request,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<RewardListResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const includeInactiveFlag = includeInactive === 'true';

    const rewards = await this.rewardService.listRewards(
      family.id,
      includeInactiveFlag,
    );
    return { items: rewards.map(toResponse) };
  }

  /** 孩子在当前周期内对各奖励的兑换用量（必须在 :id 之前声明） */
  @NeedLogin()
  @Get('usage')
  async usage(
    @Req() req: Request,
    @Query('childId') childId?: string,
  ): Promise<RewardUsageResponse> {
    if (!childId) throw new BadRequestException('childId 不能为空');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.familyService.assertChildInFamily(childId, family.id);
    const items = await this.rewardService.getUsage(family.id, childId);
    return { items };
  }

  @NeedLogin()
  @Get(':id')
  async getReward(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) rewardId: string,
  ) {
    await this.assertReward(req, rewardId);
    return toResponse(await this.rewardService.getReward(rewardId));
  }

  @NeedLogin()
  @Post()
  async createReward(
    @Req() req: Request,
    @Body() body: CreateRewardBody,
  ) {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    return toResponse(await this.rewardService.createReward(family.id, body));
  }

  @NeedLogin()
  @Patch(':id')
  async updateReward(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) rewardId: string,
    @Body() body: UpdateRewardBody,
  ) {
    await this.assertReward(req, rewardId);
    return toResponse(await this.rewardService.updateReward(rewardId, body));
  }

  @NeedLogin()
  @Delete(':id')
  async deleteReward(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) rewardId: string,
  ): Promise<{ ok: boolean }> {
    await this.assertReward(req, rewardId);
    await this.rewardService.deleteReward(rewardId);
    return { ok: true };
  }
}
