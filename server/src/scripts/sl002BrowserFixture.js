const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
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
const Role = require('../models/role.model');
const StockReservation = require('../models/stockReservation.model');
const User = require('../models/user.model');

const MARKER = 'SL002-BROWSER';
const ACCOUNTS = {
  Customer: 'sl002.browser.customer@greenhome.test',
  Staff: 'sl002.browser.staff@greenhome.test',
  WarehouseManager: 'sl002.browser.warehouse@greenhome.test',
};

function assertSafeFixtureTarget() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SL-002 browser fixture is disabled in production');
  }
  if (process.env.SL002_BROWSER_FIXTURE_CONFIRM !== MARKER) {
    throw new Error(`Set SL002_BROWSER_FIXTURE_CONFIRM=${MARKER} to use this local-only fixture`);
  }
  const uri = String(process.env.MONGODB_URI || '');
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/greenhome_kitchen(?:\?|$)/i.test(uri)) {
    throw new Error('SL-002 browser fixture is restricted to the local greenhome_kitchen database');
  }
}

async function cleanup() {
  assertSafeFixtureTarget();
  const users = await User.find({ email: { $in: Object.values(ACCOUNTS) } }).select('_id').lean();
  const userIds = users.map((item) => item._id);
  const orders = await Order.find({ orderCode: { $regex: `^${MARKER}-` } }).select('_id').lean();
  const orderIds = orders.map((item) => item._id);
  const cases = await ExchangeCase.find({ orderId: { $in: orderIds } }).select('_id').lean();
  const caseIds = cases.map((item) => item._id);
  const shipmentIds = await ExchangeShipment.find({ exchangeCaseId: { $in: caseIds } }).distinct('_id');
  const products = await Product.find({ sku: { $regex: `^${MARKER}-` } }).select('_id').lean();
  const productIds = products.map((item) => item._id);

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
  await AfterSalesOrderLock.deleteMany({ orderId: { $in: orderIds } });
  await Notification.deleteMany({
    $or: [
      { userId: { $in: userIds } },
      { targetCollection: 'ExchangeCase', targetId: { $in: caseIds } },
    ],
  });
  await AuditLog.deleteMany({
    $or: [
      { userId: { $in: userIds } },
      { targetEntity: 'ExchangeCase', targetId: { $in: caseIds.map(String) } },
    ],
  });
  await ExchangeCase.deleteMany({ _id: { $in: caseIds } });
  await OrderDetail.deleteMany({ orderId: { $in: orderIds } });
  await Order.deleteMany({ _id: { $in: orderIds } });
  await Inventory.deleteMany({ productId: { $in: productIds } });
  await Product.deleteMany({ _id: { $in: productIds } });
  await User.deleteMany({ _id: { $in: userIds } });

  return {
    users: userIds.length,
    orders: orderIds.length,
    cases: caseIds.length,
    products: productIds.length,
  };
}

async function prepare() {
  assertSafeFixtureTarget();
  const password = String(process.env.SL002_BROWSER_PASSWORD || '');
  if (password.length < 12) {
    throw new Error('SL002_BROWSER_PASSWORD with at least 12 characters is required');
  }
  await cleanup();
  const roles = await Role.find({ roleName: { $in: Object.keys(ACCOUNTS) } }).lean();
  const roleByName = new Map(roles.map((role) => [role.roleName, role]));
  for (const roleName of Object.keys(ACCOUNTS)) {
    if (!roleByName.has(roleName)) throw new Error(`Missing required role ${roleName}`);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const actorData = [
    ['Customer', 'SL-002 Browser Customer', '0902900001'],
    ['Staff', 'SL-002 Browser Staff', '0902900002'],
    ['WarehouseManager', 'SL-002 Browser Warehouse', '0902900003'],
  ];
  const createdUsers = {};
  for (const [roleName, fullName, phone] of actorData) {
    createdUsers[roleName] = await User.create({
      fullName,
      email: ACCOUNTS[roleName],
      passwordHash,
      phone,
      address: 'SL-002 browser verification only',
      roleId: roleByName.get(roleName)._id,
      status: 'Active',
    });
  }

  const product = await Product.create({
    name: 'Sản phẩm kiểm tra SL-002',
    sku: `${MARKER}-SKU`,
    price: 120000,
    stockQuantity: 3,
    unit: 'cái',
    categoryId: new mongoose.Types.ObjectId(),
    status: 'Inactive',
  });
  await Inventory.create({
    productId: product._id,
    stockQuantity: 3,
    reservedQuantity: 0,
    damagedQuantity: 0,
    lowStockThreshold: 0,
  });
  const deliveredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deadlineAt = new Date(deliveredAt.getTime() + 5 * 24 * 60 * 60 * 1000);
  const order = await Order.create({
    orderCode: `${MARKER}-ORDER`,
    customerId: createdUsers.Customer._id,
    totalAmount: 120000,
    subtotal: 120000,
    shippingFee: 0,
    paymentMethod: 'ONLINE',
    paymentStatus: 'Paid',
    orderStatus: 'Delivered',
    shippingAddress: 'SL-002 browser verification only',
    receiverName: 'SL-002 Browser Customer',
    receiverPhone: '0902900001',
    deliveredAt,
    returnDeadlineAt: deadlineAt,
    exchangeDeadlineAt: deadlineAt,
  });
  await OrderDetail.create({
    orderId: order._id,
    productId: product._id,
    productNameSnapshot: product.name,
    productSkuSnapshot: product.sku,
    unitSnapshot: product.unit,
    priceSnapshot: product.price,
    quantity: 1,
    subtotal: product.price,
  });
  return {
    orderId: String(order._id),
    orderCode: order.orderCode,
    accounts: ACCOUNTS,
  };
}

async function runCli() {
  require('dotenv').config();
  await connectDatabase();
  try {
    const mode = process.argv[2];
    if (mode === '--prepare') {
      console.log(JSON.stringify(await prepare()));
      return;
    }
    if (mode === '--cleanup') {
      console.log(JSON.stringify(await cleanup()));
      return;
    }
    throw new Error('Use --prepare or --cleanup');
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

module.exports = { assertSafeFixtureTarget, cleanup, prepare };
