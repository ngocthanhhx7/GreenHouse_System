const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  createCustomerDeliveryReceiptPolicy,
} = require('./customerDeliveryReceiptPolicy');
const CustomerDeliveryReceipt = require('../models/customerDeliveryReceipt.model');

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

  it('queries the canonical latest decision by createdAt then id, never respondedAt', async () => {
    const originalFindOne = CustomerDeliveryReceipt.findOne;
    let observedSort = null;
    CustomerDeliveryReceipt.findOne = () => ({
      sort(specification) {
        observedSort = specification;
        return {
          async lean() {
            return {
              _id: 'receipt-latest',
              orderId: 'order-1',
              customerId: 'customer-1',
              outcome: 'RECEIVED',
            };
          },
        };
      },
    });

    try {
      const policy = createCustomerDeliveryReceiptPolicy();
      await policy.requireReceived({ order, customerId: 'customer-1' });
      assert.deepEqual(observedSort, { createdAt: -1, _id: -1 });
    } finally {
      CustomerDeliveryReceipt.findOne = originalFindOne;
    }
  });

  it('treats a later-created RECEIVED decision as effective despite clock skew', async () => {
    const history = [
      {
        _id: 'receipt-a',
        orderId: 'order-1',
        customerId: 'customer-1',
        outcome: 'NOT_RECEIVED',
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
        respondedAt: new Date('2026-07-20T12:00:00.000Z'),
      },
      {
        _id: 'receipt-b',
        orderId: 'order-1',
        customerId: 'customer-1',
        outcome: 'RECEIVED',
        createdAt: new Date('2026-07-20T11:00:00.000Z'),
        respondedAt: new Date('2026-07-20T09:00:00.000Z'),
      },
    ];
    const repository = {
      async findLatestCustomerDeliveryReceiptByOrder() {
        return history.slice().sort((left, right) => (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          || String(right._id).localeCompare(String(left._id), 'en')
        ))[0];
      },
    };

    const result = await createCustomerDeliveryReceiptPolicy({ repository })
      .requireReceived({ order, customerId: 'customer-1' });
    assert.equal(result.receipt._id, 'receipt-b');
  });

  it('uses descending id as the deterministic tie-break for equal createdAt values', async () => {
    const createdAt = new Date('2026-07-20T10:00:00.000Z');
    const history = [
      {
        _id: 'receipt-a',
        orderId: 'order-1',
        customerId: 'customer-1',
        outcome: 'NOT_RECEIVED',
        createdAt,
      },
      {
        _id: 'receipt-b',
        orderId: 'order-1',
        customerId: 'customer-1',
        outcome: 'RECEIVED',
        createdAt,
      },
    ];
    const repository = {
      async findLatestCustomerDeliveryReceiptByOrder() {
        return history.slice().sort((left, right) => (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          || String(right._id).localeCompare(String(left._id), 'en')
        ))[0];
      },
    };

    const result = await createCustomerDeliveryReceiptPolicy({ repository })
      .requireReceived({ order, customerId: 'customer-1' });
    assert.equal(result.receipt._id, 'receipt-b');
  });
});
