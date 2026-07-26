const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createModelNotificationRepository, createNotificationService } = require('./notification.service');

function fixture() {
  const now = new Date('2030-07-25T00:00:00.000Z');
  const rows = [
    { _id: 'notification-1', userId: 'customer-1', type: 'ORDER_SHIPPED', templateKey: 'ORDER_SHIPPED', displayValues: { orderCode: 'ORD-001' }, channel: 'InApp', state: 'Unread', createdAt: now, targetCollection: 'Order', targetId: 'order-1' },
    { _id: 'notification-2', userId: 'customer-1', type: 'ORDER_DELIVERED', templateKey: 'ORDER_DELIVERED', displayValues: { orderCode: 'ORD-002' }, channel: 'InApp', state: 'Read', readAt: now, createdAt: now },
    { _id: 'notification-3', userId: 'customer-1', type: 'SUPPORT_RESOLVED', templateKey: 'SUPPORT_RESOLVED', displayValues: { ticketCode: 'SUP-001' }, channel: 'InApp', state: 'Archived', readAt: now, archivedAt: now, createdAt: now },
    { _id: 'notification-4', userId: 'customer-2', type: 'ORDER_SHIPPED', templateKey: 'ORDER_SHIPPED', displayValues: { orderCode: 'OTHER' }, channel: 'InApp', state: 'Unread', createdAt: now },
  ];
  const repository = {
    async listByUser(userId, options) {
      return { items: rows.filter((row) => row.userId === userId && (options.status === 'archived' ? row.state === 'Archived' : row.state !== 'Archived') && (options.status !== 'unread' || row.state === 'Unread')), nextCursor: null };
    },
    async countUnread(userId) { return rows.filter((row) => row.userId === userId && row.state === 'Unread').length; },
    async findByIdForUser(userId, id) { return rows.find((row) => row.userId === userId && row._id === id) || null; },
    async markAsReadForUser(userId, id, at) {
      const row = rows.find((entry) => entry.userId === userId && entry._id === id);
      if (!row) return null;
      if (row.state === 'Unread') Object.assign(row, { state: 'Read', readAt: at });
      return row;
    },
    async archiveForUser(userId, id, at) {
      const row = rows.find((entry) => entry.userId === userId && entry._id === id);
      if (!row) return null;
      if (row.state === 'Unread') return { conflict: 'Unread' };
      if (row.state === 'Read') Object.assign(row, { state: 'Archived', archivedAt: at });
      return row;
    },
  };
  return { rows, repository, now };
}

describe('SL-009 Notification service', () => {
  it('AT-179 lists active, unread, and archived owner-only pages with unread count', async () => {
    const { repository } = fixture();
    const service = createNotificationService({ notificationRepository: repository, notificationIdValidator: () => true });

    const active = await service.listMyNotifications('customer-1', { status: 'active' });
    assert.deepEqual(active.items.map((item) => item.id), ['notification-1', 'notification-2']);
    assert.deepEqual(active.items.map((item) => item.channel), ['InApp', 'InApp']);
    assert.deepEqual((await service.listMyNotifications('customer-1', { status: 'unread' })).items.map((item) => item.id), ['notification-1']);
    assert.deepEqual((await service.listMyNotifications('customer-1', { status: 'archived' })).items.map((item) => item.id), ['notification-3']);
    assert.equal((await service.listMyNotifications('customer-1', { status: 'archived' })).unreadCount, 1);
  });

  it('AT-179 enforces Unread -> Read -> Archived, idempotency, and no unread archive', async () => {
    const { repository, now } = fixture();
    const service = createNotificationService({ notificationRepository: repository, notificationIdValidator: () => true, clock: () => now });

    const read = await service.markAsRead('customer-1', 'notification-1');
    const readReplay = await service.markAsRead('customer-1', 'notification-1');
    assert.equal(read.state, 'Read');
    assert.equal(readReplay.readAt, read.readAt);

    const archived = await service.archiveNotification('customer-1', 'notification-1');
    const archiveReplay = await service.archiveNotification('customer-1', 'notification-1');
    const readAfterArchiveReplay = await service.markAsRead('customer-1', 'notification-1');
    assert.equal(archived.state, 'Archived');
    assert.equal(archiveReplay.archivedAt, archived.archivedAt);
    assert.equal(readAfterArchiveReplay.state, 'Archived');
    assert.equal(readAfterArchiveReplay.archivedAt, archived.archivedAt);

    await assert.rejects(
      () => service.archiveNotification('customer-2', 'notification-4'),
      (error) => error.statusCode === 409 && error.errorCode === 'NOTIFICATION_UNREAD_CANNOT_ARCHIVE'
    );
  });

  it('AT-179 discloses the same generic not-found for malformed and foreign notification IDs', async () => {
    const { repository } = fixture();
    const service = createNotificationService({ notificationRepository: repository, notificationIdValidator: (id) => id !== 'malformed' });

    for (const id of ['malformed', 'notification-4', 'missing']) {
      await assert.rejects(
        () => service.getNotification('customer-1', id),
        (error) => error.statusCode === 404 && error.message === 'Notification not found'
      );
    }
  });

  it('AT-180 resolves a target only after notification ownership is established', async () => {
    const { repository } = fixture();
    const calls = [];
    const service = createNotificationService({
      notificationRepository: repository,
      notificationIdValidator: () => true,
      targetResolver: { async resolve(actor, target) { calls.push({ actor, target }); return { href: '/orders/order-1' }; } },
    });

    assert.deepEqual(await service.resolveTarget({ id: 'customer-1', role: 'Customer' }, 'notification-1'), { href: '/orders/order-1' });
    assert.deepEqual(calls, [{ actor: { id: 'customer-1', role: 'Customer' }, target: { collection: 'Order', id: 'order-1' } }]);
    await assert.rejects(() => service.resolveTarget({ id: 'customer-2', role: 'Customer' }, 'notification-1'), /Notification not found/);
    assert.equal(calls.length, 1);
  });

  it('AT-177 treats the legacy customer-addressed stock export event as packed audit-only', async () => {
    const rows = [];
    const service = createNotificationService({
      notificationRepository: {
        async findActiveUserById() {
          return { _id: 'customer-1', email: 'customer@example.com', role: 'Customer' };
        },
        async createTuple(data) {
          const row = { _id: `notification-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
    });

    const result = await service.publishDomainEvent({
      businessEventId: 'stock-export:order-1',
      type: 'STOCK_EXPORT',
      recipientId: 'customer-1',
    });

    assert.deepEqual(result, []);
    assert.deepEqual(rows, []);
  });

  it('AT-176 sends identity security events only by email when the account is inaccessible', async () => {
    const rows = [];
    const enqueued = [];
    const service = createNotificationService({
      notificationRepository: {
        async findActiveUserById() { return null; },
        async createTuple(data) {
          const row = { _id: `notification-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
      emailOutboxService: {
        async enqueue(data) { enqueued.push(data); return { _id: 'email-1' }; },
      },
    });

    const result = await service.publishDomainEvent({
      businessEventId: 'security:user-disabled',
      type: 'PASSWORD_RESET_COMPLETED',
      recipientId: 'disabled-user',
      recipientEmail: 'disabled@example.com',
    });

    assert.deepEqual(result.map((item) => item.channel), ['Email']);
    assert.deepEqual(rows.map((item) => item.channel), ['Email']);
    assert.equal(enqueued.length, 1);
  });

  it('AT-176 expands legacy customer producer calls through the exact Email plus InApp policy', async () => {
    const rows = [];
    const enqueued = [];
    const service = createNotificationService({
      notificationRepository: {
        async findActiveUserById() {
          return { _id: 'customer-1', email: 'customer@example.com', role: 'Customer' };
        },
        async createTuple(data) {
          const row = { _id: `notification-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
      emailOutboxService: { async enqueue(data) { enqueued.push(data); return data; } },
    });

    await service.createInAppNotification({
      userId: 'customer-1',
      type: 'ORDER_SHIPPED',
      eventId: 'shipment:order-1:shipped',
      displayValues: { orderCode: 'ORD-001' },
      targetCollection: 'Order',
      targetId: '507f1f77bcf86cd799439011',
    });

    assert.deepEqual(rows.map((row) => row.channel), ['Email', 'InApp']);
    assert.equal(enqueued.length, 1);
  });

  it('AT-DR-006 routes customer-confirmed delivery to the owning Customer over Email and InApp only', async () => {
    const rows = [];
    const enqueued = [];
    const recipients = {
      'customer-1': { _id: 'customer-1', email: 'customer@example.com', role: 'Customer', status: 'Active' },
      'staff-1': { _id: 'staff-1', email: 'staff@example.com', role: 'Staff', status: 'Active' },
    };
    const service = createNotificationService({
      notificationRepository: {
        async findRecipientById(id) { return recipients[id] || null; },
        async createTuple(data) {
          const row = { _id: `notification-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
      emailOutboxService: { async enqueue(data) { enqueued.push(data); return data; } },
    });

    const delivered = await service.publishDomainEvent({
      businessEventId: 'customer-delivery-receipt:received-1',
      type: 'ORDER_COMPLETED_BY_CUSTOMER',
      recipient: { userId: 'customer-1', role: 'Customer' },
      target: { collection: 'Order', id: 'order-1' },
      displayValues: { orderCode: 'ORD-001' },
    });
    const unintended = await service.publishDomainEvent({
      businessEventId: 'customer-delivery-receipt:received-staff',
      type: 'ORDER_COMPLETED_BY_CUSTOMER',
      recipient: { userId: 'staff-1', role: 'Staff' },
      target: { collection: 'Order', id: 'order-1' },
      displayValues: { orderCode: 'ORD-001' },
    });

    assert.deepEqual(delivered.map((row) => row.channel), ['Email', 'InApp']);
    assert.deepEqual(rows.map((row) => [row.type, row.channel]), [
      ['ORDER_COMPLETED_BY_CUSTOMER', 'Email'],
      ['ORDER_COMPLETED_BY_CUSTOMER', 'InApp'],
    ]);
    assert.equal(enqueued.length, 1);
    assert.deepEqual(unintended, []);
  });

  it('AT-DR-007 routes a customer delivery dispute to the owning Customer over Email and InApp only', async () => {
    const rows = [];
    const enqueued = [];
    const recipients = {
      'customer-1': { _id: 'customer-1', email: 'customer@example.com', role: 'Customer', status: 'Active' },
      'staff-1': { _id: 'staff-1', email: 'staff@example.com', role: 'Staff', status: 'Active' },
    };
    const service = createNotificationService({
      notificationRepository: {
        async findRecipientById(id) { return recipients[id] || null; },
        async createTuple(data) {
          const row = { _id: `notification-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
      emailOutboxService: { async enqueue(data) { enqueued.push(data); return data; } },
    });

    const disputed = await service.publishDomainEvent({
      businessEventId: 'customer-delivery-receipt:disputed-1',
      type: 'CUSTOMER_DELIVERY_DISPUTED',
      recipient: { userId: 'customer-1', role: 'Customer' },
      target: { collection: 'Order', id: 'order-1' },
      displayValues: { orderCode: 'ORD-001' },
    });
    const unintended = await service.publishDomainEvent({
      businessEventId: 'customer-delivery-receipt:disputed-staff',
      type: 'CUSTOMER_DELIVERY_DISPUTED',
      recipient: { userId: 'staff-1', role: 'Staff' },
      target: { collection: 'Order', id: 'order-1' },
      displayValues: { orderCode: 'ORD-001' },
    });

    assert.deepEqual(disputed.map((row) => row.channel), ['Email', 'InApp']);
    assert.deepEqual(rows.map((row) => [row.type, row.channel]), [
      ['CUSTOMER_DELIVERY_DISPUTED', 'Email'],
      ['CUSTOMER_DELIVERY_DISPUTED', 'InApp'],
    ]);
    assert.equal(enqueued.length, 1);
    assert.deepEqual(unintended, []);
  });

  it('AT-DR-009 rejects Customer role broadcasts for owner-scoped delivery events before fan-out', async () => {
    const rows = [];
    let broadcastLookups = 0;
    const service = createNotificationService({
      notificationRepository: {
        async listActiveUsersByRole() {
          broadcastLookups += 1;
          return [
            { _id: 'customer-1', email: 'customer-1@example.com', role: 'Customer', status: 'Active' },
            { _id: 'customer-2', email: 'customer-2@example.com', role: 'Customer', status: 'Active' },
          ];
        },
        async createTuple(data) {
          const row = { _id: `notification-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
      emailOutboxService: { async enqueue(data) { return data; } },
    });

    for (const type of ['ORDER_COMPLETED_BY_CUSTOMER', 'CUSTOMER_DELIVERY_DISPUTED']) {
      await assert.rejects(
        () => service.publishDomainEvent({
          businessEventId: `customer-delivery-receipt:${type}:broadcast`,
          type,
          recipientRole: 'Customer',
          target: { collection: 'Order', id: 'order-1' },
          displayValues: { orderCode: 'ORD-001' },
        }),
        (error) => error.code === 'NOTIFICATION_DIRECT_RECIPIENT_REQUIRED'
          && error.message === 'Notification event requires a direct recipient',
      );
    }

    assert.equal(broadcastLookups, 0);
    assert.deepEqual(rows, []);
  });

  it('AT-181 fails closed for wrong recipient roles and keeps disabled Customers out of InApp', async () => {
    const scenarios = [
      [{ _id: 'staff-1', email: 'staff@example.com', role: 'Staff' }, 'ORDER_SHIPPED', []],
      [{ _id: 'staff-1', email: 'staff@example.com', role: 'Staff' }, 'LOW_STOCK_OPENED', []],
      [{ _id: 'customer-1', email: 'customer@example.com', role: 'Customer', status: 'Disabled' }, 'ORDER_SHIPPED', ['Email']],
    ];

    for (const [recipient, type, expectedChannels] of scenarios) {
      const rows = [];
      const service = createNotificationService({
        notificationRepository: {
          async findRecipientById() { return recipient; },
          async createTuple(data) { const row = { _id: `notification-${rows.length + 1}`, ...data }; rows.push(row); return row; },
        },
        emailOutboxService: { async enqueue() {} },
      });
      await service.publishDomainEvent({
        businessEventId: `event:${type}:${recipient._id}`,
        type,
        recipientId: recipient._id,
        displayValues: type === 'ORDER_SHIPPED' ? { orderCode: 'ORD-001' } : { productName: 'Chảo' },
      });
      assert.deepEqual(rows.map((row) => row.channel), expectedChannels);
    }
  });

  it('AT-181 preserves a missing guest user id as empty for email-only identity events', async () => {
    const rows = [];
    const service = createNotificationService({
      notificationRepository: {
        async findRecipientById() { return null; },
        async createTuple(data) { const row = { _id: 'notification-1', ...data }; rows.push(row); return row; },
      },
      emailOutboxService: { async enqueue() {} },
    });

    await service.publishDomainEvent({
      businessEventId: 'identity:guest:completed',
      type: 'ACCOUNT_REGISTRATION_COMPLETED',
      recipient: { email: 'guest@example.com' },
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].channel, 'Email');
    assert.equal(rows[0].userId, null);
    assert.equal(rows[0].recipientIdentity, 'email:guest@example.com');
    assert.doesNotMatch(JSON.stringify(rows), /undefined/);
  });

  it('AT-181 rejects an ambiguous direct-recipient plus role-broadcast envelope', async () => {
    const service = createNotificationService({
      notificationRepository: {
        async listActiveUsersByRole() { return []; },
        async createTuple(data) { return { _id: 'notification-1', ...data }; },
      },
    });

    await assert.rejects(
      () => service.publishDomainEvent({
        businessEventId: 'damage:decision:1',
        type: 'DAMAGE_DECIDED',
        recipientRole: 'WarehouseManager',
        recipientId: 'staff-1',
        displayValues: { quantity: 1 },
      }),
      /exactly one recipient selector/i
    );
  });

  it('AT-176 uses one atomic tuple upsert without duplicate-key recovery inside the caller transaction', async () => {
    const calls = [];
    const document = { _id: 'notification-1', businessEventId: 'event-1', recipientIdentity: 'user:user-1', type: 'ORDER_SHIPPED', channel: 'InApp' };
    const model = {
      findOne() { throw new Error('preflight reads race and must not be used'); },
      create() { throw new Error('insert plus duplicate recovery must not be used'); },
      findOneAndUpdate(filter, update, options) {
        calls.push({ filter, update, options });
        return { async lean() { return document; } };
      },
    };
    const repository = createModelNotificationRepository({ notificationModel: model });
    const session = { id: 'mongo-session-1' };

    assert.equal(await repository.createTuple(document, session), document);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].update, { $setOnInsert: document });
    assert.equal(calls[0].options.upsert, true);
    assert.equal(calls[0].options.session, session);
  });

  it('AT-179 repository read replay returns the current Archived state instead of not-found', async () => {
    const archived = { _id: '507f1f77bcf86cd799439011', state: 'Archived', readAt: new Date(), archivedAt: new Date() };
    const model = {
      findOneAndUpdate() { return { async lean() { return null; } }; },
      findOne() { return { async lean() { return archived; } }; },
    };
    const repository = createModelNotificationRepository({ notificationModel: model });

    assert.equal(await repository.markAsReadForUser('507f1f77bcf86cd799439012', archived._id, new Date()), archived);
  });
});
