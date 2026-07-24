import {
  DEFAULT_BASE_URL,
  createApiError,
  getCsrfToken,
} from './apiClient.js';

async function parseResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    throw createApiError({}, 'Support request failed');
  }
  if (!response.ok || payload?.success === false) {
    throw createApiError(payload, 'Support request failed');
  }
  return payload?.data;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function authHeaders({ idempotencyKey, json = false } = {}) {
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return headers;
}

function requireCommandKey(options = {}) {
  const key = String(options.idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 128) {
    throw createApiError({
      errorCode: 'COMMAND_VALIDATION_FAILED',
      errors: [{ field: 'idempotencyKey', message: 'Command identity must contain 8 to 128 characters' }],
    }, 'Support command identity is invalid');
  }
  return key;
}

export function createSupportCommandKey(operation = 'support') {
  if (globalThis.crypto?.randomUUID) return `${operation}-${globalThis.crypto.randomUUID()}`;
  return `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function createSupportService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  async function request(path, options = {}) {
    return parseResponse(await fetcher(`${baseUrl}${path}`, {
      credentials: 'include',
      ...options,
    }));
  }

  function command(path, method, body, options) {
    const idempotencyKey = requireCommandKey(options);
    return request(path, {
      method,
      headers: authHeaders({ idempotencyKey, json: true }),
      body: JSON.stringify(body),
    });
  }

  const service = {
    createRequest(input, options) {
      return command('/support-requests', 'POST', input, options);
    },
    listOwn(params = {}) {
      return request(`/support-requests/my${buildQuery(params)}`);
    },
    getDetail(ticketId, params = {}, { scope = 'customer' } = {}) {
      const prefix = scope === 'staff' ? '/staff' : '';
      return request(`${prefix}/support-requests/${ticketId}${buildQuery(params)}`);
    },
    appendMessage(ticketId, input, options = {}) {
      const prefix = options.scope === 'staff' ? '/staff' : '';
      return command(`${prefix}/support-requests/${ticketId}/messages`, 'POST', input, options);
    },
    withdraw(ticketId, input, options) {
      return command(`/support-requests/${ticketId}/withdraw`, 'PATCH', input, options);
    },
    reopen(ticketId, input, options) {
      return command(`/support-requests/${ticketId}/reopen`, 'POST', input, options);
    },
    listOperational(params = {}) {
      return request(`/staff/support-requests${buildQuery(params)}`);
    },
    claim(ticketId, input, options) {
      return command(`/staff/support-requests/${ticketId}/claim`, 'POST', input, options);
    },
    changePriority(ticketId, input, options) {
      return command(`/staff/support-requests/${ticketId}/priority`, 'PATCH', input, options);
    },
    transfer(ticketId, input, options) {
      return command(`/staff/support-requests/${ticketId}/transfer`, 'PATCH', input, options);
    },
    resolve(ticketId, input, options) {
      return command(`/staff/support-requests/${ticketId}/resolve`, 'POST', input, options);
    },
    async listActiveStaff(ticketId) {
      const detail = await service.getDetail(ticketId, {}, { scope: 'staff' });
      return Array.isArray(detail?.transferTargets) ? detail.transferTargets : [];
    },
    listEligibleOrders() {
      return request('/orders/my');
    },
    listActiveProducts() {
      return request('/products?page=1&pageSize=50');
    },
  };

  // Read-only aliases keep unrelated dashboard callers working during the SL-008 UI cutover.
  service.listMyRequests = service.listOwn;
  service.listStaffRequests = service.listOperational;
  service.getStaffRequest = (ticketId, params = {}) => (
    service.getDetail(ticketId, params, { scope: 'staff' })
  );
  service.createCustomerRequest = service.createRequest;

  return service;
}

export const supportService = createSupportService();
