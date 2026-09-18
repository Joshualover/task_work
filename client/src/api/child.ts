import { apiClient } from './client';
import type {
  ChildListResponse,
  ChildResponse,
  CreateChildRequest,
  UpdateChildRequest,
} from '@shared/api.interface';

export async function list(): Promise<ChildListResponse> {
  const response = await apiClient.get<ChildListResponse>('/api/children');
  return response.data;
}

export async function get(id: string): Promise<ChildResponse> {
  const response = await apiClient.get<ChildResponse>(`/api/children/${id}`);
  return response.data;
}

export async function create(data: CreateChildRequest): Promise<ChildResponse> {
  const response = await apiClient.post<ChildResponse>('/api/children', data);
  return response.data;
}

export async function update(
  id: string,
  data: UpdateChildRequest,
): Promise<ChildResponse> {
  const response = await apiClient.patch<ChildResponse>(
    `/api/children/${id}`,
    data,
  );
  return response.data;
}
