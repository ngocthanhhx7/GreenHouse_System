const ApiError = require('../utils/apiError');
const Product = require('../models/product.model');
const Cart = require('../models/cart.model');
const CartItem = require('../models/cartItem.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const { logAudit } = require('../utils/auditLogger');

function toOrderResponse(order, details = []) {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customerId: String(order.customerId),
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    shippingAddress: order.shippingAddress,
    details,
    createdAt: order.createdAt,
  };
}

function createModelCartRepository() {
  return {
    async findActiveByCustomer(customerId) {
      return Cart.findOne({ customerId, status: 'Active' }).lean();
    },
    async listItems(cartId) {
      return CartItem.find({ cartId }).lean();
    },
    async markCheckedOut(cartId) {
      await Cart.findByIdAndUpdate(cartId, { status: 'CheckedOut' });
    },
  };
}

function createModelProductRepository() {
  return {
    async findSellableById(id) {
      return Product.findOne({ _id: id, status: 'Active' }).lean();
    },
  };
}

function createModelOrderRepository() {
  return {
    async createOrder(data) {
      return Order.create(data);
    },
    async createOrderDetail(data) {
      return OrderDetail.create(data);
    },
    async createPayment(data) {
      return Payment.create(data);
    },
    async listByCustomer(customerId) {
      return Order.find({ customerId }).sort({ createdAt: -1 }).lean();
    },
    async findById(id) {
      return Order.findById(id).lean();
    },
    async listDetails(orderId) {
      return OrderDetail.find({ orderId }).lean();
    },
    async updateOrder(id, data) {
      return Order.findByIdAndUpdate(id, data, { new: true }).lean();
    },
  };
}

function createOrderService({
  cartRepository = createModelCartRepository(),
  productRepository = createModelProductRepository(),
  orderRepository = createModelOrderRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function buildOrderLines(cartItems) {
    const lines = [];
    for (const item of cartItems) {
      const product = await productRepository.findSellableById(item.productId);
      if (!product) throw new ApiError(400, `Product is no longer available: ${item.productName}`);
      if (product.stockQuantity !== undefined && item.quantity > product.stockQuantity) {
        throw new ApiError(400, `Product quantity exceeds available stock: ${product.name}`);
      }
      lines.push({
        productId: item.productId,
        productNameSnapshot: product.name,
        priceSnapshot: product.price,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
      });
    }
    return lines;
  }

  return {
    async placeOrder(customerId, input) {
      if (!input.shippingAddress || !String(input.shippingAddress).trim()) {
        throw new ApiError(400, 'Shipping address is required');
      }
      const paymentMethod = input.paymentMethod || 'COD';
      if (!['COD', 'ONLINE'].includes(paymentMethod)) throw new ApiError(400, 'Invalid payment method');

      const cart = await cartRepository.findActiveByCustomer(customerId);
      if (!cart) throw new ApiError(400, 'Cart must have at least one item before checkout');
      const cartItems = await cartRepository.listItems(cart._id);
      if (!cartItems.length) throw new ApiError(400, 'Cart must have at least one item before checkout');

      const lines = await buildOrderLines(cartItems);
      const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
      const order = await orderRepository.createOrder({
        orderCode: `ORD-${Date.now()}`,
        customerId,
        totalAmount,
        paymentMethod,
        paymentStatus: 'Pending',
        orderStatus: paymentMethod === 'ONLINE' ? 'WaitingForPayment' : 'Pending',
        shippingAddress: String(input.shippingAddress).trim(),
      });

      for (const line of lines) {
        await orderRepository.createOrderDetail({ orderId: order._id, ...line });
      }
      await orderRepository.createPayment({
        orderId: order._id,
        paymentMethod,
        amount: totalAmount,
        paymentStatus: 'Pending',
      });
      await cartRepository.markCheckedOut(cart._id);
      await auditLogger.log({
        userId: customerId,
        action: 'ORDER_CREATE',
        targetEntity: 'Order',
        targetId: String(order._id),
        description: `Order created: ${order.orderCode}`,
      });

      return toOrderResponse(order, lines);
    },

    async listMyOrders(customerId) {
      const orders = await orderRepository.listByCustomer(customerId);
      return orders.map((order) => toOrderResponse(order));
    },

    async getMyOrder(customerId, orderId) {
      const order = await orderRepository.findById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      const details = orderRepository.listDetails ? await orderRepository.listDetails(orderId) : [];
      return toOrderResponse(order, details);
    },

    async cancelOrder(customerId, orderId) {
      const order = await orderRepository.findById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      if (order.orderStatus !== 'Pending' || order.paymentStatus !== 'Pending') {
        throw new ApiError(409, 'Only Pending unpaid orders can be cancelled');
      }
      const cancelled = await orderRepository.updateOrder(orderId, { orderStatus: 'Cancelled' });
      await auditLogger.log({
        userId: customerId,
        action: 'ORDER_CANCEL',
        targetEntity: 'Order',
        targetId: String(orderId),
        description: `Order cancelled: ${order.orderCode}`,
      });
      return toOrderResponse(cancelled);
    },
  };
}

module.exports = {
  createOrderService,
  orderService: createOrderService(),
};
