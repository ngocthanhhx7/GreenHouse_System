const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  assertCompletedAfterCarrierAck,
  assertSafeTarget,
} = require('./verifySl002Exchange');

describe('SL-002 verification destructive safety', () => {
  it('allows only the local greenhome_kitchen database outside production', () => {
    assert.doesNotThrow(() => assertSafeTarget(
      'mongodb://127.0.0.1:27017/greenhome_kitchen',
      { nodeEnv: 'test' }
    ));
    assert.doesNotThrow(() => assertSafeTarget(
      'mongodb://localhost/greenhome_kitchen?replicaSet=rs0',
      { nodeEnv: 'development' }
    ));
  });

  it('rejects production and every non-local or differently named database', () => {
    assert.throws(
      () => assertSafeTarget('mongodb://127.0.0.1/greenhome_kitchen', { nodeEnv: 'production' }),
      /production/i
    );
    assert.throws(
      () => assertSafeTarget('mongodb://db.internal/greenhome_kitchen', { nodeEnv: 'test' }),
      /local/i
    );
    assert.throws(
      () => assertSafeTarget('mongodb://127.0.0.1/greenhome', { nodeEnv: 'test' }),
      /greenhome_kitchen|local/i
    );
  });

  it('keeps the Carrier ACK minimal and loads the completed Customer request separately', async () => {
    const calls = [];
    const loaded = await assertCompletedAfterCarrierAck({
      carrierAck: {
        eventId: 'event-1',
        eventType: 'DELIVERED',
        idempotentReplay: false,
      },
      exchangeService: {
        async getCustomerRequest(customerId, requestId) {
          calls.push({ customerId, requestId });
          return { id: requestId, status: 'Completed' };
        },
      },
      customerId: 'customer-1',
      requestId: 'exchange-1',
    });

    assert.equal(loaded.status, 'Completed');
    assert.deepEqual(calls, [{ customerId: 'customer-1', requestId: 'exchange-1' }]);
  });

  it('rejects the former Carrier response shape that embeds a request', async () => {
    await assert.rejects(
      () => assertCompletedAfterCarrierAck({
        carrierAck: {
          eventId: 'event-1',
          eventType: 'DELIVERED',
          idempotentReplay: false,
          request: { status: 'Completed' },
        },
        exchangeService: {
          async getCustomerRequest() { return { status: 'Completed' }; },
        },
        customerId: 'customer-1',
        requestId: 'exchange-1',
      }),
      /minimal/i,
    );
  });
});
