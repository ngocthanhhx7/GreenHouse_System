const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createReturnRefundService, computeMoneyObligationsSettled } = require('./returnRefund.service');
const { returnEvidenceClaim } = require('../utils/returnEvidenceClaim');

const ACTIVE_STATUSES = [
  'New', 'Pending', 'AwaitingCODReconciliation', 'Approved',
  'AwaitingInspection', 'Received', 'ReadyForRefund', 'CODRecoveryInProgress',
];

function duplicateError() {
  const error = new Error('duplicate key');
  error.code = 11000;
  return error;
}

async function captureError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail('Expected operation to reject');
}

function createRepository() {
  const state = {
    orders: [
      {
        _id: 'order-1', orderCode: 'GH-DEMO-2001', customerId: 'customer-1', totalAmount: 120,
        currency: 'VND', paymentMethod: 'ONLINE', paymentStatus: 'Paid', orderStatus: 'Delivered',
        deliveredAt: new Date('2026-07-20T10:00:00Z'), returnDeadlineAt: new Date('2026-07-25T10:00:00Z'),
      },
      {
        _id: 'order-2', orderCode: 'GH-DEMO-2002', customerId: 'customer-1', totalAmount: 80,
        currency: 'VND', paymentMethod: 'ONLINE', paymentStatus: 'Paid', orderStatus: 'Shipped',
      },
      {
        _id: 'order-3', orderCode: 'GH-DEMO-2003', customerId: 'customer-1', totalAmount: 90,
        codExpectedAmount: 90, currency: 'VND', paymentMethod: 'COD', paymentStatus: 'Unpaid',
        orderStatus: 'Delivered', deliveredAt: new Date('2026-07-23T10:00:00Z'),
        returnDeadlineAt: new Date('2026-07-28T10:00:00Z'), codDiscrepancyStatus: 'Open',
      },
    ],
    details: [
      {
        _id: 'detail-1', orderId: 'order-1', productId: 'product-1',
        productNameSnapshot: 'Bamboo Cutting Board', quantity: 1, priceSnapshot: 120, subtotal: 120,
      },
    ],
    payments: [
      { _id: 'payment-1', orderId: 'order-1', amount: 120, paymentStatus: 'Paid' },
      { _id: 'payment-3', orderId: 'order-3', amount: 90, paymentStatus: 'Unpaid' },
    ],
    attempts: [
      { _id: 'attempt-1', orderId: 'order-1', amount: 120, currency: 'VND', paymentStatus: 'Paid' },
      { _id: 'attempt-3', orderId: 'order-3', amount: 90, currency: 'VND', paymentStatus: 'Unpaid' },
    ],
    products: [{ _id: 'product-1', stockQuantity: 10 }],
    inventories: [{ _id: 'inventory-1', productId: 'product-1', stockQuantity: 10, reservedQuantity: 0, damagedQuantity: 1 }],
    requests: [],
    returnItems: [],
    refunds: [],
    destinations: [],
    payoutEvidence: [],
    payoutIncidents: [],
    inventoryTransactions: [],
    failInventoryTransaction: false,
  };

  const repository = {
    state,
    get orders() { return state.orders; },
    get payments() { return state.payments; },
    get attempts() { return state.attempts; },
    get products() { return state.products; },
    get inventories() { return state.inventories; },
    get requests() { return state.requests; },
    get returnItems() { return state.returnItems; },
    get refunds() { return state.refunds; },
    get destinations() { return state.destinations; },
    get payoutEvidence() { return state.payoutEvidence; },
    get payoutIncidents() { return state.payoutIncidents; },
    get inventoryTransactions() { return state.inventoryTransactions; },
    snapshot() { return structuredClone(state); },
    restore(snapshot) {
      Object.keys(snapshot).forEach((key) => { state[key] = snapshot[key]; });
    },
    async findOrderById(id) { return state.orders.find((order) => order._id === id) || null; },
    async ensureReturnDeadline(id, deadlineAt) {
      const order = state.orders.find((entry) => entry._id === id);
      if (!order.returnDeadlineAt) order.returnDeadlineAt = deadlineAt;
      return order;
    },
    async listOrderDetails(orderId) { return state.details.filter((detail) => detail.orderId === orderId); },
    async findPaymentByOrderId(orderId) { return state.payments.find((payment) => payment.orderId === orderId) || null; },
    async findLatestPaymentAttemptByOrder(orderId) { return state.attempts.filter((attempt) => attempt.orderId === orderId).at(-1) || null; },
    async findOpenRequestByOrderId(orderId) {
      return state.requests.find((request) => request.orderId === orderId && ACTIVE_STATUSES.includes(request.status)) || null;
    },
    async createRequest(data) {
      if (await this.findOpenRequestByOrderId(data.orderId)) throw duplicateError();
      const request = { _id: `request-${state.requests.length + 1}`, createdAt: new Date(), ...data };
      state.requests.push(request);
      return request;
    },
    async listRequests(query = {}) {
      return state.requests.filter((request) => (
        (!query.customerId || request.customerId === query.customerId)
        && (!query.status || request.status === query.status)
      ));
    },
    async findRequestById(id) { return state.requests.find((request) => request._id === id) || null; },
    async listOverdueRequests(at, limit = 100) {
      return state.requests.filter((request) => (
        ['Approved', 'AwaitingInspection'].includes(request.status)
        && !request.handoffAt && request.shipByAt && new Date(request.shipByAt) < at
      )).slice(0, limit);
    },
    async claimDecision(id, statuses, data) {
      const request = state.requests.find((entry) => entry._id === id && statuses.includes(entry.status));
      if (!request) return null;
      Object.assign(request, data);
      return request;
    },
    async claimHandoff(id, customerId, data) {
      const request = state.requests.find((entry) => (
        entry._id === id && entry.customerId === customerId
        && ['Approved', 'AwaitingInspection', 'Expired'].includes(entry.status) && !entry.handoffAt
      ));
      if (!request) return null;
      Object.assign(request, data);
      return request;
    },
    async claimExpiry(id, now, data) {
      const request = state.requests.find((entry) => (
        entry._id === id && ['Approved', 'AwaitingInspection'].includes(entry.status)
        && !entry.handoffAt && new Date(entry.shipByAt) < now
      ));
      if (!request) return null;
      Object.assign(request, data);
      return request;
    },
    async claimInspection(id, data) {
      const request = state.requests.find((entry) => (
        entry._id === id && ['Approved', 'AwaitingInspection'].includes(entry.status) && entry.handoffAt
      ));
      if (!request) return null;
      Object.assign(request, data);
      return request;
    },
    async claimCompletion(id, data) {
      const request = state.requests.find((entry) => entry._id === id && ['Received', 'ReadyForRefund'].includes(entry.status));
      if (!request) return null;
      Object.assign(request, data);
      return request;
    },
    async updateRequest(id, data) {
      const request = state.requests.find((entry) => entry._id === id);
      if (!request) return null;
      Object.assign(request, data);
      return request;
    },
    async updateOrder(id, data) {
      const order = state.orders.find((entry) => entry._id === id);
      if (!order) return null;
      Object.assign(order, data);
      return order;
    },
    async upsertRefundPending(data) {
      let pending = state.refunds.find((entry) => (
        data.obligationKey ? entry.obligationKey === data.obligationKey : entry.orderId === data.orderId && entry.obligationType === data.obligationType
      ));
      if (!pending) {
        pending = { _id: `refund-${state.refunds.length + 1}`, ...data };
        state.refunds.push(pending);
      }
      return pending;
    },
    async findRefundPending(obligationKey) { return state.refunds.find((entry) => entry.obligationKey === obligationKey) || null; },
    async findRefundPendingByRequestId(returnRefundRequestId) {
      return state.refunds.find((entry) => entry.returnRefundRequestId === returnRefundRequestId) || null;
    },
    async updateRefundPending(id, data) {
      const refund = state.refunds.find((entry) => entry._id === id);
      if (!refund) return null;
      Object.assign(refund, data);
      return refund;
    },
    async claimPayoutStart(id, idempotencyKey, expectedOperationKey = '', allowRecovery = false, payoutStartedAt = new Date()) {
      const refund = state.refunds.find((entry) => entry._id === id);
      if (!refund || refund.status === 'Refunded') return null;
      const mayStart = ['NotStarted', 'Failed'].includes(refund.payoutStatus)
        || (['Processing', 'Unknown'].includes(refund.payoutStatus) && refund.payoutOperationKey === idempotencyKey)
        || (allowRecovery && ['Processing', 'Unknown'].includes(refund.payoutStatus) && refund.payoutOperationKey === expectedOperationKey);
      if (!mayStart) return null;
      Object.assign(refund, {
        status: 'HandedOff',
        payoutStatus: 'Processing',
        payoutMethod: 'PayOS',
        payoutStartedAt,
        payoutOperationKey: idempotencyKey,
      });
      return refund;
    },
    async claimPayoutReconciliation(id, operationKey, data) {
      const refund = state.refunds.find((entry) => (
        entry._id === id
        && entry.status !== 'Refunded'
        && ['Processing', 'Unknown'].includes(entry.payoutStatus)
        && entry.payoutOperationKey === operationKey
      ));
      if (!refund) return null;
      Object.assign(refund, data);
      return refund;
    },
    async claimPayOSProviderResult(id, operationKey, data) {
      const refund = state.refunds.find((entry) => (
        entry._id === id
        && entry.status !== 'Refunded'
        && entry.payoutMethod === 'PayOS'
        && ['Processing', 'Unknown'].includes(entry.payoutStatus)
        && entry.payoutOperationKey === operationKey
      ));
      if (!refund) return null;
      Object.assign(refund, data);
      return refund;
    },
    async claimManualPayoutStart(
      id,
      operationKey,
      expectedOperationKey = '',
      allowRecovery = false,
      payoutStartedAt = new Date()
    ) {
      const refund = state.refunds.find((entry) => entry._id === id && entry.status !== 'Refunded');
      if (!refund) return null;
      const mayStart = ['NotStarted', 'Failed'].includes(refund.payoutStatus)
        || (allowRecovery
          && ['Processing', 'Unknown'].includes(refund.payoutStatus)
          && refund.payoutOperationKey === expectedOperationKey);
      if (!mayStart) return null;
      Object.assign(refund, {
        status: 'HandedOff',
        payoutStatus: 'Processing',
        payoutMethod: 'Manual',
        payoutStartedAt,
        payoutOperationKey: operationKey,
      });
      return refund;
    },
    async listReturnItems(requestId) { return state.returnItems.filter((item) => item.returnRefundRequestId === requestId); },
    async createReturnItems(items) {
      const created = items.map((item) => ({ _id: `return-item-${state.returnItems.length + 1}`, ...item }));
      state.returnItems.push(...created);
      return created;
    },
    async findInventoryByProductId(productId) { return state.inventories.find((entry) => entry.productId === productId) || null; },
    async claimReturnInventory(productId, before, increments, userId) {
      const inventory = state.inventories.find((entry) => (
        entry.productId === productId
        && entry.stockQuantity === before.stockQuantity
        && entry.damagedQuantity === before.damagedQuantity
      ));
      if (!inventory) return null;
      inventory.stockQuantity += increments.sellableQuantity;
      inventory.damagedQuantity += increments.damagedQuantity;
      inventory.lastUpdatedBy = userId;
      return inventory;
    },
    async updateProductStock(productId, stockQuantity) {
      const product = state.products.find((entry) => entry._id === productId);
      if (!product) return null;
      product.stockQuantity = stockQuantity;
      return product;
    },
    async createInventoryTransaction(data) {
      if (state.failInventoryTransaction && data.transactionType === 'RETURN_DAMAGED_IN') throw new Error('injected inventory write failure');
      if (state.inventoryTransactions.some((entry) => entry.movementKey === data.movementKey)) throw duplicateError();
      const transaction = { _id: `inventory-transaction-${state.inventoryTransactions.length + 1}`, ...data };
      state.inventoryTransactions.push(transaction);
      return transaction;
    },
    async findLatestDestination(requestId) {
      return state.destinations.filter((entry) => entry.returnRefundRequestId === requestId).sort((a, b) => b.version - a.version)[0] || null;
    },
    async findDestinationById(id) { return state.destinations.find((entry) => entry._id === id) || null; },
    async findDestinationByIdempotencyKey(requestId, idempotencyKey) {
      return state.destinations.find((entry) => entry.returnRefundRequestId === requestId && entry.idempotencyKey === idempotencyKey) || null;
    },
    async createDestination(data) {
      if (await this.findDestinationByIdempotencyKey(data.returnRefundRequestId, data.idempotencyKey)) throw duplicateError();
      const destination = { _id: `destination-${state.destinations.length + 1}`, createdAt: new Date(), ...data };
      state.destinations.push(destination);
      return destination;
    },
    async claimDestinationDecision(id, requestId, data) {
      const destination = state.destinations.find((entry) => entry._id === id && entry.returnRefundRequestId === requestId && entry.status === 'Submitted');
      if (!destination) return null;
      Object.assign(destination, data);
      return destination;
    },
    async findPayoutEvidenceByIdempotencyKey(idempotencyKey) {
      return state.payoutEvidence.find((entry) => entry.idempotencyKey === idempotencyKey) || null;
    },
    async findPayoutEvidenceForOperation(refundPendingId, payoutOperationKey, method) {
      return state.payoutEvidence.filter((entry) => (
        entry.refundPendingId === refundPendingId
        && entry.payoutOperationKey === payoutOperationKey
        && entry.method === method
      )).at(-1) || null;
    },
    async createPayoutEvidence(data) {
      if (await this.findPayoutEvidenceByIdempotencyKey(data.idempotencyKey)) throw duplicateError();
      const evidence = { _id: `payout-${state.payoutEvidence.length + 1}`, createdAt: new Date(), ...data };
      state.payoutEvidence.push(evidence);
      return evidence;
    },
    async findLatestPayoutIncident(requestId) {
      return state.payoutIncidents.filter((entry) => entry.returnRefundRequestId === requestId).at(-1) || null;
    },
    async findOpenPayoutIncident(requestId) {
      return state.payoutIncidents.find((entry) => entry.returnRefundRequestId === requestId && entry.status === 'Open') || null;
    },
    async findPayoutIncidentByKey(incidentKey) {
      return state.payoutIncidents.find((entry) => entry.incidentKey === incidentKey) || null;
    },
    async createPayoutIncident(data) {
      const existing = await this.findPayoutIncidentByKey(data.incidentKey);
      if (existing) throw duplicateError();
      const duplicateEvidence = state.payoutIncidents.find((entry) => (
        entry.payoutEvidenceId === data.payoutEvidenceId && entry.cause === data.cause
      ));
      if (duplicateEvidence) throw duplicateError();
      const incident = { _id: `incident-${state.payoutIncidents.length + 1}`, createdAt: new Date(), ...data };
      state.payoutIncidents.push(incident);
      return incident;
    },
    async resolvePayoutIncident(id, data) {
      const incident = state.payoutIncidents.find((entry) => entry._id === id && entry.status === 'Open');
      if (!incident) return null;
      Object.assign(incident, data);
      return incident;
    },
  };
  return repository;
}

function createAuditLogger() {
  return { entries: [], async log(entry) { this.entries.push(entry); } };
}

function createTransactionManager(repository) {
  return {
    async withTransaction(work) {
      const snapshot = repository.snapshot();
      try {
        return await work({});
      } catch (error) {
        repository.restore(snapshot);
        throw error;
      }
    },
  };
}

describe('return/refund service', () => {
  it('keeps aggregate money settlement false until every required obligation is terminal', () => {
    assert.equal(computeMoneyObligationsSettled([
      { status: 'Refunded' },
      { status: 'RefundPending' },
    ]), false);
    assert.equal(computeMoneyObligationsSettled([
      { status: 'Refunded' },
      { status: 'FailedTerminal' },
    ]), true);
  });
  let repository;
  let auditLogger;
  let service;
  let now;
  let payosGateway;
  let notifications;
  let createService;

  beforeEach(() => {
    repository = createRepository();
    auditLogger = createAuditLogger();
    notifications = [];
    now = new Date('2026-07-23T10:00:00Z');
    payosGateway = {
      calls: [],
      payout: {
        id: 'payos-payout-1', referenceId: 'RET-001', approvalState: 'PROCESSING',
        transactions: [{
          id: 'payos-transaction-1', state: 'PROCESSING', amount: 120,
          toBin: '970422', toAccountNumber: '0123456789', reference: null,
        }],
      },
      isConfigured() { return true; },
      async createPayout(input) { this.calls.push({ type: 'create', input }); return structuredClone(this.payout); },
      async getPayout(id) { this.calls.push({ type: 'get', id }); return structuredClone(this.payout); },
    };
    createService = (overrides = {}) => createReturnRefundService({
      repository,
      auditLogger,
      transactionManager: createTransactionManager(repository),
      eventPublisher: { async createInAppNotification(notification) { notifications.push(notification); } },
      payosGateway,
      clock: () => new Date(now),
      assignmentCoordinator: { async coordinate() {} },
      ...overrides,
    });
    service = createService();
  });

  function claimedEvidence(customerId = 'customer-1', index = 1, size = 1024) {
    const suffix = String(index).padStart(12, '0');
    return returnEvidenceClaim.sign(
      customerId,
      `/api/return-refunds/evidence/11111111-1111-4111-8111-${suffix}.jpg`,
      size,
    );
  }

  async function createRequest(orderId = 'order-1') {
    return service.createCustomerRequest('customer-1', {
      orderId,
      reason: 'Product arrived damaged',
      evidenceImages: [claimedEvidence()],
    });
  }

  async function approveRequest() {
    const request = await createRequest();
    await service.decideRequest('staff-1', request.id, { status: 'Approved', staffNote: 'Evidence accepted' });
    return request.id;
  }

  it('does not assign Return after a passed Staff request loses its role', async () => {
    const request = await createRequest();
    const guarded = createService({
      assignmentCoordinator: {
        async coordinate({ userId, expectedRole, session }) {
          assert.equal(userId, 'staff-1');
          assert.equal(expectedRole, 'Staff');
          assert.ok(session);
          const error = new Error('role changed after middleware');
          error.errorCode = 'ASSIGNMENT_ACTOR_STALE';
          throw error;
        },
      },
    });

    await assert.rejects(
      () => guarded.decideRequest('staff-1', request.id, {
        status: 'Approved',
        staffNote: 'Approved after inspection',
      }),
      (error) => error.errorCode === 'ASSIGNMENT_ACTOR_STALE',
    );
    assert.equal(repository.requests[0].status, 'New');
    assert.equal(repository.requests[0].resolvedBy, undefined);
  });

  async function recordHandoff(requestId) {
    return service.recordHandoffProof('customer-1', requestId, {
      proofReference: 'carrier-handoff-001',
      handoffAt: '2026-07-23T10:00:00Z',
    });
  }

  async function inspectRequest(requestId) {
    return service.inspectRequest('warehouse-1', requestId, {
      idempotencyKey: 'inspection-request-001',
      warehouseNote: 'All goods received',
      items: [{
        orderDetailId: 'detail-1', receivedQuantity: 1, sellableQuantity: 0,
        damagedQuantity: 1, evidenceImages: ['damage.jpg'],
      }],
    });
  }

  async function submitAndVerifyDestination(requestId) {
    const destination = await service.submitDestination('customer-1', requestId, {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'Nguyen Van A',
      confirmed: true,
      idempotencyKey: 'destination-request-001',
    });
    await service.verifyDestination('staff-1', requestId, { destinationId: destination.id, status: 'Verified' });
    return destination;
  }

  async function prepareReceivedRequest({ verifyDestination = false } = {}) {
    const requestId = await approveRequest();
    await recordHandoff(requestId);
    if (verifyDestination) await submitAndVerifyDestination(requestId);
    await inspectRequest(requestId);
    return requestId;
  }

  function manualPayout(overrides = {}) {
    return {
      idempotencyKey: 'manual-payout-default-001',
      transferReference: 'BANK-DEFAULT-001',
      transferredAt: new Date(now).toISOString(),
      note: 'Staff verified the manual bank transfer evidence.',
      confirmed: true,
      ...overrides,
    };
  }

  it('projects authoritative RefundPending payout state when evidence is missing or stale', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    Object.assign(repository.refunds[0], {
      payoutStatus: 'Processing',
      payoutMethod: 'PayOS',
      payoutOperationKey: 'payos-lost-response-001',
      payoutStartedAt: new Date('2026-07-23T09:59:00Z'),
    });

    let response = await service.getStaffRequest(requestId);
    assert.equal(response.payoutStatus, 'Processing');
    assert.deepEqual(response.payout, {
      status: 'Processing',
      method: 'PayOS',
      operationKey: 'payos-lost-response-001',
      startedAt: new Date('2026-07-23T09:59:00Z'),
      evidence: null,
      canStartPayOS: false,
      canRecordManualSuccess: false,
      canReconcileOperation: true,
      canReconcilePayOS: true,
      canReconcileManual: false,
      requiresManualPayOSResolution: true,
    });
    assert.deepEqual(response.capabilities, { payOSConfigured: true, manualPayout: true });

    repository.payoutEvidence.push({
      _id: 'stale-evidence-1',
      returnRefundRequestId: requestId,
      refundPendingId: repository.refunds[0]._id,
      payoutOperationKey: 'payos-lost-response-001',
      method: 'PAYOS',
      status: 'Failed',
      providerReference: 'SAFE-REFERENCE',
      occurredAt: new Date('2026-07-23T09:58:00Z'),
      createdAt: new Date('2026-07-23T09:58:00Z'),
    });
    Object.assign(repository.refunds[0], {
      payoutStatus: 'Unknown',
      payoutMethod: 'PayOS',
    });
    response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.status, 'Unknown');
    assert.equal(response.payout.evidence.status, 'Failed');
    assert.equal(response.payout.canStartPayOS, false);
    assert.equal(response.payout.canRecordManualSuccess, false);
    assert.equal(response.payout.canReconcilePayOS, true);
    assert.equal(response.payout.requiresManualPayOSResolution, true);

    repository.payoutEvidence.push({
      _id: 'wrong-method-evidence',
      returnRefundRequestId: requestId,
      refundPendingId: repository.refunds[0]._id,
      payoutOperationKey: 'payos-lost-response-001',
      method: 'MANUAL',
      status: 'Succeeded',
      providerReference: 'WRONG-METHOD-REFERENCE',
      occurredAt: new Date('2026-07-23T10:01:00Z'),
      createdAt: new Date('2026-07-23T10:01:00Z'),
    });
    response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.evidence.id, 'stale-evidence-1');
    assert.equal(JSON.stringify(response).includes('WRONG-METHOD-REFERENCE'), false);

    repository.payoutEvidence.push({
      _id: 'other-operation-evidence',
      returnRefundRequestId: requestId,
      refundPendingId: repository.refunds[0]._id,
      payoutOperationKey: 'another-operation',
      method: 'PAYOS',
      status: 'Succeeded',
      providerReference: 'OTHER-OPERATION-REFERENCE',
      occurredAt: new Date('2026-07-23T10:02:00Z'),
      createdAt: new Date('2026-07-23T10:02:00Z'),
    });
    response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.evidence.id, 'stale-evidence-1');
    assert.equal(JSON.stringify(response).includes('OTHER-OPERATION-REFERENCE'), false);

    repository.payoutEvidence.push({
      _id: 'newest-matching-evidence',
      returnRefundRequestId: requestId,
      refundPendingId: repository.refunds[0]._id,
      payoutOperationKey: 'payos-lost-response-001',
      method: 'PAYOS',
      status: 'Unknown',
      providerReference: 'CURRENT-REFERENCE',
      occurredAt: new Date('2026-07-23T10:03:00Z'),
      createdAt: new Date('2026-07-23T10:03:00Z'),
    });
    response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.evidence.id, 'newest-matching-evidence');
  });

  it('derives payout actions from authoritative state, verified destination and server configuration', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    let response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.status, 'NotStarted');
    assert.equal(response.payout.canStartPayOS, true);
    assert.equal(response.payout.canRecordManualSuccess, true);
    assert.equal(response.payout.canReconcilePayOS, false);

    Object.assign(repository.refunds[0], {
      payoutStatus: 'Failed',
      payoutMethod: 'Manual',
      payoutOperationKey: 'manual-failed-001',
      payoutStartedAt: now,
    });
    response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.canStartPayOS, true);
    assert.equal(response.payout.canRecordManualSuccess, true);

    const unconfigured = createService({
      payosGateway: { isConfigured() { return false; } },
    });
    response = await unconfigured.getStaffRequest(requestId);
    assert.deepEqual(response.capabilities, { payOSConfigured: false, manualPayout: true });
    assert.equal(response.payout.canStartPayOS, false);
    assert.equal(response.payout.canRecordManualSuccess, true);

    Object.assign(repository.refunds[0], { payoutStatus: 'Succeeded', payoutMethod: 'Manual' });
    response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.canStartPayOS, false);
    assert.equal(response.payout.canRecordManualSuccess, false);
    assert.equal(response.payout.canReconcilePayOS, false);
  });

  it('keeps unresolved Manual operations recoverable without enabling a second payout', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    Object.assign(repository.refunds[0], {
      payoutStatus: 'Unknown',
      payoutMethod: 'Manual',
      payoutOperationKey: 'manual-unknown-001',
      payoutStartedAt: now,
    });
    const response = await service.getStaffRequest(requestId);
    assert.equal(response.payout.canStartPayOS, false);
    assert.equal(response.payout.canRecordManualSuccess, false);
    assert.equal(response.payout.canReconcileOperation, true);
    assert.equal(response.payout.canReconcilePayOS, false);
    assert.equal(response.payout.canReconcileManual, true);
    assert.equal(response.payout.requiresManualPayOSResolution, false);
  });

  it('rejects caller-controlled reconciliation metadata on generic payout evidence', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const baseInput = manualPayout({ idempotencyKey: 'payout-boundary-001' });
    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        ...baseInput,
        evidenceKind: 'OPERATION_RECONCILIATION',
      }),
      (error) => error.statusCode === 400 && /unexpected.*evidenceKind/i.test(error.message),
    );
    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        ...baseInput,
        idempotencyKey: 'payout-boundary-002',
        reconcilesOperationKey: 'different-operation',
      }),
      (error) => error.statusCode === 400 && /unexpected.*reconcilesOperationKey/i.test(error.message),
    );
    assert.equal(repository.payoutEvidence.length, 0);
  });

  it('creates exactly one New request with evidence and never exposes a refund amount', async () => {
    const result = await createRequest();
    assert.equal(result.status, 'New');
    assert.deepEqual(result.evidenceImages, ['/api/return-refunds/evidence/11111111-1111-4111-8111-000000000001.jpg']);
    assert.equal(Object.hasOwn(result, 'refundAmount'), false);
    assert.equal(repository.requests.length, 1);
  });

  it('requires at least one evidence attachment', async () => {
    await assert.rejects(
      () => service.createCustomerRequest('customer-1', { orderId: 'order-1', reason: 'Damaged' }),
      /evidence/i,
    );
  });

  it('requires Customer-owned evidence claims and enforces five files and 20 MiB across split uploads', async () => {
    await assert.rejects(
      () => service.createCustomerRequest('customer-1', {
        orderId: 'order-1', reason: 'Damaged', evidenceImages: [claimedEvidence('customer-2')],
      }),
      /không thuộc quyền sở hữu/i,
    );
    await assert.rejects(
      () => service.createCustomerRequest('customer-1', {
        orderId: 'order-1', reason: 'Damaged',
        evidenceImages: Array.from({ length: 6 }, (_, index) => claimedEvidence('customer-1', index + 1)),
      }),
      /maximum of 5/i,
    );
    await assert.rejects(
      () => service.createCustomerRequest('customer-1', {
        orderId: 'order-1', reason: 'Damaged',
        evidenceImages: Array.from({ length: 5 }, (_, index) => claimedEvidence('customer-1', index + 1, 5 * 1024 * 1024)),
      }),
      /20 MiB/i,
    );
    assert.equal(repository.requests.length, 0);
  });

  it('enforces order ownership, Delivered status, and the immutable five-day deadline', async () => {
    await assert.rejects(
      () => service.createCustomerRequest('customer-2', { orderId: 'order-1', reason: 'Damaged', evidenceImages: ['a.jpg'] }),
      /not found/i,
    );
    await assert.rejects(
      () => service.createCustomerRequest('customer-1', { orderId: 'order-2', reason: 'Damaged', evidenceImages: ['a.jpg'] }),
      /Only Delivered/i,
    );
    now = new Date('2026-07-25T10:00:00Z');
    assert.equal((await createRequest()).status, 'New');
    repository.state.requests = [];
    now = new Date('2026-07-25T10:00:00.001Z');
    await assert.rejects(() => createRequest(), /five-day.*expired/i);
  });

  it('rejects a duplicate active case for the same order', async () => {
    await createRequest();
    repository.findOrderLock = async () => ({
      orderId: 'order-1', caseType: 'RETURN_REFUND', caseId: 'request-1', status: 'Active',
    });
    const error = await captureError(() => createRequest());
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.message, 'This Order already has an active after-sales case');
    assert.deepEqual(error.data, {
      currentCase: { type: 'RETURN_REFUND', id: 'request-1', status: 'New' },
      action: { label: 'Xem yêu cầu đang xử lý', href: '/return-refunds' },
    });
    assert.equal(repository.requests.length, 1);
  });

  it('returns an owner-safe typed conflict for a preexisting winning Exchange lock', async () => {
    repository.findOrderLock = async () => ({
      orderId: 'order-1', caseType: 'EXCHANGE', caseId: 'exchange-winner', status: 'Active',
    });
    repository.findExchangeCaseById = async () => ({
      _id: 'exchange-winner', orderId: 'order-1', customerId: 'customer-1',
      status: 'Submitted', reason: 'private', evidenceImages: ['private.jpg'],
    });
    repository.claimOrderLock = async () => {
      assert.fail('preexisting lock must be resolved before creating a Return');
    };

    const error = await captureError(() => createRequest());
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.message, 'This Order already has an active after-sales case');
    assert.deepEqual(error.data, {
      currentCase: { type: 'EXCHANGE', id: 'exchange-winner', status: 'Submitted' },
      action: { label: 'Xem yêu cầu đang xử lý', href: '/exchanges/exchange-winner' },
    });
    assert.doesNotMatch(JSON.stringify(error.data), /reason|evidence|private/i);
    assert.equal(repository.requests.length, 0);
  });

  it('resolves a verified shared-lock winner after Return lock-claim failure', async () => {
    let lockReads = 0;
    repository.findOrderLock = async () => {
      lockReads += 1;
      return lockReads === 1 ? null : {
        orderId: 'order-1', caseType: 'EXCHANGE', caseId: 'exchange-race', status: 'Active',
      };
    };
    repository.findExchangeCaseById = async () => ({
      _id: 'exchange-race', orderId: 'order-1', customerId: 'customer-1', status: 'Submitted',
    });
    repository.claimOrderLock = async () => null;

    const error = await captureError(() => createRequest());
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.data.action.href, '/exchanges/exchange-race');
    assert.equal(repository.requests.length, 0);
  });

  it('resolves a verified shared-lock winner after a Return E11000 race', async () => {
    let lockReads = 0;
    repository.findOrderLock = async () => {
      lockReads += 1;
      return lockReads === 1 ? null : {
        orderId: 'order-1', caseType: 'EXCHANGE', caseId: 'exchange-e11000', status: 'Active',
      };
    };
    repository.findExchangeCaseById = async () => ({
      _id: 'exchange-e11000', orderId: 'order-1', customerId: 'customer-1', status: 'Submitted',
    });
    repository.createRequest = async () => {
      const error = duplicateError();
      error.keyPattern = { requestCode: 1 };
      throw error;
    };

    const error = await captureError(() => createRequest());
    assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
    assert.equal(error.data.action.href, '/exchanges/exchange-e11000');
    assert.equal(repository.requests.length, 0);
  });

  it('returns data null for corrupt, foreign, or missing shared-lock cases', async () => {
    for (const currentCase of [
      null,
      { _id: 'wrong-order', orderId: 'order-2', customerId: 'customer-1', status: 'Submitted' },
      { _id: 'foreign-owner', orderId: 'order-1', customerId: 'customer-2', status: 'Submitted' },
    ]) {
      repository.findOrderLock = async () => ({
        orderId: 'order-1', caseType: 'EXCHANGE', caseId: currentCase?._id || 'missing', status: 'Active',
      });
      repository.findExchangeCaseById = async () => currentCase;
      const error = await captureError(() => createRequest());
      assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
      assert.equal(error.message, 'This Order already has an active after-sales case');
      assert.equal(error.data, null);
    }
  });

  it('preserves a timely Delivered+Unpaid COD request in reconciliation hold without a payout obligation', async () => {
    const result = await createRequest('order-3');
    assert.equal(result.status, 'AwaitingCODReconciliation');
    assert.equal(Object.hasOwn(result, 'refundAmount'), false);
    await assert.rejects(
      () => service.decideRequest('staff-1', result.id, { status: 'Approved', staffNote: 'Approve now' }),
      /COD reconciliation/i,
    );
    assert.equal(repository.refunds.length, 0);
  });

  it('sets fixed ApprovedAt and ShipByAt while deriving the amount only on the server', async () => {
    const request = await createRequest();
    const beforeOrder = structuredClone(repository.orders[0]);
    const result = await service.decideRequest('staff-1', request.id, { status: 'Approved', staffNote: 'Evidence accepted' });
    assert.equal(result.status, 'Approved');
    assert.equal(new Date(result.approvedAt).toISOString(), '2026-07-23T10:00:00.000Z');
    assert.equal(new Date(result.shipByAt).toISOString(), '2026-07-26T10:00:00.000Z');
    assert.equal(Object.hasOwn(result, 'refundAmount'), false);
    assert.equal(repository.requests[0].refundAmount, 120);
    assert.deepEqual(repository.orders[0], beforeOrder);
    assert.equal(repository.refunds.length, 0);
  });

  it('rolls back a decision when its mandatory Customer notification outbox cannot be written', async () => {
    const request = await createRequest();
    const guarded = createService({
      eventPublisher: {
        async publishDomainEvent() {
          throw new Error('notification outbox unavailable');
        },
      },
    });

    await assert.rejects(
      () => guarded.decideRequest('staff-1', request.id, {
        status: 'Approved',
        staffNote: 'Evidence accepted',
      }),
      /notification outbox unavailable/i,
    );
    assert.equal(repository.requests[0].status, 'New');
  });

  it('requires a Staff reason, rejects Staff-supplied amounts, and prevents stale decision overwrite', async () => {
    const request = await createRequest();
    await assert.rejects(() => service.decideRequest('staff-1', request.id, { status: 'Rejected' }), /Staff note/i);
    await assert.rejects(
      () => service.decideRequest('staff-1', request.id, { status: 'Approved', staffNote: 'OK', refundAmount: 120 }),
      /server-derived/i,
    );
    repository.claimDecision = async () => null;
    await assert.rejects(
      () => service.decideRequest('staff-1', request.id, { status: 'Approved', staffNote: 'OK' }),
      /changed/i,
    );
    assert.equal(repository.requests[0].status, 'New');
  });

  it('rejects a New case with a Staff reason without changing the paid Delivered order or creating financial effects', async () => {
    const request = await createRequest();
    const result = await service.decideRequest('staff-1', request.id, {
      status: 'Rejected', staffNote: 'Bằng chứng không đáp ứng điều kiện',
    });
    assert.equal(result.status, 'Rejected');
    assert.equal(repository.orders[0].orderStatus, 'Delivered');
    assert.equal(repository.orders[0].paymentStatus, 'Paid');
    assert.equal(repository.refunds.length, 0);
    assert.equal(repository.inventoryTransactions.length, 0);
  });

  it('records one timely Customer handoff proof and never permits replacement', async () => {
    const requestId = await approveRequest();
    const first = await recordHandoff(requestId);
    assert.equal(first.handoffProofReference, 'carrier-handoff-001');
    const replay = await recordHandoff(requestId);
    assert.equal(replay.replay, true);
    await assert.rejects(
      () => service.recordHandoffProof('customer-1', requestId, { proofReference: 'different-proof', handoffAt: '2026-07-23T10:00:00Z' }),
      /already recorded/i,
    );
  });

  it('accepts delayed integration only when the original handoff timestamp was on time', async () => {
    const requestId = await approveRequest();
    now = new Date('2026-07-27T10:00:00Z');
    const accepted = await recordHandoff(requestId);
    assert.equal(accepted.status, 'Approved');
    repository.requests[0].handoffAt = null;
    repository.requests[0].handoffProofReference = '';
    await assert.rejects(
      () => service.recordHandoffProof('customer-1', requestId, { proofReference: 'late-proof', handoffAt: '2026-07-27T09:00:00Z' }),
      /deadline.*expired/i,
    );
  });

  it('expires an approved request without proof and creates no inventory or refund side effect', async () => {
    const requestId = await approveRequest();
    now = new Date('2026-07-27T10:00:00Z');
    const expired = await service.expireRequest('staff-1', requestId);
    assert.equal(expired.status, 'Expired');
    assert.equal(repository.returnItems.length, 0);
    assert.equal(repository.inventoryTransactions.length, 0);
    assert.equal(repository.refunds.length, 0);
  });

  it('expires overdue cases in the background but allows a late-arriving on-time handoff fact to reconcile them', async () => {
    const requestId = await approveRequest();
    now = new Date('2026-07-27T10:00:00Z');
    assert.deepEqual(await service.expireOverdueRequests(), { expired: 1 });
    assert.equal(repository.requests[0].status, 'Expired');
    const reconciled = await recordHandoff(requestId);
    assert.equal(reconciled.status, 'Approved');
    assert.equal(reconciled.handoffProofReference, 'carrier-handoff-001');
  });

  it('stores an encrypted, masked destination only after Customer confirmation', async () => {
    const requestId = await approveRequest();
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, {
        bankCode: 'MB', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A',
        idempotencyKey: 'destination-request-001',
      }),
      /confirm/i,
    );
    const destination = await service.submitDestination('customer-1', requestId, {
      bankCode: 'MB', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A',
      confirmed: true, idempotencyKey: 'destination-request-001',
    });
    assert.equal(destination.maskedAccountNumber, '****6789');
    assert.equal(destination.bankName, 'MBBank');
    assert.equal(Object.hasOwn(destination, 'bankBin'), false);
    assert.equal(Object.hasOwn(destination, 'accountNumberEncrypted'), false);
    assert.equal(repository.destinations[0].bankName, 'MBBank');
    assert.equal(repository.destinations[0].bankBin, '970422');
    assert.notEqual(repository.destinations[0].accountNumberEncrypted, '0123456789');
    const replay = await service.submitDestination('customer-1', requestId, {
      bankCode: 'MB', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A',
      confirmed: true, idempotencyKey: 'destination-request-001',
    });
    assert.equal(replay.replay, true);
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, {
        bankCode: 'VCB', accountNumber: '9999999999', accountHolderName: 'Other Name',
        confirmed: true, idempotencyKey: 'destination-request-001',
      }),
      /idempotency key.*different/i,
    );
  });

  it('accepts only the safe exact destination payload and rejects unknown banks, coercion, and credential-shaped keys', async () => {
    const requestId = await approveRequest();
    const base = {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'Nguyen Van A',
      confirmed: true,
      idempotencyKey: 'destination-safe-001',
    };

    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, bankCode: 'NOT_A_BANK' }),
      /supported bank/i,
    );
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, bankCode: { toString: () => 'MB' } }),
      /bankCode.*string/i,
    );
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, accountNumber: 123456789 }),
      /accountNumber.*string/i,
    );
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, bankName: 'MBBank' }),
      /bankName.*not accepted/i,
    );
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, bankBin: '970422' }),
      /bankBin.*not accepted/i,
    );
    for (const unsafe of [
      { PIN: '1234' },
      { otp: '123456' },
      { metadata: { Password: 'secret' } },
      { extra: [{ cVv: '123' }] },
      { banking: { passCode: 'secret' } },
    ]) {
      await assert.rejects(
        () => service.submitDestination('customer-1', requestId, { ...base, ...unsafe }),
        /credential/i,
      );
    }
    assert.equal(repository.destinations.length, 0);
  });

  it('bounds hostile nested destination payloads and returns typed validation errors instead of overflowing', async () => {
    const requestId = await approveRequest();
    const base = {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'Nguyen Van A',
      confirmed: true,
      idempotencyKey: 'destination-bounded-001',
    };
    const nestedCredential = {};
    let cursor = nestedCredential;
    for (let depth = 0; depth < 6; depth += 1) {
      cursor.child = {};
      cursor = cursor.child;
    }
    cursor.PaSsCoDe = 'must-never-be-accepted';
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, metadata: nestedCredential }),
      (error) => error?.statusCode === 400 && /credential/i.test(error.message),
    );

    const tooDeep = {};
    cursor = tooDeep;
    for (let depth = 0; depth < 10000; depth += 1) {
      cursor.child = {};
      cursor = cursor.child;
    }
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, metadata: tooDeep }),
      (error) => error?.statusCode === 400
        && !(error instanceof RangeError)
        && /complex|deep|payload/i.test(error.message),
    );
    const cyclic = {};
    cyclic.self = cyclic;
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, { ...base, metadata: cyclic }),
      (error) => error?.statusCode === 400 && !(error instanceof RangeError),
    );
    assert.equal(repository.destinations.length, 0);
  });

  it('denies destination access before approval or to another Customer without revealing financial data', async () => {
    const pending = await createRequest();
    const input = {
      bankCode: 'MB', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A',
      confirmed: true, idempotencyKey: 'destination-access-001',
    };
    await assert.rejects(
      () => service.submitDestination('customer-1', pending.id, input),
      /only be submitted after approval/i,
    );
    await service.decideRequest('staff-1', pending.id, { status: 'Approved', staffNote: 'Evidence accepted' });
    await assert.rejects(
      () => service.submitDestination('customer-2', pending.id, input),
      /not found/i,
    );
    assert.equal(repository.destinations.length, 0);
  });

  it('requires valid destination values and creates a new Customer-confirmed version after rejection', async () => {
    const requestId = await approveRequest();
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, {
        bankCode: 'MB', accountNumber: 'invalid', accountHolderName: 'Nguyen Van A',
        confirmed: true, idempotencyKey: 'destination-invalid-001',
      }),
      /valid bank account/i,
    );

    const first = await service.submitDestination('customer-1', requestId, {
      bankCode: 'MB', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A',
      confirmed: true, idempotencyKey: 'destination-version-001',
    });
    await assert.rejects(
      () => service.submitDestination('customer-1', requestId, {
        bankCode: 'MB', accountNumber: '9999999999', accountHolderName: 'Nguyen Van A',
        confirmed: true, idempotencyKey: 'destination-version-002',
      }),
      /must be rejected/i,
    );
    await service.verifyDestination('staff-1', requestId, {
      destinationId: first.id, status: 'Rejected', rejectionReason: 'Sai số tài khoản',
    });
    const corrected = await service.submitDestination('customer-1', requestId, {
      bankCode: 'MB', accountNumber: '9999999999', accountHolderName: 'Nguyen Van A',
      confirmed: true, idempotencyKey: 'destination-version-002',
    });
    assert.equal(corrected.version, 2);
    assert.equal(repository.destinations[1].supersedesId, first.id);
    assert.equal(repository.destinations[1].status, 'Submitted');
  });

  it('lets Staff verify or reject but never edit Customer destination values', async () => {
    const requestId = await approveRequest();
    const destination = await service.submitDestination('customer-1', requestId, {
      bankCode: 'MB', accountNumber: '0123456789', accountHolderName: 'Nguyen Van A',
      confirmed: true, idempotencyKey: 'destination-request-001',
    });
    await assert.rejects(
      () => service.verifyDestination('staff-1', requestId, { destinationId: destination.id, status: 'Verified', accountNumber: '999999' }),
      /cannot edit/i,
    );
    assert.ok(auditLogger.entries.some((entry) => entry.action === 'REFUND_DESTINATION_EDIT_DENIED'));
    const verified = await service.verifyDestination('staff-1', requestId, { destinationId: destination.id, status: 'Verified' });
    assert.equal(verified.status, 'Verified');
    assert.equal(repository.requests[0].verifiedDestinationId, destination.id);

    const staff = await service.getStaffRequest(requestId);
    assert.equal(staff.destination.accountNumber, '0123456789');
    assert.equal(staff.destination.accountHolderName, 'NGUYEN VAN A');
    assert.equal(Object.hasOwn(staff.destination, 'bankBin'), false);
    assert.equal(staff.payoutDestinationReady, true);
    assert.equal(staff.payoutDestinationIssueCode, null);

    const staffQueue = await service.listStaffRequests();
    assert.equal(Object.hasOwn(staffQueue.items[0].destination, 'accountNumber'), false);
    assert.equal(Object.hasOwn(staffQueue.items[0].destination, 'accountHolderName'), false);
    assert.equal(Object.hasOwn(staffQueue.items[0].destination, 'bankBin'), false);
    assert.equal(staffQueue.items[0].payoutDestinationReady, true);

    repository.destinations[0].bankBin = '';
    const routeUnavailable = await service.getStaffRequest(requestId);
    assert.equal(routeUnavailable.payoutDestinationReady, false);
    assert.equal(routeUnavailable.payoutDestinationIssueCode, 'DESTINATION_ROUTE_UNAVAILABLE');
    assert.equal(Object.hasOwn(routeUnavailable.destination, 'bankBin'), false);

    const customer = await service.listMyRequests('customer-1');
    assert.equal(Object.hasOwn(customer.items[0].destination, 'accountNumber'), false);
    assert.equal(Object.hasOwn(customer.items[0].destination, 'accountHolderName'), false);
    assert.equal(Object.hasOwn(customer.items[0].destination, 'bankBin'), false);
    assert.equal(Object.hasOwn(customer.items[0], 'payout'), false);
    assert.equal(Object.hasOwn(customer.items[0], 'capabilities'), false);

    const warehouse = await service.getWarehouseRequest(requestId);
    assert.equal(Object.hasOwn(warehouse, 'destination'), false);
    assert.equal(JSON.stringify(warehouse).includes('6789'), false);
  });

  it('requires timely handoff proof before Warehouse receipt', async () => {
    const requestId = await approveRequest();
    await assert.rejects(() => inspectRequest(requestId), /handoff proof/i);
    assert.equal(repository.inventoryTransactions.length, 0);
  });

  it('requires every purchased line and every purchased unit exactly once', async () => {
    const requestId = await approveRequest();
    await recordHandoff(requestId);
    await assert.rejects(
      () => service.inspectRequest('warehouse-1', requestId, {
        items: [{ orderDetailId: 'detail-1', receivedQuantity: 0, sellableQuantity: 0, damagedQuantity: 0 }],
      }),
      /complete purchased quantity/i,
    );
    await assert.rejects(
      () => service.inspectRequest('warehouse-1', requestId, {
        items: [
          { orderDetailId: 'detail-1', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 },
          { orderDetailId: 'detail-1', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 },
        ],
      }),
      /every purchased order line|only be inspected once/i,
    );
  });

  it('atomically receives goods, updates sellable/damaged inventory, and creates one normal-return obligation', async () => {
    const requestId = await approveRequest();
    await recordHandoff(requestId);
    const result = await inspectRequest(requestId);
    assert.equal(result.status, 'Received');
    assert.equal(repository.inventories[0].stockQuantity, 10);
    assert.equal(repository.inventories[0].damagedQuantity, 2);
    assert.equal(repository.products[0].stockQuantity, 10);
    assert.deepEqual(repository.inventoryTransactions.map((entry) => entry.transactionType), ['RETURN_IN', 'RETURN_DAMAGED_IN']);
    assert.equal(repository.returnItems.length, 1);
    assert.equal(repository.refunds.length, 1);
    assert.equal(repository.refunds[0].amount, 120);
    assert.equal(repository.refunds[0].obligationType, 'NORMAL_RETURN');
    assert.equal(repository.orders[0].paymentStatus, 'Paid');
    assert.equal(repository.payments[0].paymentStatus, 'Paid');
    assert.equal(repository.attempts[0].paymentStatus, 'Paid');
  });

  it('references goods already accounted by a converted Exchange without posting Inventory twice', async () => {
    const requestId = await approveRequest();
    const request = repository.requests.find((entry) => entry._id === requestId);
    request.sourceExchangeCaseId = 'exchange-1';
    request.preAccountedMovementKeys = ['exchange-1:detail-1:EXCHANGE_RETURN_DAMAGED_IN'];
    request.preAccountedItems = [{
      orderDetailId: 'detail-1',
      productId: 'product-1',
      sellableQuantity: 0,
      damagedQuantity: 1,
      movementKeys: ['exchange-1:detail-1:EXCHANGE_RETURN_DAMAGED_IN'],
    }];
    const before = structuredClone(repository.inventories[0]);

    const result = await service.inspectRequest('warehouse-1', requestId, {
      idempotencyKey: 'inspection-converted-exchange-001',
      items: [],
    });

    assert.equal(result.status, 'Received');
    assert.deepEqual(repository.inventories[0], before);
    assert.equal(repository.inventoryTransactions.length, 0);
    assert.equal(repository.returnItems.length, 1);
    assert.match(repository.returnItems[0].warehouseNote, /not replayed/i);
  });

  it('rolls back request, inventory, movements, items, and refund when a Warehouse write fails', async () => {
    const requestId = await approveRequest();
    await recordHandoff(requestId);
    repository.state.failInventoryTransaction = true;
    await assert.rejects(() => inspectRequest(requestId), /injected inventory write failure/);
    assert.equal(repository.requests[0].status, 'Approved');
    assert.equal(repository.inventories[0].damagedQuantity, 1);
    assert.equal(repository.inventoryTransactions.length, 0);
    assert.equal(repository.returnItems.length, 0);
    assert.equal(repository.refunds.length, 0);
  });

  it('returns a replay after receipt without duplicating any side effect', async () => {
    const requestId = await prepareReceivedRequest();
    const replay = await inspectRequest(requestId);
    assert.equal(replay.replay, true);
    assert.equal(repository.inventoryTransactions.length, 2);
    assert.equal(repository.returnItems.length, 1);
    assert.equal(repository.refunds.length, 1);
    await assert.rejects(
      () => service.inspectRequest('warehouse-1', requestId, {
        idempotencyKey: 'different-inspection-id',
        items: [{ orderDetailId: 'detail-1', receivedQuantity: 1, sellableQuantity: 1, damagedQuantity: 0 }],
      }),
      /different idempotency/i,
    );
  });

  it('requires both receipt and verified destination and rejects any alternate payout amount', async () => {
    const requestId = await approveRequest();
    await submitAndVerifyDestination(requestId);
    await assert.rejects(
      () => service.recordPayoutEvidence(
        'staff-1',
        requestId,
        manualPayout({ idempotencyKey: 'payout-request-001' })
      ),
      /received or ready for refund/i,
    );
    await recordHandoff(requestId);
    await inspectRequest(requestId);
    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        ...manualPayout({ idempotencyKey: 'payout-request-001' }),
        amount: 119,
      }),
      /unexpected.*amount/i,
    );

    repository.requests[0].verifiedDestinationId = null;
    await assert.rejects(
      () => service.recordPayoutEvidence(
        'staff-1',
        requestId,
        manualPayout({ idempotencyKey: 'payout-receipt-only-001' })
      ),
      /verified refund destination/i,
    );
    assert.equal(repository.requests[0].status, 'Received');
  });

  it('keeps Processing payout evidence non-terminal and blocks a blind second provider operation', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const result = await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payout-processing-001',
    });
    assert.equal(result.status, 'Processing');
    assert.equal(repository.requests[0].status, 'Received');
    assert.equal(repository.orders[0].orderStatus, 'Delivered');
    await assert.rejects(
      () => service.startPayOSPayout('staff-1', requestId, {
        idempotencyKey: 'payout-processing-002',
      }),
      /previous payout attempt.*reconciled/i,
    );
  });

  it('starts one server-derived payOS payout and completes only after provider reconciliation succeeds', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const started = await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-start-request-001',
    });
    assert.equal(started.status, 'Processing');
    assert.equal(repository.requests[0].status, 'Received');
    assert.equal(repository.refunds[0].payoutStatus, 'Processing');
    assert.equal(repository.refunds[0].payoutMethod, 'PayOS');
    assert.deepEqual(repository.refunds[0].payoutStartedAt, now);
    assert.equal(payosGateway.calls.length, 1);
    assert.deepEqual(payosGateway.calls[0].input, {
      referenceId: repository.requests[0].requestCode,
      amount: 120,
      description: `Hoan tien ${repository.requests[0].requestCode}`,
      toBin: '970422',
      toAccountNumber: '0123456789',
      idempotencyKey: 'payos-start-request-001',
    });

    const replay = await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-start-request-001',
    });
    assert.equal(replay.replay, true);
    assert.equal(payosGateway.calls.length, 1);

    payosGateway.payout = {
      id: 'payos-payout-1', referenceId: repository.requests[0].requestCode, approvalState: 'SUCCEEDED',
      transactions: [{
        id: 'payos-transaction-1', state: 'SUCCEEDED', amount: 120,
        toBin: '970422', toAccountNumber: '0123456789', reference: 'BANK-REF-001',
      }],
    };
    const completed = await service.reconcilePayOSPayout('staff-1', requestId);
    assert.equal(completed.status, 'Succeeded');
    assert.equal(completed.request.status, 'Completed');
    assert.equal(repository.refunds[0].status, 'Refunded');
    assert.equal(repository.orders[0].orderStatus, 'Returned');
    assert.equal(repository.payments[0].paymentStatus, 'Paid');
  });

  it('fails payOS configuration before claiming the refund obligation', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    payosGateway.isConfigured = () => false;

    await assert.rejects(
      () => service.startPayOSPayout('staff-1', requestId, {
        idempotencyKey: 'payos-config-missing-001',
      }),
      (error) => error.statusCode === 503 && /not configured/i.test(error.message),
    );

    assert.equal(repository.refunds[0].payoutStatus, 'NotStarted');
    assert.equal(repository.refunds[0].payoutOperationKey || '', '');
    assert.equal(payosGateway.calls.length, 0);
  });

  it('persists a visible Unknown operation and safe incident when payOS throws after claim, then retries only the same key', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    payosGateway.createPayout = async function createPayout(input) {
      this.calls.push({ type: 'create', input });
      if (this.calls.length === 1) throw new Error('socket contained private provider diagnostics');
      return structuredClone(this.payout);
    };

    await assert.rejects(
      () => service.startPayOSPayout('staff-1', requestId, {
        idempotencyKey: 'payos-lost-response-001',
      }),
      (error) => error.statusCode === 502
        && error.errorCode === 'PAYOUT_RESULT_UNKNOWN'
        && !error.message.includes('private provider diagnostics'),
    );

    assert.equal(repository.refunds[0].payoutStatus, 'Unknown');
    assert.equal(repository.refunds[0].payoutOperationKey, 'payos-lost-response-001');
    assert.equal(repository.payoutEvidence.length, 1);
    assert.equal(repository.payoutEvidence[0].status, 'Unknown');
    assert.equal(repository.payoutEvidence[0].payoutOperationKey, 'payos-lost-response-001');
    assert.equal(repository.payoutIncidents.length, 1);
    assert.equal(JSON.stringify(repository.state).includes('private provider diagnostics'), false);

    await assert.rejects(
      () => service.startPayOSPayout('staff-1', requestId, {
        idempotencyKey: 'payos-new-operation-blocked-001',
      }),
      /previous payout attempt.*reconciled/i,
    );
    assert.equal(payosGateway.calls.length, 1);

    const retried = await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-lost-response-001',
    });
    assert.equal(retried.status, 'Processing');
    assert.equal(repository.refunds[0].payoutOperationKey, 'payos-lost-response-001');
    assert.equal(payosGateway.calls.length, 2);
    assert.equal(payosGateway.calls[1].input.idempotencyKey, 'payos-lost-response-001');

    await service.reconcilePayoutOperation('staff-1', requestId, {
      operationKey: 'payos-lost-response-001',
      outcome: 'Failed',
      transferReference: 'payos-payout-1',
      transferredAt: '2026-07-23T10:00:00Z',
      note: 'Bank statement confirms the uncertain PayOS operation did not pay.',
      confirmed: true,
      idempotencyKey: 'manual-reconciliation-lost-failed-001',
    });
    assert.equal(repository.refunds[0].payoutStatus, 'Failed');
    assert.equal(repository.payoutIncidents[0].status, 'Resolved');

    const manual = await service.recordPayoutEvidence('staff-1', requestId, manualPayout({
      idempotencyKey: 'manual-after-lost-failed-001',
      transferReference: 'BANK-MANUAL-AFTER-LOST-001',
      note: 'Manual transfer verified after the lost PayOS attempt was released.',
    }));
    assert.equal(manual.request.status, 'Completed');
    assert.equal(payosGateway.calls.length, 2);
  });

  it('manually reconciles the exact unresolved operation without calling payOS', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-reconcile-manual-001',
    });
    const providerCalls = payosGateway.calls.length;

    const unknown = await service.reconcilePayoutOperation('staff-1', requestId, {
      operationKey: 'payos-reconcile-manual-001',
      outcome: 'Unknown',
      transferReference: 'payos-payout-1',
      transferredAt: '2026-07-23T10:00:00Z',
      note: 'Bank statement remains inconclusive after Staff verification.',
      confirmed: true,
      idempotencyKey: 'manual-reconciliation-unknown-001',
    });
    assert.equal(unknown.status, 'Unknown');
    assert.equal(repository.refunds[0].payoutStatus, 'Unknown');
    assert.equal(notifications.at(-1).userId, 'staff-1');
    assert.equal(notifications.at(-1).type, 'REFUND_PAYOUT_OPERATION_RECONCILED');
    assert.doesNotMatch(
      JSON.stringify(notifications.at(-1)),
      /payos-payout-1|bank statement|account|bin/i,
    );

    const failed = await service.reconcilePayoutOperation('staff-1', requestId, {
      operationKey: 'payos-reconcile-manual-001',
      outcome: 'Failed',
      transferReference: 'payos-payout-1',
      transferredAt: '2026-07-23T10:00:00Z',
      note: 'Bank statement confirms that this exact operation did not pay.',
      confirmed: true,
      idempotencyKey: 'manual-reconciliation-failed-001',
    });
    assert.equal(failed.status, 'Failed');
    assert.equal(repository.refunds[0].payoutStatus, 'Failed');
    assert.equal(repository.requests[0].status, 'Received');

    const manual = await service.recordPayoutEvidence('staff-1', requestId, manualPayout({
      idempotencyKey: 'manual-after-failed-001',
      transferReference: 'BANK-MANUAL-001',
      note: 'Manual transfer verified against the bank statement.',
    }));
    assert.equal(manual.request.status, 'Completed');
    assert.equal(payosGateway.calls.length, providerCalls);
  });

  it('finalizes a manually verified existing payout once and replays only identical facts', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-existing-success-001',
    });
    const input = {
      operationKey: 'payos-existing-success-001',
      outcome: 'Succeeded',
      transferReference: 'payos-payout-1',
      transferredAt: '2026-07-23T10:00:00Z',
      note: 'Bank statement verifies the exact payout operation and destination.',
      confirmed: true,
      idempotencyKey: 'manual-reconciliation-success-001',
    };
    const providerCalls = payosGateway.calls.length;

    const completed = await service.reconcilePayoutOperation('staff-1', requestId, input);
    assert.equal(completed.status, 'Succeeded');
    assert.equal(completed.request.status, 'Completed');
    assert.equal(repository.payoutEvidence.filter((entry) => entry.status === 'Succeeded').length, 1);
    assert.equal(repository.payoutEvidence.at(-1).evidenceKind, 'OPERATION_RECONCILIATION');
    assert.equal(repository.payoutEvidence.at(-1).reconcilesOperationKey, input.operationKey);

    const replay = await service.reconcilePayoutOperation('staff-1', requestId, input);
    assert.equal(replay.replay, true);
    assert.equal(repository.payoutEvidence.filter((entry) => entry.status === 'Succeeded').length, 1);
    assert.equal(payosGateway.calls.length, providerCalls);

    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        ...input,
        note: 'A different reconciliation statement must conflict safely.',
      }),
      /idempotency key.*different/i,
    );
  });

  it('rejects unsafe, stale, unconfirmed, and temporally invalid reconciliation input before writes', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-input-validation-001',
    });
    const base = {
      operationKey: 'payos-input-validation-001',
      outcome: 'Failed',
      transferReference: 'payos-payout-1',
      transferredAt: '2026-07-23T10:00:00Z',
      note: 'Bank statement confirms this operation did not transfer funds.',
      confirmed: true,
      idempotencyKey: 'manual-reconciliation-input-001',
    };
    const before = repository.payoutEvidence.length;

    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, { ...base, amount: 1 }),
      /unexpected.*amount/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        ...base,
        transferReference: 123456,
      }),
      /transferReference must be a string/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        ...base,
        metadata: { bankOtp: '123456' },
      }),
      /credentials.*never accepted/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, { ...base, confirmed: false }),
      /confirm/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, { ...base, outcome: 'Processing' }),
      /Succeeded, Failed, or Unknown/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, { ...base, note: 'Too short' }),
      /20-1000/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, { ...base, transferredAt: '' }),
      /transferredAt is required/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        ...base,
        transferredAt: '2026-07-23T10:00:00.001Z',
      }),
      /future/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        ...base,
        operationKey: 'stale-operation-key-001',
      }),
      /current payout operation|stale/i,
    );
    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        ...base,
        transferredAt: '2026-07-23T09:59:00Z',
      }),
      /before.*started/i,
    );
    assert.equal(repository.payoutEvidence.length, before);
  });

  it('rolls back reconciliation evidence, Audit and Outbox when exact-operation CAS loses', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-cas-race-001',
    });
    repository.claimPayoutReconciliation = async () => null;
    const beforeEvidence = repository.payoutEvidence.length;
    const beforeAudit = auditLogger.entries.length;
    const beforeNotifications = notifications.length;

    await assert.rejects(
      () => service.reconcilePayoutOperation('staff-1', requestId, {
        operationKey: 'payos-cas-race-001',
        outcome: 'Failed',
        transferReference: 'payos-payout-1',
        transferredAt: '2026-07-23T10:00:00Z',
        note: 'Another process changed this operation before reconciliation.',
        confirmed: true,
        idempotencyKey: 'manual-reconciliation-cas-001',
      }),
      /changed|stale|operation/i,
    );
    assert.equal(repository.payoutEvidence.length, beforeEvidence);
    assert.equal(auditLogger.entries.length, beforeAudit);
    assert.equal(notifications.length, beforeNotifications);
  });

  it('requires a CAS claim before accepting manual payout evidence', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    repository.claimManualPayoutStart = async () => null;

    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        ...manualPayout({
          idempotencyKey: 'manual-cas-loser-001',
          transferReference: 'BANK-MANUAL-CAS-001',
          note: 'Manual transfer was verified against the bank statement.',
        }),
      }),
      /another payout attempt|changed/i,
    );
    assert.equal(repository.payoutEvidence.length, 0);
    assert.equal(repository.requests[0].status, 'Received');
  });

  it('accepts only the exact attested manual-success contract and compares every replay fact', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const input = {
      idempotencyKey: 'manual-exact-contract-001',
      transferReference: 'BANK-MANUAL-EXACT-001',
      transferredAt: '2026-07-23T10:00:00.000Z',
      note: 'Bank statement verifies this exact manual transfer.',
      confirmed: true,
    };

    const first = await service.recordPayoutEvidence('staff-1', requestId, input);
    assert.equal(first.status, 'Succeeded');
    const replay = await service.recordPayoutEvidence('staff-1', requestId, input);
    assert.equal(replay.replay, true);

    for (const changed of [
      { transferReference: 'BANK-MANUAL-EXACT-CHANGED' },
      { transferredAt: '2026-07-23T09:59:59.000Z' },
      { note: 'A different note must never replay the original transfer.' },
    ]) {
      await assert.rejects(
        () => service.recordPayoutEvidence('staff-1', requestId, { ...input, ...changed }),
        /idempotency key.*different/i,
      );
    }
  });

  it('rejects unknown, credential-shaped, unconfirmed, malformed and unreasonable manual evidence before writes', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const input = {
      idempotencyKey: 'manual-input-boundary-001',
      transferReference: 'BANK-MANUAL-BOUNDARY-001',
      transferredAt: '2026-07-23T10:00:00.000Z',
      note: 'Bank statement verifies this exact manual transfer.',
      confirmed: true,
    };
    const before = repository.payoutEvidence.length;
    const rejectedInputs = [
      [{ ...input, amount: 120 }, /unexpected.*amount/i],
      [{ ...input, bankBin: '970422' }, /unexpected.*bankBin/i],
      [{ ...input, metadata: { otp: '123456' } }, /credentials.*never accepted/i],
      [{ ...input, confirmed: false }, /confirm/i],
      [{ ...input, transferReference: 'bad ref with spaces' }, /transferReference/i],
      [{ ...input, transferredAt: '2026-07-23T10:00:00.001Z' }, /future/i],
      [{ ...input, note: 'short' }, /20-1000/i],
    ];
    for (const [payload, expectation] of rejectedInputs) {
      await assert.rejects(
        () => service.recordPayoutEvidence('staff-1', requestId, payload),
        expectation,
      );
    }
    assert.equal(repository.payoutEvidence.length, before);
  });

  it('rejects a late provider result after exact-operation reconciliation without overwriting the new state', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-late-result-001',
    });
    await service.reconcilePayoutOperation('staff-1', requestId, {
      operationKey: 'payos-late-result-001',
      outcome: 'Failed',
      transferReference: 'payos-payout-1',
      transferredAt: '2026-07-23T10:00:00.000Z',
      note: 'Bank statement confirms the original provider operation did not pay.',
      confirmed: true,
      idempotencyKey: 'manual-reconcile-late-result-001',
    });
    const before = structuredClone(repository.state);
    payosGateway.payout = {
      id: 'payos-payout-1',
      referenceId: repository.requests[0].requestCode,
      approvalState: 'SUCCEEDED',
      transactions: [{
        id: 'late-provider-success',
        state: 'SUCCEEDED',
        amount: 120,
        toBin: '970422',
        toAccountNumber: '0123456789',
        reference: 'BANK-LATE-001',
      }],
    };

    await assert.rejects(
      () => service.reconcilePayOSPayout('staff-1', requestId),
      (error) => error.statusCode === 409 && error.errorCode === 'PAYOUT_OPERATION_STALE',
    );
    assert.deepEqual(repository.state.refunds, before.refunds);
    assert.deepEqual(repository.state.requests, before.requests);
    assert.equal(repository.payoutEvidence.length, before.payoutEvidence.length);
  });

  it('preserves the original payOS operation identity across repeated Unknown reconciliation evidence', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const originalOperationKey = 'payos-operation-chain-001';
    await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: originalOperationKey,
    });

    payosGateway.payout = {
      id: 'payos-payout-chain', referenceId: repository.requests[0].requestCode, approvalState: 'UNRECOGNIZED',
      transactions: [{
        id: 'unknown-event-1', state: 'UNRECOGNIZED', amount: 120,
        toBin: '970422', toAccountNumber: '0123456789', reference: null,
      }],
    };
    const first = await service.reconcilePayOSPayout('staff-1', requestId);
    assert.equal(first.status, 'Unknown');

    payosGateway.payout.transactions[0].id = 'unknown-event-2';
    const second = await service.reconcilePayOSPayout('staff-1', requestId);
    assert.equal(second.status, 'Unknown');
    assert.equal(repository.refunds[0].payoutOperationKey, originalOperationKey);
    assert.equal(repository.payoutEvidence.length, 3);
    assert.deepEqual(repository.payoutEvidence.map((entry) => entry.payoutOperationKey), [
      originalOperationKey,
      originalOperationKey,
      originalOperationKey,
    ]);
    assert.deepEqual(repository.payoutEvidence.map((entry) => entry.evidenceKind), [
      'PAYOUT_EXECUTION',
      'OPERATION_RECONCILIATION',
      'OPERATION_RECONCILIATION',
    ]);
    assert.deepEqual(repository.payoutEvidence.map((entry) => entry.reconcilesOperationKey), [
      '',
      originalOperationKey,
      originalOperationKey,
    ]);
  });

  it('blocks false payOS completion when provider amount or destination differs from the verified snapshot', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    payosGateway.payout = {
      id: 'payos-payout-mismatch', referenceId: repository.requests[0].requestCode, approvalState: 'COMPLETED',
      transactions: [{
        id: 'payos-transaction-mismatch', state: 'SUCCEEDED', amount: 119,
        toBin: '970422', toAccountNumber: '9999999999', reference: 'BANK-WRONG-001',
      }],
    };
    const result = await service.startPayOSPayout('staff-1', requestId, {
      idempotencyKey: 'payos-start-mismatch-001',
    });
    assert.equal(result.status, 'Unknown');
    assert.equal(repository.requests[0].status, 'Received');
    assert.equal(repository.refunds[0].status, 'HandedOff');
    assert.equal(repository.orders[0].orderStatus, 'Delivered');
    assert.equal(repository.payoutIncidents.length, 1);
    assert.equal(repository.payoutIncidents[0].responsibility, 'ShopOrProvider');
    assert.equal(repository.payoutIncidents[0].status, 'Open');
  });

  it('does not let Staff fabricate payOS outcomes through the manual evidence endpoint', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        idempotencyKey: 'fake-payos-result-001', method: 'PAYOS', providerReference: 'fake-provider-ref',
        status: 'Succeeded', amount: 120, occurredAt: now,
      }),
      /unexpected.*method/i,
    );
    assert.equal(repository.payoutEvidence.length, 0);
    assert.equal(repository.requests[0].status, 'Received');
  });

  it('requires a reconciliation note for manual evidence', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        ...manualPayout({ idempotencyKey: 'payout-request-001' }),
        note: undefined,
      }),
      /note must be a string/i,
    );
  });

  it('atomically completes only from verified successful payout evidence and preserves primary Paid facts', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    const result = await service.recordPayoutEvidence(
      'staff-1',
      requestId,
      manualPayout({ idempotencyKey: 'payout-request-001', transferReference: 'bank-001' })
    );
    assert.equal(result.request.status, 'Completed');
    assert.equal(repository.refunds[0].status, 'Refunded');
    assert.equal(repository.orders[0].orderStatus, 'Returned');
    assert.equal(repository.orders[0].paymentStatus, 'Paid');
    assert.equal(repository.payments[0].paymentStatus, 'Paid');
    assert.equal(repository.attempts[0].paymentStatus, 'Paid');
    const replay = await service.recordPayoutEvidence(
      'staff-1',
      requestId,
      manualPayout({ idempotencyKey: 'payout-request-001', transferReference: 'bank-001' })
    );
    assert.equal(replay.replay, true);
    assert.equal(repository.payoutEvidence.length, 1);
    await assert.rejects(
      () => service.recordPayoutEvidence(
        'staff-1',
        requestId,
        manualPayout({
          idempotencyKey: 'payout-request-001',
          transferReference: 'different-bank-ref',
          note: 'Different manual bank transfer evidence.',
        })
      ),
      /idempotency key.*different/i,
    );
  });

  it('pays a cancellation refund without a warehouse receipt and keeps the cancelled order closed', async () => {
    repository.orders.push({
      _id: 'order-cancelled',
      orderCode: 'GH-CANCELLED-001',
      customerId: 'customer-1',
      totalAmount: 120,
      currency: 'VND',
      paymentMethod: 'ONLINE',
      paymentStatus: 'Paid',
      orderStatus: 'Cancelled',
      moneyObligationsSettled: false,
    });
    repository.payments.push({
      _id: 'payment-cancelled',
      orderId: 'order-cancelled',
      amount: 120,
      paymentStatus: 'Paid',
    });
    repository.attempts.push({
      _id: 'attempt-cancelled',
      orderId: 'order-cancelled',
      amount: 120,
      currency: 'VND',
      paymentStatus: 'Paid',
    });
    repository.requests.push({
      _id: 'request-cancelled',
      orderId: 'order-cancelled',
      requestCode: 'CAN-GH-CANCELLED-001',
      customerId: 'customer-1',
      reason: 'Customer cancellation: no longer needed',
      evidenceImages: [],
      status: 'ReadyForRefund',
      refundAmount: 120,
      requestedAt: now,
    });
    repository.refunds.push({
      _id: 'refund-cancelled',
      orderId: 'order-cancelled',
      paymentAttemptId: 'attempt-cancelled',
      customerId: 'customer-1',
      returnRefundRequestId: 'request-cancelled',
      amount: 120,
      currency: 'VND',
      reason: 'Customer cancellation: no longer needed',
      status: 'RefundPending',
      payoutStatus: 'NotStarted',
      obligationType: 'PAYMENT_REVERSAL',
      obligationKey: 'PAYMENT_REVERSAL:attempt-cancelled',
    });

    await submitAndVerifyDestination('request-cancelled');
    const result = await service.recordPayoutEvidence('staff-1', 'request-cancelled', manualPayout({
      idempotencyKey: 'cancel-refund-payout-001',
      transferReference: 'bank-cancel-refund-001',
      note: 'Verified cancellation refund receipt.',
    }));

    assert.equal(result.request.status, 'Completed');
    assert.equal(repository.refunds.at(-1).status, 'Refunded');
    assert.equal(repository.orders.at(-1).orderStatus, 'Cancelled');
    assert.equal(repository.orders.at(-1).paymentStatus, 'Paid');
    assert.equal(repository.orders.at(-1).moneyObligationsSettled, true);
  });

  it('keeps DeliveryFailed after its independent failed-delivery payout succeeds', async () => {
    repository.orders.push({
      _id: 'order-delivery-failed',
      orderCode: 'GH-DELIVERY-FAILED-001',
      customerId: 'customer-1',
      totalAmount: 120,
      currency: 'VND',
      paymentMethod: 'ONLINE',
      paymentStatus: 'Paid',
      orderStatus: 'DeliveryFailed',
      moneyObligationsSettled: false,
    });
    repository.payments.push({
      _id: 'payment-delivery-failed',
      orderId: 'order-delivery-failed',
      amount: 120,
      paymentStatus: 'Paid',
    });
    repository.attempts.push({
      _id: 'attempt-delivery-failed',
      orderId: 'order-delivery-failed',
      amount: 120,
      currency: 'VND',
      paymentStatus: 'Paid',
    });
    repository.requests.push({
      _id: 'request-delivery-failed',
      orderId: 'order-delivery-failed',
      requestCode: 'FD-GH-DELIVERY-FAILED-001',
      customerId: 'customer-1',
      reason: 'Terminal failed delivery resolution',
      evidenceImages: [],
      status: 'ReadyForRefund',
      refundAmount: 120,
      requestedAt: now,
      obligationKey: 'FAILED_DELIVERY:incident-1:attempt-delivery-failed',
    });
    repository.refunds.push({
      _id: 'refund-delivery-failed',
      orderId: 'order-delivery-failed',
      paymentAttemptId: 'attempt-delivery-failed',
      customerId: 'customer-1',
      returnRefundRequestId: 'request-delivery-failed',
      amount: 120,
      currency: 'VND',
      reason: 'Terminal failed delivery resolution',
      status: 'RefundPending',
      payoutStatus: 'NotStarted',
      obligationType: 'FAILED_DELIVERY',
      obligationKey: 'FAILED_DELIVERY:incident-1:attempt-delivery-failed',
    });
    repository.releaseOrderLock = async () => {
      assert.fail('FAILED_DELIVERY is not an after-sales Returned lock lifecycle');
    };

    await submitAndVerifyDestination('request-delivery-failed');
    const result = await service.recordPayoutEvidence('staff-1', 'request-delivery-failed', manualPayout({
      idempotencyKey: 'failed-delivery-payout-001',
      transferReference: 'bank-failed-delivery-001',
      note: 'Verified failed-delivery refund receipt.',
    }));

    assert.equal(result.request.status, 'Completed');
    assert.equal(repository.refunds.at(-1).status, 'Refunded');
    assert.equal(repository.orders.at(-1).orderStatus, 'DeliveryFailed');
    assert.equal(repository.orders.at(-1).paymentStatus, 'Paid');
    assert.equal(repository.orders.at(-1).moneyObligationsSettled, true);
  });

  it('opens Customer-responsibility recovery without creating an automatic second payout for the exact confirmed destination', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.recordPayoutEvidence('staff-1', requestId, manualPayout({
      idempotencyKey: 'payout-customer-destination-001',
      transferReference: 'bank-customer-001',
      note: 'Transfer receipt was verified against the bank statement.',
    }));
    const incident = await service.reportPayoutIncident('staff-1', requestId, {
      idempotencyKey: 'incident-customer-destination-001',
      cause: 'CUSTOMER_CONFIRMED_DESTINATION',
      reason: 'Customer reported that the confirmed account number was entered incorrectly',
    });
    assert.equal(incident.responsibility, 'Customer');
    assert.equal(incident.status, 'Open');
    assert.equal(repository.requests[0].status, 'Completed');
    assert.equal(repository.refunds[0].status, 'Refunded');
    assert.equal(repository.orders[0].orderStatus, 'Returned');
    assert.equal(repository.payoutEvidence.length, 1);
    await assert.rejects(
      () => service.startPayOSPayout('staff-1', requestId, { idempotencyKey: 'payos-second-payout-001' }),
      (error) => error.statusCode === 409 && error.errorCode === 'PAYOUT_TERMINAL_NO_RETRY',
    );
    assert.equal(payosGateway.calls.length, 0);
  });

  it('keeps a successful payout terminal when a Shop/provider mismatch incident is reported', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await service.recordPayoutEvidence('staff-1', requestId, {
      idempotencyKey: 'payout-misroute-original-001',
      transferReference: 'BANK-MISROUTE-001',
      transferredAt: '2026-07-23T10:00:00.000Z',
      note: 'Initial transfer receipt was later disputed by reconciliation.',
      confirmed: true,
    });
    const terminal = structuredClone(repository.state);
    const providerCalls = payosGateway.calls.length;
    const incident = await service.reportPayoutIncident('staff-1', requestId, {
      idempotencyKey: 'incident-system-mismatch-001',
      cause: 'STAFF_SYSTEM_PROVIDER_MISMATCH',
      reason: 'Bank reconciliation proved that the transfer was routed to a different account',
    });
    assert.equal(incident.responsibility, 'ShopOrProvider');
    assert.equal(repository.requests[0].status, 'Completed');
    assert.equal(repository.requests[0].completionEvidenceId, terminal.requests[0].completionEvidenceId);
    assert.equal(repository.refunds[0].status, 'Refunded');
    assert.equal(repository.refunds[0].payoutStatus, 'Succeeded');
    assert.equal(repository.refunds[0].payoutOperationKey, terminal.refunds[0].payoutOperationKey);
    assert.equal(repository.orders[0].orderStatus, 'Returned');
    assert.equal(repository.payoutEvidence.length, 1);

    await assert.rejects(
      () => service.startPayOSPayout('staff-1', requestId, {
        idempotencyKey: 'payos-corrective-forbidden-001',
        recoveryIncidentId: incident.id,
      }),
      (error) => error.statusCode === 409 && error.errorCode === 'PAYOUT_TERMINAL_NO_RETRY',
    );
    await assert.rejects(
      () => service.recordPayoutEvidence('staff-1', requestId, {
        idempotencyKey: 'manual-corrective-forbidden-001',
        transferReference: 'BANK-CORRECTIVE-FORBIDDEN-001',
        transferredAt: '2026-07-23T10:00:00.000Z',
        note: 'A terminal successful obligation must never be paid twice.',
        confirmed: true,
      }),
      (error) => error.statusCode === 409 && error.errorCode === 'PAYOUT_TERMINAL_NO_RETRY',
    );
    assert.equal(repository.payoutEvidence.length, 1);
    assert.equal(payosGateway.calls.length, providerCalls);
  });

  it('never permits note-only completion without successful payout evidence', async () => {
    const requestId = await prepareReceivedRequest({ verifyDestination: true });
    await assert.rejects(
      () => service.completeRefund('staff-1', requestId, { note: 'Trust me' }),
      /successful payout evidence/i,
    );
    assert.equal(repository.requests[0].status, 'Received');
    assert.equal(repository.orders[0].orderStatus, 'Delivered');
  });
});
