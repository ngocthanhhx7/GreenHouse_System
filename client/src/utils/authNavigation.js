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

const PUBLIC_RETURN_ROOTS = ['/', '/products', '/about', '/contact'];
const SHARED_ACCOUNT_ROOTS = ['/profile', '/notifications'];
const ROLE_RETURN_ROOTS = Object.freeze({
  Customer: ['/cart', '/checkout', '/orders', '/return-refunds', '/exchanges', '/support', '/reviews'],
  Staff: ['/staff'],
  WarehouseManager: ['/warehouse'],
  Admin: ['/admin'],
});

function isAtOrBelow(pathname, root) {
  if (root === '/') return pathname === '/';
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function safeRoleReturnPath(candidate, roleName, fallback = '/') {
  const safeFallback = safeReturnPath(fallback, '/');
  const safeCandidate = safeReturnPath(candidate, safeFallback);
  const pathname = new URL(safeCandidate, 'http://greenhome.local').pathname;
  const allowedRoots = [
    ...PUBLIC_RETURN_ROOTS,
    ...SHARED_ACCOUNT_ROOTS,
    ...(ROLE_RETURN_ROOTS[roleName] || []),
  ];

  return allowedRoots.some((root) => isAtOrBelow(pathname, root))
    ? safeCandidate
    : safeFallback;
}
