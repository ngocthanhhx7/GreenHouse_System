const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it, before, after } = require('node:test');
const { createApp } = require('../app');

function request(server, path, body) {
  return new Promise((resolve, reject) => {
    const serialized = JSON.stringify(body);
    const req = http.request({ method: 'POST', path, port: server.address().port, host: '127.0.0.1', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serialized) } }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(serialized);
  });
}

describe('auth request validation', () => {
  let server;
  before(() => { server = createApp({ rateLimit: false }).listen(0); });
  after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  it('rejects invalid registration before touching persistence', async () => {
    const result = await request(server, '/api/auth/register', { email: 'sai', password: '123' });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body.errors, [
      { field: 'fullName', message: 'Họ tên là bắt buộc' },
      { field: 'email', message: 'Email không hợp lệ' },
      { field: 'phone', message: 'Số điện thoại là bắt buộc' },
      { field: 'address', message: 'Địa chỉ là bắt buộc' },
      { field: 'password', message: 'Mật khẩu phải có ít nhất 8 ký tự' },
    ]);
  });

  it('rejects login with field-specific errors', async () => {
    const result = await request(server, '/api/auth/login', { email: 'sai', password: '' });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body.errors, [
      { field: 'email', message: 'Email không hợp lệ' },
      { field: 'password', message: 'Mật khẩu là bắt buộc' },
    ]);
  });

  it('validates forgot-password email before accessing persistence', async () => {
    const result = await request(server, '/api/auth/forgot-password', { email: 'khong-hop-le' });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body.errors, [{ field: 'email', message: 'Email không hợp lệ.' }]);
  });

  it('returns separate field errors for an invalid OTP reset payload', async () => {
    const result = await request(server, '/api/auth/reset-password', {
      email: 'khong-hop-le', otp: '12ab', password: 'short', confirmPassword: 'different',
    });
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body.errors, [
      { field: 'email', message: 'Email không hợp lệ.' },
      { field: 'otp', message: 'Mã OTP phải gồm đúng 6 chữ số.' },
      { field: 'password', message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' },
      { field: 'confirmPassword', message: 'Xác nhận mật khẩu không khớp.' },
    ]);
  });
});
