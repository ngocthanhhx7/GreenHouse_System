const EXPECTED_COUNTS = Object.freeze({
  roles: 4, users: 13, addresses: 20, categories: 5, products: 20, inventories: 20,
  carts: 12, cartItems: 20, orders: 22, orderDetails: 44, payments: 22,
  paymentAttempts: 22, paymentCallbacks: 10, invoices: 10, stockExports: 15,
  inventoryTransactions: 37, replenishments: 6, damageReports: 3, returnRequests: 5,
  returnItems: 4, refundPendings: 3, supportRequests: 10, reviews: 16,
  notifications: 40, systemSettings: 3, auditLogs: 60,
});
const { DEMO_IMAGE_MANIFEST } = require('./demoImageManifest');

function fail(message) {
  throw new Error(`Dữ liệu demo không hợp lệ: ${message}`);
}

function indexBy(items, field = 'key') {
  return new Map(items.map((item) => [item[field], item]));
}

function assertUnique(items, collection, field) {
  const values = items.map((item) => item[field]);
  if (values.some((value) => value === undefined || value === null || value === '')) fail(`${collection}.${field} bị thiếu.`);
  if (new Set(values).size !== values.length) fail(`${collection}.${field} bị trùng.`);
}

function assertReference(items, field, target, collection) {
  for (const item of items) {
    const value = item[field];
    if (value !== null && value !== undefined && !target.has(value)) fail(`${collection}.${field} '${value}' không tồn tại.`);
  }
}

function validateDemoGraph(graph) {
  for (const [collection, count] of Object.entries(EXPECTED_COUNTS)) {
    if (!Array.isArray(graph[collection])) fail(`${collection} phải là mảng.`);
    if (graph[collection].length !== count) fail(`${collection} phải có đúng ${count} bản ghi.`);
    assertUnique(graph[collection], collection, 'key');
  }

  assertUnique(graph.roles, 'roles', 'roleName');
  assertUnique(graph.users, 'users', 'email');
  assertUnique(graph.users, 'users', 'phone');
  assertUnique(graph.categories, 'categories', 'name');
  assertUnique(graph.products, 'products', 'sku');
  assertUnique(graph.orders, 'orders', 'orderCode');
  assertUnique(graph.orders, 'orders', 'idempotencyKey');
  assertUnique(graph.paymentAttempts, 'paymentAttempts', 'attemptCode');
  assertUnique(graph.paymentCallbacks, 'paymentCallbacks', 'providerMessageId');
  assertUnique(graph.invoices, 'invoices', 'invoiceCode');
  assertUnique(graph.returnRequests, 'returnRequests', 'requestCode');
  assertUnique(graph.supportRequests, 'supportRequests', 'ticketCode');
  assertUnique(graph.notifications, 'notifications', 'eventId');

  const roles = indexBy(graph.roles, 'roleName');
  const users = indexBy(graph.users);
  const categories = indexBy(graph.categories);
  const products = indexBy(graph.products);
  const inventories = indexBy(graph.inventories);
  const carts = indexBy(graph.carts);
  const orders = indexBy(graph.orders);
  const orderDetails = indexBy(graph.orderDetails);
  const payments = indexBy(graph.payments);
  const attempts = indexBy(graph.paymentAttempts);
  const returns = indexBy(graph.returnRequests);

  for (const requiredRole of ['Customer', 'Staff', 'WarehouseManager', 'Admin']) {
    if (!roles.has(requiredRole)) fail(`thiếu role ${requiredRole}.`);
  }
  for (const user of graph.users) if (!roles.has(user.roleName)) fail(`users.roleName '${user.roleName}' không tồn tại.`);
  if (graph.users.filter((user) => user.roleName === 'Customer').length !== 10) fail('phải có đúng 10 customer.');

  assertReference(graph.addresses, 'customerKey', users, 'addresses');
  assertReference(graph.products, 'categoryKey', categories, 'products');
  const imagesBySku = new Map(DEMO_IMAGE_MANIFEST.map((image) => [image.sku, image.destination]));
  for (const product of graph.products) {
    if (imagesBySku.get(product.sku) !== product.imageUrl) fail(`${product.sku} không khớp manifest ảnh đã khóa.`);
  }
  assertReference(graph.inventories, 'productKey', products, 'inventories');
  assertReference(graph.carts, 'customerKey', users, 'carts');
  assertReference(graph.cartItems, 'cartKey', carts, 'cartItems');
  assertReference(graph.cartItems, 'productKey', products, 'cartItems');
  assertReference(graph.orders, 'customerKey', users, 'orders');
  assertReference(graph.orderDetails, 'orderKey', orders, 'orderDetails');
  assertReference(graph.orderDetails, 'productKey', products, 'orderDetails');
  assertReference(graph.payments, 'orderKey', orders, 'payments');
  assertReference(graph.paymentAttempts, 'orderKey', orders, 'paymentAttempts');
  assertReference(graph.paymentCallbacks, 'orderKey', orders, 'paymentCallbacks');
  assertReference(graph.paymentCallbacks, 'paymentAttemptKey', attempts, 'paymentCallbacks');
  assertReference(graph.invoices, 'orderKey', orders, 'invoices');
  assertReference(graph.stockExports, 'orderKey', orders, 'stockExports');
  assertReference(graph.inventoryTransactions, 'productKey', products, 'inventoryTransactions');
  assertReference(graph.inventoryTransactions, 'orderKey', orders, 'inventoryTransactions');
  assertReference(graph.replenishments, 'productKey', products, 'replenishments');
  assertReference(graph.replenishments, 'inventoryKey', inventories, 'replenishments');
  assertReference(graph.damageReports, 'productKey', products, 'damageReports');
  assertReference(graph.damageReports, 'inventoryKey', inventories, 'damageReports');
  assertReference(graph.returnRequests, 'orderKey', orders, 'returnRequests');
  assertReference(graph.returnRequests, 'customerKey', users, 'returnRequests');
  assertReference(graph.returnRequests, 'paymentKey', payments, 'returnRequests');
  assertReference(graph.returnItems, 'returnRequestKey', returns, 'returnItems');
  assertReference(graph.returnItems, 'orderDetailKey', orderDetails, 'returnItems');
  assertReference(graph.returnItems, 'productKey', products, 'returnItems');
  assertReference(graph.refundPendings, 'orderKey', orders, 'refundPendings');
  assertReference(graph.refundPendings, 'paymentAttemptKey', attempts, 'refundPendings');
  assertReference(graph.supportRequests, 'customerKey', users, 'supportRequests');
  assertReference(graph.supportRequests, 'orderKey', orders, 'supportRequests');
  assertReference(graph.supportRequests, 'productKey', products, 'supportRequests');
  assertReference(graph.reviews, 'customerKey', users, 'reviews');
  assertReference(graph.reviews, 'orderKey', orders, 'reviews');
  assertReference(graph.reviews, 'productKey', products, 'reviews');
  assertReference(graph.notifications, 'userKey', users, 'notifications');
  assertReference(graph.auditLogs, 'userKey', users, 'auditLogs');

  for (const order of graph.orders) {
    const lines = graph.orderDetails.filter((line) => line.orderKey === order.key);
    if (lines.length !== 2) fail(`${order.orderCode} phải có đúng hai dòng hàng.`);
    for (const line of lines) {
      if (line.subtotal !== line.priceSnapshot * line.quantity) fail(`${line.key} có thành tiền sai.`);
    }
    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    if (subtotal !== order.subtotal || subtotal + order.shippingFee !== order.totalAmount) fail(`${order.orderCode} có tổng tiền không khớp.`);
    if (order.orderStatus === 'WaitingForPayment' && (order.paymentMethod !== 'ONLINE' || order.paymentStatus !== 'Pending')) fail('WaitingForPayment phải là ONLINE/Pending.');
    if (order.orderStatus === 'Delivered' && order.paymentStatus !== 'Paid') fail('Đơn Delivered bắt buộc có paymentStatus Paid.');
    if (order.orderStatus === 'Returned' && order.paymentStatus !== 'Refunded') fail('Đơn Returned bắt buộc có paymentStatus Refunded.');
    if (order.paymentMethod === 'ONLINE' && ['Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered'].includes(order.orderStatus) && order.paymentStatus !== 'Paid') fail(`${order.orderCode} ONLINE sau xác nhận phải Paid.`);
    const created = Date.parse(order.createdAt);
    if (!Number.isFinite(created)) fail(`${order.orderCode} thiếu createdAt hợp lệ.`);
    for (const field of ['confirmedAt', 'packedAt', 'shippedAt', 'deliveredAt']) {
      if (order[field] && Date.parse(order[field]) < created) fail(`${order.orderCode}.${field} sớm hơn createdAt.`);
    }
  }

  for (const payment of graph.payments) {
    const order = orders.get(payment.orderKey);
    if (payment.amount !== order.totalAmount || payment.paymentStatus !== order.paymentStatus || payment.paymentMethod !== order.paymentMethod) fail(`${payment.key} không khớp order.`);
  }
  for (const attempt of graph.paymentAttempts) {
    const order = orders.get(attempt.orderKey);
    if (attempt.amount !== order.totalAmount || attempt.paymentStatus !== order.paymentStatus) fail(`${attempt.key} không khớp order.`);
  }
  for (const transaction of graph.inventoryTransactions) {
    if (!Number.isInteger(transaction.quantity) || transaction.afterQuantity !== transaction.beforeQuantity + transaction.quantity || transaction.afterQuantity < 0) fail(`${transaction.key} sai bất biến số lượng kho.`);
  }
  for (const invoice of graph.invoices) {
    const order = orders.get(invoice.orderKey);
    if (invoice.totalAmount !== invoice.subtotal + invoice.shippingFee || invoice.totalAmount !== order.totalAmount) fail(`${invoice.key} sai tổng tiền hóa đơn.`);
    if (invoice.orderDetailKeys.some((key) => !orderDetails.has(key) || orderDetails.get(key).orderKey !== order.key)) fail(`${invoice.key} tham chiếu dòng hàng sai.`);
  }
  for (const item of graph.returnItems) {
    if (item.receivedQuantity !== item.sellableQuantity + item.damagedQuantity) fail(`${item.key} sai phân loại số lượng trả.`);
  }
  for (const review of graph.reviews) {
    const order = orders.get(review.orderKey);
    const backed = graph.orderDetails.some((line) => line.orderKey === review.orderKey && line.productKey === review.productKey);
    if (!['Delivered', 'Returned'].includes(order.orderStatus) || !backed || order.customerKey !== review.customerKey) fail(`Đánh giá ${review.key} không được bảo chứng bởi đơn Delivered.`);
  }

  const settings = graph.systemSettings.map((item) => item.key).sort();
  const expectedSettings = ['LOW_STOCK_DEFAULT_THRESHOLD', 'PAYMENT_TIMEOUT_MINUTES', 'RETURN_WINDOW_DAYS'];
  if (JSON.stringify(settings) !== JSON.stringify(expectedSettings)) fail('SystemSettings phải dùng đúng ba khóa canonical.');

  const activeCarts = graph.carts.filter((cart) => cart.status === 'Active');
  if (new Set(activeCarts.map((cart) => cart.customerKey)).size !== activeCarts.length) fail('mỗi customer chỉ có một giỏ Active.');
  for (const customer of graph.users.filter((user) => user.roleName === 'Customer')) {
    const defaults = graph.addresses.filter((address) => address.customerKey === customer.key && address.isDefault);
    if (defaults.length !== 1) fail(`${customer.email} phải có đúng một địa chỉ mặc định.`);
    const participates = graph.orders.some((item) => item.customerKey === customer.key)
      || graph.supportRequests.some((item) => item.customerKey === customer.key)
      || graph.reviews.some((item) => item.customerKey === customer.key);
    if (!participates) fail(`${customer.email} chưa tham gia kịch bản demo.`);
  }

  return { valid: true, counts: Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((key) => [key, graph[key].length])) };
}

module.exports = { EXPECTED_COUNTS, validateDemoGraph };
