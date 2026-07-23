const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises');
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

function requestRaw(server, options) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({ ...options, port: address.port, host: '127.0.0.1' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
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

  it('serves public product media but never exposes return evidence through /uploads', async () => {
    const uploadsRoot = await mkdtemp(path.join(os.tmpdir(), 'greenhome-static-'));
    const filename = '11111111-1111-4111-8111-111111111111.jpg';
    await mkdir(path.join(uploadsRoot, 'products'), { recursive: true });
    await mkdir(path.join(uploadsRoot, 'return-evidence'), { recursive: true });
    await writeFile(path.join(uploadsRoot, 'products', filename), Buffer.from([0xff, 0xd8, 0xff]));
    await writeFile(path.join(uploadsRoot, 'return-evidence', filename), Buffer.from([0xff, 0xd8, 0xff]));
    const mediaServer = createApp({ rateLimit: false, uploadsRoot }).listen(0);
    try {
      const product = await requestRaw(mediaServer, { method: 'GET', path: `/uploads/products/${filename}` });
      const evidence = await requestRaw(mediaServer, { method: 'GET', path: `/uploads/return-evidence/${filename}` });
      assert.equal(product.res.statusCode, 200);
      assert.equal(evidence.res.statusCode, 404);
    } finally {
      await new Promise((resolve, reject) => mediaServer.close((error) => error ? reject(error) : resolve()));
      await rm(uploadsRoot, { recursive: true, force: true });
    }
  });
});
