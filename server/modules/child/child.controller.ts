import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';

import { ChildService } from './child.service';
import { FamilyService } from '../family/family.service';
import type {
  ChildListResponse,
  ChildResponse,
  CreateChildRequest,
  UpdateChildRequest,
} from '@shared/api.interface';

@Controller('api/children')
export class ChildController {
  constructor(
    private readonly childService: ChildService,
    private readonly familyService: FamilyService,
  ) {}

  private async getFamilyId(req: Request): Promise<string> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    return family.id;
  }

  @NeedLogin()
  @Get()
  async listChildren(@Req() req: Request): Promise<ChildListResponse> {
    const familyId = await this.getFamilyId(req);
    const items = await this.childService.listChildren(familyId);
    return { items };
  }

  @NeedLogin()
  @Get(':id')
  async getChild(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ChildResponse> {
    const familyId = await this.getFamilyId(req);
    await this.familyService.assertChildInFamily(id, familyId);
    const childData = await this.childService.getChild(id);
    return { child: childData };
  }

  @NeedLogin()
  @Post()
  async createChild(
    @Req() req: Request,
    @Body() body: CreateChildRequest,
  ): Promise<ChildResponse> {
    const { userId } = req.userContext;
    const familyId = await this.getFamilyId(req);
    const created = await this.childService.createChild(familyId, body, userId);
    return { child: created };
  }

  @NeedLogin()
  @Patch(':id')
  async updateChild(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: UpdateChildRequest,
  ): Promise<ChildResponse> {
    const { userId } = req.userContext;
    const familyId = await this.getFamilyId(req);
    await this.familyService.assertChildInFamily(id, familyId);
    const updated = await this.childService.updateChild(id, body, userId);
    return { child: updated };
  }
}
