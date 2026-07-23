import { DEFAULT_BASE_URL, getCsrfToken } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Payment request failed');
  }
  return payload.data;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}),
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
          credentials: 'include',
        })
      );
    },
  };
}

export const paymentService = createPaymentService();
