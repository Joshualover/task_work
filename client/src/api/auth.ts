import { apiClient } from './client';
import type {
  AuthConfigResponse,
  AuthMeResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@shared/api.interface';

export async function getConfig(): Promise<AuthConfigResponse> {
  const response = await apiClient.get<AuthConfigResponse>('/api/auth/config');
  return response.data;
}

export async function login(data: LoginRequest): Promise<{ user: AuthUser }> {
  const response = await apiClient.post<{ user: AuthUser }>('/api/auth/login', data);
  return response.data;
}

export async function register(data: RegisterRequest): Promise<{ user: AuthUser }> {
  const response = await apiClient.post<{ user: AuthUser }>(
    '/api/auth/register',
    data,
  );
  return response.data;
}

export async function logout(): Promise<{ ok: boolean }> {
  const response = await apiClient.post<{ ok: boolean }>('/api/auth/logout', {});
  return response.data;
}

export async function me(): Promise<AuthMeResponse> {
  const response = await apiClient.get<AuthMeResponse>('/api/auth/me');
  return response.data;
}
