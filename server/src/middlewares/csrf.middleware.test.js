const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createCsrfProtection, createCsrfToken } = require('./csrf.middleware');

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

describe('cookie session CSRF protection', () => {
  it('AT-139 requires an allowed Origin and a session-bound token for mutations', () => {
    const middleware = createCsrfProtection({ allowedOrigins: ['http://localhost:5173'] });
    const token = createCsrfToken({ sessionId: 'session-1', csrfSecret: 'secret-1' });

    const denied = {
      method: 'POST',
      headers: { origin: 'https://evil.test', 'x-csrf-token': token },
      authSession: { id: 'session-1', csrfSecret: 'secret-1' },
    };
    const deniedResponse = responseRecorder();
    middleware(denied, deniedResponse, () => {});
    assert.equal(deniedResponse.statusCode, 403);

    const allowed = {
      method: 'PATCH',
      headers: { origin: 'http://localhost:5173', 'x-csrf-token': token },
      authSession: { id: 'session-1', csrfSecret: 'secret-1' },
    };
    let nextCalled = false;
    middleware(allowed, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('allows public authentication mutations to replace stale sessions', () => {
    const middleware = createCsrfProtection({ allowedOrigins: ['http://localhost:5173'] });
    let nextCalled = false;
    middleware({
      method: 'POST',
      path: '/auth/login',
      headers: {},
      authSession: { id: 'stale', csrfSecret: 'secret' },
    }, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});
