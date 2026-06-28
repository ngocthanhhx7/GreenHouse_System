import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Category request failed');
  }
  return payload.data;
}

export function createCategoryService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  return {
    async listCategories() {
      return parseResponse(await fetcher(`${baseUrl}/categories`));
    },
    async listAdminCategories() {
      return apiRequest('/admin/categories');
    },
    async createCategory(input) {
      return apiRequest('/admin/categories', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async updateCategory(id, input) {
      return apiRequest(`/admin/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  };
}

export const categoryService = createCategoryService();
