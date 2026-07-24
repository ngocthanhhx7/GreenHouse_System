import {
  DEFAULT_BASE_URL,
  apiRequest,
  createApiError,
  getCsrfToken,
} from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw createApiError(payload, 'Product request failed');
  }
  return payload.data;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function createProductService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  function authHeaders({ json = true } = {}) {
    const headers = json ? { 'Content-Type': 'application/json' } : {};
    return { ...headers, ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}) };
  }

  return {
    async listProducts(params = {}) {
      return parseResponse(await fetcher(`${baseUrl}/products${buildQuery(params)}`));
    },
    async getProduct(id) {
      return parseResponse(await fetcher(`${baseUrl}/products/${id}`));
    },
    async listBestSellers({ limit = 6 } = {}) {
      return parseResponse(await fetcher(
        `${baseUrl}/products/best-sellers${buildQuery({ limit })}`
      ));
    },
    async listAdminProducts() {
      return apiRequest('/admin/products');
    },
    async createProduct(input, { idempotencyKey } = {}) {
      const commandKey = String(idempotencyKey || '').trim();
      if (!commandKey) throw new Error('Product creation Idempotency-Key is required');
      return parseResponse(
        await fetcher(`${baseUrl}/admin/products`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Idempotency-Key': commandKey },
          body: JSON.stringify(input),
          credentials: 'include',
        })
      );
    },
    async updateProduct(id, input) {
      return apiRequest(`/admin/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async updateProductStatus(id, status) {
      return apiRequest(`/admin/products/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    async uploadImages(files) {
      const body = new FormData();
      Array.from(files || []).forEach((file) => body.append('images', file));
      return parseResponse(await fetcher(`${baseUrl}/admin/uploads/products`, {
        method: 'POST',
        headers: authHeaders({ json: false }),
        body,
        credentials: 'include',
      }));
    },
    async deleteMedia(asset) {
      return parseResponse(await fetcher(`${baseUrl}/admin/uploads/products`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({
          assetId: asset?.assetId || asset?.uploadId,
          url: asset?.url,
        }),
        credentials: 'include',
      }));
    },
    async deleteImage(value) {
      return this.deleteMedia({ url: value });
    },
  };
}

export const productService = createProductService();
