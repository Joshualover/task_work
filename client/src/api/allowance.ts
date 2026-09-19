import { apiClient } from './client';
import type {
  AllowanceTransactionListResponse,
  AllowanceRequestListResponse,
  AllowanceRequest,
  CreateAllowanceRequest,
  ReviewAllowanceRequest,
  AdjustAllowanceRequest,
} from '@shared/api.interface';

export async function getBalance(childId: string): Promise<{ balance: number }> {
  const response = await apiClient.get<{ balance: number }>(
    '/api/allowance/balance',
    { params: { childId } },
  );
  return response.data;
}

export async function listTransactions(params: {
  childId: string;
  page?: number;
  pageSize?: number;
}): Promise<AllowanceTransactionListResponse> {
  const response = await apiClient.get<AllowanceTransactionListResponse>(
    '/api/allowance/transactions',
    { params },
  );
  return response.data;
}

export async function listRequests(params?: {
  childId?: string;
  status?: string;
}): Promise<AllowanceRequestListResponse> {
  const response = await apiClient.get<AllowanceRequestListResponse>(
    '/api/allowance/requests',
    { params },
  );
  return response.data;
}

export async function createRequest(
  data: CreateAllowanceRequest,
): Promise<AllowanceRequest> {  const response = await apiClient.post<AllowanceRequest>(
    '/api/allowance/requests',
    data,
  );
  return response.data;
}

export async function reviewRequest(
  id: string,
  data: ReviewAllowanceRequest,
): Promise<AllowanceRequest> {
  const response = await apiClient.post<AllowanceRequest>(
    `/api/allowance/requests/${id}/review`,
    data,
  );
  return response.data;
}

/** 家长手动调整零花钱余额（分） */
export async function adjustBalance(
  data: AdjustAllowanceRequest,
): Promise<{ balance: number }> {
  const response = await apiClient.post<{ balance: number }>(
    '/api/allowance/adjust',
    data,
  );
  return response.data;
}
