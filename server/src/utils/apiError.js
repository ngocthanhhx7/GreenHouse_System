class ApiError extends Error {
  constructor(statusCode, message, errors = [], errorCode, data = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.errorCode = errorCode;
    this.data = data;
  }
}

module.exports = ApiError;
