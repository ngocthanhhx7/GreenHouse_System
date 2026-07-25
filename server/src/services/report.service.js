const ApiError = require('../utils/apiError');
const AuditLog = require('../models/auditLog.model');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const LowStockAlert = require('../models/lowStockAlert.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const ProductReview = require('../models/productReview.model');
const RefundPending = require('../models/refundPending.model');
const SupportMessage = require('../models/supportMessage.model');
const SupportRequest = require('../models/supportRequest.model');
const User = require('../models/user.model');

const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PERIOD_DAYS = 366;
const MAX_REPORT_ROWS = 100_000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALLOWED_PERIOD_FIELDS = new Set(['mode', 'from', 'to']);
const ALL_REPORT_REPOSITORIES = Object.freeze([
  'listOrders',
  'listOrderDetails',
  'listRefunds',
  'listProducts',
  'listUsers',
  'listInventory',
  'listInventoryTransactions',
  'listLowStockAlerts',
  'listSupportRequests',
  'listSupportMessages',
  'listAuditLogs',
  'listReviews',
]);

function limited(query) {
  return query.limit(MAX_REPORT_ROWS + 1).lean();
}

function createModelRepository() {
  return {
    async listOrders() {
      return limited(Order.find({}).select([
        '_id', 'customerId', 'paymentMethod', 'paymentStatus', 'orderStatus',
        'totalAmount', 'codExpectedAmount', 'customerCollectedAmount',
        'customerCollectedAt', 'completedSaleAt', 'createdAt', 'confirmedAt',
        'shippedAt', 'deliveredAt', 'cancelledAt', 'canceledAt', 'returnedAt',
        'deliveryResolutionCommandKey',
      ].join(' ')));
    },
    async listOrderDetails() {
      return limited(OrderDetail.find({}).select([
        'orderId', 'productId', 'productNameSnapshot', 'productSkuSnapshot',
        'quantity', 'priceSnapshot', 'subtotal',
      ].join(' ')));
    },
    async listRefunds() {
      return limited(RefundPending.find({}).select(
        '_id orderId obligationKey amount status refundedAt',
      ));
    },
    async listProducts() {
      return limited(Product.find({}).select('_id name sku status'));
    },
    async listUsers() {
      const users = await User.find({})
        .select('_id fullName roleId status createdAt')
        .populate({ path: 'roleId', select: 'name' })
        .limit(MAX_REPORT_ROWS + 1)
        .lean();
      return users.map((user) => ({
        ...user,
        role: user.roleId?.name || user.role || '',
      }));
    },
    async listInventory() {
      return limited(Inventory.find({}).select([
        '_id', 'productId', 'sellableQuantity', 'reservedQuantity',
        'quarantinedQuantity', 'damagedQuantity', 'stockQuantity',
        'lowStockThreshold', 'lowStockThresholdOverride', 'inventoryHealth',
        'updatedAt',
      ].join(' ')));
    },
    async listInventoryTransactions() {
      return limited(InventoryTransaction.find({}).select(
        'productId transactionType quantity createdAt',
      ));
    },
    async listLowStockAlerts() {
      return limited(LowStockAlert.find({}).select(
        '_id productId status openedAt resolvedAt',
      ));
    },
    async listSupportRequests() {
      return limited(SupportRequest.find({}).select(
        '_id assigneeId status createdAt resolvedAt',
      ));
    },
    async listSupportMessages() {
      return limited(SupportMessage.find({}).select(
        'ticketId actorId actorRole createdAt',
      ));
    },
    async listAuditLogs() {
      return limited(AuditLog.find({}).select(
        'auditId businessEventId actorId actorRole action outcome targetType targetId timestamp',
      ));
    },
    async listReviews() {
      return limited(ProductReview.find({
        publicationStatus: 'Published',
        moderationStatus: 'Allowed',
      }).select('_id rating createdAt'));
    },
  };
}

function reportError(message, code = 'REPORT_QUERY_INVALID') {
  return new ApiError(400, message, [], code);
}

function parseVietnamDateStart(value) {
  const match = typeof value === 'string' ? value.match(DATE_ONLY_PATTERN) : null;
  if (!match) throw reportError('Invalid report date range');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const normalized = new Date(utcMidnight);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) {
    throw reportError('Invalid report date range');
  }
  return new Date(utcMidnight - VIETNAM_OFFSET_MS);
}

function currentVietnamMonth(now) {
  const local = new Date(new Date(now).getTime() + VIETNAM_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1) - VIETNAM_OFFSET_MS),
    toExclusive: new Date(Date.UTC(year, month + 1, 1) - VIETNAM_OFFSET_MS),
  };
}

function parseReportPeriod(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw reportError('Report query must be an object');
  }
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_PERIOD_FIELDS.has(key));
  if (unsupported.length) {
    throw reportError(`Unsupported report query field: ${unsupported[0]}`);
  }

  const hasFrom = input.from !== undefined && input.from !== '';
  const hasTo = input.to !== undefined && input.to !== '';
  const mode = String(input.mode || (hasFrom || hasTo ? 'period' : 'currentMonth'));

  if (mode === 'allTime') {
    if (hasFrom || hasTo) throw reportError('allTime reports cannot include from or to');
    return { mode, timezone: REPORT_TIMEZONE, from: null, toExclusive: null };
  }
  if (mode === 'currentMonth') {
    if (hasFrom || hasTo) throw reportError('currentMonth reports cannot include from or to');
    return { mode, timezone: REPORT_TIMEZONE, ...currentVietnamMonth(now) };
  }
  if (mode !== 'period') throw reportError('Unsupported report mode');
  if (!hasFrom || !hasTo) {
    throw reportError('Invalid report date range: both from and to are required');
  }

  const from = parseVietnamDateStart(input.from);
  const toExclusive = new Date(parseVietnamDateStart(input.to).getTime() + DAY_MS);
  if (from >= toExclusive) throw reportError('Invalid report date range');
  if ((toExclusive.getTime() - from.getTime()) / DAY_MS > MAX_PERIOD_DAYS) {
    throw reportError(`Report date range cannot exceed ${MAX_PERIOD_DAYS} days`);
  }
  return { mode, timezone: REPORT_TIMEZONE, from, toExclusive };
}

function isDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

function isInPeriod(value, period) {
  if (period.mode === 'allTime') return isDate(value);
  if (!isDate(value)) return false;
  const time = new Date(value).getTime();
  return time >= period.from.getTime() && time < period.toExclusive.getTime();
}

function idOf(value) {
  if (value && typeof value === 'object' && value._id !== undefined) {
    return String(value._id);
  }
  return value === null || value === undefined ? '' : String(value);
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function groupCount(items, field) {
  return items.reduce((result, item) => {
    const key = String(item[field] || 'Unknown');
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function roleOf(user) {
  return String(user.role || user.roleId?.name || '');
}

function assertBounded(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} report repository result must be an array`);
  if (rows.length > MAX_REPORT_ROWS) {
    throw new ApiError(
      503,
      `${label} report exceeds the safe aggregation bound`,
      [],
      'REPORT_AGGREGATION_BOUND_EXCEEDED',
    );
  }
  return rows;
}

function validCompletedSale(order) {
  if (!isDate(order.completedSaleAt)) return false;
  const totalAmount = Number(order.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return false;
  if (order.paymentMethod !== 'COD') return true;
  const expected = Number(order.codExpectedAmount);
  const collected = Number(order.customerCollectedAmount);
  return Number.isFinite(expected)
    && Number.isFinite(collected)
    && expected === totalAmount
    && collected === expected
    && isDate(order.customerCollectedAt);
}

function completedSalesIn(orders, period) {
  return orders.filter((order) => (
    validCompletedSale(order) && isInPeriod(order.completedSaleAt, period)
  ));
}

function buildRevenue(orders, refunds, period) {
  const sales = completedSalesIn(orders, period);
  const refunded = refunds.filter((refund) => (
    refund.status === 'Refunded'
    && isDate(refund.refundedAt)
    && isInPeriod(refund.refundedAt, period)
    && Number.isFinite(Number(refund.amount))
    && Number(refund.amount) >= 0
  ));
  const grossSales = sales.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const refundAmount = refunded.reduce((sum, refund) => sum + Number(refund.amount), 0);
  return {
    grossSales,
    refunds: refundAmount,
    refunded: refundAmount,
    netSales: grossSales - refundAmount,
    completedSaleCount: sales.length,
    refundCount: refunded.length,
    reconciliation: {
      invalidCompletedSaleFacts: orders.filter((order) => (
        isDate(order.completedSaleAt)
        && isInPeriod(order.completedSaleAt, period)
        && !validCompletedSale(order)
      )).length,
      currentStateWithoutCompletedSale: orders.filter((order) => (
        ['Delivered', 'Returned'].includes(order.orderStatus)
        && order.paymentStatus === 'Paid'
        && !isDate(order.completedSaleAt)
      )).length,
    },
    definitions: {
      grossSales: 'Sum of immutable valid CompletedSale facts in the selected period.',
      refunds: 'Sum of authoritative Refunded obligations at RefundedAt in the selected period.',
      netSales: 'Gross sales minus refunds; the result may be negative.',
    },
  };
}

function buildOrders(orders, period, dataAsOf, auditLogs = []) {
  const eventFields = {
    created: ['createdAt'],
    confirmed: ['confirmedAt'],
    shipped: ['shippedAt'],
    delivered: ['deliveredAt'],
  };
  const periodEvents = {};
  for (const [event, fields] of Object.entries(eventFields)) {
    periodEvents[event] = orders.filter((order) => (
      fields.some((field) => isInPeriod(order[field], period))
    )).length;
  }
  function auditedLifecycleCount(fields, actions) {
    const identities = new Set();
    for (const order of orders) {
      if (fields.some((field) => isInPeriod(order[field], period))) {
        identities.add(`order:${idOf(order._id)}`);
      }
    }
    auditLogs.forEach((entry, index) => {
      if (
        entry.outcome !== 'Success'
        || !actions.has(String(entry.action))
        || !isInPeriod(entry.timestamp, period)
      ) return;
      const targetId = idOf(entry.targetId);
      const identity = entry.targetType === 'Order' && targetId
        ? `order:${targetId}`
        : `audit:${entry.businessEventId || entry.auditId || `${entry.action}:${targetId}:${index}`}`;
      identities.add(identity);
    });
    return identities.size;
  }
  periodEvents.cancelled = auditedLifecycleCount(
    ['cancelledAt', 'canceledAt'],
    new Set(['ORDER_CANCEL', 'ORDER_CANCELLED', 'STAFF_ORDER_CANCEL']),
  );
  periodEvents.returned = auditedLifecycleCount(
    ['returnedAt'],
    new Set(['RETURN_REFUND_COMPLETED', 'STAFF_COD_RECOVERY_FINALIZED']),
  );
  const byStatus = groupCount(orders, 'orderStatus');
  const isTerminalDeliveryFailure = (order) => (
    order.orderStatus === 'DeliveryFailed'
    || (
      order.orderStatus === 'Shipped'
      && Boolean(String(order.deliveryResolutionCommandKey || '').trim())
    )
  );
  return {
    periodEvents,
    currentSnapshot: {
      total: orders.length,
      backlog: orders.filter((order) => (
        ['Pending', 'Confirmed', 'Packed', 'Shipped'].includes(order.orderStatus)
        && !isTerminalDeliveryFailure(order)
      )).length,
      terminalDeliveryFailures: orders.filter(isTerminalDeliveryFailure).length,
      byStatus,
      dataAsOf,
    },
    definitions: {
      periodEvents: 'Each Order event is counted by its own immutable event timestamp.',
      currentSnapshot: 'Current Order state as of dataAsOf; it is not a historical reconstruction.',
    },
  };
}

function buildProducts({
  orders,
  orderDetails,
  products,
  inventoryTransactions,
  period,
}) {
  const sales = completedSalesIn(orders, period);
  const saleIds = new Set(sales.map((order) => idOf(order._id)));
  const currentProducts = new Map(products.map((product) => [idOf(product._id), product]));
  const itemMap = new Map();
  for (const detail of orderDetails) {
    if (!saleIds.has(idOf(detail.orderId))) continue;
    const productId = idOf(detail.productId);
    const key = productId || `${detail.productSkuSnapshot}:${detail.productNameSnapshot}`;
    const current = currentProducts.get(productId);
    const item = itemMap.get(key) || {
      productId,
      productNameSnapshot: String(detail.productNameSnapshot || ''),
      productSkuSnapshot: String(detail.productSkuSnapshot || ''),
      currentName: current?.name || null,
      currentSku: current?.sku || null,
      currentStatus: current?.status || 'Missing',
      units: 0,
      value: 0,
    };
    item.units += safeNumber(detail.quantity);
    item.value += Number.isFinite(Number(detail.subtotal))
      ? Number(detail.subtotal)
      : safeNumber(detail.priceSnapshot) * safeNumber(detail.quantity);
    itemMap.set(key, item);
  }
  const items = [...itemMap.values()].sort((left, right) => (
    right.value - left.value
    || right.units - left.units
    || left.productSkuSnapshot.localeCompare(right.productSkuSnapshot)
    || left.productId.localeCompare(right.productId)
  ));

  const movements = inventoryTransactions.filter((entry) => isInPeriod(entry.createdAt, period));
  function absoluteQuantity(type) {
    return movements
      .filter((entry) => entry.transactionType === type)
      .reduce((sum, entry) => sum + Math.abs(safeNumber(entry.quantity)), 0);
  }
  return {
    gross: {
      units: items.reduce((sum, item) => sum + item.units, 0),
      value: items.reduce((sum, item) => sum + item.value, 0),
      items,
    },
    afterSales: {
      returnedUnits: absoluteQuantity('RETURN_IN'),
      exchangeReturnedUnits: absoluteQuantity('EXCHANGE_RETURN_IN'),
      exchangeReplacementUnits: absoluteQuantity('EXCHANGE_REPLACEMENT_OUT'),
    },
    currentSnapshot: {
      total: products.length,
      byStatus: groupCount(products, 'status'),
    },
    definitions: {
      gross: 'Completed-sale quantities and values use immutable OrderDetail snapshots.',
      afterSales: 'Later return and exchange movements are separate from original gross sales.',
    },
  };
}

function buildCustomers(users, orders, period, dataAsOf) {
  const customers = users.filter((user) => roleOf(user) === 'Customer');
  const orderingCustomerIds = new Set(
    orders
      .filter((order) => isInPeriod(order.createdAt, period))
      .map((order) => idOf(order.customerId))
      .filter(Boolean),
  );
  const completedSaleCustomerIds = new Set(
    completedSalesIn(orders, period)
      .map((order) => idOf(order.customerId))
      .filter(Boolean),
  );
  return {
    currentSnapshot: {
      total: customers.length,
      byStatus: groupCount(customers, 'status'),
      dataAsOf,
    },
    period: {
      newCustomers: customers.filter((customer) => isInPeriod(customer.createdAt, period)).length,
      orderingCustomers: orderingCustomerIds.size,
      completedSaleCustomers: completedSaleCustomerIds.size,
    },
    definitions: {
      orderingCustomers: 'Distinct Customers with an Order created in the selected period.',
      completedSaleCustomers: 'Distinct Customers with a valid CompletedSale in the selected period.',
    },
  };
}

function averageDuration(totalMinutes, count) {
  return count ? totalMinutes / count : null;
}

function buildStaff(users, supportRequests, supportMessages, auditLogs, period) {
  const staff = users.filter((user) => roleOf(user) === 'Staff');
  const messagesByTicket = new Map();
  for (const message of supportMessages) {
    const ticketId = idOf(message.ticketId);
    const bucket = messagesByTicket.get(ticketId) || [];
    bucket.push(message);
    messagesByTicket.set(ticketId, bucket);
  }

  const items = staff.map((member) => {
    const staffId = idOf(member._id);
    const audits = auditLogs.filter((entry) => (
      idOf(entry.actorId) === staffId
      && String(entry.actorRole) === 'Staff'
      && isInPeriod(entry.timestamp, period)
    ));
    const assignedTickets = supportRequests.filter((ticket) => idOf(ticket.assigneeId) === staffId);
    let firstResponseMinutes = 0;
    let firstResponseCount = 0;
    let missingFirstResponseCount = 0;
    let resolutionMinutes = 0;
    let resolutionCount = 0;

    for (const ticket of assignedTickets) {
      const firstStaffMessage = (messagesByTicket.get(idOf(ticket._id)) || [])
        .filter((message) => (
          String(message.actorRole) === 'Staff'
          && idOf(message.actorId) === staffId
          && isDate(message.createdAt)
        ))
        .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))[0];
      if (isDate(ticket.createdAt) && firstStaffMessage) {
        firstResponseMinutes += Math.max(
          0,
          (new Date(firstStaffMessage.createdAt) - new Date(ticket.createdAt)) / 60_000,
        );
        firstResponseCount += 1;
      } else {
        missingFirstResponseCount += 1;
      }
      if (isDate(ticket.createdAt) && isDate(ticket.resolvedAt)) {
        resolutionMinutes += Math.max(
          0,
          (new Date(ticket.resolvedAt) - new Date(ticket.createdAt)) / 60_000,
        );
        resolutionCount += 1;
      }
    }

    return {
      staffId,
      fullName: String(member.fullName || ''),
      currentStatus: String(member.status || 'Unknown'),
      workload: {
        successfulActions: audits.filter((entry) => entry.outcome === 'Success').length,
        deniedActions: audits.filter((entry) => entry.outcome === 'Denied').length,
        failedActions: audits.filter((entry) => entry.outcome === 'Failed').length,
        assignedSupportTickets: assignedTickets.length,
      },
      support: {
        firstResponse: {
          qualifyingCount: firstResponseCount,
          averageMinutes: averageDuration(firstResponseMinutes, firstResponseCount),
        },
        resolution: {
          qualifyingCount: resolutionCount,
          averageMinutes: averageDuration(resolutionMinutes, resolutionCount),
        },
        missingFirstResponseCount,
        missingResolutionCount: assignedTickets.length - resolutionCount,
      },
    };
  }).sort((left, right) => (
    left.fullName.localeCompare(right.fullName) || left.staffId.localeCompare(right.staffId)
  ));

  return {
    items,
    definitions: {
      workload: 'Counts attributable Staff audit outcomes and currently assigned Support tickets.',
      duration: 'Averages include only rows with both required timestamps; missing rows stay explicit.',
    },
  };
}

function inventoryAvailable(item) {
  const sellable = safeNumber(item.sellableQuantity ?? item.stockQuantity);
  const reserved = safeNumber(item.reservedQuantity);
  const quarantined = safeNumber(item.quarantinedQuantity);
  return Math.max(0, sellable - reserved - quarantined);
}

function buildInventory(inventory, transactions, alerts, period, dataAsOf) {
  const totals = inventory.reduce((result, item) => ({
    sellable: result.sellable + safeNumber(item.sellableQuantity ?? item.stockQuantity),
    reserved: result.reserved + safeNumber(item.reservedQuantity),
    quarantined: result.quarantined + safeNumber(item.quarantinedQuantity),
    damaged: result.damaged + safeNumber(item.damagedQuantity),
    available: result.available + inventoryAvailable(item),
  }), {
    sellable: 0,
    reserved: 0,
    quarantined: 0,
    damaged: 0,
    available: 0,
  });
  const currentLowStock = inventory.filter((item) => {
    if (item.inventoryHealth === 'ReconciliationRequired') return false;
    const threshold = item.lowStockThresholdOverride !== null
      && item.lowStockThresholdOverride !== undefined
      ? safeNumber(item.lowStockThresholdOverride)
      : safeNumber(item.lowStockThreshold);
    return inventoryAvailable(item) <= threshold;
  }).length;

  const periodTransactions = transactions.filter((entry) => isInPeriod(entry.createdAt, period));
  const byType = {};
  for (const entry of periodTransactions) {
    const type = String(entry.transactionType || 'Unknown');
    byType[type] ||= { count: 0, signedQuantity: 0 };
    byType[type].count += 1;
    byType[type].signedQuantity += safeNumber(entry.quantity);
  }

  return {
    currentSnapshot: {
      totalRecords: inventory.length,
      totals,
      lowStockCount: currentLowStock,
      openAlertCount: alerts.filter((alert) => alert.status === 'Open').length,
      dataAsOf,
    },
    periodMovements: {
      count: periodTransactions.length,
      byType,
    },
    lowStockEvents: {
      opened: alerts.filter((alert) => isInPeriod(alert.openedAt, period)).length,
      resolved: alerts.filter((alert) => isInPeriod(alert.resolvedAt, period)).length,
    },
    definitions: {
      currentSnapshot: 'A current inventory snapshot as of dataAsOf, not a historical reconstruction.',
      periodMovements: 'Inventory movements grouped by type with their signed quantity.',
    },
  };
}

function buildSupport(supportRequests, period) {
  const periodRequests = supportRequests.filter((request) => isInPeriod(request.createdAt, period));
  return {
    total: periodRequests.length,
    open: supportRequests.filter((request) => (
      ['New', 'Open', 'InProgress'].includes(request.status)
    )).length,
    resolved: periodRequests.filter((request) => request.status === 'Resolved').length,
  };
}

function buildReviews(reviews, period) {
  const rows = reviews.filter((review) => isInPeriod(review.createdAt, period));
  const totalRating = rows.reduce((sum, review) => sum + safeNumber(review.rating), 0);
  return {
    total: rows.length,
    averageRating: rows.length ? totalRating / rows.length : 0,
  };
}

function periodMetadata(period, generatedAt, dataAsOf) {
  return {
    mode: period.mode,
    timezone: REPORT_TIMEZONE,
    period: {
      from: period.from,
      toExclusive: period.toExclusive,
    },
    generatedAt,
    dataAsOf,
  };
}

function createReportService({
  repository = createModelRepository(),
  clock = () => new Date(),
} = {}) {
  async function load(input = {}, requestedMethods = ALL_REPORT_REPOSITORIES) {
    const generatedAt = new Date(clock());
    const dataAsOf = new Date(generatedAt);
    const period = parseReportPeriod(input, generatedAt);
    const requested = new Set(requestedMethods);
    const read = (method, fallback = []) => (
      requested.has(method) && typeof repository[method] === 'function'
        ? repository[method]()
        : Promise.resolve(fallback)
    );
    const productRows = requested.has('listProducts') && typeof repository.listProducts === 'function'
      ? repository.listProducts()
      : Promise.resolve(requested.has('listProducts') && typeof repository.countProducts === 'function'
        ? Promise.resolve(repository.countProducts()).then((count) => (
          Array.from({ length: Number(count) || 0 }, (_, index) => ({
            _id: `legacy-product-${index + 1}`,
            status: 'Unknown',
          }))
        ))
        : []);
    const refundRows = requested.has('listRefunds') && typeof repository.listRefunds === 'function'
      ? repository.listRefunds()
      : (
        requested.has('listRefunds') && typeof repository.listCompletedRefunds === 'function'
          ? Promise.resolve(repository.listCompletedRefunds())
          : Promise.resolve([])
      ).then((rows) => rows.map((row) => ({
        ...row,
        amount: row.amount ?? row.refundAmount ?? row.totalAmount,
        status: 'Refunded',
        refundedAt: row.refundedAt ?? row.completedAt,
      })));
    const [
      orders,
      orderDetails,
      refunds,
      products,
      users,
      inventory,
      inventoryTransactions,
      lowStockAlerts,
      supportRequests,
      supportMessages,
      auditLogs,
      reviews,
    ] = await Promise.all([
      read('listOrders'),
      read('listOrderDetails'),
      refundRows,
      productRows,
      read('listUsers'),
      read('listInventory'),
      read('listInventoryTransactions'),
      read('listLowStockAlerts'),
      read('listSupportRequests'),
      read('listSupportMessages'),
      read('listAuditLogs'),
      read('listReviews'),
    ]);
    const data = {
      orders: assertBounded(orders, 'Order'),
      orderDetails: assertBounded(orderDetails, 'OrderDetail'),
      refunds: assertBounded(refunds, 'Refund'),
      products: assertBounded(products, 'Product'),
      users: assertBounded(users, 'User'),
      inventory: assertBounded(inventory, 'Inventory'),
      inventoryTransactions: assertBounded(inventoryTransactions, 'InventoryTransaction'),
      lowStockAlerts: assertBounded(lowStockAlerts, 'LowStockAlert'),
      supportRequests: assertBounded(supportRequests, 'SupportRequest'),
      supportMessages: assertBounded(supportMessages, 'SupportMessage'),
      auditLogs: assertBounded(auditLogs, 'AuditLog'),
      reviews: assertBounded(reviews, 'ProductReview'),
      period,
      generatedAt,
      dataAsOf,
    };
    return data;
  }

  async function compose(input = {}, requestedMethods = ALL_REPORT_REPOSITORIES) {
    const data = await load(input, requestedMethods);
    const meta = periodMetadata(data.period, data.generatedAt, data.dataAsOf);
    return {
      data,
      meta,
      revenue: buildRevenue(data.orders, data.refunds, data.period),
      orders: buildOrders(data.orders, data.period, data.dataAsOf, data.auditLogs),
      products: buildProducts(data),
      customers: buildCustomers(data.users, data.orders, data.period, data.dataAsOf),
      staff: buildStaff(
        data.users,
        data.supportRequests,
        data.supportMessages,
        data.auditLogs,
        data.period,
      ),
      inventory: buildInventory(
        data.inventory,
        data.inventoryTransactions,
        data.lowStockAlerts,
        data.period,
        data.dataAsOf,
      ),
      support: buildSupport(data.supportRequests, data.period),
      reviews: buildReviews(data.reviews, data.period),
    };
  }

  return {
    async getRevenueReport(input = {}) {
      const report = await compose(input, ['listOrders', 'listRefunds']);
      return { meta: report.meta, revenue: report.revenue };
    },
    async getOrderReport(input = {}) {
      const report = await compose(input, ['listOrders', 'listAuditLogs']);
      return { meta: report.meta, orders: report.orders };
    },
    async getProductReport(input = {}) {
      const report = await compose(input, [
        'listOrders',
        'listOrderDetails',
        'listProducts',
        'listInventoryTransactions',
      ]);
      return { meta: report.meta, products: report.products };
    },
    async getCustomerReport(input = {}) {
      const report = await compose(input, ['listOrders', 'listUsers']);
      return { meta: report.meta, customers: report.customers };
    },
    async getStaffReport(input = {}) {
      const report = await compose(input, [
        'listUsers',
        'listSupportRequests',
        'listSupportMessages',
        'listAuditLogs',
      ]);
      return { meta: report.meta, staff: report.staff };
    },
    async getInventoryReport(input = {}) {
      const report = await compose(input, [
        'listInventory',
        'listInventoryTransactions',
        'listLowStockAlerts',
      ]);
      return { meta: report.meta, inventory: report.inventory };
    },
    async getAdminOverview(input = {}) {
      const report = await compose(input);
      return {
        meta: report.meta,
        period: {
          from: report.meta.period.from,
          to: report.meta.period.toExclusive
            ? new Date(report.meta.period.toExclusive.getTime() - 1)
            : null,
          toExclusive: report.meta.period.toExclusive,
        },
        revenue: report.revenue,
        orders: {
          ...report.orders,
          total: report.orders.currentSnapshot.total,
          delivered: report.orders.currentSnapshot.byStatus.Delivered || 0,
          returned: report.orders.currentSnapshot.byStatus.Returned || 0,
          byStatus: report.orders.currentSnapshot.byStatus,
        },
        products: {
          ...report.products,
          total: report.products.currentSnapshot.total,
        },
        customers: report.customers,
        staff: report.staff,
        inventory: {
          ...report.inventory,
          totalRecords: report.inventory.currentSnapshot.totalRecords,
          lowStock: report.inventory.currentSnapshot.lowStockCount,
        },
        support: report.support,
        reviews: report.reviews,
      };
    },
  };
}

module.exports = {
  MAX_PERIOD_DAYS,
  MAX_REPORT_ROWS,
  REPORT_TIMEZONE,
  createModelRepository,
  createReportService,
  parseReportPeriod,
  reportService: createReportService(),
};
