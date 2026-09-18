import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Body,
  Query,
  Param,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';

import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';

import { AiService } from './ai.service';
import { FamilyService } from '../family/family.service';
import { ChildService } from '../child/child.service';
import type {
  AiSettingResponse,
  UpdateAiSettingRequest,
  AiRecognizeTextRequest,
  AiRecognizeImageRequest,
  AiRecognizeResponse,
  AiTestConnectionResponse,
  HomeworkSuggestionListResponse,
  ConfirmSuggestionsRequest,
  UpdateSuggestionRequest,
  HomeworkSuggestion,
  CreateSuggestionRequest,
  ToggleSubtaskRequest,
  HomeworkSubtask,
} from '@shared/api.interface';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, fieldName: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new BadRequestException(`${fieldName} 格式不正确`);
  }
}

@Controller('api/ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly familyService: FamilyService,
    private readonly childService: ChildService,
  ) {}

  /** 校验孩子属于当前家庭，避免跨家庭越权 */
  private async assertChildInFamily(
    childId: string,
    familyId: string,
  ): Promise<void> {
    const child = await this.childService.getChild(childId);
    if (child.familyId !== familyId) {
      throw new NotFoundException('孩子不存在');
    }
  }

  @NeedLogin()
  @Get('setting')
  async getSetting(@Req() req: Request): Promise<AiSettingResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const setting = await this.aiService.getAiSetting(family.id);
    return { setting };
  }

  @NeedLogin()
  @Put('setting')
  async updateSetting(
    @Req() req: Request,
    @Body() body: UpdateAiSettingRequest,
  ): Promise<AiSettingResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const setting = await this.aiService.updateAiSetting(family.id, body);
    return { setting };
  }

  @NeedLogin()
  @Post('setting/test-connection')
  async testConnection(@Req() req: Request): Promise<AiTestConnectionResponse> {
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    const result = await this.aiService.testConnection(family.id);
    return result;
  }

  @NeedLogin()
  @Post('recognize/text')
  async recognizeByText(
    @Req() req: Request,
    @Body() body: AiRecognizeTextRequest,
  ): Promise<AiRecognizeResponse> {
    const { userId } = req.userContext;
    if (!body.childId || !body.content) {
      throw new BadRequestException('childId 和 content 不能为空');
    }
    assertUuid(body.childId, 'childId');
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    const result = await this.aiService.recognizeByText(family.id, body.childId, body.content);
    return result;
  }

  @NeedLogin()
  @Post('recognize/image')
  async recognizeByImage(
    @Req() req: Request,
    @Body() body: AiRecognizeImageRequest,
  ): Promise<AiRecognizeResponse> {
    const { userId } = req.userContext;
    if (!body.childId || !body.imageUrls || body.imageUrls.length === 0) {
      throw new BadRequestException('childId 和 imageUrls 不能为空');
    }
    assertUuid(body.childId, 'childId');
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    const result = await this.aiService.recognizeByImage(family.id, body.childId, body.imageUrls);
    return result;
  }

  @NeedLogin()
  @Get('suggestions')
  async getSuggestions(
    @Req() req: Request,
    @Query('childId') childId: string,
    @Query('status') status?: string,
  ): Promise<HomeworkSuggestionListResponse> {
    if (!childId) {
      throw new BadRequestException('childId 不能为空');
    }
    assertUuid(childId, 'childId');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(childId, family.id);
    const items = await this.aiService.getSuggestions(childId, status);
    return { items };
  }

  @NeedLogin()
  @Post('suggestions')
  async createSuggestion(
    @Req() req: Request,
    @Body() body: CreateSuggestionRequest,
  ): Promise<{ suggestion: HomeworkSuggestion }> {
    const { userId } = req.userContext;
    if (!body.childId || !body.subject || !body.content) {
      throw new BadRequestException('childId、subject 和 content 不能为空');
    }
    assertUuid(body.childId, 'childId');
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    const suggestion = await this.aiService.createSuggestion(body);
    return { suggestion };
  }

  @NeedLogin()
  @Post('suggestions/:id/subtasks/:subtaskId/toggle')
  async toggleSubtask(
    @Req() req: Request,
    @Param('subtaskId') subtaskId: string,
    @Body() body: ToggleSubtaskRequest,
  ): Promise<{ subtask: HomeworkSubtask }> {
    if (!body.childId) {
      throw new BadRequestException('childId 不能为空');
    }
    assertUuid(body.childId, 'childId');
    assertUuid(subtaskId, 'subtaskId');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    const subtask = await this.aiService.toggleSubtask(
      subtaskId,
      body.childId,
      body.isCompleted,
    );
    return { subtask };
  }

  @NeedLogin()
  @Post('suggestions/confirm')
  async confirmSuggestions(
    @Req() req: Request,
    @Body() body: ConfirmSuggestionsRequest,
  ): Promise<{ confirmedCount: number }> {
    if (!body.childId || !body.suggestionIds) {
      throw new BadRequestException('参数不完整');
    }
    assertUuid(body.childId, 'childId');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    return this.aiService.confirmSuggestions(body.suggestionIds, body.childId);
  }

  @NeedLogin()
  @Patch('suggestions/:id')
  async updateSuggestion(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateSuggestionRequest & { childId: string },
  ): Promise<{ suggestion: HomeworkSuggestion }> {
    if (!body.childId) {
      throw new BadRequestException('childId 不能为空');
    }
    assertUuid(body.childId, 'childId');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    const suggestion = await this.aiService.updateSuggestion(id, body.childId, body);
    return { suggestion };
  }

  @NeedLogin()
  @Post('suggestions/:id/discard')
  async discardSuggestion(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { childId: string },
  ): Promise<{ suggestion: HomeworkSuggestion }> {
    if (!body.childId) {
      throw new BadRequestException('childId 不能为空');
    }
    assertUuid(body.childId, 'childId');
    const { userId } = req.userContext;
    const family = await this.familyService.getOrCreateFamily(userId);
    await this.assertChildInFamily(body.childId, family.id);
    const suggestion = await this.aiService.discardSuggestion(id, body.childId);
    return { suggestion };
  }
}
