const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  createCustomerDeliveryReceiptPolicy,
} = require('./customerDeliveryReceiptPolicy');

function repositoryWith(receipt) {
  return {
    async findLatestCustomerDeliveryReceiptByOrder() {
      return receipt;
    },
  };
}

describe('customer delivery receipt after-sales policy', () => {
  const order = {
    _id: 'order-1',
    customerId: 'customer-1',
    orderStatus: 'Delivered',
    deliveredAt: new Date('2026-07-20T10:00:00.000Z'),
    exchangeDeadlineAt: new Date('2099-01-01T00:00:00.000Z'),
    returnDeadlineAt: new Date('2099-01-01T00:00:00.000Z'),
  };

  it('requires an explicit Customer receipt for a physically Delivered legacy order', async () => {
    const policy = createCustomerDeliveryReceiptPolicy({
      repository: repositoryWith(null),
    });

    await assert.rejects(
      () => policy.requireReceived({
        order,
        customerId: 'customer-1',
        deadlineField: 'returnDeadlineAt',
      }),
      (error) => error.statusCode === 409
        && error.errorCode === 'AFTER_SALES_DELIVERY_CONFIRMATION_REQUIRED',
    );
  });

  it('blocks a latest NOT_RECEIVED decision with a distinct typed error', async () => {
    const policy = createCustomerDeliveryReceiptPolicy({
      repository: repositoryWith({
        _id: 'receipt-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        outcome: 'NOT_RECEIVED',
      }),
    });

    await assert.rejects(
      () => policy.requireReceived({
        order,
        customerId: 'customer-1',
        deadlineField: 'exchangeDeadlineAt',
      }),
      (error) => error.statusCode === 409
        && error.errorCode === 'AFTER_SALES_DELIVERY_DISPUTED',
    );
  });

  it('returns only the immutable deadline from a matching terminal RECEIVED snapshot', async () => {
    const receiptDeadline = new Date('2026-07-25T10:00:00.000Z');
    const policy = createCustomerDeliveryReceiptPolicy({
      repository: repositoryWith({
        _id: 'receipt-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        outcome: 'RECEIVED',
        returnDeadlineAt: receiptDeadline,
      }),
    });

    const result = await policy.requireReceived({
      order,
      customerId: 'customer-1',
      deadlineField: 'returnDeadlineAt',
    });

    assert.equal(result.deadlineAt.getTime(), receiptDeadline.getTime());
    assert.notEqual(result.deadlineAt.getTime(), order.returnDeadlineAt.getTime());
  });

  it('fails closed when receipt ownership or order identity does not match', async () => {
    for (const receipt of [
      {
        _id: 'receipt-foreign-order',
        orderId: 'order-2',
        customerId: 'customer-1',
        outcome: 'RECEIVED',
        returnDeadlineAt: new Date('2026-07-25T10:00:00.000Z'),
      },
      {
        _id: 'receipt-foreign-customer',
        orderId: 'order-1',
        customerId: 'customer-2',
        outcome: 'RECEIVED',
        returnDeadlineAt: new Date('2026-07-25T10:00:00.000Z'),
      },
    ]) {
      const policy = createCustomerDeliveryReceiptPolicy({
        repository: repositoryWith(receipt),
      });
      await assert.rejects(
        () => policy.requireReceived({
          order,
          customerId: 'customer-1',
          deadlineField: 'returnDeadlineAt',
        }),
        (error) => error.errorCode === 'AFTER_SALES_DELIVERY_CONFIRMATION_REQUIRED',
      );
    }
  });
});
