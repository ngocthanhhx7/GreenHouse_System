import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Notification request failed');
  }
  return payload.data;
}

export function createNotificationService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async listMyNotifications({ status, limit, cursor } = {}) {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit) params.set('limit', String(limit));
      if (cursor) params.set('cursor', cursor);
      const query = params.toString();
      return request(`/notifications${query ? `?${query}` : ''}`);
    },
    async getNotification(id) {
      return request(`/notifications/${id}`);
    },
    async getNotificationTarget(id) {
      return request(`/notifications/${id}/target`);
    },
    async markAsRead(id) {
      return request(`/notifications/${id}/read`, {
        method: 'PATCH',
      });
    },
    async archiveNotification(id) {
      return request(`/notifications/${id}/archive`, { method: 'PATCH' });
    },
  };
}

export const notificationService = createNotificationService();
