const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');

const QUALIFYING_ORDER_STATUS = 'Delivered';
const QUALIFYING_PAYMENT_STATUS = 'Paid';

function vietnamWindowStart(now) {
  const current = new Date(now);
  const shifted = new Date(current.getTime() + 7 * 60 * 60 * 1000);
  const localMidnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - 29,
  );
  return new Date(localMidnightUtc - 7 * 60 * 60 * 1000);
}

function isQualifyingSale(order, start, end) {
  const completedSaleAt = new Date(order?.completedSaleAt);
  return (
    order?.orderStatus === QUALIFYING_ORDER_STATUS
    && order?.paymentStatus === QUALIFYING_PAYMENT_STATUS
    && !Number.isNaN(completedSaleAt.getTime())
    && completedSaleAt >= new Date(start)
    && completedSaleAt <= new Date(end)
  );
}

function aggregateQualifyingSales({
  orders = [],
  orderDetails = [],
  start,
  end,
} = {}) {
  const qualifyingOrderIds = new Set(
    orders
      .filter((order) => isQualifyingSale(order, start, end))
      .map((order) => String(order._id)),
  );
  const totalsByProduct = new Map();
  for (const detail of orderDetails) {
    if (!qualifyingOrderIds.has(String(detail.orderId))) continue;
    const productId = String(detail.productId);
    const current = totalsByProduct.get(productId) || {
      _id: productId,
      quantity: 0,
      revenue: 0,
    };
    current.quantity += Number(detail.quantity || 0);
    current.revenue += Number(detail.subtotal || 0);
    totalsByProduct.set(productId, current);
  }
  return [...totalsByProduct.values()];
}

function createModelBestSellerRepository() {
  return {
    async aggregateQualifying(start, end) {
      const orderIds = await Order.find({
        completedSaleAt: { $gte: start, $lte: end },
        orderStatus: QUALIFYING_ORDER_STATUS,
        paymentStatus: QUALIFYING_PAYMENT_STATUS,
      }).distinct('_id');
      if (!orderIds.length) return [];
      return OrderDetail.aggregate([
        { $match: { orderId: { $in: orderIds } } },
        {
          $group: {
            _id: '$productId',
            quantity: { $sum: '$quantity' },
            revenue: { $sum: '$subtotal' },
          },
        },
      ]);
    },
  };
}

module.exports = {
  aggregateQualifyingSales,
  createModelBestSellerRepository,
  isQualifyingSale,
  vietnamWindowStart,
};
