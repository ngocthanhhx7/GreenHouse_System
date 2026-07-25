import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || 'Staff order request failed');
    error.errorCode = payload.errorCode;
    error.errors = payload.errors || [];
    error.data = payload.data || null;
    throw error;
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
    async confirmPacking(id, input = {}) {
      const { idempotencyKey, ...payload } = input;
      return request(`/staff/orders/${id}/packing`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
    },
    async createShipment(id, input = {}) {
      const { idempotencyKey, ...payload } = input;
      return request(`/staff/orders/${id}/shipments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
    },
    async getFulfillment(id) {
      return request(`/staff/orders/${id}/fulfillment`);
    },
    async recordShipmentEvent(shipmentId, input = {}) {
      return request(`/staff/shipments/${shipmentId}/events`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async addDestinationVersion(id, input = {}) {
      const { idempotencyKey, ...payload } = input;
      return request(`/staff/orders/${id}/destination-versions`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
    },
    async resolveDeliveryFailure(id, input = {}) {
      const { idempotencyKey, ...payload } = input;
      return request(`/staff/orders/${id}/delivery-resolution`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
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
      const { idempotencyKey, ...payload } = input;
      return request(`/staff/orders/${id}/cod-collection`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
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
