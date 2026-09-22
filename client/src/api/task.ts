import { apiClient } from './client';
import type {
  TaskTemplate,
  TaskTemplateListResponse,
  CreateTaskTemplateRequest,
  UpdateTaskTemplateRequest,
  TaskListResponse,
  TaskListQuery,
  CreateHomeworkTaskRequest,
  CreateGoalTaskRequest,
  UpdateHomeworkTaskRequest,
  SubmitTaskRequest,
  ReviewTaskRequest,
  BatchTaskResultResponse,
  TaskInstance,
} from '@shared/api.interface';

// ==================== 任务模板 ====================

export async function listTemplates(familyId: string): Promise<TaskTemplateListResponse> {
  const response = await apiClient.get<TaskTemplateListResponse>('/api/tasks/templates', {
    params: { familyId },
  });
  return response.data;
}

export async function createTemplate(
  data: CreateTaskTemplateRequest & { familyId: string },
): Promise<{ template: TaskTemplate }> {
  const response = await apiClient.post<{ template: TaskTemplate }>(
    '/api/tasks/templates',
    data,
  );
  return response.data;
}

export async function updateTemplate(
  id: string,
  data: UpdateTaskTemplateRequest,
): Promise<{ template: TaskTemplate }> {
  const response = await apiClient.patch<{ template: TaskTemplate }>(
    `/api/tasks/templates/${id}`,
    data,
  );
  return response.data;
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  const response = await apiClient.delete<{ ok: boolean }>(
    `/api/tasks/templates/${id}`,
  );
  return response.data;
}

// ==================== 任务实例 ====================

export async function generateDailyTasks(
  childId: string,
  date: string,
): Promise<{ items: TaskInstance[] }> {
  const response = await apiClient.post<{ items: TaskInstance[] }>(
    '/api/tasks/generate-daily',
    { childId, date },
  );
  return response.data;
}

export async function listTasks(query: TaskListQuery): Promise<TaskListResponse> {
  const response = await apiClient.get<TaskListResponse>('/api/tasks', {
    params: query,
  });
  return response.data;
}

export async function getTask(id: string): Promise<{ task: TaskInstance }> {
  const response = await apiClient.get<{ task: TaskInstance }>(`/api/tasks/${id}`);
  return response.data;
}

export async function createHomeworkTask(
  data: CreateHomeworkTaskRequest,
): Promise<{ task: TaskInstance }> {
  const response = await apiClient.post<{ task: TaskInstance }>(
    '/api/tasks/homework',
    data,
  );
  return response.data;
}

export async function updateTask(
  id: string,
  data: UpdateHomeworkTaskRequest,
): Promise<{ task: TaskInstance }> {
  const response = await apiClient.patch<{ task: TaskInstance }>(
    `/api/tasks/${id}`,
    data,
  );
  return response.data;
}

// ==================== 目标型任务 ====================

export async function createGoalTask(
  data: CreateGoalTaskRequest,
): Promise<{ task: TaskInstance }> {
  const response = await apiClient.post<{ task: TaskInstance }>(
    '/api/tasks/goal',
    data,
  );
  return response.data;
}

export async function addGoalProgress(
  id: string,
  delta: number,
): Promise<{ task: TaskInstance }> {
  const response = await apiClient.post<{ task: TaskInstance }>(
    `/api/tasks/${id}/goal-progress`,
    { delta },
  );
  return response.data;
}

export async function submitTask(
  id: string,
  body: SubmitTaskRequest,
): Promise<{ task: TaskInstance }> {
  const response = await apiClient.post<{ task: TaskInstance }>(
    `/api/tasks/${id}/submit`,
    body,
  );
  return response.data;
}

export async function reviewTask(
  id: string,
  data: ReviewTaskRequest,
): Promise<{ task: TaskInstance }> {
  const response = await apiClient.post<{ task: TaskInstance }>(
    `/api/tasks/${id}/review`,
    data,
  );
  return response.data;
}

/** 孩子端：多选一起提交 */
export async function batchSubmitTasks(body: {
  taskIds: string[];
  completionNote?: string;
}): Promise<BatchTaskResultResponse> {
  const response = await apiClient.post<BatchTaskResultResponse>(
    '/api/tasks/batch-submit',
    body,
  );
  return response.data;
}

/** 家长端：批量审核通过 */
export async function batchReviewTasks(body: {
  taskIds: string[];
}): Promise<BatchTaskResultResponse> {
  const response = await apiClient.post<BatchTaskResultResponse>(
    '/api/tasks/batch-review',
    body,
  );
  return response.data;
}

export async function deleteTask(id: string): Promise<{ ok: boolean }> {
  const response = await apiClient.delete<{ ok: boolean }>(`/api/tasks/${id}`);
  return response.data;
}
