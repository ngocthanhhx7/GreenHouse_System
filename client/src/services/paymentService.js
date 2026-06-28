import { DEFAULT_BASE_URL, TOKEN_KEY } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Payment request failed');
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

export function createPaymentService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  return {
    async createOnlinePayment(orderId) {
      return parseResponse(
        await fetcher(`${baseUrl}/orders/${orderId}/payments`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({}),
        })
      );
    },
    async submitMockCallback(input) {
      return parseResponse(
        await fetcher(`${baseUrl}/payments/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      );
    },
  };
}

export const paymentService = createPaymentService();
