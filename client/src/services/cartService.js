import {
  DEFAULT_BASE_URL,
  getCsrfToken,
  parseApiResponse,
} from './apiClient.js';

function authHeaders(idempotencyKey) {
  return {
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}),
  };
}

export function createCartIdempotencyKey(command = 'cart') {
  if (globalThis.crypto?.randomUUID) return `${command}-${globalThis.crypto.randomUUID()}`;
  return `${command}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCartService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  async function commandRequest(path, method, input, idempotencyKey) {
    return parseApiResponse(
      await fetcher(`${baseUrl}${path}`, {
        method,
        headers: authHeaders(idempotencyKey),
        credentials: 'include',
        body: JSON.stringify(input || {}),
      }),
      'Cart request failed',
    );
  }

  return {
    async getCart() {
      return parseApiResponse(
        await fetcher(`${baseUrl}/cart`, {
          credentials: 'include',
        }),
        'Cart request failed',
      );
    },
    async addItem(input, {
      idempotencyKey = createCartIdempotencyKey('cart-add'),
    } = {}) {
      return commandRequest('/cart/items', 'POST', input, idempotencyKey);
    },
    async updateItem(id, input, {
      idempotencyKey = createCartIdempotencyKey('cart-update'),
    } = {}) {
      return commandRequest(`/cart/items/${id}`, 'PATCH', input, idempotencyKey);
    },
    async removeItem(id, input = {}, {
      idempotencyKey = createCartIdempotencyKey('cart-remove'),
    } = {}) {
      return commandRequest(`/cart/items/${id}`, 'DELETE', input, idempotencyKey);
    },
  };
}

export const cartService = createCartService();
