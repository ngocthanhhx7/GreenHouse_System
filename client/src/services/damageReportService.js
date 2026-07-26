import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Damage report request failed');
  return payload.data;
}

export function createDamageReportService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async listStaffReports(params = {}) {
      const query = new URLSearchParams(params).toString();
      return request(`/staff/damage-reports${query ? `?${query}` : ''}`);
    },
    async createStaffReport(input) {
      return request('/staff/damage-reports', { method: 'POST', body: JSON.stringify(input) });
    },
    async withdrawStaffReport(id, input) {
      return request(`/staff/damage-reports/${id}/withdraw`, { method: 'POST', body: JSON.stringify(input) });
    },
    async getStaffReport(id) {
      return request(`/staff/damage-reports/${id}`);
    },
    async listWarehouseReports(params = {}) {
      const query = new URLSearchParams(params).toString();
      return request(`/warehouse/damage-reports${query ? `?${query}` : ''}`);
    },
    async getWarehouseReport(id) {
      return request(`/warehouse/damage-reports/${id}`);
    },
    async decideWarehouseReport(id, input) {
      return request(`/warehouse/damage-reports/${id}/decision`, { method: 'POST', body: JSON.stringify(input) });
    },
    async disposeDamagedInventory(inventoryId, input) {
      return request(`/warehouse/inventory/${inventoryId}/damaged-disposition`, { method: 'POST', body: JSON.stringify(input) });
    },
  };
}

export const damageReportService = createDamageReportService();
