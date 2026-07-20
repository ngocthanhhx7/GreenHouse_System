const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { requestId } = require('./requestId.middleware');

function createResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

describe('request ID middleware', () => {
  it('trims and forwards a safe incoming X-Request-Id', () => {
    const req = { headers: { 'x-request-id': '  client.trace-123  ' } };
    const res = createResponse();

    requestId(req, res, () => {});

    assert.equal(req.requestId, 'client.trace-123');
    assert.equal(res.headers['X-Request-Id'], 'client.trace-123');
  });

  it('generates a UUID for an unsafe incoming request ID', () => {
    const req = { headers: { 'x-request-id': 'not safe; value' } };
    const res = createResponse();

    requestId(req, res, () => {});

    assert.match(req.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(res.headers['X-Request-Id'], req.requestId);
  });

  it('generates a UUID when the incoming request ID is too long', () => {
    const req = { headers: { 'x-request-id': 'a'.repeat(129) } };
    const res = createResponse();

    requestId(req, res, () => {});

    assert.notEqual(req.requestId, 'a'.repeat(129));
    assert.equal(res.headers['X-Request-Id'], req.requestId);
  });
});
