import { apiClient } from './client';
import type { FamilyResponse, UpdateFamilyRequest } from '@shared/api.interface';

export async function getFamily(): Promise<FamilyResponse> {
  const response = await apiClient.get<FamilyResponse>('/api/family');
  return response.data;
}

export async function updateFamily(name: string): Promise<FamilyResponse> {
  const body: UpdateFamilyRequest = { name };
  const response = await apiClient.put<FamilyResponse>('/api/family', body);
  return response.data;
}
