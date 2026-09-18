import { apiClient } from './client';
import type {
  RewardListResponse,
  CreateRewardRequest,
  UpdateRewardRequest,
  Reward,
} from '@shared/api.interface';

interface RewardResponse {
  id: string;
  familyId: string;
  name: string;
  pointsRequired: number;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export async function listRewards(includeInactive = false): Promise<RewardListResponse> {
  const response = await apiClient.get<RewardListResponse>(
    `/api/rewards?includeInactive=${includeInactive}`,
  );
  return response.data;
}

export async function getReward(id: string): Promise<Reward> {
  const response = await apiClient.get<RewardResponse>(`/api/rewards/${id}`);
  const r = response.data;
  return {
    id: r.id,
    familyId: r.familyId,
    name: r.name,
    pointsRequired: r.pointsRequired,
    description: r.description,
    imageUrl: r.imageUrl,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
  };
}

export async function createReward(data: CreateRewardRequest): Promise<Reward> {
  const response = await apiClient.post<RewardResponse>('/api/rewards', data);
  const r = response.data;
  return {
    id: r.id,
    familyId: r.familyId,
    name: r.name,
    pointsRequired: r.pointsRequired,
    description: r.description,
    imageUrl: r.imageUrl,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
  };
}

export async function updateReward(
  id: string,
  data: UpdateRewardRequest,
): Promise<Reward> {
  const response = await apiClient.patch<RewardResponse>(
    `/api/rewards/${id}`,
    data,
  );
  const r = response.data;
  return {
    id: r.id,
    familyId: r.familyId,
    name: r.name,
    pointsRequired: r.pointsRequired,
    description: r.description,
    imageUrl: r.imageUrl,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
  };
}

export async function deleteReward(id: string): Promise<{ ok: boolean }> {
  const response = await apiClient.delete<{ ok: boolean }>(`/api/rewards/${id}`);
  return response.data;
}
