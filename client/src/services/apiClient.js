const viteEnv = import.meta.env || {};
const DEFAULT_BASE_URL = viteEnv.VITE_API_BASE_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'greenhome_token';

function getStorage() {
  return window.localStorage;
}

export async function apiRequest(path, options = {}) {
  const token = getStorage().getItem(TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'API request failed');
  }
  return payload.data;
}

export { TOKEN_KEY, DEFAULT_BASE_URL };
