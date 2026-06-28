const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const { logAudit } = require('../utils/auditLogger');
const { notificationService: defaultNotificationService } = require('./notification.service');

function toPaymentResponse(order, payment, extra = {}) {
  return {
    orderId: String(order._id),
    orderCode: order.orderCode,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.paymentStatus,
    transactionId: payment.transactionId,
    ...extra,
  };
}

function createModelPaymentRepository() {
  return {
    async findOrderById(id) {
      return Order.findById(id).lean();
    },
    async findPaymentByOrder(orderId) {
      return Payment.findOne({ orderId }).lean();
    },
    async updatePayment(id, data) {
      return Payment.findByIdAndUpdate(id, data, { new: true }).lean();
    },
    async updateOrder(id, data) {
      return Order.findByIdAndUpdate(id, data, { new: true }).lean();
    },
  };
}

function createPaymentService({
  paymentRepository = createModelPaymentRepository(),
  auditLogger = { log: logAudit },
  notificationService = defaultNotificationService,
} = {}) {
  return {
    async createOnlinePaymentRequest(customerId, orderId) {
      const order = await paymentRepository.findOrderById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.paymentMethod !== 'ONLINE') throw new ApiError(400, 'Order is not an online payment order');
      if (order.paymentStatus === 'Paid') throw new ApiError(409, 'Order is already paid');

      const payment = await paymentRepository.findPaymentByOrder(orderId);
      if (!payment) throw new ApiError(404, 'Payment record not found');

      return toPaymentResponse(order, payment, {
        mockPaymentUrl: `/payments/mock/${orderId}?amount=${payment.amount}`,
      });
    },

    async handlePaymentCallback(input) {
      const order = await paymentRepository.findOrderById(input.orderId);
      if (!order) throw new ApiError(404, 'Order not found');
      if (Number(input.amount) !== Number(order.totalAmount)) {
        throw new ApiError(400, 'Payment amount does not match order total');
      }

      const payment = await paymentRepository.findPaymentByOrder(input.orderId);
      if (!payment) throw new ApiError(404, 'Payment record not found');

      if (payment.paymentStatus === 'Paid' && input.status === 'Paid') {
        return toPaymentResponse(order, payment);
      }

      const nextStatus = ['Paid', 'Failed', 'Cancelled'].includes(input.status) ? input.status : 'Failed';
      const updatedPayment = await paymentRepository.updatePayment(payment._id, {
        paymentStatus: nextStatus,
        transactionId: input.transactionId || payment.transactionId,
        paidAt: nextStatus === 'Paid' ? new Date() : null,
        rawResponse: input,
      });
      const updatedOrder = await paymentRepository.updateOrder(order._id, {
        paymentStatus: nextStatus,
        orderStatus: nextStatus === 'Paid' && order.orderStatus === 'WaitingForPayment' ? 'Pending' : order.orderStatus,
      });

      await auditLogger.log({
        userId: order.customerId,
        action: `PAYMENT_CALLBACK_${nextStatus.toUpperCase()}`,
        targetEntity: 'Payment',
        targetId: String(payment._id),
        description: `Payment callback ${nextStatus} for ${order.orderCode}`,
      });

      await notificationService.notifyPaymentStatus({
        userId: order.customerId,
        orderCode: order.orderCode,
        paymentStatus: nextStatus,
      });

      return toPaymentResponse(updatedOrder, updatedPayment);
    },
  };
}

module.exports = {
  createPaymentService,
  paymentService: createPaymentService(),
};
