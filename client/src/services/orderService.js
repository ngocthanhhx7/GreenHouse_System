import { DEFAULT_BASE_URL, apiRequest, getCsrfToken } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || 'Order request failed');
    error.errorCode = payload.errorCode;
    error.errors = payload.errors || [];
    throw error;
  }
  return payload.data;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}),
  };
}

export function createCheckoutIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createOrderService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  return {
    async placeOrder(input, { idempotencyKey = input?.idempotencyKey || createCheckoutIdempotencyKey() } = {}) {
      const { idempotencyKey: _idempotencyKey, ...payload } = input;
      return parseResponse(
        await fetcher(`${baseUrl}/orders`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(payload),
          credentials: 'include',
        })
      );
    },
    async listMyOrders() {
      return apiRequest('/orders/my');
    },
    async getOrder(id) {
      return apiRequest(`/orders/${id}`);
    },
    async getFulfillment(id) {
      return parseResponse(await fetcher(`${baseUrl}/orders/${id}/fulfillment`, {
        method: 'GET',
        headers: authHeaders(),
        credentials: 'include',
      }));
    },
    async requestDestinationCorrection(id, input = {}) {
      const { idempotencyKey = createCheckoutIdempotencyKey(), ...payload } = input;
      return parseResponse(await fetcher(`${baseUrl}/orders/${id}/destination-corrections`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
        credentials: 'include',
      }));
    },
    async chooseDeliveryIncident(id, incidentId, input = {}) {
      const { idempotencyKey = createCheckoutIdempotencyKey(), ...payload } = input;
      return parseResponse(await fetcher(`${baseUrl}/orders/${id}/delivery-incidents/${incidentId}/choice`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
        credentials: 'include',
      }));
    },
    async cancelOrder(id, {
      cancelReason = '',
      idempotencyKey = createCheckoutIdempotencyKey(),
    } = {}) {
      return parseResponse(
        await fetcher(`${baseUrl}/orders/${id}/cancel`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ cancelReason }),
          credentials: 'include',
        })
      );
    },
  };
}

export const orderService = createOrderService();
