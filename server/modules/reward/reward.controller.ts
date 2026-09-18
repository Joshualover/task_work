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
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { RewardService } from './reward.service';
import { FamilyService } from '../family/family.service';

import type {
  RewardListResponse,
  CreateRewardRequest,
  UpdateRewardRequest,
} from '@shared/api.interface';

class CreateRewardBody implements CreateRewardRequest {
  name!: string;
  pointsRequired!: number;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
}

class UpdateRewardBody implements UpdateRewardRequest {
  name?: string;
  pointsRequired?: number;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
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

    const rewards = await this.rewardService.listRewards(family.id, includeInactiveFlag);

    return {
      items: rewards.map((r) => ({
        id: r.id,
        familyId: r.familyId,
        name: r.name,
        pointsRequired: r.pointsRequired,
        description: r.description,
        imageUrl: r.imageUrl,
        isActive: r.isActive,
        sortOrder: r.sortOrder,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  @NeedLogin()
  @Get(':id')
  async getReward(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) rewardId: string,
  ) {
    await this.assertReward(req, rewardId);
    const r = await this.rewardService.getReward(rewardId);
    return {
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Post()
  async createReward(
    @Req() req: Request,
    @Body() body: CreateRewardBody,
  ) {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);

    const r = await this.rewardService.createReward(family.id, body);
    return {
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
    };
  }

  @NeedLogin()
  @Patch(':id')
  async updateReward(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) rewardId: string,
    @Body() body: UpdateRewardBody,
  ) {
    await this.assertReward(req, rewardId);
    const r = await this.rewardService.updateReward(rewardId, body);
    return {
      id: r.id,
      familyId: r.familyId,
      name: r.name,
      pointsRequired: r.pointsRequired,
      description: r.description,
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
    };
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
