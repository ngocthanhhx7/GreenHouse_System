import { DEFAULT_BASE_URL, apiRequest } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || 'Không thể xử lý hồ sơ');
    error.errorCode = payload.errorCode;
    error.errors = payload.errors || [];
    throw error;
  }
  return payload.data;
}

export function createProfileService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseResponse(await fetcher(`${baseUrl}${path}`, options))
    : apiRequest;

  return {
    getProfile: () => request('/profile'),
    updateProfile: (input) => request('/profile', { method: 'PATCH', body: JSON.stringify(input) }),
    changePassword: (input) => request('/profile/password', { method: 'PATCH', body: JSON.stringify(input) }),
    listAddresses: () => request('/profile/addresses'),
    createAddress: (input) => request('/profile/addresses', { method: 'POST', body: JSON.stringify(input) }),
    updateAddress: (id, input) => request(`/profile/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    setDefaultAddress: (id) => request(`/profile/addresses/${id}/default`, { method: 'PATCH' }),
    deleteAddress: (id) => request(`/profile/addresses/${id}`, { method: 'DELETE' }),
    uploadAvatar(file, filename = file?.name || 'avatar') {
      const formData = new FormData();
      formData.append('avatar', file, filename);
      return request('/profile/avatar', { method: 'POST', body: formData });
    },
    deleteAvatar: () => request('/profile/avatar', { method: 'DELETE' }),
  };
}

export const profileService = createProfileService();
