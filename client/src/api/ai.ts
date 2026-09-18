import { apiClient } from './client';
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
  CreateSuggestionRequest,
  ToggleSubtaskRequest,
  HomeworkSuggestion,
  HomeworkSubtask,
} from '@shared/api.interface';

export async function getAiSetting(): Promise<AiSettingResponse> {
  const response = await apiClient.get<AiSettingResponse>('/api/ai/setting');
  return response.data;
}

export async function updateAiSetting(
  data: UpdateAiSettingRequest,
): Promise<AiSettingResponse> {
  const response = await apiClient.put<AiSettingResponse>('/api/ai/setting', data);
  return response.data;
}

export async function testConnection(): Promise<AiTestConnectionResponse> {
  const response = await apiClient.post<AiTestConnectionResponse>(
    '/api/ai/setting/test-connection',
    {},
  );
  return response.data;
}

export async function recognizeByText(
  data: AiRecognizeTextRequest,
): Promise<AiRecognizeResponse> {
  const response = await apiClient.post<AiRecognizeResponse>(
    '/api/ai/recognize/text',
    data,
  );
  return response.data;
}

export async function recognizeByImage(
  data: AiRecognizeImageRequest,
): Promise<AiRecognizeResponse> {
  const response = await apiClient.post<AiRecognizeResponse>(
    '/api/ai/recognize/image',
    data,
  );
  return response.data;
}

export async function getSuggestions(
  childId: string,
  status?: string,
): Promise<HomeworkSuggestionListResponse> {
  const params: Record<string, string> = { childId };
  if (status) params.status = status;
  const response = await apiClient.get<HomeworkSuggestionListResponse>(
    '/api/ai/suggestions',
    { params },
  );
  return response.data;
}

export async function confirmSuggestions(
  data: ConfirmSuggestionsRequest,
): Promise<{ confirmedCount: number }> {
  const response = await apiClient.post<{ confirmedCount: number }>(
    '/api/ai/suggestions/confirm',
    data,
  );
  return response.data;
}

export async function updateSuggestion(
  id: string,
  childId: string,
  data: UpdateSuggestionRequest,
): Promise<{ suggestion: HomeworkSuggestion }> {
  const response = await apiClient.patch<{ suggestion: HomeworkSuggestion }>(
    `/api/ai/suggestions/${id}`,
    { childId, ...data },
  );
  return response.data;
}

export async function discardSuggestion(
  id: string,
  childId: string,
): Promise<{ suggestion: HomeworkSuggestion }> {
  const response = await apiClient.post<{ suggestion: HomeworkSuggestion }>(
    `/api/ai/suggestions/${id}/discard`,
    { childId },
  );
  return response.data;
}

export async function createSuggestion(
  data: CreateSuggestionRequest,
): Promise<{ suggestion: HomeworkSuggestion }> {
  const response = await apiClient.post<{ suggestion: HomeworkSuggestion }>(
    '/api/ai/suggestions',
    data,
  );
  return response.data;
}

export async function toggleSubtask(
  suggestionId: string,
  subtaskId: string,
  data: ToggleSubtaskRequest,
): Promise<{ subtask: HomeworkSubtask }> {
  const response = await apiClient.post<{ subtask: HomeworkSubtask }>(
    `/api/ai/suggestions/${suggestionId}/subtasks/${subtaskId}/toggle`,
    data,
  );
  return response.data;
}
