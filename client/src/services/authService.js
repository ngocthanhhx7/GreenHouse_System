import { DEFAULT_BASE_URL, TOKEN_KEY, apiRequest } from './apiClient.js';

const DASHBOARD_BY_ROLE = {
  Customer: '/profile',
  Staff: '/staff',
  WarehouseManager: '/warehouse',
  Admin: '/admin',
};

function browserStorage() {
  return window.localStorage;
}

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Authentication request failed');
  }
  return payload.data;
}

export function createAuthService({
  baseUrl = DEFAULT_BASE_URL,
  storage = typeof window === 'undefined' ? null : browserStorage(),
  fetcher = fetch,
} = {}) {
  return {
    async register(input) {
      return parseResponse(
        await fetcher(`${baseUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      );
    },

    async login(input) {
      const result = await parseResponse(
        await fetcher(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      );
      if (storage && result.token) {
        storage.setItem(TOKEN_KEY, result.token);
      }
      return result;
    },

    async me() {
      return apiRequest('/auth/me');
    },

    logout() {
      if (storage) storage.removeItem(TOKEN_KEY);
    },

    getToken() {
      return storage ? storage.getItem(TOKEN_KEY) : null;
    },

    getDashboardPath(roleName) {
      return DASHBOARD_BY_ROLE[roleName] || '/profile';
    },
  };
}

export const authService = createAuthService();
