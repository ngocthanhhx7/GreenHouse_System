const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ApiError = require('./apiError');

describe('ApiError', () => {
  it('preserves the legacy constructor arguments', () => {
    const error = new ApiError(400, 'Invalid input', ['name is required']);

    assert.equal(error.statusCode, 400);
    assert.equal(error.message, 'Invalid input');
    assert.deepEqual(error.errors, ['name is required']);
    assert.equal(error.errorCode, undefined);
  });

  it('accepts an optional error code after the legacy arguments', () => {
    const error = new ApiError(409, 'Already exists', [], 'CONFLICT');

    assert.equal(error.errorCode, 'CONFLICT');
  });

  it('accepts owner-safe structured data without changing legacy positions', () => {
    const data = {
      currentCase: { type: 'EXCHANGE', id: 'exchange-1', status: 'Submitted' },
      action: { label: 'Xem yêu cầu đang xử lý', href: '/exchanges/exchange-1' },
    };
    const error = new ApiError(409, 'Case active', [], 'AFTER_SALES_CASE_ACTIVE', data);

    assert.deepEqual(error.data, data);
  });
});
