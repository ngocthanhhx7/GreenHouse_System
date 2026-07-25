import {
  DEFAULT_BASE_URL,
  apiRequest,
  parseApiResponse,
} from './apiClient.js';

export function createContactService({ baseUrl = DEFAULT_BASE_URL, fetcher } = {}) {
  const request = fetcher
    ? async (path, options = {}) => parseApiResponse(
      await fetcher(`${baseUrl}${path}`, {
        credentials: 'include',
        ...options,
      }),
      'Không thể gửi tin nhắn. Vui lòng thử lại.',
    )
    : apiRequest;

  return {
    submit(input) {
      return request('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
  };
}

export const contactService = createContactService();
