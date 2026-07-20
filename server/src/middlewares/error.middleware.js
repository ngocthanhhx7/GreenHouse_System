const ApiError = require('../utils/apiError');
const { sendError } = require('../utils/apiResponse');

function notFound(req, res) {
  return sendError(res, `Route not found: ${req.originalUrl}`, 404);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ApiError) {
    return sendError(res, error.message, error.statusCode, error.errors, error.errorCode);
  }
  return sendError(res, 'Internal server error', 500);
}

module.exports = {
  notFound,
  errorHandler,
};
