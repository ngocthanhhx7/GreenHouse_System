const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it, before, after } = require('node:test');
const { createApp } = require('../app');

function request(server, body) {
  return new Promise((resolve, reject) => {
    const serialized = JSON.stringify(body);
    const req = http.request({ method: 'POST', path: '/api/contact', port: server.address().port, host: '127.0.0.1', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serialized) } }, (res) => {
      let responseText = '';
      res.on('data', (chunk) => { responseText += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(responseText) }));
    });
    req.on('error', reject);
    req.end(serialized);
  });
}

describe('public contact validation', () => {
  let server;
  before(() => { server = createApp({ rateLimit: false }).listen(0); });
  after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('returns a clear error for every invalid contact field', async () => {
    const result = await request(server, { name: '', email: 'sai', phone: '123', subject: '', message: 'ngắn' });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body.errors, [
      { field: 'name', message: 'Họ tên là bắt buộc.' },
      { field: 'email', message: 'Email không hợp lệ.' },
      { field: 'phone', message: 'Số điện thoại không hợp lệ.' },
      { field: 'subject', message: 'Chủ đề là bắt buộc.' },
      { field: 'message', message: 'Nội dung phải có ít nhất 10 ký tự.' },
    ]);
  });
});
