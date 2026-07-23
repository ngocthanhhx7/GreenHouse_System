const viteEnv = import.meta.env || {};
const DEFAULT_BASE_URL = viteEnv.VITE_API_BASE_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'greenhome_token';

function getStorage() {
  return window.localStorage;
}

export function createApiError(payload = {}, fallbackMessage = 'API request failed') {
  const error = new Error(payload?.message || fallbackMessage);
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
    if (!response.ok) throw createApiError({}, fallbackMessage);
    throw new Error(fallbackMessage);
  }
  if (!response.ok || payload?.success === false) {
    throw createApiError(payload, fallbackMessage);
  }
  return payload?.data;
}

export async function apiRequest(path, options = {}) {
  const token = getStorage().getItem(TOKEN_KEY);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  return parseApiResponse(response);
}

export function resolveMediaUrl(value) {
  if (!value || /^https?:\/\//i.test(value) || /^data:/i.test(value)) return value || '';
  const serverOrigin = DEFAULT_BASE_URL.replace(/\/api\/?$/, '');
  return `${serverOrigin}${value.startsWith('/') ? value : `/${value}`}`;
}

export { TOKEN_KEY, DEFAULT_BASE_URL };
