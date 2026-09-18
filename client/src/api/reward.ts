import { apiClient } from './client';
import type {
  RewardListResponse,
  CreateRewardRequest,
  UpdateRewardRequest,
  Reward,
  RewardUsageResponse,
} from '@shared/api.interface';

export async function listRewards(includeInactive = false): Promise<RewardListResponse> {
  const response = await apiClient.get<RewardListResponse>(
    `/api/rewards?includeInactive=${includeInactive}`,
  );
  return response.data;
}

/** 某孩子在当前周期内对各奖励的兑换用量 */
export async function getUsage(childId: string): Promise<RewardUsageResponse> {
  const response = await apiClient.get<RewardUsageResponse>('/api/rewards/usage', {
    params: { childId },
  });
  return response.data;
}

export async function getReward(id: string): Promise<Reward> {
  const response = await apiClient.get<Reward>(`/api/rewards/${id}`);
  return response.data;
}

export async function createReward(data: CreateRewardRequest): Promise<Reward> {
  const response = await apiClient.post<Reward>('/api/rewards', data);
  return response.data;
}

export async function updateReward(
  id: string,
  data: UpdateRewardRequest,
): Promise<Reward> {
  const response = await apiClient.patch<Reward>(`/api/rewards/${id}`, data);
  return response.data;
}

export async function deleteReward(id: string): Promise<{ ok: boolean }> {
  const response = await apiClient.delete<{ ok: boolean }>(`/api/rewards/${id}`);
  return response.data;
}
