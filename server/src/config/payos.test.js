const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { buildRedirectUrl, createPayOSGateway } = require('./payos');

describe('payOS configuration', () => {
  it('injects the internal order id into configured return URLs', () => {
    assert.equal(
      buildRedirectUrl('http://localhost:5173/payments/result/{orderId}', 'order-1'),
      'http://localhost:5173/payments/result/order-1'
    );
    assert.equal(
      buildRedirectUrl('http://localhost:5173/payments/result', 'order-1'),
      'http://localhost:5173/payments/result?orderId=order-1'
    );
  });

  it('reports missing credentials without exposing secret values', () => {
    const gateway = createPayOSGateway({ clientId: '', apiKey: '', checksumKey: '' });
    assert.equal(gateway.isConfigured(), false);
  });

  it('uses the immutable order deadline as the provider-link expiry', async () => {
    const calls = [];
    const client = {
      paymentRequests: {
        async create(payload) {
          calls.push(payload);
          return { id: 'link-1', ...payload };
        },
      },
    };
    const deadline = new Date(Date.now() + 120_000);
    const gateway = createPayOSGateway(
      {
        clientId: 'client',
        apiKey: 'api',
        checksumKey: 'checksum',
        returnUrl: 'http://localhost:5173/payments/result',
        cancelUrl: 'http://localhost:5173/payments/cancel',
        ttlMinutes: 60,
      },
      { client },
    );

    await gateway.createPaymentLink({
      order: {
        _id: 'order-1',
        orderCode: 'ORD-001',
        totalAmount: 1000,
        paymentDeadlineAt: deadline,
      },
      providerOrderCode: 100001,
    });

    assert.equal(calls[0].expiredAt, Math.floor(deadline.getTime() / 1000));
  });

  it('creates and reconciles an idempotent payout through the official payOS client surface', async () => {
    const calls = [];
    const client = {
      payouts: {
        async create(payload, idempotencyKey) {
          calls.push({ type: 'create', payload, idempotencyKey });
          return { id: 'payout-1', referenceId: payload.referenceId, approvalState: 'PROCESSING', transactions: [] };
        },
        async get(id) {
          calls.push({ type: 'get', id });
          return { id, referenceId: 'RET-001', approvalState: 'COMPLETED', transactions: [{ state: 'SUCCEEDED' }] };
        },
      },
    };
    const gateway = createPayOSGateway(
      { clientId: 'client', apiKey: 'api', checksumKey: 'checksum' },
      { client },
    );

    const created = await gateway.createPayout({
      referenceId: 'RET-001', amount: 120000, description: 'Hoan tien RET-001',
      toBin: '970422', toAccountNumber: '0123456789', idempotencyKey: 'return-refund-request-1',
    });
    const reconciled = await gateway.getPayout('payout-1');

    assert.equal(created.id, 'payout-1');
    assert.equal(reconciled.approvalState, 'COMPLETED');
    assert.deepEqual(calls, [
      {
        type: 'create',
        payload: {
          referenceId: 'RET-001', amount: 120000, description: 'Hoan tien RET-001',
          toBin: '970422', toAccountNumber: '0123456789', category: ['refund'],
        },
        idempotencyKey: 'return-refund-request-1',
      },
      { type: 'get', id: 'payout-1' },
    ]);
  });
});
