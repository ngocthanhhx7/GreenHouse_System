const ERROR_CODES = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  503: 'SERVICE_UNAVAILABLE',
};

function getRequestId(res, req) {
  return (req && req.requestId) || (res && res.req && res.req.requestId);
}

function getErrorCode(statusCode, errorCode) {
  return errorCode || ERROR_CODES[statusCode] || 'INTERNAL_ERROR';
}

function sendSuccess(res, data = null, message = 'OK', statusCode = 200, req) {
  const payload = {
    success: true,
    message,
    data,
    errors: [],
  };
  const requestId = getRequestId(res, req);
  if (requestId) payload.requestId = requestId;
  return res.status(statusCode).json(payload);
}

function sendError(
  res,
  message = 'Đã xảy ra lỗi. Vui lòng thử lại.',
  statusCode = 500,
  errors = [],
  errorCode,
  req,
  data = null
) {
  const payload = {
    success: false,
    message,
    data,
    errors,
    errorCode: getErrorCode(statusCode, errorCode),
  };
  const requestId = getRequestId(res, req);
  if (requestId) payload.requestId = requestId;
  return res.status(statusCode).json(payload);
}

module.exports = {
  ERROR_CODES,
  getErrorCode,
  sendSuccess,
  sendError,
};
