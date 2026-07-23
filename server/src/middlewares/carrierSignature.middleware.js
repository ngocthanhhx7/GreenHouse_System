const crypto = require('node:crypto');
const { sendError } = require('../utils/apiResponse');

function createCarrierSignature({ secret = process.env.CARRIER_WEBHOOK_SECRET } = {}) {
  return function carrierSignature(req, res, next) {
    const configuredSecret = String(secret || '');
    if (!configuredSecret) return sendError(res, 'Carrier integration is not configured', 503, [], 'CARRIER_NOT_CONFIGURED', req);

    const supplied = String(req.headers['x-carrier-signature'] || '').trim().toLowerCase();
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('hex');
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
