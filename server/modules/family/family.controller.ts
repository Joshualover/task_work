import {
  Body,
  Controller,
  Get,
  Put,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';

import { FamilyService } from './family.service';
import type {
  FamilyResponse,
  UpdateFamilyRequest,
} from '@shared/api.interface';

@Controller('api/family')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @NeedLogin()
  @Get()
  async getFamily(@Req() req: Request): Promise<FamilyResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    return { family };
  }

  @NeedLogin()
  @Put()
  async updateFamily(
    @Req() req: Request,
    @Body() body: UpdateFamilyRequest,
  ): Promise<FamilyResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const updated = await this.familyService.updateFamily(
      family.id,
      body.name,
      userId,
    );
    return { family: updated };
  }
}
