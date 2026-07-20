import { DEFAULT_BASE_URL, TOKEN_KEY, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Order request failed');
  }
  return payload.data;
}

function authHeaders() {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' };
  const token = window.localStorage.getItem(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
        })
      );
    },
    async listMyOrders() {
      return apiRequest('/orders/my');
    },
    async getOrder(id) {
      return apiRequest(`/orders/${id}`);
    },
    async cancelOrder(id, { cancelReason = '' } = {}) {
      return apiRequest(`/orders/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ cancelReason }),
      });
    },
  };
}

export const orderService = createOrderService();
