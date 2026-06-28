const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createNotificationService } = require('./notification.service');

describe('notification service', () => {
  it('records payment status notification with pending delivery status', async () => {
    const saved = [];
    const service = createNotificationService({
      notificationRepository: {
        async create(data) {
          saved.push(data);
          return { _id: 'noti-1', ...data };
        },
      },
    });

    const result = await service.notifyPaymentStatus({
      userId: 'customer-1',
      orderCode: 'ORD-1',
      paymentStatus: 'Paid',
    });

    assert.equal(result.type, 'PAYMENT_STATUS');
    assert.equal(result.deliveryStatus, 'Pending');
    assert.equal(saved[0].userId, 'customer-1');
  });
});
