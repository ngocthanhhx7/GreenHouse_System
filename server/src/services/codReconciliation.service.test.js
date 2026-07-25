const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createCodReconciliationService } = require('./codReconciliation.service');

function createRepository() {
  const deliveredAt = new Date('2026-07-23T10:00:00.000Z');
  const orders = [{
    _id: 'order-1', orderCode: 'ORD-COD-1', customerId: 'customer-1', totalAmount: 100,
    codExpectedAmount: 100, paymentMethod: 'COD', paymentStatus: 'Unpaid', orderStatus: 'Delivered',
    deliveredAt, codDiscrepancyStatus: 'Open', customerCollectedAmount: 0, carrierSettlementAmount: 0,
  }];
  const payments = [{ _id: 'payment-1', orderId: 'order-1', paymentStatus: 'Unpaid', amount: 100 }];
  const attempts = [{ _id: 'attempt-1', orderId: 'order-1', paymentStatus: 'Unpaid', amount: 100 }];
  const evidence = [];
  const details = [{ _id: 'detail-1', orderId: 'order-1', productId: 'product-1', quantity: 2 }];
  const recoveryReceipts = [];
  const requestUpdates = [];
  const requests = [{
    _id: 'request-1',
    orderId: 'order-1',
    status: 'AwaitingCODReconciliation',
    refundAmount: 0,
    _caseType: 'RETURN_REFUND',
  }];
  const refunds = [];

  return {
    orders, payments, attempts, evidence, details, recoveryReceipts, requestUpdates, requests, refunds,
    async findOrderById(id) { return orders.find((entry) => entry._id === id) || null; },
    async findEvidenceByEventId(eventId) { return evidence.find((entry) => entry.eventId === eventId) || null; },
    async findCollectionEvidenceByOrder(orderId) { return evidence.find((entry) => entry.orderId === orderId && entry.eventType === 'COLLECTION') || null; },
    async listSettlementEvidenceByOrder(orderId) { return evidence.filter((entry) => entry.orderId === orderId && entry.eventType === 'SETTLEMENT'); },
    async createEvidence(data) { const record = { _id: `evidence-${evidence.length + 1}`, ...data }; evidence.push(record); return record; },
    async updateOrder(id, data) { const order = orders.find((entry) => entry._id === id); Object.assign(order, data); return order; },
    async claimCodRecoveryClosure(id, data) {
      const order = orders.find((entry) => entry._id === id && entry.orderStatus === 'Delivered' && entry.codDiscrepancyStatus === 'RecoveryInProgress');
      if (!order) return null;
      Object.assign(order, data);
      return order;
    },
    async findPaymentByOrderId(orderId) { return payments.find((entry) => entry.orderId === orderId) || null; },
    async updatePayment(id, data) { const payment = payments.find((entry) => entry._id === id); Object.assign(payment, data); return payment; },
    async findLatestPaymentAttemptByOrder(orderId) { return attempts.find((entry) => entry.orderId === orderId) || null; },
    async updatePaymentAttempt(id, data) { const attempt = attempts.find((entry) => entry._id === id); Object.assign(attempt, data); return attempt; },
    async findHeldRequestByOrder(orderId) { return requests.find((entry) => entry.orderId === orderId && ['AwaitingCODReconciliation', 'CODRecoveryInProgress'].includes(entry.status)) || null; },
    async findTerminalClosedRequestByOrder(orderId) {
      return requests.find((entry) => entry.orderId === orderId && entry.status === 'ClosedByCODRecovery') || null;
    },
    async updateRequest(id, data) {
      const request = requests.find((entry) => entry._id === id);
      requestUpdates.push({ id, data: structuredClone(data) });
      Object.assign(request, data);
      return request;
    },
    async listOrderDetails(orderId) { return details.filter((entry) => entry.orderId === orderId); },
    async findRecoveryReceiptById(receiptId) { return recoveryReceipts.find((entry) => entry.receiptId === receiptId) || null; },
    async findRecoveryReceiptByOrder(orderId) { return recoveryReceipts.find((entry) => entry.orderId === orderId) || null; },
    async listRecoveryCandidates() { return orders.filter((entry) => entry.codDiscrepancyStatus === 'Open' && entry.orderStatus === 'Delivered' && entry.customerCollectionEvidenceId); },
    async createRecoveryReceipt(data) { const receipt = { _id: `receipt-${recoveryReceipts.length + 1}`, status: 'Complete', ...data }; recoveryReceipts.push(receipt); return receipt; },
    async findRefundByObligationKey(obligationKey) { return refunds.find((entry) => entry.obligationKey === obligationKey) || null; },
    async upsertRefundPending(data) {
      let refund = refunds.find((entry) => entry.obligationKey === data.obligationKey);
      if (!refund) { refund = { _id: `refund-${refunds.length + 1}`, ...data }; refunds.push(refund); }
      return refund;
    },
  };
}

describe('COD reconciliation service', () => {
  let repository;
  let service;
  let lockReleases;
  let lockReleaseResult;
  let lockFinds;
  let lockFindResult;
  let auditEntries;

  beforeEach(() => {
    repository = createRepository();
    lockReleases = [];
    lockReleaseResult = { status: 'ClosedPermanently' };
    lockFinds = [];
    lockFindResult = null;
    auditEntries = [];
    service = createCodReconciliationService({
      repository,
      transactionManager: { async withTransaction(work) { return work({ id: 'session-1' }); } },
      clock: () => new Date('2026-07-23T12:00:00.000Z'),
      auditLogger: { async log(entry) { auditEntries.push(entry); } },
      afterSalesLockService: {
        async release(payload, session) {
          lockReleases.push({ payload, session });
          return lockReleaseResult;
        },
        async find(orderId, session) {
          lockFinds.push({ orderId, session });
          return lockFindResult;
        },
      },
    });
  });

  it('allows Staff to record manual full collection with Staff evidence and audit ownership', async () => {
    const result = await service.recordStaffCollectionEvidence('staff-1', 'order-1', {
      eventId: 'staff-collection-1',
      customerCollectedAmount: 100,
      collectionTiming: 'AT_DELIVERY',
      occurredAt: '2026-07-23T10:01:00.000Z',
      evidenceReference: 'staff-pod-1',
    });

    assert.equal(result.event.source, 'STAFF_EVIDENCE');
    assert.equal(result.order.paymentStatus, 'Paid');
    assert.equal(auditEntries[0].userId, 'staff-1');
    assert.equal(auditEntries[0].action, 'STAFF_COD_COLLECTION_RECORDED');
  });

  it('marks a full at-delivery Customer collection as Paid at DeliveredAt and releases a held request', async () => {
    const result = await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-1', customerCollectedAmount: 100, collectionTiming: 'AT_DELIVERY',
      occurredAt: '2026-07-23T10:01:00.000Z', evidenceReference: 'pod-1',
    });

    assert.equal(result.order.paymentStatus, 'Paid');
    assert.equal(repository.payments[0].paymentStatus, 'Paid');
    assert.equal(repository.attempts[0].paymentStatus, 'Paid');
    assert.equal(repository.payments[0].paidAt.toISOString(), '2026-07-23T10:00:00.000Z');
    assert.equal(repository.orders[0].completedSaleAt.toISOString(), '2026-07-23T10:00:00.000Z');
    assert.equal(repository.orders[0].codDiscrepancyStatus, 'Resolved');
    assert.equal(repository.requests[0].status, 'Pending');

    const replay = await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-1', customerCollectedAmount: 100, collectionTiming: 'AT_DELIVERY',
      occurredAt: '2026-07-23T10:01:00.000Z', evidenceReference: 'pod-1',
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(repository.evidence.length, 1);
  });

  it('releases a held Exchange to Submitted only after full Customer collection', async () => {
    repository.requests[0]._caseType = 'EXCHANGE';
    const result = await service.recordCollectionEvidence('order-1', {
      eventId: 'exchange-collection-full', customerCollectedAmount: 100, collectionTiming: 'AT_DELIVERY',
      occurredAt: '2026-07-23T10:01:00.000Z', evidenceReference: 'pod-exchange-full',
    });

    assert.equal(result.order.paymentStatus, 'Paid');
    assert.equal(repository.requests[0].status, 'Submitted');
    assert.equal(repository.requests[0].holdReason, '');
  });

  it('moves a held Exchange to COD recovery on under-collection without treating settlement as Customer payment', async () => {
    repository.requests[0]._caseType = 'EXCHANGE';
    await service.recordCollectionEvidence('order-1', {
      eventId: 'exchange-collection-partial', customerCollectedAmount: 40, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-exchange-partial',
    });
    assert.equal(repository.requests[0].status, 'CODRecoveryInProgress');
    assert.equal(repository.orders[0].paymentStatus, 'Unpaid');

    await service.recordSettlementEvidence('order-1', {
      eventId: 'exchange-settlement-full', carrierSettlementAmount: 100,
      occurredAt: '2026-07-25T08:00:00.000Z', evidenceReference: 'settlement-exchange-full',
    });
    assert.equal(repository.requests[0].status, 'CODRecoveryInProgress');
    assert.equal(repository.orders[0].paymentStatus, 'Unpaid');
  });

  it('does not accept Carrier collection evidence before physical delivery', async () => {
    repository.orders[0].orderStatus = 'Shipped';
    await assert.rejects(
      () => service.recordCollectionEvidence('order-1', {
        eventId: 'collection-before-delivery', customerCollectedAmount: 100, collectionTiming: 'AT_DELIVERY',
        occurredAt: '2026-07-23T10:01:00.000Z', evidenceReference: 'pod-before-delivery',
      }),
      /Delivered|delivery/i,
    );
    assert.equal(repository.evidence.length, 0);
  });

  it('uses the actual later collection instant and never treats a partial event as split COD', async () => {
    const partial = await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-partial', customerCollectedAmount: 40, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-partial',
    });

    assert.equal(partial.order.paymentStatus, 'Unpaid');
    assert.equal(repository.orders[0].customerCollectedAmount, 40);
    assert.equal(repository.orders[0].codDiscrepancyStatus, 'Open');
    await assert.rejects(
      () => service.recordCollectionEvidence('order-1', {
        eventId: 'collection-second', customerCollectedAmount: 60, collectionTiming: 'AFTER_DELIVERY',
        occurredAt: '2026-07-23T11:05:00.000Z', evidenceReference: 'pod-second',
      }),
      /one COD collection evidence|split/i,
    );
  });

  it('does not let Warehouse start recovery before conclusive Carrier collection evidence', async () => {
    await assert.rejects(
      () => service.recordGoodsRecovery('warehouse-1', 'order-1', {
        receiptId: 'warehouse-before-evidence', evidenceReference: 'warehouse-photo-before-evidence',
        items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
      }),
      /collection evidence|under-collection|waiting/i,
    );
  });

  it('exposes Delivered under-collection orders as Warehouse recovery work even without a Customer request', async () => {
    const result = await service.listWarehouseRecoveryCandidates();
    assert.equal(result.total, 0);
    repository.orders[0].customerCollectionEvidenceId = 'collection-existing';
    result.items = undefined;
    const candidates = await service.listWarehouseRecoveryCandidates();
    assert.equal(candidates.total, 1);
    assert.equal(candidates.items[0].orderCode, 'ORD-COD-1');
  });

  it('aggregates Carrier settlement separately without changing a valid Paid fact or creating a refund', async () => {
    repository.orders[0].paymentStatus = 'Paid';
    repository.orders[0].customerCollectedAmount = 100;
    repository.orders[0].codDiscrepancyStatus = 'Resolved';
    const result = await service.recordSettlementEvidence('order-1', {
      eventId: 'settlement-1', carrierSettlementAmount: 40,
      occurredAt: '2026-07-25T08:00:00.000Z', evidenceReference: 'settlement-batch-1',
    });

    assert.equal(result.order.paymentStatus, 'Paid');
    assert.equal(repository.orders[0].carrierSettlementAmount, 40);
    assert.equal(repository.orders[0].settlementReconciliationStatus, 'Open');
    assert.equal(repository.refunds.length, 0);
    const replay = await service.recordSettlementEvidence('order-1', {
      eventId: 'settlement-1', carrierSettlementAmount: 40,
      occurredAt: '2026-07-25T08:00:00.000Z', evidenceReference: 'settlement-batch-1',
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(repository.evidence.length, 1);
  });

  it('derives exactly one positive COD-recovery refund after goods recovery and forbids an amount input', async () => {
    await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-for-recovery', customerCollectedAmount: 40, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-recovery',
    });
    const receipt = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-receipt-1', evidenceReference: 'warehouse-photo-1',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });
    await assert.rejects(
      () => service.finalizeRecovery('staff-1', 'order-1', {
        goodsRecoveryReceiptId: receipt.receipt.receiptId, destinationVerified: true,
        destinationReference: 'destination-1', amount: 1,
      }),
      /amount is server-derived/i,
    );

    const result = await service.finalizeRecovery('staff-1', 'order-1', {
      goodsRecoveryReceiptId: receipt.receipt.receiptId, destinationVerified: true,
      destinationReference: 'destination-1', note: 'Đã nhận đủ hàng',
    });
    assert.equal(result.order.orderStatus, 'Returned');
    assert.equal(result.order.paymentStatus, 'Cancelled');
    assert.equal(repository.payments[0].paymentStatus, 'Cancelled');
    assert.equal(repository.refunds.length, 1);
    assert.equal(repository.refunds[0].amount, 40);
    assert.equal(repository.refunds[0].obligationType, 'COD_RECOVERY');
    assert.equal(repository.requests[0].status, 'CODRecoveryInProgress');
    assert.equal(lockReleases.length, 0);
    assert.equal(repository.requests[0].recoveryRefundId, repository.refunds[0]._id);
    assert.equal(repository.requests[0].recoveryCompletedAt, null);

    const replay = await service.finalizeRecovery('staff-1', 'order-1', {
      goodsRecoveryReceiptId: receipt.receipt.receiptId, destinationVerified: true,
      destinationReference: 'destination-1', note: 'Retry',
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(repository.refunds.length, 1);
    assert.equal(repository.requests[0].status, 'CODRecoveryInProgress');

    repository.refunds[0].status = 'Refunded';
    await service.finalizeRecovery('staff-1', 'order-1', {
      goodsRecoveryReceiptId: receipt.receipt.receiptId, destinationVerified: true,
      destinationReference: 'destination-1', note: 'Đối soát payout đã thành công',
    });
    assert.equal(repository.requests[0].status, 'ClosedByCODRecovery');
    assert.ok(repository.requests[0].recoveryCompletedAt);
    assert.deepEqual(lockReleases, [{
      payload: {
        orderId: 'order-1',
        caseType: 'RETURN_REFUND',
        caseId: 'request-1',
        terminalStatus: 'ClosedByCODRecovery',
        closePermanently: true,
      },
      session: { id: 'session-1' },
    }]);
  });

  it('does not finalize recovery when another Staff worker already claimed the closure', async () => {
    await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-for-claim-race', customerCollectedAmount: 40, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-claim-race',
    });
    const receipt = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-claim-race', evidenceReference: 'warehouse-photo-race',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });
    repository.claimCodRecoveryClosure = async () => null;
    await assert.rejects(
      () => service.finalizeRecovery('staff-1', 'order-1', {
        goodsRecoveryReceiptId: receipt.receipt.receiptId, destinationVerified: true, destinationReference: 'destination-race',
      }),
      /changed|another|already/i,
    );
    assert.equal(repository.refunds.length, 0);
  });

  it('closes zero-collection recovery without creating a refund', async () => {
    await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-zero', customerCollectedAmount: 0, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-zero',
    });
    const receipt = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-receipt-zero', evidenceReference: 'warehouse-photo-zero',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });
    const result = await service.finalizeRecovery('staff-1', 'order-1', {
      goodsRecoveryReceiptId: receipt.receipt.receiptId, note: 'Không thu được tiền',
    });
    assert.equal(result.order.orderStatus, 'Returned');
    assert.equal(result.order.paymentStatus, 'Cancelled');
    assert.equal(repository.refunds.length, 0);
    assert.equal(repository.requests[0].status, 'ClosedByCODRecovery');
    assert.deepEqual(lockReleases, [{
      payload: {
        orderId: 'order-1',
        caseType: 'RETURN_REFUND',
        caseId: 'request-1',
        terminalStatus: 'ClosedByCODRecovery',
        closePermanently: true,
      },
      session: { id: 'session-1' },
    }]);
  });

  it('closes an Exchange lock with the exact held case identity and transaction session', async () => {
    repository.requests[0]._caseType = 'EXCHANGE';
    await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-zero-exchange', customerCollectedAmount: 0, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-zero-exchange',
    });
    const receipt = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-receipt-zero-exchange', evidenceReference: 'warehouse-photo-zero-exchange',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });

    await service.finalizeRecovery('staff-1', 'order-1', {
      goodsRecoveryReceiptId: receipt.receipt.receiptId,
    });

    assert.deepEqual(lockReleases, [{
      payload: {
        orderId: 'order-1',
        caseType: 'EXCHANGE',
        caseId: 'request-1',
        terminalStatus: 'ClosedByCODRecovery',
        closePermanently: true,
      },
      session: { id: 'session-1' },
    }]);
  });

  it('rolls back terminal request and order updates when the lock CAS fails', async () => {
    const snapshotTransactionManager = {
      async withTransaction(work) {
        const snapshot = structuredClone({
          orders: repository.orders,
          payments: repository.payments,
          attempts: repository.attempts,
          requests: repository.requests,
          refunds: repository.refunds,
        });
        try {
          return await work({ id: 'rollback-session' });
        } catch (error) {
          for (const [key, values] of Object.entries(snapshot)) {
            repository[key].splice(0, repository[key].length, ...values);
          }
          throw error;
        }
      },
    };
    lockReleaseResult = null;
    service = createCodReconciliationService({
      repository,
      transactionManager: snapshotTransactionManager,
      clock: () => new Date('2026-07-23T12:00:00.000Z'),
      auditLogger: { async log() {} },
      afterSalesLockService: {
        async release(payload, session) {
          lockReleases.push({ payload, session });
          return lockReleaseResult;
        },
        async find(orderId, session) {
          lockFinds.push({ orderId, session });
          return lockFindResult;
        },
      },
    });
    await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-zero-lock-race', customerCollectedAmount: 0, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-zero-lock-race',
    });
    const receipt = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-receipt-lock-race', evidenceReference: 'warehouse-photo-lock-race',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });
    const before = structuredClone({
      order: repository.orders[0],
      request: repository.requests[0],
    });

    await assert.rejects(
      () => service.finalizeRecovery('staff-1', 'order-1', {
        goodsRecoveryReceiptId: receipt.receipt.receiptId,
      }),
      /after-sales lock|changed/i,
    );

    assert.deepEqual(repository.orders[0], before.order);
    assert.deepEqual(repository.requests[0], before.request);
  });

  it('repairs a legacy terminal Return request whose exact shared lock is still Active', async () => {
    repository.orders[0].orderStatus = 'Returned';
    repository.orders[0].codDiscrepancyStatus = 'Closed';
    repository.requests[0].status = 'ClosedByCODRecovery';
    repository.requests[0].recoveryCompletedAt = new Date('2026-07-23T11:30:00.000Z');
    const beforeRequest = structuredClone(repository.requests[0]);

    const result = await service.finalizeRecovery('staff-1', 'order-1');

    assert.equal(result.idempotentReplay, true);
    assert.deepEqual(repository.requests[0], beforeRequest);
    assert.equal(repository.requestUpdates.length, 0);
    assert.deepEqual(lockReleases, [{
      payload: {
        orderId: 'order-1',
        caseType: 'RETURN_REFUND',
        caseId: 'request-1',
        terminalStatus: 'ClosedByCODRecovery',
        closePermanently: true,
      },
      session: { id: 'session-1' },
    }]);
    assert.deepEqual(lockFinds, []);
  });

  it('replays a terminal Exchange closure when the exact shared lock is already closed', async () => {
    repository.orders[0].orderStatus = 'Returned';
    repository.orders[0].codDiscrepancyStatus = 'Closed';
    repository.requests[0]._caseType = 'EXCHANGE';
    repository.requests[0].status = 'ClosedByCODRecovery';
    repository.requests[0].recoveryCompletedAt = new Date('2026-07-23T11:30:00.000Z');
    lockReleaseResult = null;
    lockFindResult = {
      orderId: 'order-1',
      status: 'ClosedPermanently',
      terminalStatus: 'ClosedByCODRecovery',
      caseType: 'EXCHANGE',
      caseId: 'request-1',
    };
    const beforeRequest = structuredClone(repository.requests[0]);

    const result = await service.finalizeRecovery('staff-1', 'order-1');

    assert.equal(result.idempotentReplay, true);
    assert.deepEqual(repository.requests[0], beforeRequest);
    assert.equal(repository.requestUpdates.length, 0);
    assert.deepEqual(lockFinds, [{
      orderId: 'order-1',
      session: { id: 'session-1' },
    }]);
  });

  it('rejects an idempotent terminal repair when the closed lock belongs to another case', async () => {
    repository.orders[0].orderStatus = 'Returned';
    repository.orders[0].codDiscrepancyStatus = 'Closed';
    repository.requests[0].status = 'ClosedByCODRecovery';
    lockReleaseResult = null;
    lockFindResult = {
      orderId: 'order-1',
      status: 'ClosedPermanently',
      terminalStatus: 'ClosedByCODRecovery',
      caseType: 'RETURN_REFUND',
      caseId: 'different-request',
    };

    await assert.rejects(
      () => service.finalizeRecovery('staff-1', 'order-1'),
      /after-sales lock|changed/i,
    );
    assert.equal(repository.requestUpdates.length, 0);
  });

  it('lets Warehouse prove complete goods recovery once and rejects incomplete line recovery', async () => {
    await service.recordCollectionEvidence('order-1', {
      eventId: 'collection-for-warehouse', customerCollectedAmount: 40, collectionTiming: 'AFTER_DELIVERY',
      occurredAt: '2026-07-23T11:00:00.000Z', evidenceReference: 'pod-warehouse',
    });
    await assert.rejects(
      () => service.recordGoodsRecovery('warehouse-1', 'order-1', {
        receiptId: 'warehouse-incomplete', evidenceReference: 'warehouse-photo-incomplete',
        items: [{ orderDetailId: 'detail-1', receivedQuantity: 1 }],
      }),
      /complete|full|đủ/i,
    );
    const result = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-complete', evidenceReference: 'warehouse-photo-complete',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });
    assert.equal(result.receipt.status, 'Complete');
    assert.equal(repository.orders[0].codRecoveryReceiptId, 'warehouse-complete');
    assert.equal(repository.orders[0].codDiscrepancyStatus, 'RecoveryInProgress');
    const replay = await service.recordGoodsRecovery('warehouse-1', 'order-1', {
      receiptId: 'warehouse-complete', evidenceReference: 'warehouse-photo-complete',
      items: [{ orderDetailId: 'detail-1', receivedQuantity: 2 }],
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(repository.recoveryReceipts.length, 1);
  });
});
