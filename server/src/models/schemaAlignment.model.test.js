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
const Invoice = require('./invoice.model');
const ReturnItem = require('./returnItem.model');
const CodEvidence = require('./codEvidence.model');
const CodRecoveryReceipt = require('./codRecoveryReceipt.model');
const RefundDestination = require('./refundDestination.model');
const RefundPayoutEvidence = require('./refundPayoutEvidence.model');
const InventoryTransaction = require('./inventoryTransaction.model');

function assertPath(model, pathName) {
  assert.ok(model.schema.path(pathName), `${model.modelName}.${pathName} should exist`);
}

describe('schema alignment with ERD', () => {
  it('stores Vietnamese checkout and fulfillment fields on orders', () => {
    ['receiverName', 'receiverPhone', 'subtotal', 'shippingFee', 'currency', 'customerNote', 'confirmedAt', 'packedAt', 'shippedAt', 'deliveredAt', 'codExpectedAmount', 'customerCollectedAmount', 'carrierSettlementAmount', 'codDiscrepancyStatus', 'completedSaleAt', 'returnDeadlineAt'].forEach((field) => {
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
    ['productNameSnapshot', 'productSkuSnapshot', 'unitSnapshot', 'productImageSnapshot', 'priceSnapshot', 'priceVersionSnapshot', 'quantity', 'subtotal'].forEach((field) => {
      assertPath(OrderDetail, field);
      assert.equal(OrderDetail.schema.path(field).options.immutable, true);
    });
  });

  it('stores payment attempts, append-only callback identity, and refund hand-off state', () => {
    ['orderId', 'attemptCode', 'paymentProvider', 'providerOrderCode', 'paymentLinkId', 'checkoutUrl', 'qrCode', 'expiresAt', 'paymentStatus'].forEach((field) => assertPath(PaymentAttempt, field));
    ['orderId', 'paymentAttemptId', 'paymentProvider', 'providerMessageId', 'rawPayload'].forEach((field) => assertPath(PaymentCallbackEvent, field));
    ['orderId', 'paymentAttemptId', 'status', 'reason'].forEach((field) => assertPath(RefundPending, field));
    ['orderId', 'eventId', 'eventType', 'customerCollectedAmount', 'carrierSettlementAmount', 'evidenceReference'].forEach((field) => assertPath(CodEvidence, field));
    ['orderId', 'receiptId', 'recordedBy', 'items', 'evidenceReference', 'status'].forEach((field) => assertPath(CodRecoveryReceipt, field));
    assert.ok(PaymentAttempt.schema.path('paymentStatus').enumValues.includes('Unpaid'));
    assert.ok(!PaymentAttempt.schema.path('paymentStatus').enumValues.includes('RefundPending'));
    assert.ok(!PaymentAttempt.schema.path('paymentStatus').enumValues.includes('Refunded'));
    assertPath(Order, 'moneyObligationsSettled');
    ['orderId', 'attemptCode', 'paymentMethod', 'paymentProvider', 'providerOrderCode', 'amount', 'currency'].forEach((field) => {
      assert.equal(PaymentAttempt.schema.path(field).options.immutable, true);
    });
    ['orderId', 'paymentMethod', 'amount', 'currency'].forEach((field) => {
      assert.equal(Payment.schema.path(field).options.immutable, true);
    });
  });

  it('stores after-sale request codes and evidence fields', () => {
    ['requestCode', 'evidenceImages', 'paymentId', 'requestedAt', 'handledAt', 'approvedAt', 'shipByAt', 'handoffAt', 'receivedAt', 'verifiedDestinationId', 'refundPendingId', 'completionEvidenceId'].forEach((field) => {
      assertPath(ReturnRefundRequest, field);
    });
    ['returnRefundRequestId', 'customerId', 'version', 'bankName', 'accountNumberEncrypted', 'accountHolderEncrypted', 'destinationFingerprint', 'status', 'idempotencyKey'].forEach((field) => assertPath(RefundDestination, field));
    ['returnRefundRequestId', 'refundPendingId', 'destinationId', 'amount', 'idempotencyKey', 'method', 'providerReference', 'status', 'recordedBy'].forEach((field) => assertPath(RefundPayoutEvidence, field));
    assert.ok(InventoryTransaction.schema.path('transactionType').enumValues.includes('RETURN_IN'));
    assert.ok(InventoryTransaction.schema.path('transactionType').enumValues.includes('RETURN_DAMAGED_IN'));
    ['ticketCode', 'requestType', 'priority', 'productId', 'closedAt'].forEach((field) => {
      assertPath(SupportRequest, field);
    });
  });

  it('stores immutable invoice snapshots and warehouse return inspection records', () => {
    ['orderId', 'invoiceCode', 'issuedBy', 'issuedAt', 'currency', 'subtotal', 'shippingFee', 'totalAmount', 'receiverName', 'receiverPhone', 'shippingAddress', 'items'].forEach((field) => {
      assertPath(Invoice, field);
    });
    ['returnRefundRequestId', 'orderDetailId', 'productId', 'requestedQuantity', 'receivedQuantity', 'sellableQuantity', 'damagedQuantity', 'evidenceImages', 'warehouseNote', 'inspectedBy', 'inspectedAt'].forEach((field) => {
      assertPath(ReturnItem, field);
    });
  });

  it('stores notification targeting and provider fields', () => {
    ['targetCollection', 'targetId', 'recipientEmail', 'providerMessageId', 'eventId'].forEach((field) => {
      assertPath(Notification, field);
    });
    const eventIndex = Notification.schema.indexes().find(([fields]) => fields.userId === 1 && fields.eventId === 1);
    assert.equal(eventIndex[1].unique, true);
    assert.ok(eventIndex[1].partialFilterExpression);
  });
});
