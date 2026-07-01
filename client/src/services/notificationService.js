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
    async listMyNotifications() {
      return request('/notifications');
    },
    async markAsRead(id) {
      return request(`/notifications/${id}/read`, {
        method: 'PATCH',
      });
    },
  };
}

export const notificationService = createNotificationService();
