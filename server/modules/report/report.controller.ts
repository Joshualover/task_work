import {
  Controller,
  Get,
  Query,
  Req,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';

import { ReportService } from './report.service';
import { FamilyService } from '../family/family.service';
import type { ReportStatsResponse } from '@shared/api.interface';

@Controller('api/report')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly familyService: FamilyService,
  ) {}

  @NeedLogin()
  @Get('stats')
  async getStats(
    @Req() req: Request,
    @Query('childId', new ParseUUIDPipe()) childId: string,
  ): Promise<ReportStatsResponse> {
    if (!childId) {
      throw new BadRequestException('childId 不能为空');
    }
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    return this.reportService.getStats(childId, family.id);
  }
}
