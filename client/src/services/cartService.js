import { DEFAULT_BASE_URL, apiRequest, getCsrfToken } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Cart request failed');
  }
  return payload.data;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}),
  };
}

export function createCartService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  return {
    async getCart() {
      return apiRequest('/cart');
    },
    async addItem(input) {
      return parseResponse(
        await fetcher(`${baseUrl}/cart/items`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify(input),
        })
      );
    },
    async updateItem(id, input) {
      return apiRequest(`/cart/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async removeItem(id) {
      return apiRequest(`/cart/items/${id}`, {
        method: 'DELETE',
      });
    },
  };
}

export const cartService = createCartService();
