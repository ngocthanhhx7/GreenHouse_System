const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const { operationalEvidenceClaim } = require('../utils/operationalEvidenceClaim');

function commandKey(scope, id) {
  return `phase1:${String(scope)}:${String(id)}`;
}

function getSetCookieValues(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const value = typeof headers.get === 'function' ? headers.get('set-cookie') : '';
  return value ? [value] : [];
}

function createCookieJar() {
  const cookies = new Map();
  return {
    update(headers) {
      for (const rawCookie of getSetCookieValues(headers)) {
        const pair = String(rawCookie).split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator > 0) {
          cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
        }
      }
    },
    header() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    },
  };
}

function toJsonBody(body) {
  if (body === undefined || body === null || typeof body === 'string') return body;
  return JSON.stringify(body);
}

async function requestJson(fetcher, apiBaseUrl, requestPath, options = {}) {
  const url = `${String(apiBaseUrl).replace(/\/$/, '')}${requestPath}`;
  const headers = { ...(options.headers || {}) };
  const body = toJsonBody(options.body);
  if (body !== undefined && body !== null && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetcher(url, {
    method: options.method || 'GET',
    headers,
    ...(body === undefined || body === null ? {} : { body }),
  });
  options.onResponse?.(response);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const success = response.ok && payload?.success !== false;
  if (!success) {
    const errorCode = payload?.errorCode || `HTTP_${response.status}`;
    const error = new Error(`${errorCode}: ${payload?.message || `HTTP ${response.status}`}`);
    error.statusCode = response.status;
    error.errorCode = errorCode;
    error.errors = Array.isArray(payload?.errors) ? payload.errors : [];
    error.data = payload?.data ?? null;
    throw error;
  }
  return payload?.data;
}

function createSessionClient({
  fetcher,
  apiBaseUrl,
  origin,
}) {
  const cookieJar = createCookieJar();
  let csrfToken = '';

  async function request(requestPath, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = {
      origin,
      ...(options.headers || {}),
    };
    const cookie = cookieJar.header();
    if (cookie) headers.cookie = cookie;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
    const data = await requestJson(fetcher, apiBaseUrl, requestPath, {
      ...options,
      method,
      headers,
      onResponse(response) {
        cookieJar.update(response.headers);
        options.onResponse?.(response);
      },
    });
    return data;
  }

  return {
    async login(email, password) {
      const result = await request('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const csrf = await request('/auth/csrf');
      csrfToken = csrf?.csrfToken || '';
      if (!csrfToken) throw new Error('CSRF_TOKEN_MISSING: login did not return a CSRF token');
      return result?.user || result;
    },
    request,
  };
}

function unwrapItems(value, keys = ['items', 'products', 'orders', 'stockExports']) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function unwrapOrder(value) {
  return value?.order && value?.stockExport ? value.order : value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTruthy(value, label) {
  if (!value) throw new Error(`${label}: expected a value`);
}

async function expectHttpFailure(client, requestPath, options, expectedStatuses, expectedCodes = []) {
  try {
    await client.request(requestPath, options);
  } catch (error) {
    const statuses = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    if (!statuses.includes(error.statusCode)) {
      throw new Error(`${requestPath}: expected status ${statuses.join('/')}, got ${error.statusCode} (${error.errorCode})`);
    }
    if (expectedCodes.length && !expectedCodes.includes(error.errorCode)) {
      throw new Error(`${requestPath}: expected error ${expectedCodes.join('/')}, got ${error.errorCode}`);
    }
    return error;
  }
  throw new Error(`${requestPath}: expected an HTTP error`);
}

async function acceptIdempotentReplay(
  client,
  requestPath,
  options,
  expectedStatuses,
  expectedCodes = [],
) {
  try {
    return await client.request(requestPath, options);
  } catch (error) {
    const statuses = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    if (!statuses.includes(error.statusCode)) {
      throw new Error(`${requestPath}: expected success or status ${statuses.join('/')}, got ${error.statusCode} (${error.errorCode})`);
    }
    if (expectedCodes.length && !expectedCodes.includes(error.errorCode)) {
      throw new Error(`${requestPath}: expected success or error ${expectedCodes.join('/')}, got ${error.errorCode}`);
    }
    return error;
  }
}

function loadModels() {
  return {
    Product: require('../models/product.model'),
    User: require('../models/user.model'),
    Order: require('../models/order.model'),
    OrderDetail: require('../models/orderDetail.model'),
    Payment: require('../models/payment.model'),
    PaymentAttempt: require('../models/paymentAttempt.model'),
    OrderReservation: require('../models/orderReservation.model'),
    Inventory: require('../models/inventory.model'),
    StockExportRequest: require('../models/stockExportRequest.model'),
    InventoryTransaction: require('../models/inventoryTransaction.model'),
    Shipment: require('../models/shipment.model'),
    ShipmentEvent: require('../models/shipmentEvent.model'),
  };
}

function asId(value) {
  return String(value?._id || value?.id || value || '');
}

async function runPhase1E2E({
  apiBaseUrl = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:5000/api',
  password = process.env.E2E_PASSWORD || 'GreenHome@123',
  origin = process.env.E2E_ORIGIN || 'http://localhost:5173',
  fetcher = globalThis.fetch.bind(globalThis),
  models = loadModels(),
  connection = null,
  now = () => new Date(),
} = {}) {
  const steps = [];
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const customer = createSessionClient({ fetcher, apiBaseUrl, origin });
  const staff = createSessionClient({ fetcher, apiBaseUrl, origin });
  const warehouse = createSessionClient({ fetcher, apiBaseUrl, origin });
  const record = (name, data = null) => {
    const entry = { name, status: 'passed', ...(data ? { data } : {}) };
    steps.push(entry);
    return data;
  };
  const runStep = async (name, work) => {
    try {
      return record(name, await work());
    } catch (error) {
      steps.push({
        name,
        status: 'failed',
        error: error.message,
        errorCode: error.errorCode,
        statusCode: error.statusCode,
      });
      throw error;
    }
  };

  const customerUser = await runStep('Customer login', () => (
    customer.login('customer@greenhome.test', password)
  ));
  const staffUser = await runStep('Staff login', () => (
    staff.login('staff@greenhome.test', password)
  ));
  await runStep('Warehouse Manager login', () => (
    warehouse.login('warehouse@greenhome.test', password)
  ));

  const products = await runStep('Customer views active catalog', async () => {
    const data = await customer.request('/products');
    const items = unwrapItems(data);
    assertTruthy(items.length, 'active catalog');
    const product = items.find((item) => item.availabilityStatus === 'InStock') || items[0];
    assertTruthy(product?.id, 'catalog product id');
    return { data, product };
  });
  const product = products.product;
  await runStep('Customer opens product detail', async () => {
    const detail = await customer.request(`/products/${encodeURIComponent(product.id)}`);
    assertEqual(String(detail.id), String(product.id), 'product detail id');
    return detail;
  });

  const cartBefore = await runStep('Customer reads cart before adding item', () => customer.request('/cart'));
  const cartAfterAdd = await runStep('Customer adds product to cart', () => customer.request('/cart/items', {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('cart-add', suffix) },
    body: {
      productId: product.id,
      quantity: 1,
      expectedVersion: Number(cartBefore?.version || 0),
    },
  }));
  const cart = cartAfterAdd?.items ? cartAfterAdd : await customer.request('/cart');
  const cartItem = cart.items?.[0];
  assertTruthy(cart.id, 'cart id');
  assertTruthy(cartItem?.productId, 'cart item product id');

  const addresses = await runStep('Customer loads owned delivery address', async () => {
    const data = await customer.request('/profile/addresses');
    const items = unwrapItems(data);
    assertTruthy(items[0]?.id || items[0]?._id, 'customer address');
    return items;
  });
  const addressId = asId(addresses[0]);
  const expectedItems = [{
    productId: cartItem.productId,
    quantity: cartItem.quantity,
    unitPrice: cartItem.unitPrice,
    priceVersion: cartItem.priceVersion,
  }];
  const checkoutIdempotencyKey = commandKey('checkout', suffix);
  const checkoutBody = {
    cartId: cart.id,
    cartVersion: cart.version,
    savedAddressId: addressId,
    paymentMethod: 'COD',
    expectedItems,
    customerNote: `Phase 1 E2E ${suffix}`,
  };

  const orderCreated = await runStep('Customer checkout COD', () => customer.request('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': checkoutIdempotencyKey },
    body: checkoutBody,
  }));
  const orderId = asId(orderCreated);
  assertTruthy(orderId, 'created order id');
  const orderCode = orderCreated.orderCode;

  const orderModel = models.Order;
  const detailModel = models.OrderDetail;
  const paymentModel = models.Payment;
  const attemptModel = models.PaymentAttempt;
  const reservationModel = models.OrderReservation;
  const inventoryModel = models.Inventory;
  const exportModel = models.StockExportRequest;
  const inventoryTransactionModel = models.InventoryTransaction;
  const shipmentModel = models.Shipment;
  const shipmentEventModel = models.ShipmentEvent;

  const persistedAfterCheckout = await runStep('Assert Pending order, snapshots and reservation', async () => {
    const [order, details, payment, reservations] = await Promise.all([
      orderModel.findById(orderId).lean(),
      detailModel.find({ orderId }).lean(),
      paymentModel.findOne({ orderId }).lean(),
      reservationModel.find({ orderId, status: 'Reserved' }).lean(),
    ]);
    assertEqual(order.orderStatus, 'Pending', 'OrderStatus after checkout');
    assertEqual(order.paymentStatus, 'Unpaid', 'PaymentStatus after checkout');
    assertEqual(details.length, 1, 'OrderDetail count');
    assertEqual(details[0].productNameSnapshot, product.name, 'product name snapshot');
    assertEqual(Number(details[0].priceSnapshot), Number(product.price), 'price snapshot');
    assertEqual(reservations.length, 1, 'active reservation count');
    return { order, details, payment, reservations };
  });

  const orderCountBeforeReplay = await orderModel.countDocuments({ customerId: customerUser.id, idempotencyKey: checkoutIdempotencyKey });
  await runStep('Checkout replay returns the same order', async () => {
    const replay = await customer.request('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': checkoutIdempotencyKey },
      body: checkoutBody,
    });
    assertEqual(asId(replay), orderId, 'checkout replay order id');
    assertEqual(
      await orderModel.countDocuments({ customerId: customerUser.id, idempotencyKey: checkoutIdempotencyKey }),
      orderCountBeforeReplay,
      'checkout replay order count',
    );
    return replay;
  });

  await runStep('Rejects checkout quantity above available stock', async () => {
    const currentCart = await customer.request('/cart');
    await expectHttpFailure(customer, '/cart/items', {
      method: 'POST',
      headers: { 'Idempotency-Key': commandKey('cart-overstock', suffix) },
      body: {
        productId: product.id,
        quantity: 999999,
        expectedVersion: Number(currentCart?.version || 0),
      },
    }, 409, ['CART_QUANTITY_EXCEEDS_AVAILABLE', 'CART_ITEM_INVALID', 'CART_VERSION_CONFLICT']);
  });

  await runStep('Customer cannot confirm an order', () => expectHttpFailure(customer, `/staff/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('customer-confirm', suffix) },
    body: {},
  }, 403, ['ROLE_FORBIDDEN']));

  const confirmKey = commandKey('staff-confirm', suffix);
  await runStep('Staff confirms Pending order', () => staff.request(`/staff/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { 'Idempotency-Key': confirmKey },
    body: { note: 'Phase 1 E2E staff confirmation' },
  }));
  const exportBefore = await runStep('Assert Confirmed order has one StockExportRequest', async () => {
    const [order, exports] = await Promise.all([
      orderModel.findById(orderId).lean(),
      exportModel.find({ orderId }).lean(),
    ]);
    assertEqual(order.orderStatus, 'Confirmed', 'OrderStatus after staff confirm');
    assertEqual(exports.length, 1, 'StockExportRequest count');
    assertEqual(exports[0].status, 'Pending', 'StockExportRequest status');
    return exports[0];
  });
  await runStep('Staff confirm replay does not create a second export request', async () => {
    await acceptIdempotentReplay(staff, `/staff/orders/${orderId}/confirm`, {
      method: 'POST',
      headers: { 'Idempotency-Key': confirmKey },
      body: { note: 'Phase 1 E2E staff confirmation' },
    }, 409, ['ORDER_CONFIRM_STALE_STATE', 'ORDER_CONFIRM_CONCURRENT']);
    assertEqual(await exportModel.countDocuments({ orderId }), 1, 'export count after confirm replay');
  });

  const packingItems = persistedAfterCheckout.details.map((detail) => ({
    orderDetailId: String(detail._id),
    checkedQuantity: Number(detail.quantity),
    checked: true,
  }));
  await runStep('Packing is blocked before Warehouse export', () => expectHttpFailure(staff, `/staff/orders/${orderId}/packing`, {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('packing-before-export', suffix) },
    body: { items: packingItems },
  }, 409));
  await runStep('Direct Confirmed to Shipped is blocked', () => expectHttpFailure(staff, `/staff/orders/${orderId}/shipments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('ship-before-pack', suffix) },
    body: {
      carrierName: 'Manual Carrier',
      trackingReference: `INVALID-${suffix}`,
      handedOffAt: new Date(now()).toISOString(),
      evidenceReference: `phase1-invalid-handoff-${suffix}`,
    },
  }, 409));

  const inventoryBefore = await inventoryModel.findOne({ productId: product.id }).lean();
  const exportKey = commandKey('warehouse-export', asId(exportBefore));
  await runStep('Warehouse Manager completes stock export', () => warehouse.request(
    `/warehouse/stock-exports/${asId(exportBefore)}/process`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': exportKey },
      body: { note: 'Phase 1 E2E warehouse export' },
    },
  ));
  await runStep('Assert export completed and inventory deducted once', async () => {
    const [stockExport, inventory, transactions, reservation] = await Promise.all([
      exportModel.findById(exportBefore._id).lean(),
      inventoryModel.findOne({ productId: product.id }).lean(),
      inventoryTransactionModel.find({
        relatedCollection: 'StockExportRequest',
        relatedId: exportBefore._id,
      }).lean(),
      reservationModel.findOne({ orderId, orderDetailId: persistedAfterCheckout.details[0]._id }).lean(),
    ]);
    assertEqual(stockExport.status, 'Completed', 'stock export status');
    assertEqual(Number(inventory.stockQuantity), Number(inventoryBefore.stockQuantity) - 1, 'physical stock after export');
    assertEqual(Number(inventory.sellableQuantity), Number(inventoryBefore.sellableQuantity) - 1, 'sellable stock after export');
    assertEqual(Number(inventory.reservedQuantity), Number(inventoryBefore.reservedQuantity) - 1, 'reserved stock after export');
    assertEqual(transactions.length, 1, 'inventory transaction count');
    assertEqual(reservation.status, 'Consumed', 'reservation status after export');
  });
  await runStep('Warehouse export replay does not deduct inventory twice', async () => {
    await acceptIdempotentReplay(warehouse, `/warehouse/stock-exports/${asId(exportBefore)}/process`, {
      method: 'POST',
      headers: { 'Idempotency-Key': exportKey },
      body: { note: 'Phase 1 E2E warehouse export' },
    }, 409, ['EXPORT_STALE_STATE', 'EXPORT_ALREADY_PROCESSING']);
    assertEqual(
      await inventoryTransactionModel.countDocuments({
        relatedCollection: 'StockExportRequest',
        relatedId: exportBefore._id,
      }),
      1,
      'inventory transaction count after export replay',
    );
  });

  await runStep('Staff packs only after completed export', () => staff.request(`/staff/orders/${orderId}/packing`, {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('packing', suffix) },
    body: { items: packingItems, note: 'Phase 1 E2E packing' },
  }));

  const trackingCode = `PHASE1-${suffix}`;
  const handoffKey = commandKey('handoff', suffix);
  const handoff = await runStep('Staff records manual carrier handoff', () => staff.request(`/staff/orders/${orderId}/shipments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': handoffKey },
    body: {
      carrierName: 'Manual Demo Carrier',
      trackingReference: trackingCode,
      handedOffAt: new Date(now()).toISOString(),
      evidenceReference: `phase1-handoff-${suffix}`,
      note: 'Bàn giao thủ công trong bài demo',
    },
  }));
  const shipmentId = asId(handoff?.shipment);
  assertTruthy(shipmentId, 'shipment id');
  await runStep('Customer cannot update Staff shipping handoff', () => expectHttpFailure(customer, `/staff/orders/${orderId}/shipments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('customer-shipping', suffix) },
    body: { carrierName: 'Attacker Carrier', trackingReference: 'ATTACKER' },
  }, 403, ['ROLE_FORBIDDEN']));

  const deliveredKey = commandKey('delivered', suffix);
  const deliveredAt = new Date(now()).toISOString();
  const signedEvidence = operationalEvidenceClaim.sign(
    `/api/operational-evidence/${crypto.randomUUID()}.jpg`,
    1024,
  );
  await runStep('Staff records successful delivery and full COD collection', () => staff.request(`/staff/shipments/${shipmentId}/events`, {
    method: 'POST',
    headers: { 'Idempotency-Key': deliveredKey },
    body: {
      eventKey: deliveredKey,
      eventType: 'DELIVERED',
      occurredAt: deliveredAt,
      evidenceReferences: [signedEvidence],
      codCollectionResult: 'COLLECTED',
    },
  }));
  await runStep('Assert Delivered, Paid and one shipment event', async () => {
    const [order, payment, attempt, shipment, events] = await Promise.all([
      orderModel.findById(orderId).lean(),
      paymentModel.findOne({ orderId }).lean(),
      attemptModel.findOne({ orderId, paymentStatus: 'Paid' }).lean(),
      shipmentModel.findById(shipmentId).lean(),
      shipmentEventModel.find({ shipmentId }).lean(),
    ]);
    assertEqual(order.orderStatus, 'Delivered', 'OrderStatus after delivery');
    assertEqual(order.paymentStatus, 'Paid', 'PaymentStatus after full COD collection');
    assertEqual(payment.paymentStatus, 'Paid', 'Payment record status');
    assertTruthy(attempt, 'paid PaymentAttempt');
    assertEqual(shipment.status, 'Delivered', 'shipping status after delivery');
    assertEqual(events.filter((event) => event.eventType === 'DELIVERED').length, 1, 'delivered event count');
  });

  await runStep('Delivered replay with a new event key is blocked', () => expectHttpFailure(staff, `/staff/shipments/${shipmentId}/events`, {
    method: 'POST',
    headers: { 'Idempotency-Key': commandKey('delivered-replay', suffix) },
    body: {
      eventKey: commandKey('delivered-replay', suffix),
      eventType: 'DELIVERED',
      occurredAt: new Date(now()).toISOString(),
      evidenceReferences: [signedEvidence],
      codCollectionResult: 'COLLECTED',
    },
  }, 409, ['SHIPMENT_EVENT_TERMINAL_STATE']));

  const foreignOrder = await orderModel.create({
    orderCode: `PHASE1-FOREIGN-${suffix}`,
    customerId: staffUser.id,
    totalAmount: 1,
    codExpectedAmount: 1,
    subtotal: 1,
    shippingFee: 0,
    paymentMethod: 'COD',
    paymentStatus: 'Unpaid',
    orderStatus: 'Pending',
    shippingAddress: 'Foreign test order',
  });
  await runStep('Customer cannot read another customer order', () => expectHttpFailure(
    customer,
    `/orders/${foreignOrder._id}`,
    undefined,
    404,
    ['NOT_FOUND'],
  ));
  await runStep('Customer history includes only owned orders with shipping fields', async () => {
    const history = unwrapItems(await customer.request('/orders/my'));
    const current = history.find((item) => String(item.id || item._id) === orderId);
    assertTruthy(current, 'current order in customer history');
    assertEqual(current.orderStatus, 'Delivered', 'history OrderStatus');
    assertEqual(current.paymentStatus, 'Paid', 'history PaymentStatus');
    assertEqual(current.shippingStatus, 'Delivered', 'history ShippingStatus');
    assertEqual(current.shipping?.trackingCode, trackingCode, 'history tracking code');
    assertEqual(
      history.some((item) => String(item.id || item._id) === String(foreignOrder._id)),
      false,
      'foreign order visibility',
    );
    return current;
  });
  await runStep('Invalid order id returns a safe 404', () => expectHttpFailure(
    customer,
    '/orders/not-an-object-id',
    undefined,
    404,
    ['NOT_FOUND'],
  ));

  return {
    outcome: 'passed',
    steps,
    orderId,
    orderCode,
    productName: product.name,
    totalAmount: orderCreated.totalAmount,
    trackingCode,
    customerUserId: customerUser?.id || null,
    databaseName: connection?.db?.databaseName || null,
  };
}

async function writeE2EContext(result, outputPath = path.resolve(process.cwd(), '..', 'artifacts', 'phase1-e2e-context.json')) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    orderId: result.orderId,
    orderCode: result.orderCode,
    productName: result.productName,
    totalAmount: result.totalAmount,
    trackingCode: result.trackingCode,
  }, null, 2)}\n`);
  return outputPath;
}

async function runCli() {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) throw new Error('MONGODB_URI is required for Phase 1 E2E');
  const connection = await connectDatabase(mongodbUri);
  try {
    const result = await runPhase1E2E({
      apiBaseUrl: process.env.E2E_API_BASE_URL,
      password: process.env.E2E_PASSWORD,
      origin: process.env.E2E_ORIGIN,
      connection,
      models: loadModels(),
    });
    const reportPath = path.resolve(process.cwd(), '..', 'artifacts', 'phase1-e2e-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeE2EContext(result);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  acceptIdempotentReplay,
  assertEqual,
  commandKey,
  createSessionClient,
  expectHttpFailure,
  requestJson,
  runPhase1E2E,
  unwrapItems,
  writeE2EContext,
};
