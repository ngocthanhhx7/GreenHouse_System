const crypto = require('node:crypto');
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const { exchangeService } = require('../services/exchange.service');
const { returnEvidenceClaim } = require('../utils/returnEvidenceClaim');
const AfterSalesOrderLock = require('../models/afterSalesOrderLock.model');
const AuditLog = require('../models/auditLog.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ExchangeConversion = require('../models/exchangeConversion.model');
const ExchangeInspection = require('../models/exchangeInspection.model');
const ExchangeLine = require('../models/exchangeLine.model');
const ExchangeShipment = require('../models/exchangeShipment.model');
const ExchangeShipmentEvent = require('../models/exchangeShipmentEvent.model');
const ExchangeUnitLineage = require('../models/exchangeUnitLineage.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Notification = require('../models/notification.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const StockReservation = require('../models/stockReservation.model');

const DAY_MS = 24 * 60 * 60 * 1000;

function assertFact(condition, message) {
  if (!condition) throw new Error(`SL-002 verification failed: ${message}`);
}

async function cleanup({ orderId, productId, caseIds }) {
  const shipmentIds = await ExchangeShipment.find({ exchangeCaseId: { $in: caseIds } }).distinct('_id');
  await ExchangeShipmentEvent.deleteMany({
    $or: [
      { exchangeCaseId: { $in: caseIds } },
      { shipmentId: { $in: shipmentIds } },
    ],
  });
  await ExchangeShipment.deleteMany({ exchangeCaseId: { $in: caseIds } });
  await ExchangeInspection.deleteMany({ exchangeCaseId: { $in: caseIds } });
  await StockReservation.deleteMany({ exchangeCaseId: { $in: caseIds } });
  await ExchangeUnitLineage.deleteMany({ exchangeCaseId: { $in: caseIds } });
  await ExchangeLine.deleteMany({ exchangeCaseId: { $in: caseIds } });
  await ExchangeConversion.deleteMany({ exchangeCaseId: { $in: caseIds } });
  await InventoryTransaction.deleteMany({
    relatedCollection: 'ExchangeCase',
    relatedId: { $in: caseIds },
  });
  await AfterSalesOrderLock.deleteMany({ orderId });
  await Notification.deleteMany({ targetCollection: 'ExchangeCase', targetId: { $in: caseIds } });
  await AuditLog.deleteMany({ targetEntity: 'ExchangeCase', targetId: { $in: caseIds.map(String) } });
  await ExchangeCase.deleteMany({ _id: { $in: caseIds } });
  await OrderDetail.deleteMany({ orderId });
  await Order.deleteOne({ _id: orderId });
  await Inventory.deleteOne({ productId });
  await Product.deleteOne({ _id: productId });
}

async function verifySl002Exchange() {
  const suffix = crypto.randomUUID();
  const customerId = new mongoose.Types.ObjectId();
  const staffId = new mongoose.Types.ObjectId();
  const warehouseId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  let orderId = new mongoose.Types.ObjectId();
  let productId = new mongoose.Types.ObjectId();
  let caseIds = [];

  try {
    const now = new Date();
    const product = await Product.create({
      _id: productId,
      name: 'SL-002 verification product',
      sku: `VERIFY-SL002-${suffix}`,
      price: 100000,
      stockQuantity: 5,
      unit: 'cái',
      categoryId,
      status: 'Inactive',
    });
    await Inventory.create({
      productId: product._id,
      stockQuantity: 5,
      reservedQuantity: 0,
      damagedQuantity: 0,
      lowStockThreshold: 0,
    });
    const order = await Order.create({
      _id: orderId,
      orderCode: `VERIFY-SL002-${suffix}`,
      customerId,
      totalAmount: 100000,
      subtotal: 100000,
      shippingFee: 0,
      paymentMethod: 'ONLINE',
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      shippingAddress: 'Verification only',
      deliveredAt: new Date(now.getTime() - DAY_MS),
      returnDeadlineAt: new Date(now.getTime() + 4 * DAY_MS),
      exchangeDeadlineAt: new Date(now.getTime() + 4 * DAY_MS),
    });
    const detail = await OrderDetail.create({
      orderId: order._id,
      productId: product._id,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
      unitSnapshot: product.unit,
      priceSnapshot: product.price,
      quantity: 1,
      subtotal: product.price,
    });

    const customerEvidence = returnEvidenceClaim.sign(
      customerId,
      `/api/return-refunds/evidence/${crypto.randomUUID()}.jpg`,
      1024
    );
    const created = await exchangeService.createCustomerRequest(customerId, {
      orderId: order._id,
      idempotencyKey: `verify-submit:${suffix}`,
      reason: 'Kiểm tra live luồng đổi hàng SL-002',
      evidenceImages: [customerEvidence],
      lines: [{ orderDetailId: detail._id, quantity: 1 }],
    });
    caseIds = [new mongoose.Types.ObjectId(created.id)];
    const approved = await exchangeService.decideRequest(staffId, created.id, {
      idempotencyKey: `verify-decision:${suffix}`,
      decision: 'APPROVE',
      responsibility: 'SHOP_FAULT',
      reason: 'Kiểm tra live: đủ điều kiện và đúng SKU',
    });
    assertFact(approved.status === 'ApprovedAwaitingShipment', 'approval did not reserve exact SKU');

    await exchangeService.recordHandoffProof(customerId, created.id, {
      idempotencyKey: `verify-handoff:${suffix}`,
      proofReference: `VERIFY-IN-${suffix}`,
      handoffAt: new Date(),
    });
    await exchangeService.recordWarehouseReceipt(warehouseId, created.id, {
      idempotencyKey: `verify-receipt:${suffix}`,
      evidenceReference: `VERIFY-RECEIPT-${suffix}`,
      receivedAt: new Date(),
    });
    const warehouseEvidence = returnEvidenceClaim.sign(
      warehouseId,
      `/api/return-refunds/evidence/${crypto.randomUUID()}.jpg`,
      1024
    );
    const inspected = await exchangeService.finalizeInspection(warehouseId, created.id, {
      idempotencyKey: `verify-inspection:${suffix}`,
      lines: [{
        exchangeLineId: approved.lines[0]._id,
        receivedQuantity: 1,
        acceptedSellableQuantity: 0,
        acceptedDamagedQuantity: 1,
        rejectedQuantity: 0,
        inspectionReason: 'Kiểm tra live: xác nhận hàng lỗi',
        evidenceImages: [warehouseEvidence],
      }],
    });
    assertFact(inspected.status === 'OutboundFulfillment', 'inspection did not authorize outbound');

    const outbound = await exchangeService.createOutboundShipment(warehouseId, created.id, {
      idempotencyKey: `verify-outbound:${suffix}`,
      exchangeLineId: approved.lines[0]._id,
      direction: 'REPLACEMENT_TO_CUSTOMER',
      quantity: 1,
      carrierName: 'Verification Carrier',
      trackingCode: `VERIFY-OUT-${suffix}`,
      shippedAt: new Date(),
    });
    const completed = await exchangeService.recordCarrierShipmentEvent(outbound.shipment._id, {
      eventId: `verify-delivered:${suffix}`,
      eventType: 'DELIVERED',
      evidenceReference: `VERIFY-POD-${suffix}`,
      occurredAt: new Date(),
    });

    const [inventory, lock, movements, unit, persistedCase] = await Promise.all([
      Inventory.findOne({ productId }).lean(),
      AfterSalesOrderLock.findOne({ orderId }).lean(),
      InventoryTransaction.find({ relatedCollection: 'ExchangeCase', relatedId: caseIds[0] }).lean(),
      ExchangeUnitLineage.findOne({ exchangeCaseId: caseIds[0] }).lean(),
      ExchangeCase.findById(caseIds[0]).lean(),
    ]);
    assertFact(completed.request.status === 'Completed', 'case did not wait for and reach delivered completion');
    assertFact(inventory.stockQuantity === 4 && inventory.reservedQuantity === 0 && inventory.damagedQuantity === 1,
      'Inventory sellable/reserved/damaged quantities are inconsistent');
    assertFact(movements.length === 2, 'expected exactly one damaged-in and one replacement-out movement');
    assertFact(lock?.status === 'Released', 'shared after-sales lock was not released at completion');
    assertFact(unit?.outcome === 'ReplacementDelivered' && unit.exchangeDeadlineAt,
      'replacement lineage or its new five-day deadline is missing');
    const forbidden = [
      'refundAmount', 'bankAccount', 'refundDestination', 'payout',
      'payos', 'payOS', 'priceDifference', 'shippingCharge',
    ];
    assertFact(forbidden.every((field) => !Object.prototype.hasOwnProperty.call(persistedCase, field)),
      'Exchange persistence contains a forbidden money or payout field');

    return {
      status: completed.request.status,
      inventory: {
        stockQuantity: inventory.stockQuantity,
        reservedQuantity: inventory.reservedQuantity,
        damagedQuantity: inventory.damagedQuantity,
      },
      inventoryMovements: movements.length,
      lockStatus: lock.status,
      replacementWindowCreated: Boolean(unit.exchangeDeadlineAt),
      cleanup: 'pending',
    };
  } finally {
    if (!caseIds.length) {
      caseIds = await ExchangeCase.find({ orderId }).distinct('_id');
    }
    await cleanup({ orderId, productId, caseIds });
  }
}

async function runCli() {
  require('dotenv').config();
  await connectDatabase();
  try {
    const result = await verifySl002Exchange();
    console.log('SL-002 live database verification passed.');
    console.table([{ ...result, cleanup: 'completed' }]);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { verifySl002Exchange };
