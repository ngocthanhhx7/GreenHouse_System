const crypto = require('node:crypto');

const ApiError = require('./apiError');

const MAX_RETURN_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_RETURN_EVIDENCE_TOTAL_SIZE = 20 * 1024 * 1024;
const SAFE_BASE_URL = /^\/api\/return-refunds\/evidence\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

function createReturnEvidenceClaim({
  secret = process.env.RETURN_EVIDENCE_CLAIM_SECRET || '',
  runtime = process.env.NODE_ENV || 'development',
} = {}) {
  let resolvedSecret = String(secret || '').trim();
  if (!resolvedSecret) {
    if (runtime === 'production') throw new Error('RETURN_EVIDENCE_CLAIM_SECRET is required in production');
    resolvedSecret = String(process.env.JWT_SECRET || 'greenhome-local-return-evidence-claim-secret');
  }
  const key = crypto.createHash('sha256').update(resolvedSecret).digest();

  function signature(customerId, url, size) {
    return crypto.createHmac('sha256', key)
      .update(`${String(customerId)}\n${url}\n${size}`)
      .digest('hex');
  }

  function validateBase(url, size) {
    if (!SAFE_BASE_URL.test(url)) throw new ApiError(400, 'Return evidence URL is invalid');
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_RETURN_EVIDENCE_FILE_SIZE) {
      throw new ApiError(400, 'Return evidence size is invalid');
    }
  }

  return {
    sign(customerId, rawUrl, rawSize) {
      const url = String(rawUrl || '').toLowerCase();
      const size = Number(rawSize);
      validateBase(url, size);
      return `${url}?size=${size}&claim=${signature(customerId, url, size)}`;
    },

    verify(customerId, value) {
      const raw = String(value || '');
      const separator = raw.indexOf('?');
      if (separator < 1) throw new ApiError(400, 'Return evidence is not owned by this Customer');
      const url = raw.slice(0, separator).toLowerCase();
      const params = new URLSearchParams(raw.slice(separator + 1));
      if ([...params.keys()].length !== 2 || !params.has('size') || !params.has('claim')) {
        throw new ApiError(400, 'Return evidence is not owned by this Customer');
      }
      const size = Number(params.get('size'));
      validateBase(url, size);
      const supplied = String(params.get('claim') || '').toLowerCase();
      const expected = signature(customerId, url, size);
      if (!/^[0-9a-f]{64}$/.test(supplied)
        || !crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) {
        throw new ApiError(400, 'Return evidence is not owned by this Customer');
      }
      return { url, size };
    },
  };
}

module.exports = {
  createReturnEvidenceClaim,
  returnEvidenceClaim: createReturnEvidenceClaim(),
  MAX_RETURN_EVIDENCE_FILE_SIZE,
  MAX_RETURN_EVIDENCE_TOTAL_SIZE,
};
