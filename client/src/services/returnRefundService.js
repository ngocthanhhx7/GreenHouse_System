import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Return/refund request failed');
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

export function createReturnRefundService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async createCustomerRequest(orderId, input) {
      return request(`/orders/${orderId}/return-refund`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listMyRequests() {
      return request('/return-refunds/my');
    },
    async listStaffRequests(params = {}) {
      const query = buildQuery(params);
      return request(`/staff/return-refunds${query ? `?${query}` : ''}`);
    },
    async getStaffRequest(id) {
      return request(`/staff/return-refunds/${id}`);
    },
    async decideRequest(id, input) {
      return request(`/staff/return-refunds/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  };
}

export const returnRefundService = createReturnRefundService();
