import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Inventory request failed');
  }
  return payload.data;
}

export function createInventoryService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async listInventory() {
      return request('/warehouse/inventory');
    },
    async getInventory(id) {
      return request(`/warehouse/inventory/${id}`);
    },
    async adjustInventory(id, input) {
      return request(`/warehouse/inventory/${id}/adjust`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async listLowStock() {
      return request('/warehouse/inventory/low-stock');
    },
    async listStockExports() {
      return request('/warehouse/stock-exports');
    },
    async getStockExport(id) {
      return request(`/warehouse/stock-exports/${id}`);
    },
    async updateStockExportStatus(id, input) {
      return request(`/warehouse/stock-exports/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
  };
}

export const inventoryService = createInventoryService();
