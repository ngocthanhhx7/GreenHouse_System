import {
  DEFAULT_BASE_URL,
  apiRequest,
  parseApiResponse,
} from './apiClient.js';

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

function commandHeaders(idempotencyKey) {
  return {
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

function createIdempotencyKey(prefix = 'review') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function valueId(value) {
  if (!value || typeof value !== 'object') return value;
  return value.id ?? value._id;
}

function asItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.orders)) return payload.orders;
  return [];
}

export function createReviewService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  // The injected fetcher is used by unit/acceptance tests. Production requests
  // go through apiRequest so CSRF, credentials, and shared API errors remain
  // consistent with the rest of the client.
  const request = fetcher
    ? async (path, options = {}) => parseApiResponse(
      await fetcher(`${baseUrl}${path}`, options),
      'Review request failed',
    )
    : apiRequest;

  async function command(path, method, body, options = {}) {
    const idempotencyKey = options?.idempotencyKey || createIdempotencyKey();
    return request(path, {
      method,
      headers: commandHeaders(idempotencyKey),
      body: JSON.stringify(body || {}),
    });
  }

  return {
    async listPublic(productId, { page, pageSize } = {}) {
      const query = buildQuery({ page, pageSize });
      const encodedProductId = encodeURIComponent(String(productId));
      return request(`/products/${encodedProductId}/reviews${query ? `?${query}` : ''}`);
    },

    async listOwn({ page, pageSize } = {}) {
      const query = buildQuery({ page, pageSize });
      return request(`/customer/reviews${query ? `?${query}` : ''}`);
    },

    /**
     * Return only delivered OrderDetail choices for this product. The order
     * list endpoint intentionally omits details, so fetch each delivered order
     * before projecting its detail identifiers. No foreign identifiers are
     * exposed by this client projection beyond the server-issued option value.
     */
    async listEligibility(productId) {
      const ordersPayload = await request('/orders/my');
      const delivered = asItems(ordersPayload)
        .filter((order) => order?.orderStatus === 'Delivered');
      const detailed = await Promise.all(delivered.map(async (order) => {
        if (Array.isArray(order?.details)) return order;
        const id = valueId(order);
        if (!id) return order;
        try {
          return await request(`/orders/${encodeURIComponent(String(id))}`);
        } catch (_error) {
          // Eligibility is private and best-effort; an incomplete order must
          // never prevent the rest of the product page from rendering.
          return order;
        }
      }));
      const wanted = String(productId);
      const items = detailed.flatMap((order) => (order?.orderStatus === 'Delivered'
        ? (order.details || []).filter((detail) => String(valueId(detail?.productId) ?? detail?.productId) === wanted)
          .map((detail) => ({
            id: valueId(detail),
            orderDetailId: valueId(detail),
            orderId: valueId(order),
            orderCode: order.orderCode,
            productId: detail.productId,
            productName: detail.productName || detail.name,
          }))
        : []));
      return { items, total: items.length };
    },

    async listModeration({ page, pageSize } = {}) {
      const query = buildQuery({ page, pageSize });
      return request(`/staff/reviews${query ? `?${query}` : ''}`);
    },

    async createReview(productId, body, options = {}) {
      return command(
        `/products/${encodeURIComponent(String(productId))}/reviews`,
        'POST',
        body,
        options,
      );
    },

    async updateReview(reviewId, body, options = {}) {
      return command(`/reviews/${encodeURIComponent(String(reviewId))}`, 'PATCH', body, options);
    },

    async setPublication(reviewId, body, options = {}) {
      return command(
        `/reviews/${encodeURIComponent(String(reviewId))}/publication`,
        'PATCH',
        body,
        options,
      );
    },

    async moderate(reviewId, body, options = {}) {
      return command(
        `/staff/reviews/${encodeURIComponent(String(reviewId))}/moderation`,
        'PATCH',
        body,
        options,
      );
    },

    // Legacy aliases retained for callers outside the SL-008 surfaces.
    async listProductReviews(productId, params) {
      return this.listPublic(productId, params);
    },
    async createCustomerReview(productId, input, options) {
      return this.createReview(productId, input, options);
    },
    filterReviewableOrders(orders = [], productId) {
      return orders.filter((order) => order?.orderStatus === 'Delivered'
        && (order.details || []).some((item) => String(valueId(item.productId) ?? item.productId) === String(productId)));
    },
  };
}

export const reviewService = createReviewService();
