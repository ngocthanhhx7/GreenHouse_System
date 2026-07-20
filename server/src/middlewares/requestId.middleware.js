const crypto = require('node:crypto');

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function getIncomingRequestId(req) {
  if (typeof req.get === 'function') return req.get('X-Request-Id');
  return req.headers && req.headers['x-request-id'];
}

function isSafeRequestId(value) {
  return typeof value === 'string' && value.length <= MAX_REQUEST_ID_LENGTH && SAFE_REQUEST_ID.test(value);
}

function requestId(req, res, next) {
  const incoming = getIncomingRequestId(req);
  const trimmed = typeof incoming === 'string' ? incoming.trim() : '';
  req.requestId = isSafeRequestId(trimmed) ? trimmed : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  return next();
}

module.exports = {
  requestId,
  isSafeRequestId,
};
