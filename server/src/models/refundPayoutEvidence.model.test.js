const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const RefundPayoutEvidence = require('./refundPayoutEvidence.model');

function validEvidence(overrides = {}) {
  return {
    returnRefundRequestId: new mongoose.Types.ObjectId(),
    refundPendingId: new mongoose.Types.ObjectId(),
    destinationId: new mongoose.Types.ObjectId(),
    amount: 120000,
    currency: 'VND',
    idempotencyKey: 'payout-operation-0001',
    payoutOperationKey: 'payout-operation-0001',
    evidenceKind: 'PAYOUT_EXECUTION',
    method: 'MANUAL',
    providerReference: 'BANK-REFERENCE-0001',
    status: 'Succeeded',
    recordedBy: new mongoose.Types.ObjectId(),
    occurredAt: new Date('2026-07-23T10:00:00Z'),
    reconciliationNote: 'Transfer checked against the bank statement',
    destinationSnapshotHash: 'a'.repeat(64),
    ...overrides,
  };
}

describe('refund payout evidence model', () => {
  it('stores non-terminal and successful reconciliation outcomes', () => {
    const statuses = RefundPayoutEvidence.schema.path('status').enumValues;
    ['Processing', 'Failed', 'Unknown', 'Succeeded'].forEach((status) => assert.ok(statuses.includes(status)));
  });

  it('prevents duplicate payout identities', () => {
    const index = RefundPayoutEvidence.schema.indexes().find(([fields, options]) => fields.idempotencyKey === 1 && options.unique);
    assert.ok(index);
  });

  it('classifies execution and operation-reconciliation evidence immutably', () => {
    const evidenceKind = RefundPayoutEvidence.schema.path('evidenceKind');
    assert.deepEqual(evidenceKind.enumValues, ['PAYOUT_EXECUTION', 'OPERATION_RECONCILIATION']);
    assert.equal(evidenceKind.options.immutable, true);
    assert.equal(evidenceKind.options.default, 'PAYOUT_EXECUTION');
    assert.equal(RefundPayoutEvidence.schema.path('reconcilesOperationKey').options.immutable, true);
    assert.equal(RefundPayoutEvidence.schema.path('payoutOperationKey').options.immutable, true);
  });

  it('allows at most one successful evidence record per refund obligation', () => {
    const successIndex = RefundPayoutEvidence.schema.indexes().find(([fields, options]) => (
      fields.refundPendingId === 1
      && options.unique === true
      && options.partialFilterExpression?.status === 'Succeeded'
    ));
    assert.ok(successIndex);
    assert.equal(successIndex[1].name, 'refund_payout_one_success_per_obligation');
    const operationIndex = RefundPayoutEvidence.schema.indexes().find(([fields, options]) => (
      fields.refundPendingId === 1
      && fields.payoutOperationKey === 1
      && fields.createdAt === -1
      && options.name === 'refund_payout_by_obligation_operation'
    ));
    assert.ok(operationIndex);
  });

  it('binds reconciliation evidence to one valid operation and forbids that binding on execution evidence', async () => {
    await new RefundPayoutEvidence(validEvidence()).validate();
    await assert.rejects(
      () => new RefundPayoutEvidence(validEvidence({
        reconcilesOperationKey: 'payout-operation-0001',
      })).validate(),
      /execution evidence.*reconcilesOperationKey/i,
    );
    await assert.rejects(
      () => new RefundPayoutEvidence(validEvidence({
        evidenceKind: 'OPERATION_RECONCILIATION',
        reconcilesOperationKey: '',
      })).validate(),
      /reconciliation evidence.*operation key/i,
    );
    await assert.rejects(
      () => new RefundPayoutEvidence(validEvidence({
        evidenceKind: 'OPERATION_RECONCILIATION',
        payoutOperationKey: 'different-operation-0001',
        reconcilesOperationKey: 'payout-operation-0001',
        idempotencyKey: 'reconcile-command-0001',
      })).validate(),
      /same payout operation key/i,
    );
    await assert.rejects(
      () => new RefundPayoutEvidence(validEvidence({
        evidenceKind: 'OPERATION_RECONCILIATION',
        reconcilesOperationKey: 'bad key with spaces',
      })).validate(),
      /reconciliation evidence.*operation key/i,
    );
    await new RefundPayoutEvidence(validEvidence({
      evidenceKind: 'OPERATION_RECONCILIATION',
      reconcilesOperationKey: 'payout-operation-0001',
      idempotencyKey: 'reconcile-command-0001',
    })).validate();
  });

  it('rejects every persisted mutation while allowing append-only creation APIs', async () => {
    const persisted = RefundPayoutEvidence.hydrate(validEvidence({ _id: new mongoose.Types.ObjectId() }));
    persisted.reconciliationNote = 'mutated';
    await assert.rejects(() => persisted.save(), /append-only/i);
    await assert.rejects(
      () => RefundPayoutEvidence.updateOne({ _id: persisted._id }, { $set: { status: 'Failed' } }),
      /append-only/i,
    );
    await assert.rejects(
      () => RefundPayoutEvidence.updateMany({}, { $set: { status: 'Failed' } }),
      /append-only/i,
    );
    await assert.rejects(
      () => RefundPayoutEvidence.findOneAndUpdate({ _id: persisted._id }, { $set: { status: 'Failed' } }),
      /append-only/i,
    );
    await assert.rejects(
      () => RefundPayoutEvidence.replaceOne({ _id: persisted._id }, validEvidence()),
      /append-only/i,
    );
    await assert.rejects(() => RefundPayoutEvidence.deleteOne({ _id: persisted._id }), /append-only/i);
    await assert.rejects(() => RefundPayoutEvidence.deleteMany({}), /append-only/i);
    await assert.rejects(
      () => RefundPayoutEvidence.bulkWrite([{
        updateOne: { filter: { _id: persisted._id }, update: { $set: { status: 'Failed' } } },
      }]),
      /append-only/i,
    );
    assert.doesNotThrow(() => RefundPayoutEvidence.assertInsertOnlyBulk([{
      insertOne: { document: validEvidence({ idempotencyKey: 'insert-only-bulk-0001' }) },
    }]));
    assert.equal(RefundPayoutEvidence.schema.s.hooks._pres.get('insertMany'), undefined);
  });
});
