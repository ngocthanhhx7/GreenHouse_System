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
      actors.staffA,
      actors.staffB,
      actors.inactiveStaff,
    ],
    orders: [
      { id: 'order-old', customerId: 'customer-1', deliveredAt: new Date('2026-07-20T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-new', customerId: 'customer-1', deliveredAt: new Date('2026-07-22T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-tie', customerId: 'customer-1', deliveredAt: new Date('2026-07-22T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-foreign', customerId: 'customer-2', deliveredAt: new Date('2026-07-23T08:00:00.000Z'), status: 'Delivered' },
      { id: 'order-undelivered', customerId: 'customer-1', deliveredAt: null, status: 'Shipped' },
    ],
    orderDetails: [
      { id: 'detail-001', orderId: 'order-old', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-010', orderId: 'order-new', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-011', orderId: 'order-tie', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-foreign', orderId: 'order-foreign', productId: 'product-1', sku: 'SKU-1' },
      { id: 'detail-undelivered', orderId: 'order-undelivered', productId: 'product-1', sku: 'SKU-1' },
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
      actors.customer,
      actors.foreignCustomer,
      actors.staffA,
      actors.staffB,
      actors.inactiveStaff,
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
  const service = createSupportService({
    repository,
    transactionManager,
    auditLogger,
    outbox,
    outboxRepository: outbox,
    clock,
    now: () => clock.now(),
    assignmentCoordinator,
  });

  return {
    state,
    repository,
    auditLogger,
    outbox,
    clock,
    transactionManager,
    assignmentCoordinator,
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
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');

    const result = await createReview(
      actors.customer,
      'product-1',
      reviewCommand({ orderDetailId: undefined }),
    );

    assert.equal(result.orderDetailId, 'detail-011');
  });

  it('AT-152 keeps one Customer+Product identity across repeat purchases', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    await createReview(actors.customer, 'product-1', reviewCommand());
    const before = snapshotEffects(fixture.state);

    await expectDomainError(
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
  });

  it('AT-153 preserves Review identity after return/refund and same-SKU exchange changes', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    const created = await createReview(actors.customer, 'product-1', reviewCommand());
    fixture.state.orders.find((item) => item.id === 'order-old').status = 'Returned';
    fixture.state.orderDetails.push({
      id: 'detail-exchange',
      orderId: 'order-new',
      productId: 'product-1',
      sku: 'SKU-1',
      source: 'Exchange',
    });

    const publicPage = await listPublic('product-1', { page: 1, pageSize: 20 });

    assert.equal(fixture.state.reviews.length, 1);
    assert.equal(fixture.state.reviews[0].id, created.id);
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
          audits: 0,
          outbox: 0,
        });
      });
    }
  });

  it('AT-155 denies invalid, foreign, and non-delivered eligibility without effects or disclosure', async () => {
    const cases = ['missing-detail', 'detail-foreign', 'detail-undelivered'];
    for (const [index, orderDetailId] of cases.entries()) {
      const fixture = buildReviewFixture();
      const createReview = requiredMethod(fixture.service, 'createReview');
      const before = snapshotEffects(fixture.state);
      const error = await expectDomainError(
        () => createReview(
          actors.customer,
          'product-1',
          reviewCommand({
            orderDetailId,
            idempotencyKey: `review-denied-${index}-0001`,
          }),
        ),
        'REVIEW_NOT_ELIGIBLE',
      );
      assert.equal(error.statusCode, 404);
      assert.equal(error.data?.orderId, undefined);
      assert.equal(error.data?.customerId, undefined);
      assert.deepEqual(snapshotEffects(fixture.state), before);
    }
  });

  it('AT-156 returns only masked verified public DTO fields under Active Product+Category', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    await createReview(actors.customer, 'product-1', reviewCommand());

    const result = await listPublic('product-1', { page: 1, pageSize: 20 });

    assert.deepEqual(Object.keys(result.items[0]).sort(), [
      'content',
      'createdAt',
      'displayName',
      'rating',
      'updatedAt',
      'verifiedPurchase',
    ]);
    assert.equal(result.items[0].displayName, 'Nguyen T. M. A.');
    assert.equal(result.items[0].verifiedPurchase, true);
    assert.equal(JSON.stringify(result), JSON.stringify(result).replace(
      /customerId|orderId|orderDetailId|email|phone|moderationReason|staffId/g,
      '',
    ));

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
    const created = await createReview(actors.customer, 'product-1', reviewCommand());

    const withdrawn = await setPublication(actors.customer, created.id, {
      publicationStatus: 'Withdrawn',
      expectedVersion: created.version,
      idempotencyKey: 'review-withdraw-0001',
    });
    assert.equal(withdrawn.publicationStatus, 'Withdrawn');
    assert.equal(withdrawn.moderationStatus, 'Allowed');

    const hidden = await moderate(actors.staffA, created.id, {
      moderationStatus: 'HiddenByStaff',
      reason: 'Contains prohibited promotional content',
      expectedVersion: withdrawn.version,
      idempotencyKey: 'review-moderate-0001',
    });
    assert.equal(hidden.publicationStatus, 'Withdrawn');
    assert.equal(hidden.moderationStatus, 'HiddenByStaff');
    assert.equal(fixture.state.publicationHistory.length, 1);
    assert.equal(fixture.state.moderationHistory.length, 1);
  });

  it('AT-158 appends immutable histories and exposes no delete or Staff content edit', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const updateReview = requiredMethod(fixture.service, 'updateReview');
    const created = await createReview(actors.customer, 'product-1', reviewCommand());
    const originalHistory = structuredClone(fixture.state.contentHistory);

    const updated = await updateReview(actors.customer, created.id, {
      rating: 4,
      content: 'Updated customer content',
      expectedVersion: created.version,
      idempotencyKey: 'review-update-0001',
    });
    await expectDomainError(
      () => updateReview(actors.staffA, created.id, {
        rating: 1,
        content: 'Staff overwrite',
        expectedVersion: updated.version,
        idempotencyKey: 'review-staff-edit-0001',
      }),
      'REVIEW_FORBIDDEN',
    );

    assert.equal(typeof fixture.service.deleteReview, 'undefined');
    assert.equal(fixture.state.reviews.length, 1);
    assert.deepEqual(fixture.state.contentHistory.slice(0, originalHistory.length), originalHistory);
    assert.equal(fixture.state.contentHistory.at(-1).rating, 4);
  });

  it('AT-159 derives count/list/one-decimal mean from one visible set with stable paging and no edit reposition', async () => {
    const fixture = buildReviewFixture();
    fixture.state.reviews.push(
      {
        id: 'review-c',
        customerId: 'customer-1',
        productId: 'product-1',
        rating: 5,
        content: 'C',
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
        createdAt: new Date('2026-07-23T00:00:00.000Z'),
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
        version: 1,
      },
      {
        id: 'review-b',
        customerId: 'customer-2',
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
        id: 'review-a',
        customerId: 'customer-3',
        productId: 'product-1',
        rating: 1,
        content: 'hidden',
        publicationStatus: 'Withdrawn',
        moderationStatus: 'Allowed',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
        updatedAt: new Date('2026-07-24T00:00:00.000Z'),
        version: 1,
      },
    );
    fixture.state.users.push({ id: 'customer-3', displayName: 'Hidden User' });
    const listPublic = requiredMethod(fixture.service, 'listPublic');
    const updateReview = requiredMethod(fixture.service, 'updateReview');

    const first = await listPublic('product-1', { page: 1, pageSize: 1 });
    assert.equal(first.total, 2);
    assert.equal(first.averageRating, 4.5);
    assert.equal(first.items[0].content, 'C');
    assert.equal(first.totalPages, 2);

    await updateReview(actors.customer, 'review-c', {
      rating: 3,
      content: 'C edited later',
      expectedVersion: 1,
      idempotencyKey: 'review-stable-edit-0001',
    });
    const afterEdit = await listPublic('product-1', { page: 1, pageSize: 2 });
    assert.deepEqual(afterEdit.items.map((item) => item.content), ['C edited later', 'B']);
    assert.equal(afterEdit.averageRating, 3.5);
  });

  it('AT-160 replays one Review result, resolves a same-key race once, and rejects stale versions without effects', async () => {
    const fixture = buildReviewFixture();
    const createReview = requiredMethod(fixture.service, 'createReview');
    const updateReview = requiredMethod(fixture.service, 'updateReview');
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

    const beforeStale = snapshotEffects(fixture.state);
    await expectDomainError(
      () => updateReview(actors.customer, first.id, {
        rating: 4,
        content: 'stale',
        expectedVersion: 0,
        idempotencyKey: 'review-stale-0001',
      }),
      'REVIEW_VERSION_CONFLICT',
    );
    assert.deepEqual(snapshotEffects(fixture.state), beforeStale);

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
      ['Product', { productId: 'product-1' }],
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
      assert.equal(fixture.state.messages.at(-1).content, 'The delivered package needs support.');
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
    for (const [index, orderId] of ['missing-order', 'order-foreign'].entries()) {
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
      const valid = await createSupportTicket(fixture, {
        type,
        orderId: undefined,
        productId: undefined,
        idempotencyKey: `support-${type.toLowerCase()}-valid-0001`,
      });
      assert.equal(valid.type, type);

      const invalidFixture = buildSupportFixture();
      const createRequest = requiredMethod(invalidFixture.service, 'createRequest');
      await expectDomainError(
        () => createRequest(actors.customer, supportCreate({
          type,
          orderId: 'order-foreign',
          idempotencyKey: `support-${type.toLowerCase()}-invalid-0001`,
        })),
        'SUPPORT_REFERENCE_NOT_FOUND',
      );
      assert.equal(invalidFixture.state.tickets.length, 0);
    }
  });

  it('AT-165 keeps initial/later messages immutable, chronological, paged, and command-idempotent', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    const appendMessage = requiredMethod(fixture.service, 'appendMessage');
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

  it('AT-166 allows only owner and current Active assignee to append in New/InProgress', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    const appendMessage = requiredMethod(fixture.service, 'appendMessage');
    const customerMessage = await appendMessage(actors.customer, ticket.id, {
      message: 'Owner message while New.',
      expectedVersion: ticket.version,
      idempotencyKey: 'support-owner-new-0001',
    });
    const claimed = await claimSupportTicket(fixture, customerMessage);

    await expectDomainError(
      () => appendMessage(actors.staffB, ticket.id, {
        message: 'Non-assignee message.',
        expectedVersion: claimed.version,
        idempotencyKey: 'support-non-assignee-message-0001',
      }),
      'SUPPORT_FORBIDDEN',
    );
    await appendMessage(actors.staffA, ticket.id, {
      message: 'Current assignee message.',
      expectedVersion: claimed.version,
      idempotencyKey: 'support-assignee-message-0001',
    });
    assert.equal(fixture.state.messages.length, 3);
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

    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(fixture.state.assignmentHistory.length, 1);
    assert.ok(['staff-a', 'staff-b'].includes(fixture.state.tickets[0].assigneeId));
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

    for (const [index, priority] of ['Low', 'Normal', 'High', 'Urgent'].entries()) {
      current = await changePriority(actors.staffA, ticket.id, {
        priority,
        reason: 'Valid priority reason',
        expectedVersion: current.version,
        idempotencyKey: `support-priority-${index}-0001`,
      });
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
    await expectDomainError(
      () => transfer(actors.staffA, ticket.id, {
        assigneeId: actors.inactiveStaff.id,
        reason: 'Transfer to unavailable Staff',
        expectedVersion: current.version,
        idempotencyKey: 'support-transfer-inactive-0001',
      }),
      'SUPPORT_TRANSFER_TARGET_INVALID',
    );
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
  });

  it('AT-170 clears a disabled assignee exactly once, preserves state, and permits recovery claim', async () => {
    const fixture = buildSupportFixture();
    const ticket = await createSupportTicket(fixture);
    const claimed = await claimSupportTicket(fixture, ticket);
    const clearDisabledAssignee = requiredMethod(fixture.service, 'clearDisabledAssignee');
    fixture.state.users.find((item) => item.id === actors.staffA.id).status = 'Disabled';

    const cleared = await clearDisabledAssignee(actors.staffA.id, {
      idempotencyKey: 'support-assignee-clear-0001',
    });
    await clearDisabledAssignee(actors.staffA.id, {
      idempotencyKey: 'support-assignee-clear-0001',
    });

    assert.equal(cleared.status, 'InProgress');
    assert.equal(cleared.priority, claimed.priority);
    assert.equal(cleared.assigneeId, null);
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

  it('AT-172 reopens at exactly resolvedAt+72h and rejects +1ms without effects', async () => {
    async function resolvedFixture() {
      const fixture = buildSupportFixture();
      const ticket = await createSupportTicket(fixture);
      const claimed = await claimSupportTicket(fixture, ticket);
      const resolve = requiredMethod(fixture.service, 'resolve');
      const resolved = await resolve(actors.staffA, ticket.id, {
        finalMessage: 'Resolved before reopen test.',
        expectedVersion: claimed.version,
        idempotencyKey: 'support-boundary-resolve-0001',
      });
      return { fixture, resolved };
    }

    const atBoundary = await resolvedFixture();
    const reopen = requiredMethod(atBoundary.fixture.service, 'reopen');
    atBoundary.fixture.clock.set(
      new Date(atBoundary.resolved.resolvedAt).getTime() + 72 * 60 * 60 * 1000,
    );
    const reopened = await reopen(actors.customer, atBoundary.resolved.id, {
      message: 'The same issue returned.',
      expectedVersion: atBoundary.resolved.version,
      idempotencyKey: 'support-reopen-boundary-0001',
    });
    assert.equal(reopened.status, 'InProgress');

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

  it('AT-173 returns owner/Staff-safe paged projections and rejects invalid filters privately', async () => {
    const fixture = buildSupportFixture();
    await createSupportTicket(fixture);
    const createRequest = requiredMethod(fixture.service, 'createRequest');
    await createRequest(actors.foreignCustomer, supportCreate({
      type: 'Other',
      orderId: undefined,
      idempotencyKey: 'support-foreign-owner-0001',
    }));
    const listOwn = requiredMethod(fixture.service, 'listOwn');
    const listOperational = requiredMethod(fixture.service, 'listOperational');

    const own = await listOwn(actors.customer, { page: 1, pageSize: 20 });
    assert.equal(own.total, 1);
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

    await expectDomainError(
      () => listOperational(actors.staffA, {
        status: 'Open',
        page: 0,
        pageSize: 51,
      }),
      'SUPPORT_FILTER_INVALID',
    );
  });

  it('AT-174 rolls back grouped writes, retries delivery safely, and never mutates foreign domains', async () => {
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

    const applied = await createRequest(actors.customer, command);
    const replay = await createRequest(actors.customer, command);
    assert.equal(applied.id, replay.id);
    assert.equal(fixture.state.tickets.length, 1);
    assert.equal(fixture.state.messages.length, 1);
    assert.equal(fixture.state.audits.length, 1);
    assert.equal(fixture.state.outbox.length, 1);
    assert.deepEqual(fixture.state.foreignDomains, foreignBefore);
    assert.equal(fixture.state.outbox[0].payload?.initialMessage, undefined);
    assert.equal(fixture.state.audits[0].description?.includes('The delivered package'), false);

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
  });
});
