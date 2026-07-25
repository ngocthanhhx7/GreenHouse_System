import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Admin request failed');
  }
  return payload.data;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, value);
  });
  return query.toString();
}

export function createAdminService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async getOverviewReport(params = {}) {
      const query = buildQuery(params);
      return request(`/admin/reports/overview${query ? `?${query}` : ''}`);
    },
    async listAuditLogs(params = {}) {
      const query = buildQuery(params);
      return request(`/admin/audit-logs${query ? `?${query}` : ''}`);
    },
    async getSettings() {
      return request('/admin/settings');
    },
    async updateSettings(input, idempotencyKey) {
      return request('/admin/settings', {
        method: 'PATCH',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      });
    },
  };
}

export const adminService = createAdminService();
