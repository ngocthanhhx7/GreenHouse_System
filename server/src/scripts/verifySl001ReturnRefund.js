const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const AfterSalesOrderLock = require('../models/afterSalesOrderLock.model');
const AuditLog = require('../models/auditLog.model');
const Category = require('../models/category.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
const Product = require('../models/product.model');
const RefundDestination = require('../models/refundDestination.model');
const RefundPayoutEvidence = require('../models/refundPayoutEvidence.model');
const RefundPayoutIncident = require('../models/refundPayoutIncident.model');
const RefundPending = require('../models/refundPending.model');
const ReturnItem = require('../models/returnItem.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const User = require('../models/user.model');
const { createReturnRefundService } = require('../services/returnRefund.service');
const { returnEvidenceClaim } = require('../utils/returnEvidenceClaim');

function assertSafeTarget(uri) {
  if (process.env.NODE_ENV === 'production') throw new Error('SL-001 verification cannot run in production');
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/greenhome_kitchen(?:\?|$)/i.test(String(uri || ''))) {
    throw new Error('SL-001 verification is restricted to the local greenhome_kitchen database');
  }
}

async function loadActor(email) {
  const user = await User.findOne({ email }).lean();
  if (!user) throw new Error(`Required local verification account is missing: ${email}`);
  return user;
}

async function cleanup(ids) {
  if (ids.requestId) {
    await AuditLog.deleteMany({ targetEntity: 'ReturnRefundRequest', targetId: String(ids.requestId) });
    await InventoryTransaction.deleteMany({ relatedCollection: 'ReturnRefundRequest', relatedId: ids.requestId });
    await RefundPayoutIncident.deleteMany({ returnRefundRequestId: ids.requestId });
    await RefundPayoutEvidence.deleteMany({ returnRefundRequestId: ids.requestId });
    await RefundDestination.deleteMany({ returnRefundRequestId: ids.requestId });
    await RefundPending.deleteMany({ returnRefundRequestId: ids.requestId });
    await ReturnItem.deleteMany({ returnRefundRequestId: ids.requestId });
    await ReturnRefundRequest.deleteOne({ _id: ids.requestId });
  }
  if (ids.paymentId) await Payment.deleteOne({ _id: ids.paymentId });
  if (ids.attemptId) await PaymentAttempt.deleteOne({ _id: ids.attemptId });
  if (ids.detailId) await OrderDetail.deleteOne({ _id: ids.detailId });
  if (ids.orderId) {
    await AfterSalesOrderLock.deleteOne({
      orderId: ids.orderId,
      caseType: 'RETURN_REFUND',
    });
  }
  if (ids.orderId) await Order.deleteOne({ _id: ids.orderId });
  if (ids.inventoryId) await Inventory.deleteOne({ _id: ids.inventoryId });
  if (ids.productId) await Product.deleteOne({ _id: ids.productId });
  if (ids.categoryId) await Category.deleteOne({ _id: ids.categoryId });
}

async function verifySl001ReturnRefund() {
  require('dotenv').config();
  assertSafeTarget(process.env.MONGODB_URI);
  await connectDatabase();

  const ids = {};
  const marker = crypto.randomUUID();
  const now = new Date();
  try {
    const [customer, staff, warehouse] = await Promise.all([
      loadActor('khachhang@greenhome.test'),
      loadActor('nhanvien@greenhome.test'),
      loadActor('quanlykho@greenhome.test'),
    ]);

    const category = await Category.create({ name: `SL001 verification ${marker}`, description: 'Temporary local verification record' });
    ids.categoryId = category._id;
    const product = await Product.create({
      name: `SL001 verification product ${marker}`,
      sku: `SL001-${marker}`,
      description: 'Temporary local verification record',
      price: 60000,
      stockQuantity: 5,
      unit: 'cái',
      categoryId: category._id,
    });
    ids.productId = product._id;
    const inventory = await Inventory.create({
      productId: product._id,
      stockQuantity: 5,
      reservedQuantity: 0,
      damagedQuantity: 1,
      lowStockThreshold: 1,
      lastUpdatedBy: warehouse._id,
    });
    ids.inventoryId = inventory._id;

    const deliveredAt = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const order = await Order.create({
      orderCode: `SL001-VERIFY-${marker}`,
      customerId: customer._id,
      totalAmount: 120000,
      subtotal: 120000,
      shippingFee: 0,
      currency: 'VND',
      paymentMethod: 'ONLINE',
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      shippingAddress: 'Local verification only',
      deliveredAt,
      returnDeadlineAt: new Date(deliveredAt.getTime() + (5 * 24 * 60 * 60 * 1000)),
    });
    ids.orderId = order._id;
    const detail = await OrderDetail.create({
      orderId: order._id,
      productId: product._id,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
      unitSnapshot: product.unit,
      priceSnapshot: 60000,
      quantity: 2,
      subtotal: 120000,
    });
    ids.detailId = detail._id;
    const payment = await Payment.create({
      orderId: order._id,
      transactionId: `SL001-PAYMENT-${marker}`,
      paymentMethod: 'ONLINE',
      paymentProvider: 'LOCAL_VERIFICATION',
      amount: 120000,
      currency: 'VND',
      paymentStatus: 'Paid',
      paidAt: deliveredAt,
    });
    ids.paymentId = payment._id;
    const attempt = await PaymentAttempt.create({
      orderId: order._id,
      attemptCode: `SL001-ATTEMPT-${marker}`,
      paymentMethod: 'ONLINE',
      paymentProvider: 'LOCAL_VERIFICATION',
      amount: 120000,
      currency: 'VND',
      paymentStatus: 'Paid',
      transactionId: `SL001-PAYMENT-${marker}`,
      paidAt: deliveredAt,
    });
    ids.attemptId = attempt._id;

    const service = createReturnRefundService({
      eventPublisher: { async createInAppNotification() {} },
      clock: () => new Date(now),
    });
    const request = await service.createCustomerRequest(customer._id, {
      orderId: order._id,
      reason: 'Local SL-001 end-to-end verification',
      evidenceImages: [returnEvidenceClaim.sign(
        customer._id,
        '/api/return-refunds/evidence/33333333-3333-4333-8333-333333333333.jpg',
        1024,
      )],
    });
    ids.requestId = request.id;
    assert.equal(request.status, 'New');
    assert.equal(Object.hasOwn(request, 'refundAmount'), false);

    const approved = await service.decideRequest(staff._id, request.id, { status: 'Approved', staffNote: 'Verification approval' });
    assert.equal(approved.status, 'Approved');
    assert.equal(new Date(approved.shipByAt).getTime() - new Date(approved.approvedAt).getTime(), 3 * 24 * 60 * 60 * 1000);
    await service.recordHandoffProof(customer._id, request.id, { proofReference: `HANDOFF-${marker}`, handoffAt: now });
    const destination = await service.submitDestination(customer._id, request.id, {
      bankName: 'LOCAL TEST BANK',
      bankBin: '970422',
      accountNumber: '0123456789',
      accountHolderName: 'LOCAL TEST CUSTOMER',
      confirmed: true,
      idempotencyKey: `destination:${marker}`,
    });
    await service.verifyDestination(staff._id, request.id, { destinationId: destination.id, status: 'Verified' });

    const warehouseView = await service.getWarehouseRequest(request.id);
    assert.equal(Object.hasOwn(warehouseView, 'destination'), false);
    await service.inspectRequest(warehouse._id, request.id, {
      idempotencyKey: `inspection:${marker}`,
      warehouseNote: 'Verification full receipt',
      items: [{
        orderDetailId: detail._id,
        receivedQuantity: 2,
        sellableQuantity: 1,
        damagedQuantity: 1,
        evidenceImages: [`verification-receipt:${marker}`],
      }],
    });
    const payout = await service.recordPayoutEvidence(staff._id, request.id, {
      idempotencyKey: `payout:${marker}`,
      method: 'MANUAL',
      providerReference: `LOCAL-BANK-${marker}`,
      status: 'Succeeded',
      occurredAt: now,
      reconciliationNote: 'Local verified payout evidence',
    });
    assert.equal(payout.request.status, 'Completed');

    const [storedRequest, storedOrder, storedPayment, storedAttempt, storedInventory, movements, refund, storedDestination, payoutEvidence] = await Promise.all([
      ReturnRefundRequest.findById(request.id).lean(),
      Order.findById(order._id).lean(),
      Payment.findById(payment._id).lean(),
      PaymentAttempt.findById(attempt._id).lean(),
      Inventory.findById(inventory._id).lean(),
      InventoryTransaction.find({ relatedCollection: 'ReturnRefundRequest', relatedId: request.id }).lean(),
      RefundPending.findOne({ returnRefundRequestId: request.id }).lean(),
      RefundDestination.findById(destination.id).select('+accountNumberEncrypted +accountHolderEncrypted +destinationFingerprint').lean(),
      RefundPayoutEvidence.findOne({ returnRefundRequestId: request.id }).lean(),
    ]);

    assert.equal(storedRequest.status, 'Completed');
    assert.equal(storedOrder.orderStatus, 'Returned');
    assert.equal(storedOrder.paymentStatus, 'Paid');
    assert.equal(storedPayment.paymentStatus, 'Paid');
    assert.equal(storedAttempt.paymentStatus, 'Paid');
    assert.equal(storedInventory.stockQuantity, 6);
    assert.equal(storedInventory.damagedQuantity, 2);
    assert.deepEqual(new Set(movements.map((movement) => movement.transactionType)), new Set(['RETURN_IN', 'RETURN_DAMAGED_IN']));
    assert.equal(refund.status, 'Refunded');
    assert.equal(refund.amount, 120000);
    assert.notEqual(storedDestination.accountNumberEncrypted, '0123456789');
    assert.notEqual(storedDestination.accountHolderEncrypted, 'LOCAL TEST CUSTOMER');
    assert.equal(payoutEvidence.status, 'Succeeded');
    assert.equal(payoutEvidence.amount, 120000);

    const incident = await service.reportPayoutIncident(staff._id, request.id, {
      idempotencyKey: `incident:${marker}`,
      cause: 'STAFF_SYSTEM_PROVIDER_MISMATCH',
      reason: 'Local verification of false-completion correction',
    });
    const [correctedRequest, correctedOrder, correctedRefund] = await Promise.all([
      ReturnRefundRequest.findById(request.id).lean(),
      Order.findById(order._id).lean(),
      RefundPending.findOne({ returnRefundRequestId: request.id }).lean(),
    ]);
    assert.equal(incident.responsibility, 'ShopOrProvider');
    assert.equal(correctedRequest.status, 'Received');
    assert.equal(correctedOrder.orderStatus, 'Delivered');
    assert.equal(correctedRefund.status, 'HandedOff');
    assert.equal(correctedRefund.payoutStatus, 'Unknown');

    const correctivePayout = await service.recordPayoutEvidence(staff._id, request.id, {
      idempotencyKey: `corrective-payout:${marker}`,
      method: 'MANUAL',
      providerReference: `LOCAL-CORRECTIVE-BANK-${marker}`,
      status: 'Succeeded',
      occurredAt: now,
      reconciliationNote: 'Local verified corrective payout evidence',
      previousAttemptReconciled: true,
      recoveryIncidentId: incident.id,
    });
    const [resolvedIncident, finalOrder, evidenceCount] = await Promise.all([
      RefundPayoutIncident.findById(incident.id).lean(),
      Order.findById(order._id).lean(),
      RefundPayoutEvidence.countDocuments({ returnRefundRequestId: request.id }),
    ]);
    assert.equal(correctivePayout.request.status, 'Completed');
    assert.equal(resolvedIncident.status, 'Resolved');
    assert.equal(finalOrder.orderStatus, 'Returned');
    assert.equal(evidenceCount, 2);

    return {
      lifecycle: ['New', 'Approved', 'Received', 'Completed'],
      recoveryLifecycle: ['Completed', 'Received', 'Completed'],
      inventoryMovements: movements.length,
      payoutEvidence: evidenceCount,
      recoveryStatus: resolvedIncident.status,
      refundStatus: (await RefundPending.findOne({ returnRefundRequestId: request.id }).lean()).status,
      orderStatus: finalOrder.orderStatus,
      primaryPaymentStatus: storedPayment.paymentStatus,
      warehouseDestinationVisible: Object.hasOwn(warehouseView, 'destination'),
      cleanup: 'scoped temporary records removed',
    };
  } finally {
    await cleanup(ids);
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  verifySl001ReturnRefund()
    .then((result) => {
      console.log('SL-001 local transaction verification completed.');
      console.table([result]);
    })
    .catch((error) => {
      console.error('SL-001 local transaction verification failed:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { assertSafeTarget, verifySl001ReturnRefund };
