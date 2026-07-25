const viteEnv = import.meta.env || {};
const DEFAULT_BASE_URL = viteEnv.VITE_API_BASE_URL || 'http://localhost:5000/api';
let csrfToken = '';
const sessionExpirationListeners = new Set();

export function setCsrfToken(value) {
  csrfToken = String(value || '');
}

export function clearCsrfToken() {
  csrfToken = '';
}

export function getCsrfToken() {
  return csrfToken;
}

export function createApiError(payload = {}, fallbackMessage = 'API request failed', statusCode) {
  const error = new Error(payload?.message || fallbackMessage);
  error.statusCode = statusCode;
  error.errorCode = payload?.errorCode;
  error.errors = Array.isArray(payload?.errors) ? payload.errors : [];
  error.data = payload?.data ?? null;
  error.requestId = payload?.requestId;
  return error;
}

export async function parseApiResponse(response, fallbackMessage = 'API request failed') {
  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    if (!response.ok) {
      const error = createApiError({}, fallbackMessage, response.status);
      if (isSessionExpirationError(error)) notifySessionExpiration(error);
      throw error;
    }
    throw new Error(fallbackMessage);
  }
  if (!response.ok || payload?.success === false) {
    const error = createApiError(payload, fallbackMessage, response.status);
    if (isSessionExpirationError(error)) notifySessionExpiration(error);
    throw error;
  }
  return payload?.data;
}

export function isSessionExpirationError(error) {
  return Number(error?.statusCode) === 401
    && /^SESSION_[A-Z0-9_]+$/.test(String(error?.errorCode || ''));
}

export function subscribeToSessionExpiration(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('Session expiration listener must be a function');
  }
  sessionExpirationListeners.add(listener);
  return () => {
    sessionExpirationListeners.delete(listener);
  };
}

function notifySessionExpiration(error) {
  for (const listener of [...sessionExpirationListeners]) {
    try {
      listener(error);
    } catch (_listenerError) {
      // A UI listener must not replace the authoritative API error.
    }
  }
}

export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  return parseApiResponse(response);
}

export function resolveMediaUrl(value) {
  if (!value || /^https?:\/\//i.test(value) || /^data:/i.test(value)) return value || '';
  const serverOrigin = DEFAULT_BASE_URL.replace(/\/api\/?$/, '');
  return `${serverOrigin}${value.startsWith('/') ? value : `/${value}`}`;
}

export { DEFAULT_BASE_URL };
