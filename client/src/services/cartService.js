import { DEFAULT_BASE_URL, TOKEN_KEY, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Cart request failed');
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
