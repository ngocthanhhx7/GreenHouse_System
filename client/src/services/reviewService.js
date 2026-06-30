import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Review request failed');
  }
  return payload.data;
}

export function createReviewService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async listProductReviews(productId) {
      return request(`/products/${productId}/reviews`);
    },
    async createCustomerReview(productId, input) {
      return request(`/products/${productId}/reviews`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };
}

export const reviewService = createReviewService();
