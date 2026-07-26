const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const RefundPending = require('../models/refundPending.model');
const RefundPayoutEvidence = require('../models/refundPayoutEvidence.model');
const {
  cleanupDisposableMongo,
  resolveMongodBinary,
  startDisposableMongo,
} = require('../testUtils/disposableMongo');
const { createModelRepository } = require('./returnRefund.service');

function objectId() {
  return new mongoose.Types.ObjectId();
}

function successfulEvidence(refundPendingId, idempotencyKey) {
  return {
    returnRefundRequestId: objectId(),
    refundPendingId,
    destinationId: objectId(),
    amount: 120000,
    currency: 'VND',
    idempotencyKey,
    payoutOperationKey: idempotencyKey,
    evidenceKind: 'PAYOUT_EXECUTION',
    method: 'MANUAL',
    providerReference: `BANK-${idempotencyKey}`,
    status: 'Succeeded',
    recordedBy: objectId(),
    occurredAt: new Date('2026-07-23T10:00:00.000Z'),
    reconciliationNote: 'Bank statement confirms the manual transfer.',
    destinationSnapshotHash: 'a'.repeat(64),
  };
}

describe('refund payout persistence on real Mongo', () => {
  it('CAS-binds provider results to the exact PayOS operation and enforces one success', {
    skip: !resolveMongodBinary(),
    timeout: 30_000,
  }, async () => {
    const instance = await startDisposableMongo({ binary: resolveMongodBinary() });
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${instance.port}/refund-payout-cas-test`);
      await Promise.all([RefundPending.syncIndexes(), RefundPayoutEvidence.syncIndexes()]);
      const operationKey = 'payos-operation-0001';
      const refund = await RefundPending.create({
        orderId: objectId(),
        paymentAttemptId: objectId(),
        customerId: objectId(),
        returnRefundRequestId: objectId(),
        amount: 120000,
        currency: 'VND',
        reason: 'Normal return',
        status: 'HandedOff',
        payoutStatus: 'Processing',
        payoutMethod: 'PayOS',
        payoutStartedAt: new Date('2026-07-23T09:55:00.000Z'),
        payoutOperationKey: operationKey,
      });
      const repository = createModelRepository();

      const reconciled = await repository.claimPayoutReconciliation(
        refund._id,
        operationKey,
        { status: 'RefundPending', payoutStatus: 'Failed' }
      );
      assert.equal(reconciled.payoutStatus, 'Failed');
      assert.equal(
        await repository.claimPayOSProviderResult(
          refund._id,
          operationKey,
          { status: 'Refunded', payoutStatus: 'Succeeded' }
        ),
        null,
        'a late provider result must not overwrite a reconciled operation'
      );

      await RefundPayoutEvidence.create(successfulEvidence(refund._id, 'manual-success-0001'));
      await assert.rejects(
        () => RefundPayoutEvidence.create(successfulEvidence(refund._id, 'manual-success-0002')),
        (error) => error?.code === 11000,
      );
    } finally {
      await mongoose.disconnect();
      await cleanupDisposableMongo(instance);
    }
  });
});
