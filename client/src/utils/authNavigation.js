export function safeReturnPath(candidate, fallback = '/') {
  if (typeof candidate !== 'string') return fallback;
  const value = candidate.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }

  try {
    const localOrigin = 'http://greenhome.local';
    const parsed = new URL(value, localOrigin);
    if (parsed.origin !== localOrigin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return fallback;
  }
}
