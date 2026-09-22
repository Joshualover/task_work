import { apiClient } from './client';
import type {
  AuthConfigResponse,
  AuthMeResponse,
  AuthUser,
  LoginRequest,
  ParentAccount,
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

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  const response = await apiClient.post<{ ok: boolean }>('/api/auth/password', {
    oldPassword,
    newPassword,
  });
  return response.data;
}

export async function listChildAccounts(): Promise<{
  items: Array<{ childId: string; username: string }>;
}> {
  const response = await apiClient.get<{
    items: Array<{ childId: string; username: string }>;
  }>('/api/auth/child-accounts');
  return response.data;
}

export async function saveChildAccount(data: {
  childId: string;
  username: string;
  password: string;
}): Promise<{ childId: string; username: string }> {
  const response = await apiClient.post<{ childId: string; username: string }>(
    '/api/auth/child-account',
    data,
  );
  return response.data;
}

/** 家长：本家庭家长账号列表 */
export async function listParentAccounts(): Promise<{
  items: ParentAccount[];
}> {
  const response = await apiClient.get<{ items: ParentAccount[] }>(
    '/api/auth/parent-accounts',
  );
  return response.data;
}

/** 家长：新增家长账号 / 重置家长密码 */
export async function saveParentAccount(data: {
  userId?: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ id: string; username: string }> {
  const response = await apiClient.post<{ id: string; username: string }>(
    '/api/auth/parent-account',
    data,
  );
  return response.data;
}
