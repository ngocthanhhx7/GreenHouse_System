const crypto = require('node:crypto');
const { sendError } = require('../utils/apiResponse');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_MUTATION_PATHS = new Set([
  '/auth/login',
  '/auth/registration-challenges',
  '/auth/registrations',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/internal-invitations/accept',
]);

function createCsrfToken({ sessionId, csrfSecret }) {
  return crypto.createHmac('sha256', String(csrfSecret || '')).update(String(sessionId || '')).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createCsrfProtection({ allowedOrigins = [] } = {}) {
  const allowlist = new Set(allowedOrigins);
  return function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) return next();
    if (PUBLIC_MUTATION_PATHS.has(req.path)) return next();
    if (!req.authSession) return next();
    const origin = req.headers.origin;
    if (!origin || !allowlist.has(origin)) {
      return sendError(res, 'Nguồn yêu cầu không được phép.', 403, [], 'CSRF_ORIGIN_DENIED', req);
    }
    const expected = createCsrfToken({
      sessionId: req.authSession.id,
      csrfSecret: req.authSession.csrfSecret,
    });
    if (!safeEqual(req.headers['x-csrf-token'], expected)) {
      return sendError(res, 'Mã bảo vệ yêu cầu không hợp lệ.', 403, [], 'CSRF_TOKEN_INVALID', req);
    }
    return next();
  };
}

module.exports = { SAFE_METHODS, createCsrfProtection, createCsrfToken };
