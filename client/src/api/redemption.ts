import { apiClient } from './client';
import type {
  RedemptionListResponse,
  CreateRedemptionRequest,
  ReviewRedemptionRequest,
  Redemption,
  RedemptionStatus,
} from '@shared/api.interface';

interface RedemptionResponse {
  id: string;
  childId: string;
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export async function listRedemptions(params?: {
  childId?: string;
  status?: RedemptionStatus;
}): Promise<RedemptionListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.childId) searchParams.set('childId', params.childId);
  if (params?.status) searchParams.set('status', params.status);

  const query = searchParams.toString();
  const response = await apiClient.get<RedemptionListResponse>(
    `/api/redemptions${query ? `?${query}` : ''}`,
  );
  return response.data;
}

export async function getRedemption(id: string): Promise<Redemption> {
  const response = await apiClient.get<RedemptionResponse>(
    `/api/redemptions/${id}`,
  );
  const r = response.data;
  return {
    id: r.id,
    childId: r.childId,
    rewardId: r.rewardId,
    rewardName: r.rewardName,
    pointsCost: r.pointsCost,
    status: r.status as RedemptionStatus,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
  };
}

export async function createRedemption(
  data: CreateRedemptionRequest,
): Promise<Redemption> {
  const response = await apiClient.post<RedemptionResponse>(
    '/api/redemptions',
    data,
  );
  const r = response.data;
  return {
    id: r.id,
    childId: r.childId,
    rewardId: r.rewardId,
    rewardName: r.rewardName,
    pointsCost: r.pointsCost,
    status: r.status as RedemptionStatus,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
  };
}

export async function reviewRedemption(
  id: string,
  data: ReviewRedemptionRequest,
): Promise<Redemption> {
  const response = await apiClient.post<RedemptionResponse>(
    `/api/redemptions/${id}/review`,
    data,
  );
  const r = response.data;
  return {
    id: r.id,
    childId: r.childId,
    rewardId: r.rewardId,
    rewardName: r.rewardName,
    pointsCost: r.pointsCost,
    status: r.status as RedemptionStatus,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
  };
}
