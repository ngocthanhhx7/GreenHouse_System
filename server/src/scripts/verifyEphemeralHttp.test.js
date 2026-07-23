const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { runEphemeralHttpSmoke } = require('./verifyEphemeralHttp');

function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    async json() { return body; },
    async text() { return String(body); },
  };
}

describe('ephemeral HTTP smoke verifier', () => {
  it('records successful live checks without tokens or passwords', async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (url === 'http://front/') return response(200, '<div id="root"></div>');
      if (url === 'http://api/health' && !options.headers?.Origin) {
        return response(200, { success: true, data: null, requestId: 'health-id' });
      }
      if (url === 'http://api/health' && options.headers?.Origin === 'http://front') {
        return response(200, { success: true }, { 'access-control-allow-origin': 'http://front' });
      }
      if (url === 'http://api/health' && options.headers?.Origin === 'https://evil.example') {
        return response(200, { success: true });
      }
      if (url === 'http://api/profile' && !options.headers?.Authorization) {
        return response(401, { success: false, errorCode: 'AUTH_TOKEN_MISSING' });
      }
      if (url.endsWith('/auth/login')) {
        const email = JSON.parse(options.body).email;
        const role = email.startsWith('khachhang')
          ? 'Customer'
          : email.startsWith('nhanvien')
            ? 'Staff'
            : 'WarehouseManager';
        return response(200, {
          success: true,
          data: { token: `token-${role}`, user: { role: { id: `role-${role}`, roleName: role } } },
        });
      }
      if (url.endsWith('/orders/my')) return response(200, { success: true, data: [] });
      if (url.endsWith('/staff/orders') && options.headers?.Authorization === 'Bearer token-Customer') {
        return response(403, { success: false, errorCode: 'FORBIDDEN' });
      }
      if (url.endsWith('/staff/orders')) return response(200, { success: true, data: [] });
      if (url.endsWith('/warehouse/inventory')) return response(200, { success: true, data: [] });
      throw new Error(`Unexpected request ${url}`);
    };

    const report = await runEphemeralHttpSmoke({
      fetcher,
      apiBaseUrl: 'http://api',
      frontendUrl: 'http://front',
      password: 'not-recorded-password',
      now: (() => {
        let value = 0;
        return () => value++;
      })(),
    });

    assert.equal(report.outcome, 'passed');
    assert.equal(report.steps.every((step) => step.outcome === 'passed'), true);
    assert.equal(JSON.stringify(report).includes('not-recorded-password'), false);
    assert.equal(JSON.stringify(report).includes('token-Customer'), false);
    assert.equal(calls.length > 8, true);
  });

  it('records the failed step and rethrows without leaking credentials', async () => {
    try {
      await runEphemeralHttpSmoke({
        fetcher: async () => response(500, { success: false }),
        apiBaseUrl: 'http://api',
        frontendUrl: 'http://front',
        password: 'not-recorded-password',
      });
      assert.fail('Expected the smoke verifier to reject');
    } catch (error) {
      assert.match(error.message, /frontend root/i);
      assert.equal(error.report.outcome, 'failed');
      assert.equal(error.report.steps[0].name, 'frontend root');
      assert.equal(JSON.stringify(error.report).includes('not-recorded-password'), false);
    }
  });
});
