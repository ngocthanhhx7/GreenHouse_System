const { sendError } = require('../utils/apiResponse');
const { sessionService: defaultSessionService } = require('../services/session.service');
const { readSessionCookie } = require('../utils/sessionCookie');

function attachAuthentication(req, result) {
  req.user = result.user;
  req.authSession = result.session;
}

function createAuthenticate({ sessionService = defaultSessionService } = {}) {
  return async function authenticateRequest(req, res, next) {
    if (req.user && req.authSession) return next();
    const selector = readSessionCookie(req);
    if (!selector) {
      return sendError(res, 'Thiếu phiên đăng nhập.', 401, [], 'SESSION_MISSING', req);
    }
    try {
      const result = await sessionService.authenticate(selector);
      attachAuthentication(req, result);
      return next();
    } catch (error) {
      return sendError(
        res,
        error.message || 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
        error.statusCode || 401,
        error.errors || [],
        error.errorCode || 'SESSION_INVALID',
        req
      );
    }
  };
}

function createSessionLoader({ sessionService = defaultSessionService } = {}) {
  return async function loadSession(req, res, next) {
    if (req.user && req.authSession) return next();
    const selector = readSessionCookie(req);
    if (!selector) return next();
    try {
      attachAuthentication(req, await sessionService.authenticate(selector));
    } catch (_error) {
      // Protected routes return the authoritative 401; public login may replace a stale cookie.
    }
    return next();
  };
}

const authenticate = createAuthenticate();
const loadSession = createSessionLoader();

module.exports = { authenticate, createAuthenticate, createSessionLoader, loadSession };
