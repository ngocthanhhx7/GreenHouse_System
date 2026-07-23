const rateLimit = require('express-rate-limit');

function resolveCorsOrigins(value = process.env.CORS_ORIGINS || 'http://localhost:5173') {
  return String(value).split(',').map((origin) => origin.trim()).filter(Boolean);
}

function createCorsOptions(origins = resolveCorsOrigins()) {
  const allowlist = new Set(origins);
  return {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  };
}

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  message = 'Bạn thao tác quá nhiều, vui lòng thử lại sau.',
  errorCode = 'RATE_LIMITED',
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({
        success: false,
        message,
        data: null,
        errors: [],
        errorCode,
        ...(req.requestId ? { requestId: req.requestId } : {}),
      });
    },
  });
}

module.exports = {
  resolveCorsOrigins,
  createCorsOptions,
  createRateLimiter,
};
