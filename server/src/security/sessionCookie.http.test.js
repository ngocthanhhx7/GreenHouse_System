const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, describe, it } = require('node:test');

const { createApp } = require('../app');

function request(server, options) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      ...options,
      host: '127.0.0.1',
      port: address.port,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ res, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('session cookie HTTP boundary', () => {
  let server;

  before(() => {
    server = createApp({ rateLimit: false }).listen(0);
  });

  after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  it('keeps the Express process responsive for malformed percent-encoded cookies', async () => {
    const response = await request(server, {
      method: 'GET',
      path: '/api/health',
      headers: {
        Cookie: 'theme=light; gh_session=%E0%A4%A',
        'X-Request-Id': 'malformed-session-cookie',
      },
    });

    assert.equal(response.res.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.requestId, 'malformed-session-cookie');
  });
});
