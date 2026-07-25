import {
  DEFAULT_BASE_URL,
  apiRequest,
  getCsrfToken,
  parseApiResponse,
} from './apiClient.js';

async function parseResponse(response) {
  return parseApiResponse(response, 'Return/refund request failed');
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, value);
  });
  return query.toString();
}

function evidenceApiPath(value) {
  const match = /^\/(?:api\/return-refunds\/evidence|uploads\/return-evidence)\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/.exec(String(value || '').toLowerCase());
  if (!match) throw new Error('Đường dẫn ảnh bằng chứng không hợp lệ');
  return `/return-refunds/evidence/${match[1]}`;
}

export function createReturnRefundService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const directFetcher = fetcher || fetch;
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    async uploadEvidence(files) {
      const body = new FormData();
      Array.from(files || []).forEach((file) => body.append('images', file));
      return parseResponse(await directFetcher(`${baseUrl}/return-refunds/evidence`, {
        method: 'POST',
        headers: getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {},
        credentials: 'include',
        body,
      }));
    },
    async fetchEvidence(url) {
      const response = await directFetcher(`${baseUrl}${evidenceApiPath(url)}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        let message = 'Không thể mở ảnh bằng chứng';
        try { message = (await response.json()).message || message; } catch { /* binary/non-JSON error */ }
        throw new Error(message);
      }
      return response.blob();
    },
    async createCustomerRequest(orderId, input) {
      return request(`/orders/${orderId}/return-refund`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async listMyRequests() {
      return request('/return-refunds/my');
    },
    async listBanks() {
      return request('/return-refunds/banks');
    },
    async listStaffRequests(params = {}) {
      const query = buildQuery(params);
      return request(`/staff/return-refunds${query ? `?${query}` : ''}`);
    },
    async listWarehouseRequests(params = {}) {
      const query = buildQuery(params);
      return request(`/warehouse/return-refunds${query ? `?${query}` : ''}`);
    },
    async listCodRecoveryCandidates() {
      return request('/warehouse/cod-recoveries');
    },
    async getCodRecoveryCandidate(orderId) {
      return request(`/warehouse/cod-recoveries/${orderId}`);
    },
    async getWarehouseRequest(id) {
      return request(`/warehouse/return-refunds/${id}`);
    },
    async getStaffRequest(id) {
      return request(`/staff/return-refunds/${id}`);
    },
    async decideRequest(id, input) {
      return request(`/staff/return-refunds/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async recordHandoffProof(id, input) {
      return request(`/return-refunds/${id}/handoff-proof`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async submitDestination(id, input) {
      const safeInput = {
        bankCode: input?.bankCode,
        accountNumber: input?.accountNumber,
        accountHolderName: input?.accountHolderName,
        confirmed: input?.confirmed,
        idempotencyKey: input?.idempotencyKey,
      };
      return request(`/return-refunds/${id}/destination`, {
        method: 'POST',
        body: JSON.stringify(safeInput),
      });
    },
    async verifyDestination(id, input) {
      return request(`/staff/return-refunds/${id}/destination`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    async expireRequest(id) {
      return request(`/staff/return-refunds/${id}/expire`, { method: 'POST' });
    },
    async recordPayoutEvidence(id, input) {
      return request(`/staff/return-refunds/${id}/payout-evidence`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async startPayOSPayout(id, input) {
      return request(`/staff/return-refunds/${id}/payos-payout`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async reconcilePayOSPayout(id) {
      return request(`/staff/return-refunds/${id}/payos-reconcile`, { method: 'POST' });
    },
    async reconcilePayout(id, input) {
      return request(`/staff/return-refunds/${id}/payout-reconciliation`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: input?.idempotencyKey,
          operationKey: input?.operationKey,
          outcome: input?.outcome,
          providerReference: input?.providerReference,
          occurredAt: input?.occurredAt,
          reconciliationNote: input?.reconciliationNote,
          confirmed: input?.confirmed === true,
        }),
      });
    },
    async reportPayoutIncident(id, input) {
      return request(`/staff/return-refunds/${id}/payout-incident`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async inspectRequest(id, input) {
      return request(`/warehouse/return-refunds/${id}/inspection`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async recordCodRecoveryReceipt(orderId, input) {
      return request(`/warehouse/orders/${orderId}/cod-recovery-receipt`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async completeRefund(id, input) {
      return request(`/staff/return-refunds/${id}/complete-refund`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };
}

export const returnRefundService = createReturnRefundService();
