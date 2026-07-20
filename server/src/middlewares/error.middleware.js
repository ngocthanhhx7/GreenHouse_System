const ApiError = require('../utils/apiError');
const { sendError } = require('../utils/apiResponse');

function notFound(req, res) {
  return sendError(res, `Route not found: ${req.originalUrl}`, 404);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error && error.type === 'entity.parse.failed') {
    return sendError(res, 'Invalid request body', 400, [], 'VALIDATION_ERROR');
  }
  if (error instanceof ApiError) {
    return sendError(res, error.message, error.statusCode, error.errors, error.errorCode);
  }
  return sendError(res, 'Internal server error', 500);
}

module.exports = {
  notFound,
  errorHandler,
};
