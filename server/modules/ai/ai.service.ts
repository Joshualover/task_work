import { Inject, Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { HttpService } from '@nestjs/axios';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { firstValueFrom } from 'rxjs';

import { todayString } from '@server/common/utils/date';
import { TaskService } from '../task/task.service';
import type { TaskCreator } from '../task/task.service';
import {
  encryptSecret,
  decryptSecret,
  isEncryptionEnabled,
} from '@server/common/utils/crypto';

import {
  aiSetting,
  aiRecognitionLog,
  homeworkSuggestion,
  homeworkSubtask,
  taskInstance,
} from '@server/database/schema';
import type {
  AiSetting as AiSettingType,
  HomeworkSuggestion as HomeworkSuggestionType,
  HomeworkSubtask as HomeworkSubtaskType,
  AiRecognitionResult,
  UpdateAiSettingRequest,
  UpdateSuggestionRequest,
  CreateSuggestionRequest,
} from '@shared/api.interface';

const MOCK_TASKS: AiRecognitionResult['tasks'] = [
  { subject: '语文', content: '抄写生字词 2 遍', quantity: 2, suggestedPoints: 10 },
  { subject: '数学', content: '完成口算练习第 15 页', quantity: 1, suggestedPoints: 15 },
  { subject: '英语', content: '背诵 Unit 3 单词', quantity: 10, suggestedPoints: 20 },
];

/**
 * 每科作业（语文/数学/英语/…）的固定积分。
 * 各科一致，且与子任务数量无关——子任务只是完成检查项，不计积分。
 */
const SUBJECT_HOMEWORK_POINTS = 10;

// 私网 / 本机 / 链路本地等不应被服务端主动请求的地址段
const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  // IPv6: 环回 / 唯一本地 / 链路本地
  if (host === '::1' || /^f[cd]/.test(host) || /^fe80/.test(host)) {
    return true;
  }
  return PRIVATE_IPV4_PATTERNS.some((re) => re.test(host));
}

/**
 * 校验用户配置的 AI 接口地址，避免 SSRF：
 * 仅允许 http/https，且不能指向本机 / 内网 / 链路本地地址。
 */
function assertSafeExternalUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException(
      'API 地址格式不正确，请输入完整的 URL（包含 https:// 或 http://）',
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('API 地址仅支持 http/https 协议');
  }
  if (isPrivateHost(url.hostname)) {
    throw new BadRequestException('出于安全考虑，API 地址不能指向内网或本机地址');
  }
}

/** 要求模型只输出结构化 JSON 的系统提示词 */
const TASK_JSON_INSTRUCTION = [
  '你是小学作业识别助手。请从用户提供的作业内容中提取任务。',
  '只输出 JSON，不要输出任何解释或 Markdown 代码块。',
  'JSON 格式：{"tasks":[{"subject":"语文|数学|英语|科学|其他","content":"任务描述","quantity":1,"suggestedPoints":10}]}',
].join('\n');

/**
 * 将用户填写的地址规范化为可用的 chat/completions 地址：
 * - 已是 .../chat/completions → 原样
 * - 空路径 / 以 /vN 结尾（如 https://api.deepseek.com、https://api.openai.com/v1）
 *   → 视为 OpenAI 兼容 base，补全 /chat/completions
 * - 其他自定义路径 → 原样（走自定义契约）
 */
function resolveChatEndpoint(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(path)) return u.toString();
    if (path === '' || /\/v\d+$/i.test(path)) {
      u.pathname = `${path}/chat/completions`;
      return u.toString();
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/** 是否为 OpenAI 兼容的 chat/completions 接口 */
function isOpenAiChatEndpoint(apiUrl: string): boolean {
  try {
    return /\/chat\/completions\/?$/i.test(
      new URL(resolveChatEndpoint(apiUrl)).pathname,
    );
  } catch {
    return false;
  }
}

/** 将上游错误转成可读提示 */
function describeUpstreamError(error: unknown): string {
  const e = error as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  const status = e.response?.status;
  const data = e.response?.data as { error?: { message?: string } } | undefined;
  const detail = data?.error?.message;
  if (status === 401 || status === 403) return 'API 密钥无效或无权限';
  if (status === 404)
    return '接口地址不存在（404），请确认填写的是完整的 chat/completions 地址';
  if (status && status >= 500)
    return `上游服务异常（${status}）${detail ? `：${detail}` : ''}`;
  if (status === 400 || status === 422)
    return `请求被拒绝（${status}）${detail ? `：${detail}` : ''}`;
  return e.message ?? '调用失败';
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function normalizeTasks(raw: unknown): AiRecognitionResult['tasks'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      subject: String(t.subject ?? '其他'),
      content: String(t.content ?? '').trim(),
      quantity: Number(t.quantity ?? 1) || 1,
      suggestedPoints: Number(t.suggestedPoints ?? 10) || 10,
    }))
    .filter((t) => t.content.length > 0);
}

/** 从模型文本中解析 tasks（兼容裸 JSON / 代码块 / 夹杂说明文字） */
function parseTasksFromModelText(text: string): AiRecognitionResult['tasks'] {
  const candidate = stripCodeFence(text);
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(candidate);
  if (!parsed) {
    const match = candidate.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) parsed = tryParse(match[0]);
  }
  if (!parsed) return [];
  if (Array.isArray(parsed)) return normalizeTasks(parsed);
  return normalizeTasks((parsed as { tasks?: unknown }).tasks);
}

/**
 * 从上游响应中提取 tasks：
 * - 自定义契约：`{ tasks: [...] }`
 * - OpenAI 兼容：`{ choices: [{ message: { content: "<JSON>" } }] }`
 */
function extractTasks(data: unknown): AiRecognitionResult['tasks'] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.tasks)) return normalizeTasks(d.tasks);
  const choices = d.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const c0 = choices[0] as { message?: { content?: unknown }; text?: unknown };
    const text =
      typeof c0?.message?.content === 'string'
        ? c0.message.content
        : typeof c0?.text === 'string'
          ? c0.text
          : '';
    if (text) return parseTasksFromModelText(text);
  }
  return [];
}

/** 上游是否返回了有效回复（用于连通性测试） */
function hasModelReply(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.tasks)) return true;
  const choices = d.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const c0 = choices[0] as { message?: { content?: unknown }; text?: unknown };
    return (
      typeof c0?.message?.content === 'string' || typeof c0?.text === 'string'
    );
  }
  return false;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly httpService: HttpService,
    private readonly taskService: TaskService,
  ) {}

  async getAiSetting(familyId: string): Promise<AiSettingType | null> {
    const rows = await this.db
      .select()
      .from(aiSetting)
      .where(eq(aiSetting.familyId, familyId))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      familyId: row.familyId,
      apiUrl: row.apiUrl ?? null,
      apiKey: null,
      modelName: row.modelName ?? null,
      imageApiUrl: row.imageApiUrl ?? null,
      imageApiKey: null,
      imageModelName: row.imageModelName ?? null,
      isEnabled: row.isEnabled,
      hasApiKey: !!row.apiKey,
      hasImageApiKey: !!row.imageApiKey,
    };
  }

  async updateAiSetting(
    familyId: string,
    data: UpdateAiSettingRequest,
  ): Promise<AiSettingType> {
    if ((data.apiKey || data.imageApiKey) && !isEncryptionEnabled()) {
      this.logger.warn(
        'AI_SETTING_ENCRYPTION_KEY 未配置或长度不足 16，AI 密钥将以明文存储',
      );
    }

    const existing = await this.db
      .select()
      .from(aiSetting)
      .where(eq(aiSetting.familyId, familyId))
      .limit(1);

    if (existing.length > 0) {
      const patch: Record<string, unknown> = {};
      if (data.apiUrl !== undefined) patch.apiUrl = data.apiUrl || null;
      if (data.apiKey !== undefined && data.apiKey !== '') patch.apiKey = encryptSecret(data.apiKey);
      if (data.modelName !== undefined) patch.modelName = data.modelName || null;
      if (data.imageApiUrl !== undefined) patch.imageApiUrl = data.imageApiUrl || null;
      if (data.imageApiKey !== undefined && data.imageApiKey !== '') patch.imageApiKey = encryptSecret(data.imageApiKey);
      if (data.imageModelName !== undefined) patch.imageModelName = data.imageModelName || null;
      if (data.isEnabled !== undefined) patch.isEnabled = data.isEnabled;

      const updated = await this.db
        .update(aiSetting)
        .set(patch)
        .where(eq(aiSetting.id, existing[0].id))
        .returning();

      const row = updated[0];
      return {
        id: row.id,
        familyId: row.familyId,
        apiUrl: row.apiUrl ?? null,
        apiKey: null,
        modelName: row.modelName ?? null,
        imageApiUrl: row.imageApiUrl ?? null,
        imageApiKey: null,
        imageModelName: row.imageModelName ?? null,
        isEnabled: row.isEnabled,
        hasApiKey: !!row.apiKey,
        hasImageApiKey: !!row.imageApiKey,
      };
    }

    const inserted = await this.db
      .insert(aiSetting)
      .values({
        familyId,
        apiUrl: data.apiUrl || null,
        apiKey: data.apiKey ? encryptSecret(data.apiKey) : null,
        modelName: data.modelName || null,
        imageApiUrl: data.imageApiUrl || null,
        imageApiKey: data.imageApiKey ? encryptSecret(data.imageApiKey) : null,
        imageModelName: data.imageModelName || null,
        isEnabled: data.isEnabled ?? false,
      })
      .returning();

    const row = inserted[0];
    return {
      id: row.id,
      familyId: row.familyId,
      apiUrl: row.apiUrl ?? null,
      apiKey: null,
      modelName: row.modelName ?? null,
      imageApiUrl: row.imageApiUrl ?? null,
      imageApiKey: null,
      imageModelName: row.imageModelName ?? null,
      isEnabled: row.isEnabled,
      hasApiKey: !!row.apiKey,
      hasImageApiKey: !!row.imageApiKey,
    };
  }

  private async getFullAiSetting(familyId: string): Promise<typeof aiSetting.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(aiSetting)
      .where(eq(aiSetting.familyId, familyId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    // 解密后用于服务端调用；密钥不会回传前端
    return {
      ...row,
      apiKey: decryptSecret(row.apiKey),
      imageApiKey: decryptSecret(row.imageApiKey),
    };
  }

  /** 构造文字识别请求体：兼容自定义契约与 OpenAI 兼容接口 */
  private buildTextRequestBody(
    apiUrl: string,
    model: string | null,
    content: string,
  ): Record<string, unknown> {
    if (isOpenAiChatEndpoint(apiUrl)) {
      return {
        model: model ?? undefined,
        temperature: 0,
        messages: [
          { role: 'system', content: TASK_JSON_INSTRUCTION },
          { role: 'user', content },
        ],
      };
    }
    return { content, model: model ?? undefined };
  }

  /** 构造图片识别请求体：兼容自定义契约与 OpenAI 兼容（vision）接口 */
  private buildImageRequestBody(
    apiUrl: string,
    model: string | null,
    imageUrls: string[],
  ): Record<string, unknown> {
    if (isOpenAiChatEndpoint(apiUrl)) {
      return {
        model: model ?? undefined,
        temperature: 0,
        messages: [
          { role: 'system', content: TASK_JSON_INSTRUCTION },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请识别这张作业图片中的任务。' },
              ...imageUrls.map((url) => ({
                type: 'image_url',
                image_url: { url },
              })),
            ],
          },
        ],
      };
    }
    return { imageUrls, model: model ?? undefined };
  }

  async testConnection(familyId: string): Promise<{ success: boolean; message: string }> {
    const setting = await this.getFullAiSetting(familyId);
    if (!setting || !setting.apiUrl) {
      throw new BadRequestException('请先配置 API 地址');
    }

    if (setting.apiUrl.toLowerCase().includes('mock')) {
      return { success: true, message: '演示模式配置有效' };
    }

    assertSafeExternalUrl(setting.apiUrl);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (setting.apiKey) {
      headers.Authorization = `Bearer ${setting.apiKey}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>(
          resolveChatEndpoint(setting.apiUrl),
          this.buildTextRequestBody(
            setting.apiUrl,
            setting.modelName,
            '连通性测试：请按约定返回 JSON。',
          ),
          { headers, timeout: 30000 },
        ),
      );
      const tasks = extractTasks(response.data);
      if (tasks.length > 0) {
        return { success: true, message: '连接成功，接口返回格式正确' };
      }
      if (hasModelReply(response.data)) {
        return { success: true, message: '连接成功（模型已响应）' };
      }
      return { success: false, message: '接口响应格式不符合预期' };
    } catch (error) {
      const axiosError = error as {
        response?: { status: number; data?: unknown };
        message: string;
        config?: { url?: string };
      };
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;
      const detail =
        responseData && typeof responseData === 'object' && 'error' in responseData
          ? (responseData as { error?: { message?: string } }).error?.message
          : typeof responseData === 'string'
            ? responseData.slice(0, 200)
            : undefined;

      this.logger.error(
        `AI test connection failed: url=${axiosError.config?.url ?? setting.apiUrl} status=${status ?? 'N/A'} message=${axiosError.message} detail=${detail ?? 'N/A'}`,
      );

      if (status === 401 || status === 403) {
        throw new BadRequestException('连接失败：API 密钥无效或无权限');
      }
      if (status === 404) {
        throw new BadRequestException('连接失败：API 地址不存在（404）');
      }
      if (status && status >= 500) {
        throw new BadRequestException(
          `连接失败：上游服务异常（${status}）${detail ? `：${detail}` : ''}`,
        );
      }
      throw new BadRequestException(`连接失败：${axiosError.message}`);
    }
  }

  /**
   * 将 AI 返回的 tasks 按 subject 分组：
   * - 每个科目合并为一个作业任务，名称统一为「<科目>作业」（如：数学作业）；
   * - 该科目识别到的每条内容作为子任务（仅完成检查项，不计积分）；
   * - 每科积分固定一致（SUBJECT_HOMEWORK_POINTS），与子任务数量无关。
   */
  private groupTasksBySubject(tasks: AiRecognitionResult['tasks']): Array<{
    subject: string;
    content: string;
    quantity: number;
    suggestedPoints: number;
    subtasks: Array<{ content: string; points: number; sortOrder: number }>;
  }> {
    const bySubject = new Map<string, AiRecognitionResult['tasks']>();
    for (const task of tasks) {
      const existing = bySubject.get(task.subject) ?? [];
      existing.push(task);
      bySubject.set(task.subject, existing);
    }

    const result: Array<{
      subject: string;
      content: string;
      quantity: number;
      suggestedPoints: number;
      subtasks: Array<{ content: string; points: number; sortOrder: number }>;
    }> = [];

    for (const [subject, subjectTasks] of bySubject) {
      // 任务名统一为「<科目>作业」（如：数学作业），原内容转为子任务
      const subtasks = subjectTasks.map((task, idx) => ({
        content: task.content,
        points: 0,
        sortOrder: idx,
      }));
      result.push({
        subject,
        content: `${subject}作业`,
        quantity: subjectTasks.length,
        suggestedPoints: SUBJECT_HOMEWORK_POINTS,
        subtasks,
      });
    }

    return result;
  }

  /**
   * 将数据库行映射为 HomeworkSuggestionType，可选地附带子任务。
   */
  private mapRowToSuggestion(
    row: typeof homeworkSuggestion.$inferSelect,
    subtasks: HomeworkSubtaskType[] = [],
  ): HomeworkSuggestionType {
    return {
      id: row.id,
      childId: row.childId,
      recognitionLogId: row.recognitionLogId ?? null,
      subject: row.subject,
      content: row.content,
      quantity: row.quantity ?? 1,
      suggestedPoints: row.suggestedPoints,
      deadline: row.deadline ?? null,
      extendDays: row.extendDays ?? 0,
      status: row.status as 'pending' | 'confirmed' | 'discarded',
      createdAt: row.createdAt.toISOString(),
      subtasks,
    };
  }

  /**
   * 将子任务数据库行映射为 HomeworkSubtaskType。
   */
  private mapSubtaskRow(
    row: typeof homeworkSubtask.$inferSelect,
  ): HomeworkSubtaskType {
    return {
      id: row.id,
      suggestionId: row.suggestionId,
      content: row.content,
      points: row.points,
      sortOrder: row.sortOrder,
      isCompleted: row.isCompleted,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 批量插入作业建议及其子任务（事务内完成）。
   * 返回完整的 HomeworkSuggestionType 数组，每项含对应的 subtasks。
   */
  private async insertSuggestionsWithSubtasks(
    childId: string,
    logId: string,
    grouped: Array<{
      subject: string;
      content: string;
      quantity: number;
      suggestedPoints: number;
      subtasks: Array<{ content: string; points: number; sortOrder: number }>;
    }>,
  ): Promise<HomeworkSuggestionType[]> {
    if (grouped.length === 0) return [];

    const result = await this.db.transaction(async (tx) => {
      const suggestionValues = grouped.map((g) => ({
        childId,
        recognitionLogId: logId,
        subject: g.subject,
        content: g.content,
        quantity: g.quantity,
        suggestedPoints: g.suggestedPoints,
        status: 'pending' as const,
      }));

      const insertedSuggestions = await tx
        .insert(homeworkSuggestion)
        .values(suggestionValues)
        .returning();

      const allSubtaskValues: Array<{
        suggestionId: string;
        content: string;
        points: number;
        sortOrder: number;
      }> = [];

      for (let i = 0; i < grouped.length; i++) {
        const g = grouped[i];
        const suggestionId = insertedSuggestions[i].id;
        for (const st of g.subtasks) {
          allSubtaskValues.push({
            suggestionId,
            content: st.content,
            points: st.points,
            sortOrder: st.sortOrder,
          });
        }
      }

      let insertedSubtasks: typeof homeworkSubtask.$inferSelect[] = [];
      if (allSubtaskValues.length > 0) {
        insertedSubtasks = await tx
          .insert(homeworkSubtask)
          .values(allSubtaskValues)
          .returning();
      }

      const subtasksBySuggestion = new Map<string, HomeworkSubtaskType[]>();
      for (const st of insertedSubtasks) {
        const arr = subtasksBySuggestion.get(st.suggestionId) ?? [];
        arr.push(this.mapSubtaskRow(st));
        subtasksBySuggestion.set(st.suggestionId, arr);
      }

      const suggestions: HomeworkSuggestionType[] = insertedSuggestions.map((row) => {
        const sts = subtasksBySuggestion.get(row.id) ?? [];
        sts.sort((a, b) => a.sortOrder - b.sortOrder);
        return this.mapRowToSuggestion(row, sts);
      });

      return suggestions;
    });

    return result;
  }

  async recognizeByText(
    familyId: string,
    childId: string,
    content: string,
  ): Promise<{ suggestions: HomeworkSuggestionType[]; logId: string; notConfigured?: boolean }> {
    const setting = await this.getFullAiSetting(familyId);

    if (!setting || !setting.isEnabled || !setting.apiUrl) {
      const mockResult = { tasks: MOCK_TASKS };
      const logRows = await this.db
        .insert(aiRecognitionLog)
        .values({
          familyId,
          childId,
          inputType: 'text',
          inputContent: content,
          resultJson: mockResult as unknown as Record<string, unknown>,
          status: 'success',
        })
        .returning({ id: aiRecognitionLog.id });

      const logId = logRows[0].id;
      const tasks = mockResult.tasks ?? [];
      const grouped = this.groupTasksBySubject(tasks);
      const suggestions = await this.insertSuggestionsWithSubtasks(childId, logId, grouped);

      return { suggestions, logId, notConfigured: true };
    }

    let result: AiRecognitionResult;
    let logId: string;

    try {
      if (setting.apiUrl.toLowerCase().includes('mock')) {
        result = { tasks: MOCK_TASKS };
      } else {
        assertSafeExternalUrl(setting.apiUrl);
        const response = await firstValueFrom(
          this.httpService.post<unknown>(
            resolveChatEndpoint(setting.apiUrl),
            this.buildTextRequestBody(setting.apiUrl, setting.modelName, content),
            {
              headers: {
                Authorization: `Bearer ${setting.apiKey ?? ''}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            },
          ),
        );
        // 模型已响应但没有可解析的任务时，返回空结果（由前端提示“未识别到内容”），不视为错误
        result = { tasks: extractTasks(response.data) };
      }

      const logRows = await this.db
        .insert(aiRecognitionLog)
        .values({
          familyId,
          childId,
          inputType: 'text',
          inputContent: content,
          resultJson: result as unknown as Record<string, unknown>,
          status: 'success',
        })
        .returning({ id: aiRecognitionLog.id });

      logId = logRows[0].id;
    } catch (error) {
      const errorMessage = describeUpstreamError(error);
      this.logger.error(`AI recognize error: ${errorMessage}`);

      const logRows = await this.db
        .insert(aiRecognitionLog)
        .values({
          familyId,
          childId,
          inputType: 'text',
          inputContent: content,
          status: 'failed',
          errorMessage,
        })
        .returning({ id: aiRecognitionLog.id });

      logId = logRows[0].id;
      throw new BadRequestException(`AI 识别失败：${errorMessage}`);
    }

    const tasks = result.tasks ?? [];
    if (tasks.length === 0) {
      return { suggestions: [], logId };
    }

    const grouped = this.groupTasksBySubject(tasks);
    const suggestions = await this.insertSuggestionsWithSubtasks(childId, logId, grouped);

    return { suggestions, logId };
  }

  async recognizeByImage(
    familyId: string,
    childId: string,
    imageUrls: string[],
  ): Promise<{ suggestions: HomeworkSuggestionType[]; logId: string; notConfigured?: boolean }> {
    const setting = await this.getFullAiSetting(familyId);
    // 图片配置留空时回退到文字识别配置（与前端提示一致）
    const imageApiUrl = setting?.imageApiUrl || setting?.apiUrl || null;
    const imageApiKey = setting?.imageApiKey || setting?.apiKey || null;
    const imageModelName = setting?.imageModelName || setting?.modelName || null;
    const isConfigured = setting?.isEnabled && !!imageApiUrl;

    if (!isConfigured) {
      const mockResult = { tasks: MOCK_TASKS };
      const logRows = await this.db
        .insert(aiRecognitionLog)
        .values({
          familyId,
          childId,
          inputType: 'image',
          imageUrl: imageUrls.join(','),
          resultJson: mockResult as unknown as Record<string, unknown>,
          status: 'success',
        })
        .returning({ id: aiRecognitionLog.id });

      const logId = logRows[0].id;
      const tasks = mockResult.tasks ?? [];
      const grouped = this.groupTasksBySubject(tasks);
      const suggestions = await this.insertSuggestionsWithSubtasks(childId, logId, grouped);

      return { suggestions, logId, notConfigured: true };
    }

    let result: AiRecognitionResult;
    let logId: string;

    try {
      if (imageApiUrl!.toLowerCase().includes('mock')) {
        result = { tasks: MOCK_TASKS };
      } else {
        assertSafeExternalUrl(imageApiUrl!);
        const response = await firstValueFrom(
          this.httpService.post<unknown>(
            resolveChatEndpoint(imageApiUrl!),
            this.buildImageRequestBody(imageApiUrl!, imageModelName, imageUrls),
            {
              headers: {
                Authorization: `Bearer ${imageApiKey ?? ''}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            },
          ),
        );
        // 模型已响应但没有可解析的任务时，返回空结果（由前端提示“未识别到内容”），不视为错误
        result = { tasks: extractTasks(response.data) };
      }

      const logRows = await this.db
        .insert(aiRecognitionLog)
        .values({
          familyId,
          childId,
          inputType: 'image',
          imageUrl: imageUrls.join(','),
          resultJson: result as unknown as Record<string, unknown>,
          status: 'success',
        })
        .returning({ id: aiRecognitionLog.id });

      logId = logRows[0].id;
    } catch (error) {
      const errorMessage = describeUpstreamError(error);
      this.logger.error(`AI image recognize error: ${errorMessage}`);

      const logRows = await this.db
        .insert(aiRecognitionLog)
        .values({
          familyId,
          childId,
          inputType: 'image',
          imageUrl: imageUrls.join(','),
          status: 'failed',
          errorMessage,
        })
        .returning({ id: aiRecognitionLog.id });

      logId = logRows[0].id;
      throw new BadRequestException(`AI 图片识别失败：${errorMessage}`);
    }

    const tasks = result.tasks ?? [];
    if (tasks.length === 0) {
      return { suggestions: [], logId };
    }

    const grouped = this.groupTasksBySubject(tasks);
    const suggestions = await this.insertSuggestionsWithSubtasks(childId, logId, grouped);

    return { suggestions, logId };
  }

  async getSuggestions(
    childId: string,
    status?: string,
  ): Promise<HomeworkSuggestionType[]> {
    const conditions = [eq(homeworkSuggestion.childId, childId)];
    if (status) {
      conditions.push(eq(homeworkSuggestion.status, status));
    }

    const query =
      conditions.length > 1
        ? this.db.select().from(homeworkSuggestion).where(and(...conditions))
        : this.db.select().from(homeworkSuggestion).where(conditions[0]);

    const rows = await query.orderBy(homeworkSuggestion.createdAt);

    if (rows.length === 0) return [];

    const suggestionIds = rows.map((row) => row.id);
    const subtaskRows = await this.db
      .select()
      .from(homeworkSubtask)
      .where(inArray(homeworkSubtask.suggestionId, suggestionIds))
      .orderBy(homeworkSubtask.sortOrder);

    const subtasksBySuggestion = new Map<string, HomeworkSubtaskType[]>();
    for (const st of subtaskRows) {
      const arr = subtasksBySuggestion.get(st.suggestionId) ?? [];
      arr.push(this.mapSubtaskRow(st));
      subtasksBySuggestion.set(st.suggestionId, arr);
    }

    return rows.map((row) => {
      const sts = subtasksBySuggestion.get(row.id) ?? [];
      return this.mapRowToSuggestion(row, sts);
    });
  }

  async confirmSuggestions(
    suggestionIds: string[],
    childId: string,
    taskId?: string,
    creator?: TaskCreator,
  ): Promise<{ confirmedCount: number }> {
    if (suggestionIds.length === 0) {
      return { confirmedCount: 0 };
    }

    const todayStr = todayString();

    const result = await this.db.transaction(async (tx) => {
      const suggestions = await tx
        .select()
        .from(homeworkSuggestion)
        .where(
          and(
            eq(homeworkSuggestion.childId, childId),
            inArray(homeworkSuggestion.id, suggestionIds),
            eq(homeworkSuggestion.status, 'pending'),
          ),
        );

      if (suggestions.length === 0) {
        return { confirmedCount: 0 };
      }

      await tx
        .update(homeworkSuggestion)
        .set({ status: 'confirmed' })
        .where(inArray(homeworkSuggestion.id, suggestions.map((s) => s.id)));

      // 编辑已有任务：把建议关联到任务实例（不新建任务）
      if (taskId) {
        const s = suggestions[0];
        await tx
          .update(taskInstance)
          .set({
            suggestionId: s.id,
            name: s.content,
            subject: s.subject,
            points: s.suggestedPoints,
            deadline: s.deadline ?? null,
            extendDays: s.extendDays ?? 0,
          })
          .where(eq(taskInstance.id, taskId));
        return { confirmedCount: suggestions.length };
      }

      const taskValues = suggestions.map((s) => ({
        childId: s.childId,
        type: 'homework' as const,
        name: s.content,
        subject: s.subject,
        points: s.suggestedPoints,
        suggestionId: s.id,
        deadline: s.deadline ?? null,
        extendDays: s.extendDays ?? 0,
        taskDate: todayStr,
        status: 'pending' as const,
        creatorUserId: creator?.userId ?? null,
        creatorName: creator?.name ?? null,
      }));

      await tx.insert(taskInstance).values(taskValues);

      return { confirmedCount: suggestions.length };
    });

    return result;
  }

  async updateSuggestion(
    id: string,
    childId: string,
    data: UpdateSuggestionRequest,
  ): Promise<HomeworkSuggestionType> {
    const result = await this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(homeworkSuggestion)
        .where(and(eq(homeworkSuggestion.id, id), eq(homeworkSuggestion.childId, childId)))
        .limit(1);

      if (existing.length === 0) {
        throw new BadRequestException('建议不存在或无权限修改');
      }

      const patch: Record<string, unknown> = {};
      if (data.subject !== undefined) patch.subject = data.subject;
      if (data.content !== undefined) patch.content = data.content;
      if (data.quantity !== undefined) patch.quantity = data.quantity;
      if (data.deadline !== undefined) {
        patch.deadline = data.deadline ? data.deadline.split('T')[0] : null;
      }
      if (data.extendDays !== undefined) {
        patch.extendDays = data.extendDays;
      }

      // 如果有 subtasks 字段，做全量替换（子任务不计积分，不影响 suggestedPoints）
      let updatedSubtasks: HomeworkSubtaskType[] = [];
      if (data.subtasks !== undefined) {
        const incoming = data.subtasks;

        // suggestedPoints 不再由子任务求和得出；仅当显式传入时更新
        if (data.suggestedPoints !== undefined) {
          patch.suggestedPoints = data.suggestedPoints;
        }

        // 获取现有的子任务
        const existingSubtasks = await tx
          .select()
          .from(homeworkSubtask)
          .where(eq(homeworkSubtask.suggestionId, id));

        const existingIds = new Set(existingSubtasks.map((st) => st.id));
        const incomingIds = new Set(incoming.filter((st) => st.id).map((st) => st.id!));

        // 删除不在 incoming 中的旧子任务
        const toDelete = existingSubtasks
          .filter((st) => !incomingIds.has(st.id))
          .map((st) => st.id);
        if (toDelete.length > 0) {
          await tx.delete(homeworkSubtask).where(inArray(homeworkSubtask.id, toDelete));
        }

        // 更新已有 id 的子任务
        for (const st of incoming) {
          if (st.id && existingIds.has(st.id)) {
            await tx
              .update(homeworkSubtask)
              .set({
                content: st.content,
                points: 0,
                sortOrder: st.sortOrder,
              })
              .where(eq(homeworkSubtask.id, st.id));
          }
        }

        // 新增没有 id 的子任务
        const newSubtasks = incoming.filter((st) => !st.id);
        if (newSubtasks.length > 0) {
          await tx
            .insert(homeworkSubtask)
            .values(
              newSubtasks.map((st) => ({
                suggestionId: id,
                content: st.content,
                points: 0,
                sortOrder: st.sortOrder,
              })),
            );
        }

        // 读取更新后的全部子任务
        const allSubtasks = await tx
          .select()
          .from(homeworkSubtask)
          .where(eq(homeworkSubtask.suggestionId, id))
          .orderBy(homeworkSubtask.sortOrder);
        updatedSubtasks = allSubtasks.map((st) => this.mapSubtaskRow(st));
      } else {
        // 没有 subtasks 字段时，suggestedPoints 按原逻辑处理
        if (data.suggestedPoints !== undefined) {
          patch.suggestedPoints = data.suggestedPoints;
        }
      }

      if (Object.keys(patch).length === 0) {
        // 没有需要更新的主表字段，直接返回当前状态
        const current = existing[0];
        if (data.subtasks === undefined) {
          // 如果没传 subtasks，需要读出现有 subtasks 返回
          const currentSubtasks = await tx
            .select()
            .from(homeworkSubtask)
            .where(eq(homeworkSubtask.suggestionId, id))
            .orderBy(homeworkSubtask.sortOrder);
          updatedSubtasks = currentSubtasks.map((st) => this.mapSubtaskRow(st));
        }
        return this.mapRowToSuggestion(current, updatedSubtasks);
      }

      const updated = await tx
        .update(homeworkSuggestion)
        .set(patch)
        .where(and(eq(homeworkSuggestion.id, id), eq(homeworkSuggestion.childId, childId)))
        .returning();

      const row = updated[0];

      if (data.subtasks === undefined) {
        const currentSubtasks = await tx
          .select()
          .from(homeworkSubtask)
          .where(eq(homeworkSubtask.suggestionId, id))
          .orderBy(homeworkSubtask.sortOrder);
        updatedSubtasks = currentSubtasks.map((st) => this.mapSubtaskRow(st));
      }

      return this.mapRowToSuggestion(row, updatedSubtasks);
    });

    return result;
  }

  async discardSuggestion(id: string, childId: string): Promise<HomeworkSuggestionType> {
    const result = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(homeworkSuggestion)
        .set({ status: 'discarded' })
        .where(
          and(
            eq(homeworkSuggestion.id, id),
            eq(homeworkSuggestion.childId, childId),
            eq(homeworkSuggestion.status, 'pending'),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new BadRequestException('建议不存在或无法丢弃');
      }

      const row = updated[0];
      const subtaskRows = await tx
        .select()
        .from(homeworkSubtask)
        .where(eq(homeworkSubtask.suggestionId, id))
        .orderBy(homeworkSubtask.sortOrder);

      const subtasks = subtaskRows.map((st) => this.mapSubtaskRow(st));
      return this.mapRowToSuggestion(row, subtasks);
    });

    return result;
  }

  async createSuggestion(dto: CreateSuggestionRequest): Promise<HomeworkSuggestionType> {
    const result = await this.db.transaction(async (tx) => {
      const subtasksInput = dto.subtasks ?? [];
      // 每科作业积分固定统一，子任务不计积分
      const suggestedPoints = dto.suggestedPoints ?? SUBJECT_HOMEWORK_POINTS;

      const inserted = await tx
        .insert(homeworkSuggestion)
        .values({
          childId: dto.childId,
          subject: dto.subject,
          content: dto.content,
          quantity: dto.quantity ?? 1,
          suggestedPoints,
          deadline: dto.deadline ? dto.deadline.split('T')[0] : null,
          extendDays: dto.extendDays ?? 0,
          status: 'pending' as const,
        })
        .returning();

      const row = inserted[0];

      let subtasks: HomeworkSubtaskType[] = [];
      if (subtasksInput.length > 0) {
        const insertedSubtasks = await tx
          .insert(homeworkSubtask)
          .values(
            subtasksInput.map((st) => ({
              suggestionId: row.id,
              content: st.content,
              points: 0,
              sortOrder: st.sortOrder,
            })),
          )
          .returning();

        subtasks = insertedSubtasks
          .map((st) => this.mapSubtaskRow(st))
          .sort((a, b) => a.sortOrder - b.sortOrder);
      }

      return this.mapRowToSuggestion(row, subtasks);
    });

    return result;
  }

  async toggleSubtask(
    subtaskId: string,
    childId: string,
    isCompleted: boolean,
  ): Promise<HomeworkSubtaskType> {
    // 先验证子任务所属的建议是否属于该孩子
    const subtaskWithSuggestion = await this.db
      .select({
        subtask: homeworkSubtask,
        suggestionChildId: homeworkSuggestion.childId,
      })
      .from(homeworkSubtask)
      .innerJoin(homeworkSuggestion, eq(homeworkSubtask.suggestionId, homeworkSuggestion.id))
      .where(eq(homeworkSubtask.id, subtaskId))
      .limit(1);

    if (subtaskWithSuggestion.length === 0) {
      throw new NotFoundException('子任务不存在');
    }

    if (subtaskWithSuggestion[0].suggestionChildId !== childId) {
      throw new BadRequestException('无权限操作该子任务');
    }

    const updated = await this.db
      .update(homeworkSubtask)
      .set({ isCompleted })
      .where(eq(homeworkSubtask.id, subtaskId))
      .returning();

    const suggestionId = subtaskWithSuggestion[0].subtask.suggestionId;

    // 子任务全部完成时，自动提交为「待审核」，等待家长审批（不自动完成）
    const allSubtasks = await this.db
      .select({ isCompleted: homeworkSubtask.isCompleted })
      .from(homeworkSubtask)
      .where(eq(homeworkSubtask.suggestionId, suggestionId));

    if (allSubtasks.length > 0 && allSubtasks.every((s) => s.isCompleted)) {
      const linkedTask = await this.db
        .select({ id: taskInstance.id })
        .from(taskInstance)
        .where(eq(taskInstance.suggestionId, suggestionId))
        .orderBy(desc(taskInstance.createdAt))
        .limit(1);
      if (linkedTask.length > 0) {
        await this.taskService.autoSubmitBySubtasks(linkedTask[0].id);
      }
    }

    return this.mapSubtaskRow(updated[0]);
  }
}
