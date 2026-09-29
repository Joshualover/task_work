import { apiClient } from './client';
import type { ReportRange, ReportStatsResponse } from '@shared/api.interface';

export async function getStats(
  childId: string,
  range: ReportRange = 'week',
): Promise<ReportStatsResponse> {
  const response = await apiClient.get<ReportStatsResponse>('/api/report/stats', {
    params: { childId, range },
  });
  return response.data;
}
