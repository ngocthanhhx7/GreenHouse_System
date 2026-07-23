import { DEFAULT_BASE_URL, TOKEN_KEY, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Exchange request failed');
  return payload.data;
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, value);
  });
  return query.toString();
}

function evidencePath(value) {
  const match = /^\/(?:api\/(?:return-refunds|exchanges)\/evidence|uploads\/return-evidence)\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/
    .exec(String(value || '').toLowerCase());
  if (!match) throw new Error('Đường dẫn ảnh bằng chứng không hợp lệ');
  return `/exchanges/evidence/${match[1]}`;
}

export function createExchangeService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const directFetcher = fetcher || fetch;
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async uploadEvidence(files) {
      const body = new FormData();
      Array.from(files || []).forEach((file) => body.append('images', file));
      const token = typeof window === 'undefined' ? '' : window.localStorage.getItem(TOKEN_KEY);
      return parseResponse(await directFetcher(`${baseUrl}/exchanges/evidence`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      }));
    },
    async fetchEvidence(url) {
      const token = typeof window === 'undefined' ? '' : window.localStorage.getItem(TOKEN_KEY);
      const response = await directFetcher(`${baseUrl}${evidencePath(url)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Không thể mở ảnh bằng chứng');
      return response.blob();
    },
    async createCustomerRequest(orderId, input) {
      return request(`/orders/${orderId}/exchanges`, { method: 'POST', body: JSON.stringify(input) });
    },
    async listMyRequests() { return request('/exchanges/my'); },
    async getCustomerRequest(id) { return request(`/exchanges/${id}`); },
    async recordHandoffProof(id, input) {
      return request(`/exchanges/${id}/handoff-proof`, { method: 'POST', body: JSON.stringify(input) });
    },
    async cancelRequest(id, input) {
      return request(`/exchanges/${id}/cancel`, { method: 'POST', body: JSON.stringify(input) });
    },
    async chooseStockOption(id, input) {
      return request(`/exchanges/${id}/stock-choice`, { method: 'POST', body: JSON.stringify(input) });
    },
    async reportShipmentDispute(id, shipmentId, input) {
      return request(`/exchanges/${id}/shipments/${shipmentId}/disputes`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listStaffRequests(params = {}) {
      const query = queryString(params);
      return request(`/staff/exchanges${query ? `?${query}` : ''}`);
    },
    async getStaffRequest(id) { return request(`/staff/exchanges/${id}`); },
    async decideRequest(id, input) {
      return request(`/staff/exchanges/${id}/decision`, { method: 'PATCH', body: JSON.stringify(input) });
    },
    async retryReservation(id, input = {}) {
      return request(`/staff/exchanges/${id}/retry-reservation`, { method: 'POST', body: JSON.stringify(input) });
    },
    async expireRequest(id) { return request(`/staff/exchanges/${id}/expire`, { method: 'POST' }); },
    async recordStaffShipmentEvent(id, shipmentId, input) {
      return request(`/staff/exchanges/${id}/shipments/${shipmentId}/events`, { method: 'POST', body: JSON.stringify(input) });
    },
    async resendReplacement(id, input) {
      return request(`/staff/exchanges/${id}/resend`, { method: 'POST', body: JSON.stringify(input) });
    },
    async listWarehouseRequests(params = {}) {
      const query = queryString(params);
      return request(`/warehouse/exchanges${query ? `?${query}` : ''}`);
    },
    async getWarehouseRequest(id) { return request(`/warehouse/exchanges/${id}`); },
    async recordWarehouseReceipt(id, input) {
      return request(`/warehouse/exchanges/${id}/receipt`, { method: 'POST', body: JSON.stringify(input) });
    },
    async finalizeInspection(id, input) {
      return request(`/warehouse/exchanges/${id}/inspection`, { method: 'POST', body: JSON.stringify(input) });
    },
    async createOutboundShipment(id, input) {
      return request(`/warehouse/exchanges/${id}/shipments`, { method: 'POST', body: JSON.stringify(input) });
    },
  };
}

export const exchangeService = createExchangeService();
