const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  NOTIFICATION_TYPES,
  TYPE_DISPLAY_VALUES,
  renderNotification,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');
const { resolveNotificationChannels } = require('./notificationPolicy.service');
const { canonicalNotificationEvent } = require('./notificationOutbox.service');
const { createNotificationService } = require('./notification.service');

const TYPE = 'REFUND_PAYOUT_OPERATION_RECONCILED';

describe('Refund payout reconciliation notification contract', () => {
  it('registers the Staff-only canonical type with requestCode as its only display value', () => {
    assert.ok(NOTIFICATION_TYPES.includes(TYPE));
    assert.deepEqual(TYPE_DISPLAY_VALUES[TYPE], ['requestCode']);
    assert.deepEqual(sanitizeDisplayValues(TYPE, { requestCode: 'RR-001' }, { rejectUnknown: true }), {
      requestCode: 'RR-001',
    });
    assert.throws(
      () => sanitizeDisplayValues(TYPE, { requestCode: 'RR-001', bankBin: '970436' }, { rejectUnknown: true }),
      /display value bankBin is not allowed/i,
    );
    const copy = renderNotification(TYPE, TYPE, { requestCode: 'RR-001' });
    assert.match(copy.subject, /RR-001/);
    assert.doesNotMatch(JSON.stringify(copy), /bank|account|provider|reference|note|bin/i);
  });

  it('allows InApp only for the intended Staff recipient and rejects every other role', () => {
    assert.deepEqual(resolveNotificationChannels(TYPE, {
      userId: 'staff-1', role: 'Staff', hasAccessibleAccount: true,
    }), ['InApp']);
    for (const role of ['', 'Customer', 'WarehouseManager', 'Admin']) {
      assert.deepEqual(resolveNotificationChannels(TYPE, {
        userId: 'user-1', role, hasAccessibleAccount: true,
      }), []);
    }
  });

  it('accepts the canonical direct-Staff DomainOutbox event and materializes no Email tuple', async () => {
    const event = canonicalNotificationEvent({
      identityKey: 'refund-payout:rr-1:operation-1:reconciled',
      eventType: TYPE,
      payload: {
        businessEventId: 'refund-payout:rr-1:operation-1:reconciled',
        type: TYPE,
        recipient: { userId: 'staff-1', role: 'Staff' },
        target: { collection: 'ReturnRefundRequest', id: 'request-1' },
        displayValues: { requestCode: 'RR-001' },
      },
    });
    assert.deepEqual(event, {
      businessEventId: 'refund-payout:rr-1:operation-1:reconciled',
      type: TYPE,
      recipient: { userId: 'staff-1', email: '', role: 'Staff' },
      target: { collection: 'ReturnRefundRequest', id: 'request-1' },
      displayValues: { requestCode: 'RR-001' },
    });

    const tuples = [];
    const service = createNotificationService({
      notificationRepository: {
        async findRecipientById() {
          return { _id: 'staff-1', email: 'staff@example.com', role: 'Staff', status: 'Active' };
        },
        async createTuple(tuple) {
          const created = { _id: `notification-${tuples.length + 1}`, ...tuple };
          tuples.push(created);
          return created;
        },
      },
      emailOutboxService: { async enqueue() { throw new Error('Staff reconciliation must not enqueue Email'); } },
    });

    const result = await service.publishDomainEvent(event);
    assert.deepEqual(result.map((tuple) => tuple.channel), ['InApp']);
    assert.deepEqual(tuples.map((tuple) => tuple.channel), ['InApp']);
    assert.doesNotMatch(JSON.stringify(tuples), /bank|account|provider|reference|note|bin/i);
  });
});
