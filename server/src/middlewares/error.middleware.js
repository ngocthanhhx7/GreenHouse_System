const ApiError = require('../utils/apiError');
const { sendError } = require('../utils/apiResponse');

function notFound(req, res) {
  return sendError(res, `Route not found: ${req.originalUrl}`, 404);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error && error.type === 'entity.parse.failed') {
    return sendError(res, 'Invalid request body', 400, [], 'VALIDATION_ERROR', req);
  }
  if (error && (error.type === 'entity.too.large' || error.status === 413)) {
    return sendError(res, 'Request body is too large', 413, [], 'PAYLOAD_TOO_LARGE', req);
  }
  if (error instanceof ApiError) {
    return sendError(res, error.message, error.statusCode, error.errors, error.errorCode, req);
  }
  return sendError(res, 'Internal server error', 500, [], undefined, req);
}

module.exports = {
  notFound,
  errorHandler,
};
