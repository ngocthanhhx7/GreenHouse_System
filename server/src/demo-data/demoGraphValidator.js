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
  const stockExports = indexBy(graph.stockExports);
  const replenishments = indexBy(graph.replenishments);
  const damageReports = indexBy(graph.damageReports);
  const inventoryByProduct = new Map(graph.inventories.map((item) => [item.productKey, item]));

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
  for (const collection of [graph.stockExports, graph.inventoryTransactions, graph.replenishments, graph.damageReports, graph.returnItems, graph.supportRequests]) {
    for (const item of collection) {
      for (const field of ['requestedByKey', 'processedByKey', 'performedByKey', 'approvedByKey', 'receivedByKey', 'reportedByKey', 'confirmedByKey', 'inspectedByKey', 'handledByKey', 'resolvedByKey', 'completedByKey']) {
        if (field in item && item[field] !== null && !users.has(item[field])) fail(`${item.key}.${field} không tồn tại.`);
      }
    }
  }

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
    if (order.paymentMethod === 'COD' && order.orderStatus !== 'Delivered' && order.paymentStatus !== 'Unpaid') fail(`${order.orderCode} COD chưa giao phải Unpaid.`);
    if (order.orderStatus === 'Cancelled' && !String(order.cancelReason || '').trim()) fail(`${order.orderCode} Cancelled phải có lý do.`);
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
  for (const callback of graph.paymentCallbacks) {
    const order = orders.get(callback.orderKey);
    const attempt = attempts.get(callback.paymentAttemptKey);
    if (order.paymentMethod !== 'ONLINE' || attempt.orderKey !== order.key || attempt.paymentMethod !== 'ONLINE') fail(`Callback ${callback.key} chỉ được gắn với ONLINE attempt cùng order.`);
    if (callback.eventStatus === 'Received' && (order.paymentStatus !== 'Pending' || callback.processingStartedAt !== null || callback.processingResult !== null)) fail(`Callback ${callback.key} Received chưa được có kết quả xử lý.`);
    if (callback.eventStatus === 'Processed') {
      const expectedGatewayStatus = order.paymentStatus === 'Failed' ? 'Failed' : 'Paid';
      if (callback.rawPayload?.paymentStatus !== expectedGatewayStatus || callback.processingResult?.accepted !== (expectedGatewayStatus === 'Paid')) fail(`Callback ${callback.key} Processed không khớp kết quả gateway.`);
    }
  }

  const transactionCounts = Object.fromEntries(['STOCK_EXPORT', 'REPLENISHMENT_RECEIVE', 'DAMAGE_CONFIRMED', 'ADJUSTMENT']
    .map((type) => [type, graph.inventoryTransactions.filter((item) => item.transactionType === type).length]));
  const expectedTransactionCounts = { STOCK_EXPORT: 22, REPLENISHMENT_RECEIVE: 2, DAMAGE_CONFIRMED: 1, ADJUSTMENT: 12 };
  if (JSON.stringify(transactionCounts) !== JSON.stringify(expectedTransactionCounts)) fail('InventoryTransaction phải có đúng 22 export, 2 replenish, 1 damage và 12 adjustment.');
  for (const transaction of graph.inventoryTransactions) {
    if (!Number.isInteger(transaction.quantity) || transaction.afterQuantity !== transaction.beforeQuantity + transaction.quantity || transaction.afterQuantity < 0) fail(`${transaction.key} sai bất biến số lượng kho.`);
    if (transaction.transactionType === 'ADJUSTMENT') {
      const inventory = inventories.get(transaction.relatedKey);
      if (transaction.relatedCollection !== 'Inventory' || !inventory || inventory.productKey !== transaction.productKey || transaction.orderKey !== null) fail(`${transaction.key} ADJUSTMENT tham chiếu Inventory không hợp lệ.`);
    } else if (transaction.transactionType === 'REPLENISHMENT_RECEIVE') {
      const request = replenishments.get(transaction.relatedKey);
      if (transaction.relatedCollection !== 'ReplenishmentRequest' || !request || request.status !== 'Received' || request.productKey !== transaction.productKey || transaction.quantity !== request.receivedQuantity) fail(`${transaction.key} REPLENISHMENT_RECEIVE không khớp request Received.`);
    } else if (transaction.transactionType === 'DAMAGE_CONFIRMED') {
      const report = damageReports.get(transaction.relatedKey);
      if (transaction.relatedCollection !== 'DamageReport' || !report || report.status !== 'Confirmed' || report.productKey !== transaction.productKey || transaction.quantity !== -report.quantity) fail(`${transaction.key} DAMAGE_CONFIRMED không khớp report Confirmed.`);
    } else if (transaction.transactionType === 'STOCK_EXPORT') {
      const request = stockExports.get(transaction.relatedKey);
      if (transaction.relatedCollection !== 'StockExportRequest' || !request || request.status !== 'Exported' || request.orderKey !== transaction.orderKey) fail(`${transaction.key} STOCK_EXPORT phải tham chiếu request Exported cùng order.`);
      const detail = graph.orderDetails.find((item) => item.orderKey === transaction.orderKey && item.productKey === transaction.productKey);
      if (!detail || transaction.quantity !== -detail.quantity) fail(`${transaction.key} STOCK_EXPORT không khớp dòng hàng.`);
    }
  }
  for (const product of graph.products) {
    const inventory = inventoryByProduct.get(product.key);
    const transactions = graph.inventoryTransactions.filter((item) => item.productKey === product.key)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.key.localeCompare(right.key));
    for (let index = 1; index < transactions.length; index += 1) {
      if (transactions[index - 1].afterQuantity !== transactions[index].beforeQuantity) fail(`${product.sku} có chuỗi ledger kho bị đứt.`);
    }
    const finalQuantity = transactions.at(-1)?.afterQuantity;
    if (product.stockQuantity !== inventory.stockQuantity || inventory.stockQuantity !== finalQuantity) fail(`${product.sku} tồn kho product/inventory không được derive từ ledger.`);
    const expectedReserved = graph.orders
      .filter((order) => ['Pending', 'WaitingForPayment', 'Confirmed', 'StockExportRequested'].includes(order.orderStatus))
      .flatMap((order) => graph.orderDetails.filter((detail) => detail.orderKey === order.key && detail.productKey === product.key))
      .reduce((sum, detail) => sum + detail.quantity, 0);
    if (inventory.reservedQuantity !== expectedReserved || expectedReserved > inventory.stockQuantity) fail(`${product.sku} reservedQuantity không khớp các đơn đang giữ chỗ.`);
  }
  for (const invoice of graph.invoices) {
    const order = orders.get(invoice.orderKey);
    const details = graph.orderDetails.filter((detail) => detail.orderKey === order.key);
    const expectedDetailKeys = details.map((detail) => detail.key).sort();
    const actualDetailKeys = [...invoice.orderDetailKeys].sort();
    if (invoice.totalAmount !== invoice.subtotal + invoice.shippingFee || invoice.totalAmount !== order.totalAmount) fail(`${invoice.key} sai tổng tiền hóa đơn.`);
    if (JSON.stringify(actualDetailKeys) !== JSON.stringify(expectedDetailKeys)) fail(`${invoice.key} phải chụp đầy đủ chính xác các dòng hàng của order.`);
    if (!Array.isArray(invoice.items) || invoice.items.length !== details.length) fail(`${invoice.key} thiếu items snapshot đầy đủ.`);
    for (const detail of details) {
      const item = invoice.items.find((candidate) => candidate.orderDetailKey === detail.key);
      if (!item
        || item.productKey !== detail.productKey
        || item.productNameSnapshot !== detail.productNameSnapshot
        || item.productSkuSnapshot !== detail.productSkuSnapshot
        || item.unitSnapshot !== detail.unitSnapshot
        || item.productImageSnapshot !== detail.productImageSnapshot
        || item.priceSnapshot !== detail.priceSnapshot
        || item.quantity !== detail.quantity
        || item.subtotal !== detail.subtotal) {
        fail(`${invoice.key} có invoice item snapshot không khớp OrderDetail.`);
      }
    }
    if (invoice.items.reduce((sum, item) => sum + item.subtotal, 0) !== invoice.subtotal) fail(`${invoice.key} có subtotal items không khớp.`);
  }
  for (const item of graph.returnItems) {
    if (item.receivedQuantity !== item.sellableQuantity + item.damagedQuantity) fail(`${item.key} sai phân loại số lượng trả.`);
  }
  for (const request of graph.returnRequests) {
    const order = orders.get(request.orderKey);
    const items = graph.returnItems.filter((item) => item.returnRequestKey === request.key);
    if (request.customerKey !== order.customerKey) fail(`${request.key} không thuộc customer của order.`);
    if (request.status === 'Completed' && (order.orderStatus !== 'Returned' || order.paymentStatus !== 'Refunded' || items.length === 0)) fail(`${request.key} Completed bắt buộc order Returned/Refunded và có inspection items.`);
    if (request.status === 'Completed' && (request.completedByKey !== 'user-staff' || !request.completedAt || !request.inspectionNote || items.some((item) => Date.parse(item.inspectedAt) > Date.parse(request.completedAt)))) fail(`${request.key} Completed thiếu actor/timestamp/inspection hợp lệ.`);
    if (request.status === 'ReadyForRefund' && (order.orderStatus !== 'Delivered' || order.paymentStatus !== 'Paid' || items.length === 0)) fail(`${request.key} ReadyForRefund phải giữ order Delivered/Paid và có inspection items.`);
    if (request.status === 'ReadyForRefund' && !request.inspectionNote) fail(`${request.key} ReadyForRefund thiếu inspection note.`);
    if (request.status === 'AwaitingInspection' && (!(request.refundAmount > 0) || request.refundAmount > order.totalAmount || request.resolvedByKey !== 'user-staff' || !request.handledAt)) {
      fail(`${request.key} AwaitingInspection cần số tiền hoàn dương hợp lệ và quyết định của Staff.`);
    }
    if (['Pending', 'AwaitingInspection', 'Rejected'].includes(request.status) && items.length) fail(`${request.key} chưa inspection xong nhưng đã có return items.`);
  }
  for (const pending of graph.refundPendings) {
    const order = orders.get(pending.orderKey);
    const request = graph.returnRequests.find((item) => item.orderKey === order.key);
    if (pending.status !== 'RefundPending') fail(`${pending.key} phải phản ánh trạng thái RefundPending mà service hiện tại đang lưu.`);
    const validHandoff = ['ReadyForRefund', 'Completed'].includes(request?.status)
      || (order.orderStatus === 'Cancelled' && order.paymentStatus === 'RefundPending');
    if (!validHandoff) fail(`${pending.key} RefundPending không khớp hand-off hiện tại.`);
  }
  for (const review of graph.reviews) {
    const order = orders.get(review.orderKey);
    const backed = graph.orderDetails.some((line) => line.orderKey === review.orderKey && line.productKey === review.productKey);
    if (order.orderStatus !== 'Delivered' || !backed || order.customerKey !== review.customerKey) fail(`Đánh giá ${review.key} không được bảo chứng bởi đơn Delivered.`);
  }

  for (const support of graph.supportRequests) {
    if (support.status === 'New' && (support.handledByKey !== null || support.response !== '' || support.respondedAt !== null || support.closedAt !== null)) fail(`Support ${support.key} New không được có actor/response/timestamp xử lý.`);
    if (support.status === 'InProgress' && (!support.handledByKey || !support.response || !support.respondedAt || support.closedAt !== null)) fail(`Support ${support.key} InProgress thiếu actor/response hợp lệ.`);
    if (support.status === 'Resolved' && (!support.handledByKey || !support.response || !support.respondedAt || !support.closedAt || Date.parse(support.closedAt) < Date.parse(support.respondedAt))) fail(`Support ${support.key} Resolved thiếu lifecycle hoàn chỉnh.`);
  }
  for (const request of graph.stockExports) {
    const order = orders.get(request.orderKey);
    if (request.requestedByKey !== 'user-staff') fail(`${request.key} phải do Staff yêu cầu.`);
    if (request.status === 'Pending' && (request.processedByKey !== null || request.exportedAt !== null || order.orderStatus !== 'StockExportRequested')) fail(`${request.key} Pending có actor/timestamp sai.`);
    if (request.status === 'Approved' && (request.processedByKey !== 'user-warehouse' || request.exportedAt !== null || order.orderStatus !== 'StockExportRequested')) fail(`${request.key} Approved có lifecycle sai.`);
    if (request.status === 'Rejected' && (request.processedByKey !== 'user-warehouse' || request.exportedAt !== null || order.orderStatus !== 'Confirmed')) fail(`${request.key} Rejected phải trả order về Confirmed.`);
    if (request.status === 'Exported' && (request.processedByKey !== 'user-warehouse' || !request.exportedAt || !['Packed', 'Shipped', 'Delivered'].includes(order.orderStatus) || Date.parse(request.exportedAt) > Date.parse(order.packedAt))) fail(`${request.key} Exported có actor/timestamp/order sai.`);
    if (request.status === 'Exported') {
      const details = graph.orderDetails.filter((detail) => detail.orderKey === request.orderKey);
      const transactions = graph.inventoryTransactions.filter((item) => item.transactionType === 'STOCK_EXPORT' && item.relatedKey === request.key);
      if (transactions.length !== details.length) fail(`${request.key} phải có đúng một STOCK_EXPORT cho mỗi OrderDetail.`);
      for (const detail of details) {
        const matches = transactions.filter((transaction) => transaction.orderKey === request.orderKey
          && transaction.productKey === detail.productKey
          && transaction.quantity === -detail.quantity);
        if (matches.length !== 1) fail(`${request.key} thiếu hoặc trùng STOCK_EXPORT cho ${detail.key}.`);
      }
    }
  }

  const roleByUser = new Map(graph.users.map((user) => [user.key, user.roleName]));
  for (const request of graph.replenishments) {
    if (roleByUser.get(request.requestedByKey) !== 'WarehouseManager') fail(`${request.key} phải do WarehouseManager yêu cầu.`);
    if (request.approvedByKey && roleByUser.get(request.approvedByKey) !== 'Admin') fail(`${request.key} phải do Admin phê duyệt.`);
    if (request.receivedByKey && roleByUser.get(request.receivedByKey) !== 'WarehouseManager') fail(`${request.key} phải do WarehouseManager nhận hàng.`);
  }
  for (const report of graph.damageReports) {
    if (roleByUser.get(report.reportedByKey) !== 'Staff') fail(`${report.key} phải do Staff báo hỏng.`);
    if (report.status === 'Confirmed' && (roleByUser.get(report.confirmedByKey) !== 'WarehouseManager' || !report.confirmedAt)) fail(`${report.key} Confirmed cần WarehouseManager và thời gian xác nhận.`);
    if (report.status === 'PendingWarehouseConfirmation' && (report.confirmedByKey !== null || report.confirmedAt !== null)) fail(`${report.key} Pending không được có actor xác nhận.`);
    if (!['PendingWarehouseConfirmation', 'Confirmed'].includes(report.status)) fail(`${report.key} dùng trạng thái không thể sinh bởi service hiện tại.`);
  }
  for (const notification of graph.notifications) {
    const targets = notification.targetCollection === 'Order' ? orders
      : notification.targetCollection === 'SupportRequest' ? new Map(graph.supportRequests.map((item) => [item.key, item]))
        : null;
    if (!targets || !targets.has(notification.targetKey)) fail(`${notification.key} có targetCollection/targetKey không hợp lệ.`);
  }

  const lowStock = graph.inventories.filter((inventory) => inventory.stockQuantity - inventory.reservedQuantity <= inventory.lowStockThreshold);
  if (lowStock.length < 2 || lowStock.some((inventory) => inventory.reservedQuantity !== 0)) fail('Demo phải có ít nhất hai sản phẩm sắp hết không bị reservation để hiển thị dashboard kho.');

  const dateValues = JSON.stringify(graph).match(/20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ/g) || [];
  if (dateValues.some((value) => !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.parse('2026-07-22T00:00:00.000Z'))) fail('Thời gian demo không hợp lệ hoặc nằm trong tương lai.');

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
