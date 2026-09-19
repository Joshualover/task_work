import { apiClient } from './client';
import type {
  AllowanceTransactionListResponse,
  AllowanceRequestListResponse,
  AllowanceRequest,
  CreateAllowanceRequest,
  ReviewAllowanceRequest,
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
): Promise<AllowanceRequest> {
  const response = await apiClient.post<AllowanceRequest>(
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
