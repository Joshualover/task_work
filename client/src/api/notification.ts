import { apiClient } from './client';
import type { NotificationListResponse } from '@shared/api.interface';

export async function list(
  unreadOnly = false,
): Promise<NotificationListResponse> {
  const response = await apiClient.get<NotificationListResponse>(
    `/api/notifications?unreadOnly=${unreadOnly}`,
  );
  return response.data;
}

export async function unreadCount(): Promise<{ unreadCount: number }> {
  const response = await apiClient.get<{ unreadCount: number }>(
    '/api/notifications/unread-count',
  );
  return response.data;
}

export async function markRead(id: string): Promise<{ ok: boolean }> {
  const response = await apiClient.post<{ ok: boolean }>(
    `/api/notifications/${id}/read`,
    {},
  );
  return response.data;
}

export async function markAllRead(): Promise<{ ok: boolean }> {
  const response = await apiClient.post<{ ok: boolean }>(
    '/api/notifications/read-all',
    {},
  );
  return response.data;
}
