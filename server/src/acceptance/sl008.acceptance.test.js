const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReviewService } = require('../services/review.service');
const { createSupportService } = require('../services/support.service');

const actors = {
  guest: { id: null, role: 'Guest' },
  customer: { id: 'customer-1', role: 'Customer' },
  foreignCustomer: { id: 'customer-2', role: 'Customer' },
  staffA: { id: 'staff-a', role: 'Staff', status: 'Active' },
  staffB: { id: 'staff-b', role: 'Staff', status: 'Active' },
  inactiveStaff: { id: 'staff-disabled', role: 'Staff', status: 'Disabled' },
  admin: { id: 'admin-1', role: 'Admin' },
  warehouse: { id: 'warehouse-1', role: 'WarehouseManager' },
};

function requiredMethod(service, name) {
  assert.equal(
    typeof service[name],
    'function',
    `SL-008 service must expose ${name}()`,
  );
  return service[name].bind(service);
}

async function expectDomainError(work, errorCode) {
  const error = await work().then(
    () => null,
    (caught) => caught,
  );
  assert.ok(error, `expected ${errorCode}`);
  assert.equal(error.errorCode, errorCode);
  return error;
}

function snapshotEffects(state) {
  return {
    reviews: state.reviews?.length || 0,
    tickets: state.tickets?.length || 0,
    messages: state.messages?.length || 0,
    contentHistory: state.contentHistory?.length || 0,
    publicationHistory: state.publicationHistory?.length || 0,
    moderationHistory: state.moderationHistory?.length || 0,
    assignmentHistory: state.assignmentHistory?.length || 0,
    priorityHistory: state.priorityHistory?.length || 0,
    resolutionHistory: state.resolutionHistory?.length || 0,
    commands: state.commands?.length || 0,
    audits: state.audits.length,
    outbox: state.outbox.length,
  };
}

function transactionManagerFor(state) {
  return {
    async withTransaction(work) {
      const snapshot = structuredClone(state);
      try {
        return await work({ id: `session-${state.transactions + 1}` });
      } catch (error) {
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, snapshot);
        throw error;
      } finally {
        state.transactions += 1;
      }
    },
  };
}

function buildReviewFixture({ now = '2026-07-24T12:00:00.000Z' } = {}) {
  const state = {
    products: [
      { id: 'product-1', categoryId: 'category-1', status: 'Active' },
      { id: 'product-inactive', categoryId: 'category-1', status: 'Inactive' },
      { id: 'product-hidden-category', categoryId: 'category-inactive', status: 'Active' },
    ],
    categories: [
      { id: 'category-1', status: 'Active' },
      { id: 'category-inactive', status: 'Inactive' },
    ],
    users: [
      { id: 'customer-1', displayName: 'Nguyen Thi Minh Anh', status: 'Active' },
      { id: 'customer-2', displayName: 'Tran Van Binh', status: 'Active' },
      { id: 'customer-3', displayName: 'Ánh', status: 'Active' },
      { ...actors.staffA },
      { ...actors.staffB },
      { ...actors.inactiveStaff },
    ],
    orders: [
      { id: 'order-old', customerId: 'customer-1', deliveredAt: new Date('2026-07-20T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-new', customerId: 'customer-1', deliveredAt: new Date('2026-07-22T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-tie', customerId: 'customer-1', deliveredAt: new Date('2026-07-22T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-foreign', customerId: 'customer-2', deliveredAt: new Date('2026-07-23T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-undelivered', customerId: 'customer-1', deliveredAt: null, status: 'Shipped' },
    ],
    orderDetails: [
      // Deliberately shuffled: fallback ordering must not inherit repository insertion order.
      { id: 'detail-010', orderId: 'order-new', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-foreign', orderId: 'order-foreign', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-001', orderId: 'order-old', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-undelivered', orderId: 'order-undelivered', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-011', orderId: 'order-tie', productId: 'product-1', sku: 'SKU-1' },
    ],
    reviews: [],
    contentHistory: [],
    publicationHistory: [],
    moderationHistory: [],
    commands: [],
    audits: [],
    outbox: [],
    transactions: 0,
    nextReview: 1,
  };

  const repository = {
    async findProductById(id) {
      return state.products.find((item) => item.id === String(id)) || null;
    },
    async findCategoryById(id) {
      return state.categories.find((item) => item.id === String(id)) || null;
    },
    async findUserById(id) {
      return state.users.find((item) => item.id === String(id)) || null;
    },
    async findOrderById(id) {
      return state.orders.find((item) => item.id === String(id)) || null;
    },
    async findOrderDetailById(id) {
      return state.orderDetails.find((item) => item.id === String(id)) || null;
    },
    async listOwnedDeliveredOrderDetails(customerId, productId) {
      return state.orderDetails
        .filter((detail) => detail.productId === String(productId))
        .map((detail) => ({
          ...detail,
          order: state.orders.find((order) => order.id === detail.orderId),
        }))
        .filter((detail) => detail.order?.customerId === String(customerId) && detail.order.deliveredAt);
    },
    async findReviewByIdentity(customerId, productId) {
      return state.reviews.find(
        (item) => item.customerId === String(customerId) && item.productId === String(productId),
      ) || null;
    },
    async findReviewById(id) {
      return state.reviews.find((item) => item.id === String(id)) || null;
    },
    async insertReview(data) {
      const review = {
        id: data.id || `review-${state.nextReview++}`,
        version: 1,
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        ...structuredClone(data),
      };
      state.reviews.push(review);
      return structuredClone(review);
    },
    async createReview(data) {
      return this.insertReview(data);
    },
    async updateReviewByVersion(id, expectedVersion, changes) {
      const review = state.reviews.find(
        (item) => item.id === String(id) && item.version === Number(expectedVersion),
      );
      if (!review) return null;
      Object.assign(review, structuredClone(changes), { version: review.version + 1 });
      return structuredClone(review);
    },
    async appendContentHistory(entry) {
      state.contentHistory.push(structuredClone(entry));
      return entry;
    },
    async appendPublicationHistory(entry) {
      state.publicationHistory.push(structuredClone(entry));
      return entry;
    },
    async appendModerationHistory(entry) {
      state.moderationHistory.push(structuredClone(entry));
      return entry;
    },
    async findCommand(actorId, key) {
      return state.commands.find(
        (item) => item.actorId === String(actorId) && item.idempotencyKey === key,
      ) || null;
    },
    async recordCommand(command) {
      state.commands.push(structuredClone(command));
      return command;
    },
    async listPublicReviews(productId) {
      return state.reviews.filter((review) => review.productId === String(productId));
    },
  };

  const auditLogger = {
    async log(entry) {
      state.audits.push(structuredClone(entry));
    },
  };
  const outbox = {
    failNext: false,
    failDeliveryNext: false,
    async enqueue(entry) {
      if (this.failNext) {
        this.failNext = false;
        const error = new Error('outbox persistence unavailable');
        error.errorCode = 'OUTBOX_WRITE_FAILED';
        throw error;
      }
      state.outbox.push({
        ...structuredClone(entry),
        status: 'Pending',
        attempts: 0,
      });
    },
    async deliverNext() {
      const event = state.outbox.find((item) => item.status === 'Pending');
      if (!event) return null;
      event.attempts += 1;
      if (this.failDeliveryNext) {
        this.failDeliveryNext = false;
        const error = new Error('outbox delivery unavailable');
        error.errorCode = 'OUTBOX_DELIVERY_FAILED';
        throw error;
      }
      event.status = 'Delivered';
      return structuredClone(event);
    },
  };
  const clock = {
    value: new Date(now),
    now() {
      return new Date(this.value);
    },
    set(value) {
      this.value = new Date(value);
    },
  };
  const transactionManager = transactionManagerFor(state);
  const service = createReviewService({
    repository,
    transactionManager,
    auditLogger,
    outbox,
    outboxRepository: outbox,
    clock,
    now: () => clock.now(),
  });

  return { state, repository, auditLogger, outbox, clock, transactionManager, service };
}

function reviewCommand(overrides = {}) {
  return {
    rating: 5,
    content: 'Very useful product',
    orderDetailId: 'detail-001',
    expectedVersion: 0,
    idempotencyKey: 'review-create-0001',
    ...overrides,
  };
}

function buildSupportFixture({ now = '2026-07-24T12:00:00.000Z' } = {}) {
  const state = {
    users: [
      { ...actors.customer },
      { ...actors.foreignCustomer },
      { ...actors.staffA },
      { ...actors.staffB },
      { ...actors.inactiveStaff },
    ],
    products: [
      { id: 'product-1', status: 'Active' },
      { id: 'product-2', status: 'Active' },
      { id: 'product-inactive', status: 'Inactive' },
    ],
    orders: [
      { id: 'order-1', customerId: 'customer-1' },
      { id: 'order-foreign', customerId: 'customer-2' },
    ],
    orderDetails: [
      { id: 'detail-1', orderId: 'order-1', productId: 'product-1' },
    ],
    tickets: [],
    messages: [],
    assignmentHistory: [],
    priorityHistory: [],
    resolutionHistory: [],
    commands: [],
    audits: [],
    outbox: [],
    transactions: 0,
    nextTicket: 1,
    nextMessage: 1,
    foreignDomains: {
      orders: [{ id: 'order-1', status: 'Delivered' }],
      payments: [{ id: 'payment-1', status: 'Paid' }],
      returns: [{ id: 'return-1', status: 'Approved' }],
      exchanges: [{ id: 'exchange-1', status: 'Completed' }],
      shipments: [{ id: 'shipment-1', status: 'Delivered' }],
      inventory: [{ productId: 'product-1', available: 8 }],
    },
    sessionRevocations: [],
  };

  const repository = {
    async findUserById(id) {
      return state.users.find((item) => item.id === String(id)) || null;
    },
    async findProductById(id) {
      return state.products.find((item) => item.id === String(id)) || null;
    },
    async findOrderById(id) {
      return state.orders.find((item) => item.id === String(id)) || null;
    },
    async findOrderDetail(orderId, productId) {
      return state.orderDetails.find(
        (item) => item.orderId === String(orderId) && item.productId === String(productId),
      ) || null;
    },
    async findTicketById(id) {
      return state.tickets.find((item) => item.id === String(id)) || null;
    },
    async findRequestById(id) {
      return this.findTicketById(id);
    },
    async insertTicket(data) {
      const number = state.nextTicket++;
      const ticket = {
        id: data.id || `ticket-${number}`,
        ticketCode: data.ticketCode || `SUP-20260724-${String(number).padStart(4, '0')}`,
        version: 1,
        status: 'New',
        assigneeId: null,
        priority: 'Normal',
        ...structuredClone(data),
      };
      state.tickets.push(ticket);
      return structuredClone(ticket);
    },
    async createRequest(data) {
      return this.insertTicket(data);
    },
    async updateTicketByVersion(id, expectedVersion, changes) {
      const ticket = state.tickets.find(
        (item) => item.id === String(id) && item.version === Number(expectedVersion),
      );
      if (!ticket) return null;
      Object.assign(ticket, structuredClone(changes), { version: ticket.version + 1 });
      return structuredClone(ticket);
    },
    async appendMessage(entry) {
      const message = {
        id: entry.id || `message-${state.nextMessage++}`,
        createdAt: entry.createdAt || new Date(),
        ...structuredClone(entry),
      };
      state.messages.push(message);
      return structuredClone(message);
    },
    async appendAssignmentHistory(entry) {
      state.assignmentHistory.push(structuredClone(entry));
      return entry;
    },
    async appendPriorityHistory(entry) {
      state.priorityHistory.push(structuredClone(entry));
      return entry;
    },
    async appendResolutionHistory(entry) {
      state.resolutionHistory.push(structuredClone(entry));
      return entry;
    },
    async findCommand(actorId, key) {
      return state.commands.find(
        (item) => item.actorId === String(actorId) && item.idempotencyKey === key,
      ) || null;
    },
    async recordCommand(command) {
      state.commands.push(structuredClone(command));
      return command;
    },
    async listTickets(filter = {}) {
      return state.tickets.filter((ticket) => Object.entries(filter).every(
        ([key, value]) => value === undefined || ticket[key] === value,
      ));
    },
    async listMessages(ticketId) {
      return state.messages.filter((item) => item.ticketId === String(ticketId));
    },
  };

  const auditLogger = {
    async log(entry) {
      state.audits.push(structuredClone(entry));
    },
  };
  const outbox = {
    failNext: false,
    failDeliveryNext: false,
    async enqueue(entry) {
      if (this.failNext) {
        this.failNext = false;
        const error = new Error('outbox persistence unavailable');
        error.errorCode = 'OUTBOX_WRITE_FAILED';
        throw error;
      }
      state.outbox.push({
        ...structuredClone(entry),
        status: 'Pending',
        attempts: 0,
      });
    },
    async deliverNext() {
      const event = state.outbox.find((item) => item.status === 'Pending');
      if (!event) return null;
      event.attempts += 1;
      if (this.failDeliveryNext) {
        this.failDeliveryNext = false;
        const error = new Error('outbox delivery unavailable');
        error.errorCode = 'OUTBOX_DELIVERY_FAILED';
        throw error;
      }
      event.status = 'Delivered';
      return structuredClone(event);
    },
  };
  const clock = {
    value: new Date(now),
    now() {
      return new Date(this.value);
    },
    set(value) {
      this.value = new Date(value);
    },
    advance(milliseconds) {
      this.value = new Date(this.value.getTime() + milliseconds);
    },
  };
  const transactionManager = transactionManagerFor(state);
  const assignmentCoordinator = {
    async coordinate({ userId }) {
      return state.users.find(
        (item) => item.id === String(userId) && item.role === 'Staff' && item.status === 'Active',
      ) || null;
    },
  };
  function mutationGateway(method) {
    return {
      calls: [],
      async [method](...args) {
        this.calls.push({ method, args: structuredClone(args) });
      },
    };
  }
  const foreignMutationGateways = {
    order: mutationGateway('updateStatus'),
    payment: mutationGateway('refund'),
    returnRefund: mutationGateway('updateDisposition'),
    exchange: mutationGateway('updateStatus'),
    shipment: mutationGateway('reschedule'),
    inventory: mutationGateway('reserve'),
  };
  const sl007SessionService = {
    calls: [],
    async revokeAllForUser(userId, reason) {
      this.calls.push({ userId: String(userId), reason });
      state.sessionRevocations.push({
        userId: String(userId),
        signal: 'SL007_SESSIONS_REVOKED',
        reason,
        occurredAt: clock.now(),
      });
      return { revokedCount: 2 };
    },
  };
  const sl007Lifecycle = {
    async disableStaff(userId, clearAssignment) {
      await sl007SessionService.revokeAllForUser(userId, 'ACCOUNT_DISABLED');
      return clearAssignment(String(userId), {
        idempotencyKey: `sl007-disable-${userId}`,
      });
    },
  };
  const service = createSupportService({
    repository,
    transactionManager,
    auditLogger,
    outbox,
    outboxRepository: outbox,
    clock,
    now: () => clock.now(),
    assignmentCoordinator,
    orderCommandGateway: foreignMutationGateways.order,
    paymentCommandGateway: foreignMutationGateways.payment,
    returnRefundCommandGateway: foreignMutationGateways.returnRefund,
    exchangeCommandGateway: foreignMutationGateways.exchange,
    shipmentCommandGateway: foreignMutationGateways.shipment,
    inventoryCommandGateway: foreignMutationGateways.inventory,
  });

  return {
    state,
    repository,
    auditLogger,
    outbox,
    clock,
    transactionManager,
    assignmentCoordinator,
    foreignMutationGateways,
    sl007SessionService,
    sl007Lifecycle,
    service,
  };
}

function supportCreate(overrides = {}) {
  return {
    type: 'Order',
    subject: 'Delivery package issue',
    initialMessage: 'The delivered package needs support.',
    orderId: 'order-1',
    expectedVersion: 0,
    idempotencyKey: 'support-create-0001',
    ...overrides,
  };
}

async function createSupportTicket(fixture, overrides = {}) {
  const createRequest = requiredMethod(fixture.service, 'createRequest');
  return createRequest(actors.customer, supportCreate(overrides));
}

async function claimSupportTicket(fixture, ticket, actor = actors.staffA, overrides = {}) {
  const claim = requiredMethod(fixture.service, 'claim');
  return claim(actor, ticket.id, {
    expectedVersion: ticket.version,
    idempotencyKey: `support-claim-${actor.id}-0001`,
    ...overrides,
  });
}

describe('SL-008 Review behavioral acceptance', () => {
  it('AT-150 creates one Review atomically from the exact owned delivered OrderDetail', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');

    const result = await createReview(actors.customer, 'product-1', reviewCommand());

    assert.equal(result.orderDetailId, 'detail-001');
    assert.equal(result.customerId, actors.customer.id);
    assert.equal(fixture.state.reviews.length, 1);
    assert.equal(fixture.state.contentHistory.length, 1);
    assert.equal(fixture.state.audits.length, 1);
    assert.equal(fixture.state.outbox.length, 1);
    assert.equal(fixture.state.outbox[0].eventType, 'REVIEW_CREATED');
  });

  it('AT-151 deterministically falls back by deliveredAt DESC then OrderDetail ID DESC', async () => {
    const tieFixture = buildReviewFixture();
    const createWithTie = requiredMethod(tieFixture.service, 'createReview');

    const tieResult = await createWithTie(
      actors.customer,
      'product-1',
      reviewCommand({ orderDetailId: undefined }),
    );
    assert.equal(tieResult.orderDetailId, 'detail-011');

    const deliveredAtFixture = buildReviewFixture();
    deliveredAtFixture.state.orderDetails = deliveredAtFixture.state.orderDetails.filter(
      (detail) => detail.id !== 'detail-011',
    );
    const createWithoutTie = requiredMethod(deliveredAtFixture.service, 'createReview');
    const deliveredAtResult = await createWithoutTie(
      actors.customer,
      'product-1',
      reviewCommand({
        orderDetailId: undefined,
        idempotencyKey: 'review-fallback-delivered-at-0001',
      }),
    );
    assert.equal(deliveredAtResult.orderDetailId, 'detail-010');
  });

  it('AT-152 keeps one Customer+Product identity across repeat purchases', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const updateReview = requiredMethod(fixture.service, 'updateReview');
    const created = await createReview(actors.customer, 'product-1', reviewCommand());
    const before = snapshotEffects(fixture.state);

    const duplicate = await expectDomainError(
      () => createReview(
        actors.customer,
        'product-1',
        reviewCommand({
          orderDetailId: 'detail-011',
          idempotencyKey: 'review-create-repeat-0002',
        }),
      ),
      'REVIEW_ALREADY_EXISTS',
    );

    assert.deepEqual(snapshotEffects(fixture.state), before);
    assert.equal(fixture.state.reviews.length, 1);
    assert.equal(duplicate.data.review.id, created.id);
    assert.equal(duplicate.data.review.version, created.version);
    assert.equal(duplicate.data.review.publicationStatus, 'Published');
    assert.equal(duplicate.data.review.moderationStatus, 'Allowed');

    const updated = await updateReview(actors.customer, duplicate.data.review.id, {
      rating: 4,
      content: 'Updated from the existing Review identity.',
      expectedVersion: duplicate.data.review.version,
      idempotencyKey: 'review-existing-identity-update-0001',
    });
    assert.equal(updated.id, created.id);
    assert.equal(fixture.state.reviews.length, 1);
  });

  it('AT-153 preserves Review identity after return/refund and same-SKU exchange changes', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    const created = await createReview(actors.customer, 'product-1', reviewCommand());
    const originalHistory = structuredClone(fixture.state.contentHistory);
    fixture.state.orders.find((item) => item.id === 'order-old').status = 'Returned';
    fixture.state.returnRefunds = [{
      id: 'return-refund-later',
      orderId: 'order-old',
      orderDetailId: 'detail-001',
      status: 'Refunded',
    }];
    fixture.state.exchanges = [{
      id: 'exchange-same-sku',
      sourceOrderDetailId: 'detail-001',
      replacementOrderDetailId: 'detail-exchange',
      sku: 'SKU-1',
      status: 'Completed',
    }];
    fixture.state.orderDetails.push({
      id: 'detail-exchange',
      orderId: 'order-new',
      productId: 'product-1',
      sku: 'SKU-1',
      source: 'Exchange',
    });

    const beforeSecondCreate = snapshotEffects(fixture.state);
    const duplicate = await expectDomainError(
      () => createReview(actors.customer, 'product-1', reviewCommand({
        orderDetailId: 'detail-exchange',
        idempotencyKey: 'review-after-sales-second-create-0001',
      })),
      'REVIEW_ALREADY_EXISTS',
    );
    const publicPage = await listPublic('product-1', { page: 1, pageSize: 20 });

    assert.deepEqual(snapshotEffects(fixture.state), beforeSecondCreate);
    assert.equal(fixture.state.reviews.length, 1);
    assert.equal(fixture.state.reviews[0].id, created.id);
    assert.equal(fixture.state.reviews[0].orderDetailId, 'detail-001');
    assert.deepEqual(fixture.state.contentHistory, originalHistory);
    assert.equal(duplicate.data.review.id, created.id);
    assert.equal(duplicate.data.review.orderDetailId, 'detail-001');
    assert.equal(publicPage.total, 1);
  });

  it('AT-154 enforces every integer rating and normalized optional-text boundary', async (t) => {
    const validCases = [
      { rating: 1, content: '' },
      { rating: 5, content: 'x'.repeat(1000) },
      { rating: 3, content: '  normalized text  ', expected: 'normalized text' },
    ];
    for (const [index, input] of validCases.entries()) {
      await t.test(`valid boundary ${index + 1}`, async () => {
        const fixture = buildReviewFixture();
        const createReview = requiredMethod(fixture.service, 'createReview');
        const result = await createReview(
          actors.customer,
          'product-1',
          reviewCommand({ ...input, idempotencyKey: `review-valid-${index}-0001` }),
        );
        assert.equal(result.rating, input.rating);
        assert.equal(result.content, input.expected ?? input.content);
      });
    }

    const invalidCases = [
      { rating: 0, content: '' },
      { rating: 6, content: '' },
      { rating: 1.5, content: '' },
      { rating: 'five', content: '' },
      { rating: undefined, content: '' },
      { rating: 5, content: 'x'.repeat(1001) },
    ];
    for (const [index, input] of invalidCases.entries()) {
      await t.test(`invalid boundary ${index + 1}`, async () => {
        const fixture = buildReviewFixture();
        const createReview = requiredMethod(fixture.service, 'createReview');
        await expectDomainError(
          () => createReview(
            actors.customer,
            'product-1',
            reviewCommand({ ...input, idempotencyKey: `review-invalid-${index}-0001` }),
          ),
          'REVIEW_VALIDATION_FAILED',
        );
        assert.deepEqual(snapshotEffects(fixture.state), {
          reviews: 0,
          tickets: 0,
          messages: 0,
          contentHistory: 0,
          publicationHistory: 0,
          moderationHistory: 0,
          assignmentHistory: 0,
          priorityHistory: 0,
          resolutionHistory: 0,
          commands: 0,
          audits: 0,
          outbox: 0,
        });
      });
    }
  });

  it('AT-155 denies invalid, foreign, and non-delivered eligibility without effects or disclosure', async () => {
    const cases = [
      { actor: actors.customer, productId: 'product-1', orderDetailId: 'missing-detail' },
      { actor: actors.customer, productId: 'product-1', orderDetailId: 'detail-foreign' },
      { actor: actors.customer, productId: 'product-1', orderDetailId: 'detail-undelivered' },
      { actor: actors.customer, productId: 'missing-product', orderDetailId: 'detail-001' },
      { actor: actors.foreignCustomer, productId: 'product-1', orderDetailId: 'detail-001' },
    ];
    for (const [index, testCase] of cases.entries()) {
      const fixture = buildReviewFixture();
      const createReview = requiredMethod(fixture.service, 'createReview');
      const before = snapshotEffects(fixture.state);
      const error = await expectDomainError(
        () => createReview(
          testCase.actor,
          testCase.productId,
          reviewCommand({
            orderDetailId: testCase.orderDetailId,
            idempotencyKey: `review-denied-${index}-0001`,
          }),
        ),
        'REVIEW_NOT_ELIGIBLE',
      );
      assert.equal(error.statusCode, 404);
      assert.equal(error.data?.orderId, undefined);
      assert.equal(error.data?.orderDetailId, undefined);
      assert.equal(error.data?.productId, undefined);
      assert.equal(error.data?.customerId, undefined);
      assert.deepEqual(snapshotEffects(fixture.state), before);
    }
  });

  it('AT-156 returns only masked verified public DTO fields under Active Product+Category', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    await createReview(actors.customer, 'product-1', reviewCommand());
    await fixture.repository.insertReview({
      id: 'review-unicode-name',
      customerId: 'customer-3',
      productId: 'product-1',
      orderDetailId: 'detail-011',
      rating: 4,
      content: 'Unicode one-token display name',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      updatedAt: new Date('2026-07-23T12:00:00.000Z'),
    });

    const result = await listPublic('product-1', { page: 1, pageSize: 20 });

    for (const item of result.items) {
      assert.deepEqual(Object.keys(item).sort(), [
        'content',
        'createdAt',
        'displayName',
        'rating',
        'updatedAt',
        'verifiedPurchase',
      ]);
      assert.equal(item.verifiedPurchase, true);
    }
    assert.equal(
      result.items.find((item) => item.content === 'Very useful product').displayName,
      'Anh N.',
    );
    assert.equal(
      result.items.find((item) => item.content === 'Unicode one-token display name').displayName,
      'Á***',
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /customerId|orderId|orderDetailId|email|phone|moderationReason|staffId/,
    );

    fixture.state.products[0].status = 'Inactive';
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 0);
    fixture.state.products[0].status = 'Active';
    fixture.state.categories[0].status = 'Inactive';
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 0);
  });

  it('AT-157 keeps Customer publication independent from Staff moderation', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const setPublication = requiredMethod(fixture.service, 'setPublication');
    const moderate = requiredMethod(fixture.service, 'moderate');
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    const created = await createReview(actors.customer, 'product-1', reviewCommand());

    const withdrawn = await setPublication(actors.customer, created.id, {
      publicationStatus: 'Withdrawn',
      expectedVersion: created.version,
      idempotencyKey: 'review-withdraw-0001',
    });
    assert.equal(withdrawn.publicationStatus, 'Withdrawn');
    assert.equal(withdrawn.moderationStatus, 'Allowed');
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 0);

    const hidden = await moderate(actors.staffA, created.id, {
      moderationStatus: 'HiddenByStaff',
      reason: 'Contains prohibited promotional content',
      expectedVersion: withdrawn.version,
      idempotencyKey: 'review-moderate-0001',
    });
    assert.equal(hidden.publicationStatus, 'Withdrawn');
    assert.equal(hidden.moderationStatus, 'HiddenByStaff');
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 0);

    const republishedWhileHidden = await setPublication(actors.customer, created.id, {
      publicationStatus: 'Published',
      expectedVersion: hidden.version,
      idempotencyKey: 'review-republish-0001',
    });
    assert.equal(republishedWhileHidden.publicationStatus, 'Published');
    assert.equal(republishedWhileHidden.moderationStatus, 'HiddenByStaff');
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 0);

    const restored = await moderate(actors.staffA, created.id, {
      moderationStatus: 'Allowed',
      reason: 'Rechecked and approved for public display',
      expectedVersion: republishedWhileHidden.version,
      idempotencyKey: 'review-restore-0001',
    });
    assert.equal(restored.publicationStatus, 'Published');
    assert.equal(restored.moderationStatus, 'Allowed');
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 1);
    assert.equal(fixture.state.publicationHistory.length, 2);
    assert.equal(fixture.state.moderationHistory.length, 2);
  });

  it('AT-158 appends immutable histories and exposes no delete or Staff content edit', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const updateReview = requiredMethod(fixture.service, 'updateReview');
    const setPublication = requiredMethod(fixture.service, 'setPublication');
    const moderate = requiredMethod(fixture.service, 'moderate');
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    const created = await createReview(actors.customer, 'product-1', reviewCommand());
    const originalContentHistory = structuredClone(fixture.state.contentHistory);

    const hidden = await moderate(actors.staffA, created.id, {
      moderationStatus: 'HiddenByStaff',
      reason: 'Temporarily hidden for policy review',
      expectedVersion: created.version,
      idempotencyKey: 'review-history-hide-0001',
    });
    const withdrawn = await setPublication(actors.customer, created.id, {
      publicationStatus: 'Withdrawn',
      expectedVersion: hidden.version,
      idempotencyKey: 'review-history-withdraw-0001',
    });
    const firstModeration = structuredClone(fixture.state.moderationHistory[0]);
    const firstPublication = structuredClone(fixture.state.publicationHistory[0]);

    const updated = await updateReview(actors.customer, created.id, {
      rating: 4,
      content: 'Updated customer content',
      expectedVersion: withdrawn.version,
      idempotencyKey: 'review-update-0001',
    });
    assert.equal(updated.moderationStatus, 'HiddenByStaff');
    assert.equal(updated.publicationStatus, 'Withdrawn');
    assert.equal((await listPublic('product-1', { page: 1, pageSize: 20 })).total, 0);
    const updatedContentHistory = structuredClone(fixture.state.contentHistory.at(-1));

    const republished = await setPublication(actors.customer, created.id, {
      publicationStatus: 'Published',
      expectedVersion: updated.version,
      idempotencyKey: 'review-history-republish-0001',
    });
    const restored = await moderate(actors.staffA, created.id, {
      moderationStatus: 'Allowed',
      reason: 'Policy review completed',
      expectedVersion: republished.version,
      idempotencyKey: 'review-history-restore-0001',
    });
    await expectDomainError(
      () => updateReview(actors.staffA, created.id, {
        rating: 1,
        content: 'Staff overwrite',
        expectedVersion: restored.version,
        idempotencyKey: 'review-staff-edit-0001',
      }),
      'REVIEW_FORBIDDEN',
    );

    assert.equal(typeof fixture.service.deleteReview, 'undefined');
    assert.equal(fixture.state.reviews.length, 1);
    assert.deepEqual(
      fixture.state.contentHistory.slice(0, originalContentHistory.length),
      originalContentHistory,
    );
    assert.equal(fixture.state.contentHistory.at(-1).rating, 4);
    assert.equal(updatedContentHistory.actorId, actors.customer.id);
    assert.ok(updatedContentHistory.createdAt);
    assert.equal(firstPublication.actorId, actors.customer.id);
    assert.ok(firstPublication.createdAt);
    assert.equal(firstModeration.actorId, actors.staffA.id);
    assert.equal(firstModeration.reason, 'Temporarily hidden for policy review');
    assert.ok(firstModeration.createdAt);
    assert.deepEqual(fixture.state.contentHistory.at(-1), updatedContentHistory);
    assert.deepEqual(fixture.state.publicationHistory[0], firstPublication);
    assert.deepEqual(fixture.state.moderationHistory[0], firstModeration);
  });

  it('AT-159 derives count/list/one-decimal mean from one visible set with stable paging and no edit reposition', async () => {
    const fixture = buildReviewFixture();
    fixture.state.reviews.push(
      {
        id: 'review-b',
        customerId: 'customer-3',
        productId: 'product-1',
        rating: 4,
        content: 'B',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        createdAt: new Date('2026-07-23T00:00:00.000Z'),
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
        version: 1,
      },
      {
        id: 'review-d',
        customerId: 'customer-1',
        productId: 'product-1',
        rating: 5,
        content: 'D',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        createdAt: new Date('2026-07-23T00:00:00.000Z'),
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
        version: 1,
      },
      {
        id: 'review-c',
        customerId: 'customer-2',
        productId: 'product-1',
        rating: 3,
        content: 'C',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        createdAt: new Date('2026-07-23T00:00:00.000Z'),
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
        version: 1,
      },
      {
        id: 'review-withdrawn',
        customerId: 'customer-3',
        productId: 'product-1',
        rating: 1,
        content: 'withdrawn-hidden',
        publicationStatus: 'Withdrawn',
        moderationStatus: 'Allowed',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
        updatedAt: new Date('2026-07-24T00:00:00.000Z'),
        version: 1,
      },
      {
        id: 'review-staff-hidden',
        customerId: 'customer-3',
        productId: 'product-1',
        rating: 1,
        content: 'staff-hidden',
        publicationStatus: 'Published',
        moderationStatus: 'HiddenByStaff',
        createdAt: new Date('2026-07-25T00:00:00.000Z'),
        updatedAt: new Date('2026-07-25T00:00:00.000Z'),
        version: 1,
      },
    );
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    const updateReview = requiredMethod(fixture.service, 'updateReview');

    const first = await listPublic('product-1', { page: 1, pageSize: 2 });
    const second = await listPublic('product-1', { page: 2, pageSize: 2 });
    const firstPass = [...first.items, ...second.items].map((item) => item.content);
    assert.equal(first.total, 3);
    assert.equal(second.total, 3);
    assert.equal(first.averageRating, 4.0);
    assert.equal(second.averageRating, 4.0);
    assert.deepEqual(firstPass, ['D', 'C', 'B']);
    assert.equal(new Set(firstPass).size, 3);
    assert.equal(first.totalPages, 2);
    assert.equal(second.totalPages, 2);

    await updateReview(actors.customer, 'review-d', {
      rating: 2,
      content: 'D edited later',
      expectedVersion: 1,
      idempotencyKey: 'review-stable-edit-0001',
    });
    const afterEditPage1 = await listPublic('product-1', { page: 1, pageSize: 2 });
    const afterEditPage2 = await listPublic('product-1', { page: 2, pageSize: 2 });
    const afterEdit = [...afterEditPage1.items, ...afterEditPage2.items]
      .map((item) => item.content);
    assert.deepEqual(afterEdit, ['D edited later', 'C', 'B']);
    assert.equal(new Set(afterEdit).size, 3);
    assert.equal(afterEditPage1.averageRating, 3.0);
    assert.equal(afterEditPage1.items.some((item) => item.content === 'staff-hidden'), false);
    assert.equal(afterEditPage1.items.some((item) => item.content === 'withdrawn-hidden'), false);
  });

  it('AT-160 applies distinct/same-key races and repeated state commands exactly once, with stale no-effects', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const updateReview = requiredMethod(fixture.service, 'updateReview');
    const setPublication = requiredMethod(fixture.service, 'setPublication');
    const moderate = requiredMethod(fixture.service, 'moderate');
    const command = reviewCommand();

    const [first, replay] = await Promise.all([
      createReview(actors.customer, 'product-1', command),
      createReview(actors.customer, 'product-1', command),
    ]);
    assert.equal(first.id, replay.id);
    assert.equal(fixture.state.reviews.length, 1);
    assert.equal(fixture.state.contentHistory.length, 1);
    assert.equal(fixture.state.audits.length, 1);
    assert.equal(fixture.state.outbox.length, 1);

    const publicationCommand = {
      publicationStatus: 'Withdrawn',
      expectedVersion: first.version,
      idempotencyKey: 'review-publication-race-0001',
    };
    const [publication, publicationReplay] = await Promise.all([
      setPublication(actors.customer, first.id, publicationCommand),
      setPublication(actors.customer, first.id, publicationCommand),
    ]);
    assert.equal(publicationReplay.version, publication.version);
    assert.equal(publication.version, first.version + 1);
    assert.equal(fixture.state.publicationHistory.length, 1);
    assert.equal(
      fixture.state.audits.filter((item) => item.action === 'REVIEW_PUBLICATION_CHANGED').length,
      1,
    );
    assert.equal(
      fixture.state.outbox.filter((item) => item.eventType === 'REVIEW_PUBLICATION_CHANGED').length,
      1,
    );

    const moderationCommand = {
      moderationStatus: 'HiddenByStaff',
      reason: 'Repeated moderation must apply once',
      expectedVersion: publication.version,
      idempotencyKey: 'review-moderation-race-0001',
    };
    const [moderated, moderationReplay] = await Promise.all([
      moderate(actors.staffA, first.id, moderationCommand),
      moderate(actors.staffA, first.id, moderationCommand),
    ]);
    assert.equal(moderationReplay.version, moderated.version);
    assert.equal(moderated.version, publication.version + 1);
    assert.equal(fixture.state.moderationHistory.length, 1);
    assert.equal(
      fixture.state.audits.filter((item) => item.action === 'REVIEW_MODERATION_CHANGED').length,
      1,
    );
    assert.equal(
      fixture.state.outbox.filter((item) => item.eventType === 'REVIEW_MODERATION_CHANGED').length,
      1,
    );

    const beforeStale = snapshotEffects(fixture.state);
    await expectDomainError(
      () => updateReview(actors.customer, first.id, {
        rating: 4,
        content: 'stale',
        expectedVersion: publication.version,
        idempotencyKey: 'review-stale-0001',
      }),
      'REVIEW_VERSION_CONFLICT',
    );
    assert.deepEqual(snapshotEffects(fixture.state), beforeStale);

    const distinctKeyFixture = buildReviewFixture();
    const distinctCreate = requiredMethod(distinctKeyFixture.service, 'createReview');
    const distinctResults = await Promise.allSettled([
      distinctCreate(actors.customer, 'product-1', reviewCommand({
        idempotencyKey: 'review-distinct-race-a',
      })),
      distinctCreate(actors.customer, 'product-1', reviewCommand({
        idempotencyKey: 'review-distinct-race-b',
      })),
    ]);
    assert.equal(distinctResults.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(distinctResults.filter((item) => item.status === 'rejected').length, 1);
    const distinctWinner = distinctResults.find((item) => item.status === 'fulfilled').value;
    const distinctLoser = distinctResults.find((item) => item.status === 'rejected').reason;
    assert.equal(distinctLoser.errorCode, 'REVIEW_ALREADY_EXISTS');
    assert.equal(distinctLoser.data.review.id, distinctWinner.id);
    assert.equal(distinctKeyFixture.state.reviews.length, 1);
    assert.equal(distinctKeyFixture.state.contentHistory.length, 1);
    assert.equal(distinctKeyFixture.state.audits.length, 1);
    assert.equal(distinctKeyFixture.state.outbox.length, 1);

    for (const [index, invalid] of [
      { idempotencyKey: 'short' },
      { idempotencyKey: 'x'.repeat(129) },
      { expectedVersion: -1, idempotencyKey: 'review-invalid-version-0001' },
      { expectedVersion: 1.5, idempotencyKey: 'review-invalid-version-0002' },
    ].entries()) {
      const invalidFixture = buildReviewFixture();
      const invalidCreate = requiredMethod(invalidFixture.service, 'createReview');
      await expectDomainError(
        () => invalidCreate(
          actors.customer,
          'product-1',
          reviewCommand({
            ...invalid,
            idempotencyKey: invalid.idempotencyKey || `review-invalid-command-${index}`,
          }),
        ),
        'COMMAND_VALIDATION_FAILED',
      );
      assert.equal(invalidFixture.state.reviews.length, 0);
      assert.equal(invalidFixture.state.audits.length, 0);
      assert.equal(invalidFixture.state.outbox.length, 0);
    }
  });
});

describe('SL-008 Support behavioral acceptance', () => {
  it('AT-161 accepts all seven Support type/reference combinations with unique New/unassigned/Normal tickets', async () => {
    const fixture = buildSupportFixture();
    const cases = [
      ['Order', { orderId: 'order-1' }],
      ['Payment', { orderId: 'order-1' }],
      ['ReturnRefund', { orderId: 'order-1' }],
      ['Exchange', { orderId: 'order-1' }],
      ['Product', { productId: 'product-1', orderId: 'order-1' }],
      ['Account', {}],
      ['Other', {}],
    ];
    const codes = new Set();
    for (const [index, [type, references]] of cases.entries()) {
      const ticket = await createSupportTicket(fixture, {
        type,
        orderId: undefined,
        ...references,
        idempotencyKey: `support-type-${index}-0001`,
      });
      assert.equal(ticket.type, type);
      assert.equal(ticket.status, 'New');
      assert.equal(ticket.assigneeId, null);
      assert.equal(ticket.priority, 'Normal');
      assert.ok(ticket.ticketCode);
      codes.add(ticket.ticketCode);
      assert.equal(fixture.state.messages.length, index + 1);
      const initialMessage = fixture.state.messages.at(-1);
      assert.equal(initialMessage.ticketId, ticket.id);
      assert.equal(initialMessage.content, 'The delivered package needs support.');
      assert.equal(initialMessage.actorId, actors.customer.id);
      assert.equal(initialMessage.actorRole, 'Customer');
      assert.equal(new Date(initialMessage.createdAt).toISOString(), fixture.clock.now().toISOString());
      assert.equal(initialMessage.commandId, `support-type-${index}-0001`);
      assert.equal(fixture.state.audits.length, index + 1);
      assert.equal(fixture.state.outbox.length, index + 1);
      assert.equal(fixture.state.outbox.at(-1).eventType, 'SUPPORT_CREATED');
      assert.doesNotMatch(
        JSON.stringify([fixture.state.audits.at(-1), fixture.state.outbox.at(-1)]),
        /The delivered package needs support\./,
      );
    }
    assert.equal(codes.size, cases.length);

    for (const [index, boundary] of [
      { subject: '12345', initialMessage: '1234567890' },
      { subject: 's'.repeat(120), initialMessage: 'm'.repeat(2000) },
    ].entries()) {
      const boundaryFixture = buildSupportFixture();
      const ticket = await createSupportTicket(boundaryFixture, {
        ...boundary,
        idempotencyKey: `support-create-boundary-valid-${index}`,
      });
      assert.equal(ticket.subject.length, boundary.subject.length);
      assert.equal(boundaryFixture.state.messages[0].content.length, boundary.initialMessage.length);
    }

    for (const [index, boundary] of [
      { subject: '1234', initialMessage: '1234567890' },
      { subject: 's'.repeat(121), initialMessage: '1234567890' },
      { subject: 'Valid subject', initialMessage: '123456789' },
      { subject: 'Valid subject', initialMessage: 'm'.repeat(2001) },
    ].entries()) {
      const boundaryFixture = buildSupportFixture();
      const createRequest = requiredMethod(boundaryFixture.service, 'createRequest');
      await expectDomainError(
        () => createRequest(actors.customer, supportCreate({
          ...boundary,
          idempotencyKey: `support-create-boundary-invalid-${index}`,
        })),
        'SUPPORT_VALIDATION_FAILED',
      );
      assert.equal(boundaryFixture.state.tickets.length, 0);
      assert.equal(boundaryFixture.state.messages.length, 0);
    }
  });

  it('AT-162 denies missing or foreign required Order without leaking its identity or effects', async () => {
    for (const [index, orderId] of [undefined, 'missing-order', 'order-foreign'].entries()) {
      const fixture = buildSupportFixture();
      const createRequest = requiredMethod(fixture.service, 'createRequest');
      const before = snapshotEffects(fixture.state);
      const error = await expectDomainError(
        () => createRequest(
          actors.customer,
          supportCreate({ orderId, idempotencyKey: `support-order-denied-${index}-0001` }),
        ),
        'SUPPORT_REFERENCE_NOT_FOUND',
      );
      assert.equal(error.statusCode, 404);
      assert.equal(error.data?.customerId, undefined);
      assert.deepEqual(snapshotEffects(fixture.state), before);
    }
  });

  it('AT-163 denies invalid/inactive Product and Product+Order mismatch without effects', async () => {
    const cases = [
      { productId: 'missing-product' },
      { productId: 'product-inactive' },
      { productId: 'product-2', orderId: 'order-1' },
    ];
    for (const [index, references] of cases.entries()) {
      const fixture = buildSupportFixture();
      const createRequest = requiredMethod(fixture.service, 'createRequest');
      const before = snapshotEffects(fixture.state);
      await expectDomainError(
        () => createRequest(actors.customer, supportCreate({
          type: 'Product',
          orderId: undefined,
          ...references,
          idempotencyKey: `support-product-denied-${index}-0001`,
        })),
        'SUPPORT_REFERENCE_NOT_FOUND',
      );
      assert.deepEqual(snapshotEffects(fixture.state), before);
    }
  });

  it('AT-164 permits Account/Other without refs but validates every supplied optional ref', async () => {
    for (const type of ['Account', 'Other']) {
      const fixture = buildSupportFixture();
      const withoutRefs = await createSupportTicket(fixture, {
        type,
        orderId: undefined,
        productId: undefined,
        idempotencyKey: `support-${type.toLowerCase()}-without-refs-0001`,
      });
      assert.equal(withoutRefs.type, type);
      assert.equal(withoutRefs.orderId, undefined);
      assert.equal(withoutRefs.productId, undefined);

      const withRefs = await createSupportTicket(fixture, {
        type,
        orderId: 'order-1',
        productId: 'product-1',
        idempotencyKey: `support-${type.toLowerCase()}-with-refs-0001`,
      });
      assert.equal(withRefs.orderId, 'order-1');
      assert.equal(withRefs.productId, 'product-1');

      for (const [index, references] of [
        { orderId: 'order-foreign', productId: undefined },
        { orderId: 'order-1', productId: 'product-2' },
      ].entries()) {
        const invalidFixture = buildSupportFixture();
        const createRequest = requiredMethod(invalidFixture.service, 'createRequest');
        const before = snapshotEffects(invalidFixture.state);
        await expectDomainError(
          () => createRequest(actors.customer, supportCreate({
            type,
            ...references,
            idempotencyKey: `support-${type.toLowerCase()}-invalid-${index}-0001`,
          })),
          'SUPPORT_REFERENCE_NOT_FOUND',
        );
        assert.deepEqual(snapshotEffects(invalidFixture.state), before);
      }
    }
  });

  it('AT-165 keeps initial/later messages immutable, chronological, paged, and command-idempotent', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    const appendMessage = requiredMethod(fixture.service, 'appendMessage');
    const listMessages = requiredMethod(fixture.service, 'listMessages');
    const command = {
      message: 'x',
      expectedVersion: ticket.version,
      idempotencyKey: 'support-message-0001',
    };
    const first = await appendMessage(actors.customer, ticket.id, command);
    const replay = await appendMessage(actors.customer, ticket.id, command);
    const third = await appendMessage(actors.customer, ticket.id, {
      message: 'm'.repeat(2000),
      expectedVersion: first.version,
      idempotencyKey: 'support-message-0002',
    });

    assert.equal(first.id, replay.id);
    assert.equal(fixture.state.messages.length, 3);
    assert.deepEqual(
      fixture.state.messages.map((item) => item.content),
      [
        'The delivered package needs support.',
        'x',
        'm'.repeat(2000),
      ],
    );
    assert.ok(new Date(third.createdAt) >= new Date(first.createdAt));
    for (const message of fixture.state.messages) {
      message.createdAt = new Date('2026-07-24T12:30:00.000Z');
    }
    fixture.state.messages = [
      fixture.state.messages[2],
      fixture.state.messages[0],
      fixture.state.messages[1],
    ];
    const page1 = await listMessages(actors.customer, ticket.id, { page: 1, pageSize: 2 });
    const page2 = await listMessages(actors.customer, ticket.id, { page: 2, pageSize: 2 });
    const pagedMessages = [...page1.items, ...page2.items];
    assert.deepEqual(
      pagedMessages.map((item) => item.content),
      ['The delivered package needs support.', 'x', 'm'.repeat(2000)],
    );
    assert.equal(new Set(pagedMessages.map((item) => item.id)).size, 3);
    assert.equal(page1.total, 3);
    assert.equal(page1.totalPages, 2);
    assert.deepEqual(
      pagedMessages.map((item) => item.actorRole),
      ['Customer', 'Customer', 'Customer'],
    );
    assert.ok(pagedMessages.every((item) => item.actorId === actors.customer.id));
    assert.ok(pagedMessages.every(
      (item) => new Date(item.createdAt).toISOString() === '2026-07-24T12:30:00.000Z',
    ));
    assert.deepEqual(
      pagedMessages.map((item) => item.commandId),
      ['support-create-0001', 'support-message-0001', 'support-message-0002'],
    );
    assert.equal(typeof fixture.service.editMessage, 'undefined');
    assert.equal(typeof fixture.service.deleteMessage, 'undefined');
    assert.equal(typeof fixture.service.overwriteMessage, 'undefined');

    for (const [index, message] of ['', 'm'.repeat(2001)].entries()) {
      const before = snapshotEffects(fixture.state);
      await expectDomainError(
        () => appendMessage(actors.customer, ticket.id, {
          message,
          expectedVersion: third.version,
          idempotencyKey: `support-message-invalid-${index}`,
        }),
        'SUPPORT_VALIDATION_FAILED',
      );
      assert.deepEqual(snapshotEffects(fixture.state), before);
    }
  });

  it('AT-166 enforces owner/assignee, New/InProgress, terminal, stale, and immutable-message rules', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    const appendMessage = requiredMethod(fixture.service, 'appendMessage');
    const beforeForeign = snapshotEffects(fixture.state);
    await expectDomainError(
      () => appendMessage(actors.foreignCustomer, ticket.id, {
        message: 'Foreign Customer message.',
        expectedVersion: ticket.version,
        idempotencyKey: 'support-foreign-customer-message-0001',
      }),
      'SUPPORT_FORBIDDEN',
    );
    assert.deepEqual(snapshotEffects(fixture.state), beforeForeign);
    await expectDomainError(
      () => appendMessage(actors.staffA, ticket.id, {
        message: 'Staff cannot message an unassigned New ticket.',
        expectedVersion: ticket.version,
        idempotencyKey: 'support-staff-new-message-0001',
      }),
      'SUPPORT_FORBIDDEN',
    );
    const customerMessage = await appendMessage(actors.customer, ticket.id, {
      message: 'Owner message while New.',
      expectedVersion: ticket.version,
      idempotencyKey: 'support-owner-new-0001',
    });
    const claimed = await claimSupportTicket(fixture, customerMessage);

    const customerInProgress = await appendMessage(actors.customer, ticket.id, {
      message: 'Owner message while InProgress.',
      expectedVersion: claimed.version,
      idempotencyKey: 'support-owner-in-progress-0001',
    });
    await expectDomainError(
      () => appendMessage(actors.staffB, ticket.id, {
        message: 'Non-assignee message.',
        expectedVersion: customerInProgress.version,
        idempotencyKey: 'support-non-assignee-message-0001',
      }),
      'SUPPORT_FORBIDDEN',
    );
    const staffMessage = await appendMessage(actors.staffA, ticket.id, {
      message: 'Current assignee message.',
      expectedVersion: customerInProgress.version,
      idempotencyKey: 'support-assignee-message-0001',
    });
    const beforeStale = snapshotEffects(fixture.state);
    await expectDomainError(
      () => appendMessage(actors.customer, ticket.id, {
        message: 'Stale message.',
        expectedVersion: claimed.version,
        idempotencyKey: 'support-stale-message-0001',
      }),
      'SUPPORT_VERSION_CONFLICT',
    );
    assert.deepEqual(snapshotEffects(fixture.state), beforeStale);

    const resolve = requiredMethod(fixture.service, 'resolve');
    const resolved = await resolve(actors.staffA, ticket.id, {
      finalMessage: 'Terminal resolution message.',
      expectedVersion: staffMessage.version,
      idempotencyKey: 'support-message-terminal-resolve-0001',
    });
    for (const [index, actor] of [actors.customer, actors.staffA].entries()) {
      const beforeTerminal = snapshotEffects(fixture.state);
      await expectDomainError(
        () => appendMessage(actor, ticket.id, {
          message: 'Terminal tickets reject messages.',
          expectedVersion: resolved.version,
          idempotencyKey: `support-resolved-message-denied-${index}`,
        }),
        'SUPPORT_TRANSITION_INVALID',
      );
      assert.deepEqual(snapshotEffects(fixture.state), beforeTerminal);
    }

    const withdrawnFixture = buildSupportFixture();
    const withdrawnTicket = await createSupportTicket(withdrawnFixture);
    const withdraw = requiredMethod(withdrawnFixture.service, 'withdraw');
    const withdrawn = await withdraw(actors.customer, withdrawnTicket.id, {
      expectedVersion: withdrawnTicket.version,
      idempotencyKey: 'support-message-withdraw-0001',
    });
    const appendWithdrawn = requiredMethod(withdrawnFixture.service, 'appendMessage');
    await expectDomainError(
      () => appendWithdrawn(actors.customer, withdrawn.id, {
        message: 'Withdrawn tickets reject messages.',
        expectedVersion: withdrawn.version,
        idempotencyKey: 'support-withdrawn-message-denied-0001',
      }),
      'SUPPORT_TRANSITION_INVALID',
    );
    assert.equal(typeof fixture.service.editMessage, 'undefined');
    assert.equal(typeof fixture.service.deleteMessage, 'undefined');
    assert.equal(typeof fixture.service.overwriteMessage, 'undefined');
    assert.equal(fixture.state.messages.some((item) => item.content === 'Stale message.'), false);
  });

  it('AT-167 makes a two-Staff claim race choose exactly one winner and one history', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    const claim = requiredMethod(fixture.service, 'claim');
    const results = await Promise.allSettled([
      claim(actors.staffA, ticket.id, {
        expectedVersion: ticket.version,
        idempotencyKey: 'support-claim-race-a',
      }),
      claim(actors.staffB, ticket.id, {
        expectedVersion: ticket.version,
        idempotencyKey: 'support-claim-race-b',
      }),
    ]);

    const winners = results.filter((item) => item.status === 'fulfilled');
    const losers = results.filter((item) => item.status === 'rejected');
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(fixture.state.assignmentHistory.length, 1);
    assert.ok(['staff-a', 'staff-b'].includes(fixture.state.tickets[0].assigneeId));
    assert.equal(losers[0].reason.errorCode, 'SUPPORT_VERSION_CONFLICT');
    assert.equal(losers[0].reason.data.ticket.id, ticket.id);
    assert.equal(losers[0].reason.data.ticket.assigneeId, winners[0].value.assigneeId);
    assert.equal(losers[0].reason.data.ticket.status, 'InProgress');
    assert.equal(losers[0].reason.data.ticket.version, winners[0].value.version);
  });

  it('AT-168 enforces the current-Active-assignee actor matrix for Staff commands', async () => {
    const commandCases = [
      {
        name: 'appendMessage',
        input: { message: 'Assignee operational update.' },
      },
      {
        name: 'changePriority',
        input: {
          priority: 'High',
          reason: 'Customer impact requires faster handling',
        },
      },
      {
        name: 'transfer',
        input: {
          assigneeId: actors.staffB.id,
          reason: 'Specialist ownership transfer',
        },
      },
      {
        name: 'resolve',
        input: { finalMessage: 'The issue is resolved with a replacement.' },
      },
    ];
    const deniedActors = [
      actors.customer,
      actors.foreignCustomer,
      actors.staffB,
      actors.inactiveStaff,
      actors.admin,
      actors.warehouse,
    ];

    for (const [commandIndex, command] of commandCases.entries()) {
      const allowedFixture = buildSupportFixture();
      const allowedTicket = await createSupportTicket(allowedFixture, {
        idempotencyKey: `support-matrix-allowed-create-${commandIndex}`,
      });
      const allowedClaim = await claimSupportTicket(allowedFixture, allowedTicket);
      const allowedCommand = requiredMethod(allowedFixture.service, command.name);
      const allowed = await allowedCommand(actors.staffA, allowedTicket.id, {
        ...command.input,
        expectedVersion: allowedClaim.version,
        idempotencyKey: `support-matrix-allowed-${command.name}-0001`,
      });
      assert.ok(allowed);

      for (const [actorIndex, actor] of deniedActors.entries()) {
        const fixture = buildSupportFixture();
        const ticket = await createSupportTicket(fixture, {
          idempotencyKey: `support-matrix-create-${commandIndex}-${actorIndex}`,
        });
        const claimed = await claimSupportTicket(fixture, ticket);
        const serviceCommand = requiredMethod(fixture.service, command.name);
        const before = snapshotEffects(fixture.state);
        await expectDomainError(
          () => serviceCommand(actor, ticket.id, {
            ...command.input,
            expectedVersion: claimed.version,
            idempotencyKey: `support-matrix-denied-${command.name}-${actorIndex}`,
          }),
          'SUPPORT_FORBIDDEN',
        );
        assert.deepEqual(snapshotEffects(fixture.state), before);
      }
    }
  });

  it('AT-169 validates every priority/transfer target/reason and appends immutable histories', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    let current = await claimSupportTicket(fixture, ticket);
    const changePriority = requiredMethod(fixture.service, 'changePriority');
    const transfer = requiredMethod(fixture.service, 'transfer');
    const prioritySnapshots = [];

    for (const [index, priority] of ['Low', 'Normal', 'High', 'Urgent'].entries()) {
      const beforePriority = current.priority;
      current = await changePriority(actors.staffA, ticket.id, {
        priority,
        reason: 'Valid priority reason',
        expectedVersion: current.version,
        idempotencyKey: `support-priority-${index}-0001`,
      });
      const history = fixture.state.priorityHistory.at(-1);
      assert.equal(history.beforePriority, beforePriority);
      assert.equal(history.afterPriority, priority);
      assert.equal(history.actorId, actors.staffA.id);
      assert.equal(history.reason, 'Valid priority reason');
      assert.ok(history.createdAt);
      prioritySnapshots.push(structuredClone(history));
    }
    assert.equal(fixture.state.priorityHistory.length, 4);

    for (const [index, invalid] of [
      { priority: 'Critical', reason: 'Valid priority reason' },
      { priority: 'High', reason: 'four' },
      { priority: 'High', reason: 'x'.repeat(501) },
    ].entries()) {
      await expectDomainError(
        () => changePriority(actors.staffA, ticket.id, {
          ...invalid,
          expectedVersion: current.version,
          idempotencyKey: `support-priority-invalid-${index}`,
        }),
        'SUPPORT_VALIDATION_FAILED',
      );
    }
    for (const [index, target] of [
      actors.inactiveStaff,
      actors.customer,
      actors.admin,
    ].entries()) {
      await expectDomainError(
        () => transfer(actors.staffA, ticket.id, {
          assigneeId: target.id,
          reason: 'Transfer to invalid or unavailable target',
          expectedVersion: current.version,
          idempotencyKey: `support-transfer-target-invalid-${index}`,
        }),
        'SUPPORT_TRANSFER_TARGET_INVALID',
      );
    }
    for (const [index, reason] of ['four', 'x'.repeat(501)].entries()) {
      await expectDomainError(
        () => transfer(actors.staffA, ticket.id, {
          assigneeId: actors.staffB.id,
          reason,
          expectedVersion: current.version,
          idempotencyKey: `support-transfer-reason-invalid-${index}`,
        }),
        'SUPPORT_VALIDATION_FAILED',
      );
    }
    const transferred = await transfer(actors.staffA, ticket.id, {
      assigneeId: actors.staffB.id,
      reason: 'Specialist ownership transfer',
      expectedVersion: current.version,
      idempotencyKey: 'support-transfer-valid-0001',
    });
    assert.equal(transferred.assigneeId, actors.staffB.id);
    assert.equal(fixture.state.assignmentHistory.length, 2);
    const transferHistory = fixture.state.assignmentHistory.at(-1);
    assert.equal(transferHistory.beforeAssigneeId, actors.staffA.id);
    assert.equal(transferHistory.afterAssigneeId, actors.staffB.id);
    assert.equal(transferHistory.actorId, actors.staffA.id);
    assert.equal(transferHistory.reason, 'Specialist ownership transfer');
    assert.ok(transferHistory.createdAt);
    assert.deepEqual(fixture.state.priorityHistory, prioritySnapshots);
  });

  it('AT-170 clears a disabled assignee exactly once, preserves state, and permits recovery claim', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    let claimed = await claimSupportTicket(fixture, ticket);
    const appendMessage = requiredMethod(fixture.service, 'appendMessage');
    claimed = await appendMessage(actors.staffA, ticket.id, {
      message: 'Operational context must survive Staff disable.',
      expectedVersion: claimed.version,
      idempotencyKey: 'support-disable-preserved-message-0001',
    });
    const changePriority = requiredMethod(fixture.service, 'changePriority');
    claimed = await changePriority(actors.staffA, ticket.id, {
      priority: 'High',
      reason: 'Customer impact remains high during recovery',
      expectedVersion: claimed.version,
      idempotencyKey: 'support-disable-preserved-priority-0001',
    });
    const clearDisabledAssignee = requiredMethod(fixture.service, 'clearDisabledAssignee');
    fixture.state.users.find((item) => item.id === actors.staffA.id).status = 'Disabled';
    const preservedMessages = structuredClone(fixture.state.messages);
    const preservedAssignments = structuredClone(fixture.state.assignmentHistory);
    const preservedPriority = structuredClone(fixture.state.priorityHistory);

    const cleared = await fixture.sl007Lifecycle.disableStaff(
      actors.staffA.id,
      (userId, command) => clearDisabledAssignee(userId, command),
    );
    await clearDisabledAssignee(actors.staffA.id, {
      idempotencyKey: `sl007-disable-${actors.staffA.id}`,
    });

    assert.deepEqual(fixture.sl007SessionService.calls, [{
      userId: actors.staffA.id,
      reason: 'ACCOUNT_DISABLED',
    }]);
    assert.deepEqual(fixture.state.sessionRevocations, [{
      userId: actors.staffA.id,
      signal: 'SL007_SESSIONS_REVOKED',
      reason: 'ACCOUNT_DISABLED',
      occurredAt: fixture.clock.now(),
    }]);
    assert.equal(cleared.status, 'InProgress');
    assert.equal(cleared.priority, claimed.priority);
    assert.equal(cleared.assigneeId, null);
    assert.deepEqual(fixture.state.messages, preservedMessages);
    assert.deepEqual(
      fixture.state.assignmentHistory.slice(0, preservedAssignments.length),
      preservedAssignments,
    );
    assert.equal(
      fixture.state.assignmentHistory.length,
      preservedAssignments.length + 1,
    );
    const clearedHistory = fixture.state.assignmentHistory.at(-1);
    assert.equal(clearedHistory.beforeAssigneeId, actors.staffA.id);
    assert.equal(clearedHistory.afterAssigneeId, null);
    assert.equal(clearedHistory.actorRole, 'System');
    assert.equal(clearedHistory.reason, 'ASSIGNEE_DISABLED');
    assert.ok(clearedHistory.createdAt);
    assert.deepEqual(fixture.state.priorityHistory, preservedPriority);
    assert.equal(
      fixture.state.outbox.filter((item) => item.eventType === 'ASSIGNEE_CLEARED').length,
      1,
    );
    const recovered = await claimSupportTicket(
      fixture,
      cleared,
      actors.staffB,
      { idempotencyKey: 'support-recovery-claim-0001' },
    );
    assert.equal(recovered.assigneeId, actors.staffB.id);
    assert.equal(recovered.status, 'InProgress');
    assert.equal(
      fixture.state.assignmentHistory.length,
      preservedAssignments.length + 2,
    );
  });

  it('AT-171 allows only approved withdraw/resolve transitions and resolves with one atomic final message', async () => {
    const withdrawFixture = buildSupportFixture();
    const newTicket = await createSupportTicket(withdrawFixture);
    const withdraw = requiredMethod(withdrawFixture.service, 'withdraw');
    const withdrawn = await withdraw(actors.customer, newTicket.id, {
      expectedVersion: newTicket.version,
      idempotencyKey: 'support-withdraw-0001',
    });
    assert.equal(withdrawn.status, 'Withdrawn');
    const reopenWithdrawn = requiredMethod(withdrawFixture.service, 'reopen');
    const withdrawnBefore = snapshotEffects(withdrawFixture.state);
    await expectDomainError(
      () => reopenWithdrawn(actors.customer, newTicket.id, {
        message: 'Withdrawn tickets do not reopen.',
        expectedVersion: withdrawn.version,
        idempotencyKey: 'support-withdrawn-reopen-0001',
      }),
      'SUPPORT_TRANSITION_INVALID',
    );
    assert.deepEqual(snapshotEffects(withdrawFixture.state), withdrawnBefore);

    const resolveFixture = buildSupportFixture();
    const ticket = await createSupportTicket(resolveFixture);
    const resolve = requiredMethod(resolveFixture.service, 'resolve');
    const withdrawResolved = requiredMethod(resolveFixture.service, 'withdraw');
    const claimResolved = requiredMethod(resolveFixture.service, 'claim');
    const newBefore = snapshotEffects(resolveFixture.state);
    await expectDomainError(
      () => resolve(actors.staffA, ticket.id, {
        finalMessage: 'Cannot resolve an unclaimed New ticket.',
        expectedVersion: ticket.version,
        idempotencyKey: 'support-resolve-new-0001',
      }),
      'SUPPORT_TRANSITION_INVALID',
    );
    assert.deepEqual(snapshotEffects(resolveFixture.state), newBefore);

    const claimed = await claimSupportTicket(resolveFixture, ticket);
    const assignedBefore = snapshotEffects(resolveFixture.state);
    await expectDomainError(
      () => withdrawResolved(actors.customer, ticket.id, {
        expectedVersion: claimed.version,
        idempotencyKey: 'support-withdraw-assigned-0001',
      }),
      'SUPPORT_TRANSITION_INVALID',
    );
    assert.deepEqual(snapshotEffects(resolveFixture.state), assignedBefore);

    for (const [index, finalMessage] of ['', 'm'.repeat(2001)].entries()) {
      const beforeInvalidFinal = snapshotEffects(resolveFixture.state);
      await expectDomainError(
        () => resolve(actors.staffA, ticket.id, {
          finalMessage,
          expectedVersion: claimed.version,
          idempotencyKey: `support-resolve-invalid-final-${index}`,
        }),
        'SUPPORT_VALIDATION_FAILED',
      );
      assert.deepEqual(snapshotEffects(resolveFixture.state), beforeInvalidFinal);
    }

    const resolved = await resolve(actors.staffA, ticket.id, {
      finalMessage: 'The issue is resolved with a replacement.',
      expectedVersion: claimed.version,
      idempotencyKey: 'support-resolve-0001',
    });
    assert.equal(resolved.status, 'Resolved');
    assert.ok(resolved.resolvedAt);
    assert.equal(resolveFixture.state.messages.at(-1).content, 'The issue is resolved with a replacement.');
    assert.equal(resolveFixture.state.resolutionHistory.length, 1);

    const beforeDenied = snapshotEffects(resolveFixture.state);
    await expectDomainError(
      () => claimResolved(actors.staffB, ticket.id, {
        expectedVersion: resolved.version,
        idempotencyKey: 'support-claim-resolved-0001',
      }),
      'SUPPORT_TRANSITION_INVALID',
    );
    await expectDomainError(
      () => resolve(actors.staffA, ticket.id, {
        finalMessage: 'Cannot resolve twice.',
        expectedVersion: resolved.version,
        idempotencyKey: 'support-resolve-twice-0001',
      }),
      'SUPPORT_TRANSITION_INVALID',
    );
    assert.deepEqual(snapshotEffects(resolveFixture.state), beforeDenied);
  });

  it('AT-172 reopens through +72h, retains Active assignee, clears inactive assignee, and rejects +1ms', async () => {
    async function resolvedFixture({ disableAssignee = false } = {}) {
      const fixture = buildSupportFixture();
      const ticket = await createSupportTicket(fixture);
      const claimed = await claimSupportTicket(fixture, ticket);
      const resolve = requiredMethod(fixture.service, 'resolve');
      const resolved = await resolve(actors.staffA, ticket.id, {
        finalMessage: 'Resolved before reopen test.',
        expectedVersion: claimed.version,
        idempotencyKey: 'support-boundary-resolve-0001',
      });
      if (disableAssignee) {
        fixture.state.users.find((item) => item.id === actors.staffA.id).status = 'Disabled';
      }
      return { fixture, resolved };
    }

    const atBoundary = await resolvedFixture();
    const reopen = requiredMethod(atBoundary.fixture.service, 'reopen');
    const activeMessagesBefore = structuredClone(atBoundary.fixture.state.messages);
    const activeAssignmentsBefore = structuredClone(atBoundary.fixture.state.assignmentHistory);
    const activeResolutionCount = atBoundary.fixture.state.resolutionHistory.length;
    atBoundary.fixture.clock.set(
      new Date(atBoundary.resolved.resolvedAt).getTime() + 72 * 60 * 60 * 1000,
    );
    const reopened = await reopen(actors.customer, atBoundary.resolved.id, {
      message: 'The same issue returned.',
      expectedVersion: atBoundary.resolved.version,
      idempotencyKey: 'support-reopen-boundary-0001',
    });
    assert.equal(reopened.status, 'InProgress');
    assert.equal(reopened.assigneeId, actors.staffA.id);
    assert.deepEqual(atBoundary.fixture.state.messages.slice(0, activeMessagesBefore.length), activeMessagesBefore);
    assert.equal(atBoundary.fixture.state.messages.length, activeMessagesBefore.length + 1);
    assert.equal(atBoundary.fixture.state.messages.at(-1).content, 'The same issue returned.');
    assert.equal(atBoundary.fixture.state.messages.at(-1).actorId, actors.customer.id);
    assert.deepEqual(atBoundary.fixture.state.assignmentHistory, activeAssignmentsBefore);
    assert.equal(atBoundary.fixture.state.resolutionHistory.length, activeResolutionCount + 1);
    assert.equal(atBoundary.fixture.state.resolutionHistory.at(-1).actorId, actors.customer.id);
    assert.equal(atBoundary.fixture.state.resolutionHistory.at(-1).transition, 'Reopened');
    assert.ok(atBoundary.fixture.state.resolutionHistory.at(-1).createdAt);
    assert.equal(
      atBoundary.fixture.state.outbox.filter(
        (item) => item.eventType === 'ASSIGNEE_CLEARED',
      ).length,
      0,
    );

    const inactiveBoundary = await resolvedFixture({ disableAssignee: true });
    const reopenInactive = requiredMethod(inactiveBoundary.fixture.service, 'reopen');
    const inactiveMessagesBefore = structuredClone(inactiveBoundary.fixture.state.messages);
    const inactiveAssignmentCount = inactiveBoundary.fixture.state.assignmentHistory.length;
    const inactiveResolutionCount = inactiveBoundary.fixture.state.resolutionHistory.length;
    inactiveBoundary.fixture.clock.set(
      new Date(inactiveBoundary.resolved.resolvedAt).getTime() + 72 * 60 * 60 * 1000,
    );
    const reopenedInactive = await reopenInactive(
      actors.customer,
      inactiveBoundary.resolved.id,
      {
        message: 'Reopened after the former assignee was disabled.',
        expectedVersion: inactiveBoundary.resolved.version,
        idempotencyKey: 'support-reopen-inactive-assignee-0001',
      },
    );
    assert.equal(reopenedInactive.status, 'InProgress');
    assert.equal(reopenedInactive.assigneeId, null);
    assert.equal(inactiveBoundary.fixture.state.messages.length, inactiveMessagesBefore.length + 1);
    assert.deepEqual(
      inactiveBoundary.fixture.state.messages.slice(0, inactiveMessagesBefore.length),
      inactiveMessagesBefore,
    );
    assert.equal(
      inactiveBoundary.fixture.state.assignmentHistory.length,
      inactiveAssignmentCount + 1,
    );
    assert.equal(
      inactiveBoundary.fixture.state.assignmentHistory.at(-1).beforeAssigneeId,
      actors.staffA.id,
    );
    assert.equal(inactiveBoundary.fixture.state.assignmentHistory.at(-1).afterAssigneeId, null);
    assert.equal(
      inactiveBoundary.fixture.state.resolutionHistory.length,
      inactiveResolutionCount + 1,
    );
    assert.equal(
      inactiveBoundary.fixture.state.outbox.filter(
        (item) => item.eventType === 'ASSIGNEE_CLEARED',
      ).length,
      1,
    );

    const afterBoundary = await resolvedFixture();
    const reopenLate = requiredMethod(afterBoundary.fixture.service, 'reopen');
    afterBoundary.fixture.clock.set(
      new Date(afterBoundary.resolved.resolvedAt).getTime() + 72 * 60 * 60 * 1000 + 1,
    );
    const before = snapshotEffects(afterBoundary.fixture.state);
    await expectDomainError(
      () => reopenLate(actors.customer, afterBoundary.resolved.id, {
        message: 'One millisecond too late.',
        expectedVersion: afterBoundary.resolved.version,
        idempotencyKey: 'support-reopen-late-0001',
      }),
      'SUPPORT_REOPEN_WINDOW_EXPIRED',
    );
    assert.deepEqual(snapshotEffects(afterBoundary.fixture.state), before);
  });

  it('AT-173 protects Review management and returns role-safe Support list/detail projections privately', async () => {
    const reviewFixture = buildReviewFixture();
    const createReview = requiredMethod(reviewFixture.service, 'createReview');
    await createReview(actors.customer, 'product-1', reviewCommand());
    const listModeration = requiredMethod(reviewFixture.service, 'listModeration');
    const moderationPage = await listModeration(actors.staffA, {
      page: 1,
      pageSize: 20,
      productId: 'product-1',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
    });
    assert.equal(moderationPage.total, 1);
    assert.doesNotMatch(
      JSON.stringify(moderationPage),
      /orderId|orderDetailId|email|phone/,
    );
    for (const actor of [
      actors.guest,
      actors.customer,
      actors.foreignCustomer,
      actors.admin,
      actors.warehouse,
    ]) {
      await expectDomainError(
        () => listModeration(actor, { page: 1, pageSize: 20 }),
        'REVIEW_FORBIDDEN',
      );
    }

    const fixture = buildSupportFixture();
    const ownTicket = await createSupportTicket(fixture);
    const createRequest = requiredMethod(fixture.service, 'createRequest');
    const foreignTicket = await createRequest(actors.foreignCustomer, supportCreate({
      type: 'Other',
      orderId: undefined,
      idempotencyKey: 'support-foreign-owner-0001',
    }));
    const listOwn = requiredMethod(fixture.service, 'listOwn');
    const listOperational = requiredMethod(fixture.service, 'listOperational');
    const getDetail = requiredMethod(fixture.service, 'getDetail');

    const own = await listOwn(actors.customer, { page: 1, pageSize: 20 });
    const foreignOwn = await listOwn(actors.foreignCustomer, { page: 1, pageSize: 20 });
    assert.equal(own.total, 1);
    assert.equal(foreignOwn.total, 1);
    assert.equal(foreignOwn.items[0].id, foreignTicket.id);
    assert.equal(own.items[0].customerId, undefined);
    assert.equal(own.items[0].email, undefined);
    assert.equal(own.items[0].phone, undefined);

    const staff = await listOperational(actors.staffA, {
      type: 'Order',
      status: 'New',
      priority: 'Normal',
      assigneeId: 'unassigned',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      page: 1,
      pageSize: 20,
    });
    assert.equal(staff.total, 1);
    assert.equal(staff.pageSize, 20);
    assert.equal(JSON.stringify(staff).includes('The delivered package needs support.'), false);

    const ownerDetail = await getDetail(
      actors.customer,
      ownTicket.id,
      { page: 1, pageSize: 20 },
    );
    const staffDetail = await getDetail(
      actors.staffA,
      ownTicket.id,
      { page: 1, pageSize: 20 },
    );
    assert.equal(ownerDetail.id, ownTicket.id);
    assert.equal(staffDetail.id, ownTicket.id);
    assert.ok(Array.isArray(ownerDetail.messages.items));
    assert.ok(Array.isArray(staffDetail.messages.items));
    assert.doesNotMatch(
      JSON.stringify([ownerDetail, staffDetail]),
      /email|phone|password|sessionToken/,
    );

    for (const actor of [actors.guest, actors.admin, actors.warehouse]) {
      await expectDomainError(
        () => listOwn(actor, { page: 1, pageSize: 20 }),
        'SUPPORT_FORBIDDEN',
      );
    }
    for (const actor of [
      actors.customer,
      actors.foreignCustomer,
      actors.admin,
      actors.warehouse,
    ]) {
      await expectDomainError(
        () => listOperational(actor, { page: 1, pageSize: 20 }),
        'SUPPORT_FORBIDDEN',
      );
    }
    for (const actor of [
      actors.foreignCustomer,
      actors.admin,
      actors.warehouse,
    ]) {
      await expectDomainError(
        () => getDetail(actor, ownTicket.id, { page: 1, pageSize: 20 }),
        'SUPPORT_FORBIDDEN',
      );
    }

    await expectDomainError(
      () => listOperational(actors.staffA, {
        status: 'Open',
        page: 0,
        pageSize: 51,
      }),
      'SUPPORT_FILTER_INVALID',
    );
    assert.doesNotMatch(
      JSON.stringify([fixture.state.audits, fixture.state.outbox]),
      /The delivered package needs support\.|email|phone|password|sessionToken/,
    );
  });

  it('AT-174 rolls back grouped writes, retries delivery safely, and never mutates foreign domains', async () => {
    const reviewFixture = buildReviewFixture();
    const createReview = requiredMethod(reviewFixture.service, 'createReview');
    const reviewAtomicCommand = reviewCommand({
      idempotencyKey: 'review-atomic-retry-0001',
    });
    reviewFixture.outbox.failNext = true;
    await expectDomainError(
      () => createReview(actors.customer, 'product-1', reviewAtomicCommand),
      'OUTBOX_WRITE_FAILED',
    );
    assert.deepEqual(snapshotEffects(reviewFixture.state), {
      reviews: 0,
      tickets: 0,
      messages: 0,
      contentHistory: 0,
      publicationHistory: 0,
      moderationHistory: 0,
      assignmentHistory: 0,
      priorityHistory: 0,
      resolutionHistory: 0,
      commands: 0,
      audits: 0,
      outbox: 0,
    });
    assert.equal(reviewFixture.state.commands.length, 0);
    const appliedReview = await createReview(
      actors.customer,
      'product-1',
      reviewAtomicCommand,
    );
    const replayedReview = await createReview(
      actors.customer,
      'product-1',
      reviewAtomicCommand,
    );
    assert.equal(replayedReview.id, appliedReview.id);
    assert.equal(reviewFixture.state.reviews.length, 1);
    assert.equal(reviewFixture.state.contentHistory.length, 1);
    assert.equal(reviewFixture.state.commands.length, 1);
    assert.equal(reviewFixture.state.audits.length, 1);
    assert.equal(reviewFixture.state.outbox.length, 1);

    const fixture = buildSupportFixture();
    const createRequest = requiredMethod(fixture.service, 'createRequest');
    const command = supportCreate({ idempotencyKey: 'support-atomic-retry-0001' });
    const foreignBefore = structuredClone(fixture.state.foreignDomains);
    fixture.outbox.failNext = true;

    await expectDomainError(
      () => createRequest(actors.customer, command),
      'OUTBOX_WRITE_FAILED',
    );
    assert.equal(fixture.state.tickets.length, 0);
    assert.equal(fixture.state.messages.length, 0);
    assert.equal(fixture.state.audits.length, 0);
    assert.equal(fixture.state.outbox.length, 0);
    assert.equal(fixture.state.commands.length, 0);

    const applied = await createRequest(actors.customer, command);
    const replay = await createRequest(actors.customer, command);
    assert.equal(applied.id, replay.id);
    assert.equal(fixture.state.tickets.length, 1);
    assert.equal(fixture.state.messages.length, 1);
    assert.equal(fixture.state.audits.length, 1);
    assert.equal(fixture.state.outbox.length, 1);
    assert.equal(fixture.state.commands.length, 1);
    assert.deepEqual(fixture.state.foreignDomains, foreignBefore);
    assert.equal(fixture.state.outbox[0].payload?.initialMessage, undefined);
    assert.equal(
      String(fixture.state.audits[0].description || '').includes('The delivered package'),
      false,
    );

    const claim = requiredMethod(fixture.service, 'claim');
    const beforeStale = snapshotEffects(fixture.state);
    await expectDomainError(
      () => claim(actors.staffA, applied.id, {
        expectedVersion: 0,
        idempotencyKey: 'support-stale-claim-0001',
      }),
      'SUPPORT_VERSION_CONFLICT',
    );
    assert.deepEqual(snapshotEffects(fixture.state), beforeStale);

    for (const [index, invalid] of [
      { idempotencyKey: 'short' },
      { idempotencyKey: 'x'.repeat(129) },
      { expectedVersion: -1, idempotencyKey: 'support-invalid-version-0001' },
      { expectedVersion: 1.5, idempotencyKey: 'support-invalid-version-0002' },
    ].entries()) {
      const invalidFixture = buildSupportFixture();
      const invalidCreate = requiredMethod(invalidFixture.service, 'createRequest');
      await expectDomainError(
        () => invalidCreate(actors.customer, supportCreate({
          ...invalid,
          idempotencyKey: invalid.idempotencyKey || `support-invalid-command-${index}`,
        })),
        'COMMAND_VALIDATION_FAILED',
      );
      assert.equal(invalidFixture.state.tickets.length, 0);
      assert.equal(invalidFixture.state.audits.length, 0);
      assert.equal(invalidFixture.state.outbox.length, 0);
    }

    const beforeDelivery = structuredClone(fixture.state.foreignDomains);
    fixture.outbox.failDeliveryNext = true;
    await expectDomainError(
      () => fixture.outbox.deliverNext(),
      'OUTBOX_DELIVERY_FAILED',
    );
    assert.equal(fixture.state.outbox[0].status, 'Pending');
    assert.equal(fixture.state.outbox[0].attempts, 1);
    const delivered = await fixture.outbox.deliverNext();
    assert.equal(delivered.status, 'Delivered');
    assert.equal(delivered.attempts, 2);
    assert.deepEqual(fixture.state.foreignDomains, beforeDelivery);
    for (const gateway of Object.values(fixture.foreignMutationGateways)) {
      assert.equal(gateway.calls.length, 0);
    }
  });
});
