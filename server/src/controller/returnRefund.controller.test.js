const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const controller = require('./returnRefund.controller');
const { listPublicBanks } = require('../config/refundBankCatalog');

function responseHarness() {
  return {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
}

describe('return/refund public bank catalog controller', () => {
  it('returns only the public catalog with no-store caching', async () => {
    const res = responseHarness();
    await controller.listPublicBanks({ user: { id: 'customer-1', role: 'Customer' } }, res, assert.fail);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data, listPublicBanks());
    assert.equal(JSON.stringify(res.payload).includes('970436'), false);
  });
});
