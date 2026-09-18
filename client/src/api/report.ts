import { apiClient } from './client';
import type { ReportStatsResponse } from '@shared/api.interface';

export async function getStats(childId: string): Promise<ReportStatsResponse> {
  const response = await apiClient.get<ReportStatsResponse>('/api/report/stats', {
    params: { childId },
  });
  return response.data;
}
