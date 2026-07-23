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
    async recordPhysicalCount(id, input) {
      return request(`/warehouse/inventory/${id}/physical-count`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async setThresholdOverride(id, input) {
      return request(`/warehouse/inventory/${id}/threshold`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async listLowStock() {
      return request('/warehouse/inventory/low-stock');
    },
    async listLowStockAlerts(params = {}) {
      const query = new URLSearchParams(params).toString();
      return request(`/warehouse/inventory/low-stock-alerts${query ? `?${query}` : ''}`);
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
