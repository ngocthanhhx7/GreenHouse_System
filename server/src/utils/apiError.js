class ApiError extends Error {
  constructor(statusCode, message, errors = [], errorCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.errorCode = errorCode;
  }
}

module.exports = ApiError;
