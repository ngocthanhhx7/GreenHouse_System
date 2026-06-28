const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { authorizeRoles } = require('./authorize.middleware');

function createResponse() {
  return {
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

describe('authorizeRoles middleware', () => {
  it('allows a request when user role is included', () => {
    const req = { user: { role: 'Admin' } };
    const res = createResponse();
    let nextCalled = false;

    authorizeRoles('Admin', 'Staff')(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });

  it('rejects a request with 403 when user role is not included', () => {
    const req = { user: { role: 'Customer' } };
    const res = createResponse();
    let nextCalled = false;

    authorizeRoles('Admin', 'Staff')(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
  });
});
