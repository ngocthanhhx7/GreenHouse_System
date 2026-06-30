import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Support request failed');
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

export function createSupportService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async createCustomerRequest(input) {
      return request('/support-requests', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listMyRequests() {
      return request('/support-requests/my');
    },
    async listStaffRequests(params = {}) {
      const query = buildQuery(params);
      return request(`/staff/support-requests${query ? `?${query}` : ''}`);
    },
    async getStaffRequest(id) {
      return request(`/staff/support-requests/${id}`);
    },
    async respondToRequest(id, input) {
      return request(`/staff/support-requests/${id}/response`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  };
}

export const supportService = createSupportService();
