import { DEFAULT_BASE_URL, apiRequest, createApiError } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw createApiError(payload, 'Inventory request failed');
  }
  return payload.data;
}

export function resolveStockExportFeedback({
  result = null,
  latest = null,
  requestError = null,
} = {}) {
  const status = latest?.status || 'Unknown';
  if (status === 'Completed') {
    const replay = Boolean(
      result?.idempotentReplay
      || result?.replay
      || result?.stockExport?.status !== 'Completed',
    );
    return {
      status,
      rotateKey: false,
      error: '',
      message: replay
        ? 'AlreadyProcessed: kết quả Completed đã tồn tại, không trừ kho lần nữa.'
        : 'Đã xuất chính xác toàn bộ đơn. Staff sẽ xác nhận packing riêng.',
    };
  }
  if (status === 'Failed') {
    const returned = result?.stockExport || {};
    const failureCode = latest?.failureCode || returned.failureCode;
    const failureReason = latest?.failureReason || returned.failureReason;
    const error = [failureCode, failureReason].filter(Boolean).join(': ')
      || requestError?.message
      || 'Xuất kho chưa thành công.';
    return { status, rotateKey: true, error, message: '' };
  }
  return {
    status,
    rotateKey: false,
    error: requestError?.message || 'Chưa thể xác minh kết quả xuất kho. Vui lòng tải lại trang.',
    message: '',
  };
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
    async processStockExport(id, input = {}) {
      const { idempotencyKey, ...payload } = input;
      return request(`/warehouse/stock-exports/${id}/process`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
    },
    async listReturnedParcels() {
      return request('/warehouse/returned-parcels');
    },
    async recordReturnedParcelReceipt(shipmentId, input = {}) {
      const { idempotencyKey, ...payload } = input;
      return request(`/warehouse/shipments/${shipmentId}/returned-receipt`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
    },
  };
}

export const inventoryService = createInventoryService();
