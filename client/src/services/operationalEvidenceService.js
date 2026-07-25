import { DEFAULT_BASE_URL, createApiError, getCsrfToken } from './apiClient.js';

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw createApiError(payload, 'Không thể tải ảnh dẫn chứng');
  return payload.data;
}

export function createOperationalEvidenceService({ baseUrl = DEFAULT_BASE_URL, fetcher = fetch } = {}) {
  return {
    async uploadImages(files) {
      const selected = Array.from(files || []);
      if (!selected.length) throw new Error('Cần chọn ít nhất 1 ảnh dẫn chứng.');
      if (selected.length > 5) throw new Error('Chỉ được tải tối đa 5 ảnh dẫn chứng.');
      const body = new FormData();
      selected.forEach((file) => body.append('images', file));
      return parseResponse(await fetcher(`${baseUrl}/operational-evidence`, {
        method: 'POST',
        headers: getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {},
        credentials: 'include',
        body,
      }));
    },
  };
}

export const operationalEvidenceService = createOperationalEvidenceService();
