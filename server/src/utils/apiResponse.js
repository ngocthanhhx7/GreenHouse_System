const ERROR_CODES = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  503: 'SERVICE_UNAVAILABLE',
};

function getRequestId(res, req) {
  return (req || (res && res.req)) && (req || res.req).requestId;
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

function sendError(res, message = 'Something went wrong', statusCode = 500, errors = [], errorCode, req) {
  const payload = {
    success: false,
    message,
    data: null,
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
