import { DEFAULT_BASE_URL, TOKEN_KEY, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Product request failed');
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
  function authHeaders() {
    if (typeof window === 'undefined') return { 'Content-Type': 'application/json' };
    const token = window.localStorage.getItem(TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  return {
    async listProducts(params = {}) {
      return parseResponse(await fetcher(`${baseUrl}/products${buildQuery(params)}`));
    },
    async getProduct(id) {
      return parseResponse(await fetcher(`${baseUrl}/products/${id}`));
    },
    async listAdminProducts() {
      return apiRequest('/admin/products');
    },
    async createProduct(input) {
      return parseResponse(
        await fetcher(`${baseUrl}/admin/products`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(input),
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
  };
}

export const productService = createProductService();
