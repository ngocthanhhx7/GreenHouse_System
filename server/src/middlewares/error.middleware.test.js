const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ApiError = require('../utils/apiError');
const { errorHandler, notFound } = require('./error.middleware');

function createResponse(requestId) {
  return {
    req: { requestId },
    statusCode: null,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('error middleware', () => {
  it('returns an explicit ApiError code and request ID', () => {
    const res = createResponse('api-error-request');

    errorHandler(new ApiError(400, 'Invalid input', ['email'], 'VALIDATION_ERROR'), {}, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'VALIDATION_ERROR');
    assert.equal(res.body.requestId, 'api-error-request');
    assert.equal(res.body.errors[0], 'email');
  });

  it('maps a legacy ApiError status without requiring callers to change', () => {
    const res = createResponse('legacy-api-error-request');

    errorHandler(new ApiError(404, 'Missing record'), {}, res, () => {});

    assert.equal(res.body.errorCode, 'NOT_FOUND');
    assert.equal(res.body.requestId, 'legacy-api-error-request');
  });

  it('uses a generic 500 contract without leaking the original stack or message', () => {
    const res = createResponse('internal-request');
    const error = new Error('database password leaked');

    errorHandler(error, {}, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      success: false,
      message: 'Internal server error',
      data: null,
      errors: [],
      errorCode: 'INTERNAL_ERROR',
      requestId: 'internal-request',
    });
    assert.equal(res.body.stack, undefined);
  });

  it('returns NOT_FOUND for an unmatched route', () => {
    const res = createResponse('not-found-request');

    notFound({ originalUrl: '/api/missing' }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'NOT_FOUND');
    assert.equal(res.body.requestId, 'not-found-request');
  });
});
