const assert = require('node:assert/strict');
const { it } = require('node:test');

const { validateRequest } = require('./validateRequest.middleware');
const { rules } = require('../validation/requestValidation');

it('validateRequest rejects invalid input with the existing error envelope', () => {
  const req = { body: { email: 'sai' }, requestId: 'validation-1' };
  const res = {
    req,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;

  validateRequest({ email: [rules.email('Email không hợp lệ')] })(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Dữ liệu yêu cầu không hợp lệ',
    data: null,
    errors: [{ field: 'email', message: 'Email không hợp lệ' }],
    errorCode: 'VALIDATION_ERROR',
    requestId: 'validation-1',
  });
});

it('validateRequest replaces the body with normalized values', () => {
  const req = { body: { email: ' THANH@EXAMPLE.COM ' } };
  const res = {};
  let nextCalled = false;

  validateRequest({ email: [rules.email('Email không hợp lệ')] })(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.body.email, 'thanh@example.com');
});
