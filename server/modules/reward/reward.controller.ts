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
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { RewardService, type RewardRow } from './reward.service';
import { FamilyService } from '../family/family.service';

import type {
  RewardListResponse,
  RewardFrequency,
  RewardUsageResponse,
} from '@shared/api.interface';

/** class-validator @IsEnum 需要"枚举对象"，shared 的 RewardFrequency 是字符串联合类型 */
const REWARD_FREQUENCY_ENUM = {
  unlimited: 'unlimited',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
} as const;

class CreateRewardBody {
  @IsString()
  @Length(1, 50)
  name!: string;

  @IsInt()
  pointsRequired!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(REWARD_FREQUENCY_ENUM)
  frequency?: RewardFrequency;

  @IsOptional()
  @IsInt()
  limitCount?: number | null;

  @IsOptional()
  @IsInt()
  limitPoints?: number | null;

  @IsOptional()
  @IsIn(['item', 'allowance'])
  rewardType?: 'item' | 'allowance';

  @IsOptional()
  @IsInt()
  allowanceAmount?: number | null;
}

class UpdateRewardBody {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsInt()
  pointsRequired?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(REWARD_FREQUENCY_ENUM)
  frequency?: RewardFrequency;

  @IsOptional()
  @IsInt()
  limitCount?: number | null;

  @IsOptional()
  @IsInt()
  limitPoints?: number | null;

  @IsOptional()
  @IsIn(['item', 'allowance'])
  rewardType?: 'item' | 'allowance';

  @IsOptional()
  @IsInt()
  allowanceAmount?: number | null;
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
    rewardType: r.rewardType,
    allowanceAmount: r.allowanceAmount,
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
