import { apiClient } from './client';
import type {
  PointTransactionListResponse,
  AdjustPointsRequest,
} from '@shared/api.interface';

export async function listTransactions(params: {
  childId: string;
  page?: number;
  pageSize?: number;
}): Promise<PointTransactionListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('childId', params.childId);
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.pageSize !== undefined) searchParams.set('pageSize', String(params.pageSize));

  const response = await apiClient.get<PointTransactionListResponse>(
    `/api/points/transactions?${searchParams.toString()}`,
  );
  return response.data;
}

export async function getBalance(childId: string): Promise<{ balance: number }> {
  const response = await apiClient.get<{ balance: number }>(
    `/api/points/balance?childId=${encodeURIComponent(childId)}`,
  );
  return response.data;
}

export async function adjustPoints(
  data: AdjustPointsRequest,
): Promise<{ newBalance: number }> {
  const response = await apiClient.post<{ newBalance: number }>(
    '/api/points/adjust',
    data,
  );
  return response.data;
}
