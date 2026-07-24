const ApiError = require('../utils/apiError');

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeIdentity(value, field = 'idempotencyKey') {
  const identity = String(value || '').trim();
  if (
    identity.length < 8
    || identity.length > 160
    || !/^[A-Za-z0-9:._-]+$/.test(identity)
  ) {
    throw new ApiError(
      400,
      `A valid ${field} is required`,
      [{ field, message: 'Use 8-160 letters, numbers, ., _, :, or -' }],
      'FULFILLMENT_IDENTITY_INVALID',
    );
  }
  return identity;
}

function requiredText(value, field, maxLength = 256) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ApiError(
      400,
      `${field} is required`,
      [{ field, message: `${field} is required and must be at most ${maxLength} characters` }],
      'FULFILLMENT_VALIDATION_FAILED',
    );
  }
  return normalized;
}

function optionalText(value, maxLength = 1000) {
  const normalized = String(value || '').trim();
  if (normalized.length > maxLength) {
    throw new ApiError(400, `Text must be at most ${maxLength} characters`);
  }
  return normalized;
}

function requiredDate(value, field) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new ApiError(
      400,
      `${field} is invalid`,
      [{ field, message: `${field} must be a valid timestamp` }],
      'FULFILLMENT_VALIDATION_FAILED',
    );
  }
  return parsed;
}

function positiveInteger(value, field, { allowZero = false } = {}) {
  const normalized = Number(value);
  const valid = Number.isSafeInteger(normalized) && (allowZero ? normalized >= 0 : normalized > 0);
  if (!valid) throw new ApiError(400, `${field} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
  return normalized;
}

function sameId(left, right) {
  return String(left) === String(right);
}

module.exports = {
  ApiError,
  hasOwn,
  normalizeIdentity,
  optionalText,
  positiveInteger,
  requiredDate,
  requiredText,
  sameId,
};
