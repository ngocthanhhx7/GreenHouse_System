const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { sendSuccess, sendError } = require('./apiResponse');

function createResponse(requestId) {
  return {
    req: requestId ? { requestId } : undefined,
    statusCode: null,
    body: null,
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

describe('API response helpers', () => {
  it('keeps the legacy success fields and adds the request ID from res.req', () => {
    const res = createResponse('request-123');

    sendSuccess(res, { id: 1 }, 'Created', 201);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, {
      success: true,
      message: 'Created',
      data: { id: 1 },
      errors: [],
      requestId: 'request-123',
    });
  });

  it('accepts a request explicitly while preserving the old helper arguments', () => {
    const res = createResponse();

    sendSuccess(res, null, 'OK', 200, { requestId: 'explicit-request' });

    assert.equal(res.body.requestId, 'explicit-request');
    assert.equal(res.body.message, 'OK');
  });

  it('maps known error statuses and keeps the legacy error fields', () => {
    const expectedCodes = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      503: 'SERVICE_UNAVAILABLE',
    };

    for (const [statusCode, errorCode] of Object.entries(expectedCodes)) {
      const res = createResponse('request-error');

      sendError(res, 'Request failed', Number(statusCode), ['detail']);

      assert.equal(res.statusCode, Number(statusCode));
      assert.deepEqual(res.body, {
        success: false,
        message: 'Request failed',
        data: null,
        errors: ['detail'],
        errorCode,
        requestId: 'request-error',
      });
    }
  });

  it('uses INTERNAL_ERROR for unmapped error statuses', () => {
    const res = createResponse('request-internal');

    sendError(res, 'Internal server error', 500);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.errorCode, 'INTERNAL_ERROR');
    assert.equal(res.body.requestId, 'request-internal');
  });
});
