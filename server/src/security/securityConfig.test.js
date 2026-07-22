const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it, before, after } = require('node:test');

const { createApp } = require('../app');

function request(server, options, body = '') {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({ ...options, port: address.port, host: '127.0.0.1' }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => resolve({ res, body: responseBody ? JSON.parse(responseBody) : null }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('app security defaults', () => {
  let server;
  before(() => { server = createApp({ rateLimit: false }).listen(0); });
  after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('limits JSON bodies to 100kb with the normal error envelope', async () => {
    const body = JSON.stringify({ email: 'a@example.com', padding: 'x'.repeat(101 * 1024) });
    const { res, body: payload } = await request(server, {
      method: 'POST', path: '/api/auth/login', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body);
    assert.equal(res.statusCode, 413);
    assert.equal(payload.errorCode, 'PAYLOAD_TOO_LARGE');
    assert.equal(payload.success, false);
  });

  it('allows configured origins and rejects unconfigured origins', async () => {
    const allowed = await request(server, { method: 'GET', path: '/api/health', headers: { Origin: 'http://localhost:5173' } });
    assert.equal(allowed.res.headers['access-control-allow-origin'], 'http://localhost:5173');
    const denied = await request(server, { method: 'GET', path: '/api/health', headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.res.headers['access-control-allow-origin'], undefined);
  });
});
