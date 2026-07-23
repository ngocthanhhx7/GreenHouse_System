import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, value);
  });
  return query.toString();
}

function commandOptions(input = {}) {
  const key = input.idempotencyKey || globalThis.crypto?.randomUUID?.() || `web-${Date.now()}`;
  return {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ ...input, idempotencyKey: key }),
  };
}

export function createAdminAccountService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => {
      const response = await fetcher(`${baseUrl}${path}`, { ...options, credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        const error = new Error(payload.message || 'Admin request failed');
        error.errorCode = payload.errorCode;
        error.errors = payload.errors || [];
        throw error;
      }
      return payload.data;
    }
    : apiRequest;

  return {
    listAccounts(params = {}) {
      const query = buildQuery(params);
      return request(`/admin/accounts${query ? `?${query}` : ''}`);
    },
    changeStatus(id, input) {
      return request(`/admin/accounts/${id}/status`, commandOptions(input));
    },
    transferRole(id, input) {
      return request(`/admin/accounts/${id}/role-transfer`, commandOptions(input));
    },
    createInvitation(input) {
      return request('/admin/internal-invitations', commandOptions(input));
    },
    resendInvitation(id, input = {}) {
      return request(`/admin/internal-invitations/${id}/resend`, commandOptions(input));
    },
    revokeInvitation(id, input = {}) {
      return request(`/admin/internal-invitations/${id}/revoke`, commandOptions(input));
    },
  };
}

export const adminAccountService = createAdminAccountService();
