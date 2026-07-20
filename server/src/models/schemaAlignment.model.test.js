const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Notification = require('./notification.model');
const Order = require('./order.model');
const OrderDetail = require('./orderDetail.model');
const Payment = require('./payment.model');
const PaymentAttempt = require('./paymentAttempt.model');
const PaymentCallbackEvent = require('./paymentCallbackEvent.model');
const RefundPending = require('./refundPending.model');
const Product = require('./product.model');
const ReturnRefundRequest = require('./returnRefundRequest.model');
const SupportRequest = require('./supportRequest.model');

function assertPath(model, pathName) {
  assert.ok(model.schema.path(pathName), `${model.modelName}.${pathName} should exist`);
}

describe('schema alignment with ERD', () => {
  it('stores Vietnamese checkout and fulfillment fields on orders', () => {
    ['receiverName', 'receiverPhone', 'subtotal', 'shippingFee', 'currency', 'customerNote', 'confirmedAt', 'packedAt', 'shippedAt', 'deliveredAt'].forEach((field) => {
      assertPath(Order, field);
    });
  });

  it('stores payment gateway reconciliation fields', () => {
    ['paymentProvider', 'gatewayResponseCode', 'gatewayMessage', 'providerMessageId', 'currency'].forEach((field) => {
      assertPath(Payment, field);
    });
  });

  it('stores product and order line snapshots for stable invoices', () => {
    assertPath(Product, 'sku');
    ['productNameSnapshot', 'productSkuSnapshot', 'unitSnapshot', 'productImageSnapshot', 'priceSnapshot', 'quantity', 'subtotal'].forEach((field) => assertPath(OrderDetail, field));
  });

  it('stores payment attempts, append-only callback identity, and refund hand-off state', () => {
    ['orderId', 'attemptCode', 'paymentProvider', 'paymentStatus'].forEach((field) => assertPath(PaymentAttempt, field));
    ['orderId', 'paymentAttemptId', 'paymentProvider', 'providerMessageId', 'rawPayload'].forEach((field) => assertPath(PaymentCallbackEvent, field));
    ['orderId', 'paymentAttemptId', 'status', 'reason'].forEach((field) => assertPath(RefundPending, field));
    assert.ok(PaymentAttempt.schema.path('paymentStatus').enumValues.includes('Unpaid'));
    assert.ok(PaymentAttempt.schema.path('paymentStatus').enumValues.includes('RefundPending'));
  });

  it('stores after-sale request codes and evidence fields', () => {
    ['requestCode', 'evidenceImages', 'paymentId', 'requestedAt', 'handledAt'].forEach((field) => {
      assertPath(ReturnRefundRequest, field);
    });
    ['ticketCode', 'requestType', 'priority', 'productId', 'closedAt'].forEach((field) => {
      assertPath(SupportRequest, field);
    });
  });

  it('stores notification targeting and provider fields', () => {
    ['targetCollection', 'targetId', 'recipientEmail', 'providerMessageId'].forEach((field) => {
      assertPath(Notification, field);
    });
  });
});
