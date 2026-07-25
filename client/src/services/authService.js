import {
  DEFAULT_BASE_URL,
  clearCsrfToken,
  getCsrfToken,
  setCsrfToken,
} from './apiClient.js';

const DASHBOARD_BY_ROLE = {
  Customer: '/',
  Staff: '/staff',
  WarehouseManager: '/warehouse',
  Admin: '/admin',
};

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || 'Yêu cầu xác thực thất bại.');
    error.errorCode = payload.errorCode;
    error.errors = Array.isArray(payload.errors) ? payload.errors : [];
    error.data = payload.data ?? null;
    throw error;
  }
  return payload.data;
}

export function createAuthService({
  baseUrl = DEFAULT_BASE_URL,
  fetcher = fetch,
} = {}) {
  function createIdempotencyKey() {
    return globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && getCsrfToken()) {
      headers['X-CSRF-Token'] = getCsrfToken();
    }
    return parseResponse(await fetcher(`${baseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    }));
  }

  async function loadCsrf() {
    const result = await request('/auth/csrf');
    setCsrfToken(result.csrfToken);
    return result.csrfToken;
  }

  return {
    async requestRegistrationChallenge(email) {
      const idempotencyKey = createIdempotencyKey();
      return request('/auth/registration-challenges', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ email, idempotencyKey }),
      });
    },

    async completeRegistration(input) {
      const idempotencyKey = input.idempotencyKey || createIdempotencyKey();
      return request('/auth/registrations', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ ...input, idempotencyKey }),
      });
    },

    async acceptInvitation(input) {
      const idempotencyKey = input.idempotencyKey || createIdempotencyKey();
      return request('/internal-invitations/accept', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ ...input, idempotencyKey }),
      });
    },

    async login(input) {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await loadCsrf();
      return result;
    },

    async me() {
      const result = await request('/auth/me');
      await loadCsrf();
      return result;
    },

    async logout() {
      try {
        return await request('/auth/logout', { method: 'POST' });
      } finally {
        clearCsrfToken();
      }
    },

    getDashboardPath(roleName) {
      return DASHBOARD_BY_ROLE[roleName] || '/profile';
    },
  };
}

export const authService = createAuthService();
