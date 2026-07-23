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

describe('SL-007 cookie session authentication', () => {
  it('AT-140 rejects a bearer token when no protected session cookie exists', async () => {
    const authenticate = createAuthenticate({
      sessionService: { async authenticate() { throw new Error('must not receive bearer'); } },
    });
    const req = { headers: { authorization: 'Bearer legacy-token' } };
    const res = responseRecorder();
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.errorCode, 'SESSION_MISSING');
    assert.equal(nextCalled, false);
  });

  it('AT-140 authenticates only the current server session and attaches its persisted user', async () => {
    const authenticate = createAuthenticate({
      sessionService: {
        async authenticate(selector) {
          assert.equal(selector, 'opaque-selector');
          return {
            user: { id: 'user-1', email: 'thanh@example.com', role: 'Customer', status: 'Active' },
            session: { id: 'session-1', csrfSecret: 'csrf-secret' },
          };
        },
      },
    });
    const req = { headers: { cookie: 'gh_session=opaque-selector' } };
    const res = responseRecorder();
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.email, 'thanh@example.com');
    assert.equal(req.authSession.id, 'session-1');
  });
});
