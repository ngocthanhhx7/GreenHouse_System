const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createAuthenticate } = require('./auth.middleware');

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

const user = {
  _id: 'user-1', fullName: 'Nguyễn Ngọc Thành', email: 'thanh@example.com', phone: '0900000000',
  roleId: { roleName: 'Customer' }, status: 'Active', passwordChangedAt: new Date('2026-07-22T03:00:00.000Z'),
};

describe('authentication password version', () => {
  it('rejects a JWT issued before the latest password reset', async () => {
    const authenticate = createAuthenticate({
      verifyToken: () => ({ sub: 'user-1', pwd: 0 }),
      findUserById: async () => user,
    });
    const req = { headers: { authorization: 'Bearer old-token' } };
    const res = responseRecorder();
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.errorCode, 'AUTH_TOKEN_STALE');
    assert.equal(nextCalled, false);
  });

  it('accepts a JWT carrying the current password version', async () => {
    const authenticate = createAuthenticate({
      verifyToken: () => ({ sub: 'user-1', pwd: user.passwordChangedAt.getTime() }),
      findUserById: async () => user,
    });
    const req = { headers: { authorization: 'Bearer current-token' } };
    const res = responseRecorder();
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.email, 'thanh@example.com');
  });
});
