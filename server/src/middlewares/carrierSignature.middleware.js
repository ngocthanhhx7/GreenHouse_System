const crypto = require('node:crypto');
const { sendError } = require('../utils/apiResponse');

const DEFAULT_REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

function createCarrierSignature({
  secret = process.env.CARRIER_WEBHOOK_SECRET,
  clock = () => new Date(),
  replayToleranceMs = DEFAULT_REPLAY_TOLERANCE_MS,
} = {}) {
  return function carrierSignature(req, res, next) {
    const configuredSecret = String(secret || '');
    if (!configuredSecret) return sendError(res, 'Carrier integration is not configured', 503, [], 'CARRIER_NOT_CONFIGURED', req);

    const supplied = String(req.headers['x-carrier-signature'] || '').trim().toLowerCase();
    const timestamp = String(req.headers['x-carrier-timestamp'] || '').trim();
    const timestampMs = Date.parse(timestamp);
    if (!timestamp || Number.isNaN(timestampMs)
      || Math.abs(new Date(clock()).getTime() - timestampMs) > replayToleranceMs) {
      return sendError(res, 'Invalid or stale Carrier timestamp', 401, [], 'CARRIER_TIMESTAMP_INVALID', req);
    }
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
    const method = String(req.method || '').toUpperCase();
    const requestPath = String(req.originalUrl || req.url || '');
    const expected = crypto.createHmac('sha256', configuredSecret)
      .update(`${timestamp}\n${method}\n${requestPath}\n`)
      .update(rawBody)
      .digest('hex');
    const suppliedBuffer = Buffer.from(supplied, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      return sendError(res, 'Invalid Carrier signature', 401, [], 'CARRIER_SIGNATURE_INVALID', req);
    }
    return next();
  };
}

const carrierSignature = createCarrierSignature();

module.exports = { createCarrierSignature, carrierSignature };
