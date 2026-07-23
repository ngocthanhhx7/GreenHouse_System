import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Staff order request failed');
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

export function createStaffOrderService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async listOrders(params = {}) {
      const query = buildQuery(params);
      return request(`/staff/orders${query ? `?${query}` : ''}`);
    },
    async getOrder(id) {
      return request(`/staff/orders/${id}`);
    },
    async confirmOrder(id, input = {}) {
      return request(`/staff/orders/${id}/confirm`, {
        method: 'POST',
        ...(input.idempotencyKey ? { headers: { 'Idempotency-Key': input.idempotencyKey } } : {}),
        body: JSON.stringify(input),
      });
    },
    async requestStockExport(id, input = {}) {
      return request(`/staff/orders/${id}/stock-export`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async updateStatus(id, nextStatus) {
      return request(`/staff/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ nextStatus }),
      });
    },
    async cancelOrder(id, input = {}) {
      return request(`/staff/orders/${id}/cancel`, {
        method: 'POST',
        ...(input.idempotencyKey ? { headers: { 'Idempotency-Key': input.idempotencyKey } } : {}),
        body: JSON.stringify(input),
      });
    },
    async markCodCollected(id, input = {}) {
      throw new Error('Thao tác thu COD thủ công không còn được hỗ trợ; cần bằng chứng Carrier.');
    },
    async finalizeCodRecovery(id, input = {}) {
      return request(`/staff/orders/${id}/cod-recovery`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async getInvoice(id) {
      return request(`/staff/orders/${id}/invoice`);
    },
  };
}

export const staffOrderService = createStaffOrderService();
