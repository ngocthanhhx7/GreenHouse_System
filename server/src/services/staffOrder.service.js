const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const { logAudit } = require('../utils/auditLogger');
const { canTransitionOrderStatus, getAllowedOrderStatusTransitions } = require('../utils/orderStateMachine');

function toOrderSummary(order) {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customerId: String(order.customerId),
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    shippingAddress: order.shippingAddress,
    createdAt: order.createdAt,
  };
}

function toOrderDetail(order, details = []) {
  return {
    ...toOrderSummary(order),
    allowedNextStatuses: getAllowedOrderStatusTransitions(order.orderStatus),
    details,
  };
}

function toStockExportRequest(request) {
  return {
    id: String(request._id),
    orderId: String(request.orderId),
    requestedBy: String(request.requestedBy),
    status: request.status,
    note: request.note || '',
    createdAt: request.createdAt,
  };
}

function createModelOrderRepository() {
  return {
    async listOrders(query = {}) {
      const filter = {};
      if (query.status) filter.orderStatus = query.status;
      if (query.dateFrom || query.dateTo) {
        filter.createdAt = {};
        if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
        if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
      }
      return Order.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findOrderById(id) {
      return Order.findById(id).lean();
    },
    async listOrderDetails(orderId) {
      return OrderDetail.find({ orderId }).lean();
    },
    async updateOrder(id, data) {
      return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async findOpenStockExportRequest(orderId) {
      return StockExportRequest.findOne({ orderId, status: { $in: ['Pending', 'Approved', 'Processing'] } }).lean();
    },
    async createStockExportRequest(data) {
      return StockExportRequest.create(data);
    },
  };
}

function createStaffOrderService({
  orderRepository = createModelOrderRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function getOrderOrThrow(orderId) {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) throw new ApiError(404, 'Order not found');
    return order;
  }

  async function writeAudit(staffId, action, order, description) {
    await auditLogger.log({
      userId: staffId,
      action,
      targetEntity: 'Order',
      targetId: String(order._id),
      description,
    });
  }

  return {
    async listOrders(query = {}) {
      const orders = await orderRepository.listOrders(query);
      return {
        items: orders.map(toOrderSummary),
        total: orders.length,
      };
    },

    async getOrder(orderId) {
      const order = await getOrderOrThrow(orderId);
      const details = await orderRepository.listOrderDetails(orderId);
      return toOrderDetail(order, details);
    },

    async confirmOrder(staffId, orderId, input = {}) {
      const order = await getOrderOrThrow(orderId);
      if (order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'Paid') {
        throw new ApiError(409, 'Online order must be paid before confirmation');
      }
      if (order.orderStatus !== 'Pending') throw new ApiError(409, 'Only Pending orders can be confirmed');

      const updated = await orderRepository.updateOrder(orderId, { orderStatus: 'Confirmed' });
      await writeAudit(staffId, 'STAFF_ORDER_CONFIRM', updated, `Staff confirmed order ${updated.orderCode}. ${input.note || ''}`.trim());
      return toOrderDetail(updated, await orderRepository.listOrderDetails(orderId));
    },

    async requestStockExport(staffId, orderId, input = {}) {
      const order = await getOrderOrThrow(orderId);
      const existing = await orderRepository.findOpenStockExportRequest(orderId);
      if (existing) throw new ApiError(409, 'Stock export request already exists');
      if (order.orderStatus !== 'Confirmed') throw new ApiError(409, 'Only Confirmed orders can request stock export');

      const request = await orderRepository.createStockExportRequest({
        orderId,
        requestedBy: staffId,
        status: 'Pending',
        note: String(input.note || '').trim(),
      });
      const updated = await orderRepository.updateOrder(orderId, { orderStatus: 'StockExportRequested' });
      await writeAudit(staffId, 'STAFF_STOCK_EXPORT_REQUEST', updated, `Staff requested stock export for ${updated.orderCode}`);
      return {
        order: toOrderSummary(updated),
        stockExportRequest: toStockExportRequest(request),
      };
    },

    async updateStatus(staffId, orderId, input = {}) {
      const order = await getOrderOrThrow(orderId);
      const nextStatus = input.nextStatus;
      if (!canTransitionOrderStatus(order.orderStatus, nextStatus)) {
        throw new ApiError(409, 'Invalid order status transition');
      }

      const updated = await orderRepository.updateOrder(orderId, { orderStatus: nextStatus });
      await writeAudit(staffId, 'STAFF_ORDER_STATUS_UPDATE', updated, `Staff updated order ${updated.orderCode} to ${nextStatus}`);
      return toOrderDetail(updated, await orderRepository.listOrderDetails(orderId));
    },

    async getInvoice(orderId) {
      const order = await getOrderOrThrow(orderId);
      if (!['Confirmed', 'StockExportRequested', 'Packed', 'Shipped', 'Delivered'].includes(order.orderStatus)) {
        throw new ApiError(409, 'Invoice is only available after order confirmation');
      }
      const items = await orderRepository.listOrderDetails(orderId);
      return {
        order: toOrderSummary(order),
        items,
        totalAmount: order.totalAmount,
        issuedAt: new Date().toISOString(),
      };
    },
  };
}

module.exports = {
  createStaffOrderService,
  staffOrderService: createStaffOrderService(),
};
