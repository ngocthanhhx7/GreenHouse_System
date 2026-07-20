const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it, before, after } = require('node:test');

const { createApp } = require('./app');

function request(server, options, body = '') {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      { ...options, port: address.port, host: '127.0.0.1' },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => resolve({ res, body: JSON.parse(responseBody) }));
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

describe('API error contract app integration', () => {
  let server;

  before(async () => {
    server = await new Promise((resolve) => {
      const instance = createApp().listen(0, () => resolve(instance));
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it('returns the incoming request ID on a successful response', async () => {
    const { res, body } = await request(server, {
      method: 'GET',
      path: '/api/health',
      headers: { 'X-Request-Id': '  integration-health  ' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-request-id'], 'integration-health');
    assert.equal(body.success, true);
    assert.equal(body.requestId, 'integration-health');
  });

  it('returns a traceable 404 contract for an unmatched route', async () => {
    const { res, body } = await request(server, {
      method: 'GET',
      path: '/api/does-not-exist',
      headers: { 'X-Request-Id': 'integration-not-found' },
    });

    assert.equal(res.statusCode, 404);
    assert.equal(body.errorCode, 'NOT_FOUND');
    assert.equal(body.requestId, 'integration-not-found');
    assert.equal(body.stack, undefined);
  });

  it('returns a generic traceable 400 for malformed JSON without leaking parser details', async () => {
    const { res, body } = await request(
      server,
      {
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': 'integration-parser-error',
        },
      },
      '{'
    );

    assert.equal(res.statusCode, 400);
    assert.equal(body.errorCode, 'VALIDATION_ERROR');
    assert.equal(body.requestId, 'integration-parser-error');
    assert.equal(body.message, 'Invalid request body');
    assert.equal(body.stack, undefined);
    assert.equal(body.message.includes('Unexpected end'), false);
  });
});
