import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Replenishment request failed');
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

export function createReplenishmentService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async createWarehouseRequest(input) {
      return request('/warehouse/replenishments', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listWarehouseRequests(params = {}) {
      const query = buildQuery(params);
      return request(`/warehouse/replenishments${query ? `?${query}` : ''}`);
    },
    async receiveWarehouseRequest(id, input) {
      return request(`/warehouse/replenishments/${id}/receive`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async withdrawWarehouseRequest(id, input) {
      return request(`/warehouse/replenishments/${id}/withdraw`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async requestShortClosure(id, input) {
      return request(`/warehouse/replenishments/${id}/short-closure`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async correctReceipt(id, input) {
      return request(`/warehouse/replenishments/${id}/receipt-correction`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listAdminRequests(params = {}) {
      const query = buildQuery(params);
      return request(`/admin/replenishments${query ? `?${query}` : ''}`);
    },
    async updateAdminStatus(id, input) {
      return request(`/admin/replenishments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async decideShortClosure(id, input) {
      return request(`/admin/replenishments/${id}/short-closure`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  };
}

export const replenishmentService = createReplenishmentService();
