const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
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

  it('prevents caching Customer destination list and submit responses', async () => {
    const listRes = responseHarness();
    const submitRes = responseHarness();
    const service = require('../services/returnRefund.service').returnRefundService;
    const savedList = service.listMyRequests;
    const savedSubmit = service.submitDestination;
    service.listMyRequests = async () => ({ items: [] });
    service.submitDestination = async () => ({ id: 'destination-1' });
    try {
      await controller.listMyRequests({ user: { id: 'customer-1' } }, listRes, assert.fail);
      await controller.submitDestination({
        user: { id: 'customer-1' },
        params: { id: 'request-1' },
        body: {},
      }, submitRes, assert.fail);
    } finally {
      service.listMyRequests = savedList;
      service.submitDestination = savedSubmit;
    }
    assert.equal(listRes.headers['Cache-Control'], 'no-store');
    assert.equal(submitRes.headers['Cache-Control'], 'no-store');
  });

  it('exposes Staff payout reconciliation, prevents caching, and preserves typed service errors', async () => {
    const service = require('../services/returnRefund.service').returnRefundService;
    const saved = service.reconcilePayoutOperation;
    const typedError = Object.assign(new Error('stale payout operation'), {
      statusCode: 409,
      errorCode: 'PAYOUT_OPERATION_STALE',
    });
    let nextError;
    service.reconcilePayoutOperation = async () => { throw typedError; };
    const res = responseHarness();
    try {
      await controller.reconcilePayoutOperation({
        user: { id: 'staff-1' },
        params: { id: 'request-1' },
        body: { operationKey: 'operation-1' },
      }, res, (error) => { nextError = error; });
    } finally {
      service.reconcilePayoutOperation = saved;
    }

    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(nextError, typedError);
    assert.equal(nextError.statusCode, 409);
    assert.equal(nextError.errorCode, 'PAYOUT_OPERATION_STALE');

    const routes = readFileSync(path.join(__dirname, '../routes/returnRefund.routes.js'), 'utf8');
    assert.match(
      routes,
      /router\.post\('\/staff\/return-refunds\/:id\/payout-reconciliation', authenticate, authorizeRoles\('Staff'\), validateObjectIdParam\(\), returnRefundController\.reconcilePayoutOperation\)/,
    );
  });
});
