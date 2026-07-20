const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const Product = require('../models/product.model');
const Cart = require('../models/cart.model');
const CartItem = require('../models/cartItem.model');
const Inventory = require('../models/inventory.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const Payment = require('../models/payment.model');
const PaymentAttempt = require('../models/paymentAttempt.model');
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
    cancelReason: order.cancelReason || '',
    details,
    createdAt: order.createdAt,
  };
}

function generateOrderCode() {
  return `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function generateAttemptCode() {
  return `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function createModelCartRepository() {
  return {
    async findActiveByCustomer(customerId, session) {
      return withOptionalSession(Cart.findOne({ customerId, status: 'Active' }), session).lean();
    },
    async listItems(cartId, session) {
      return withOptionalSession(CartItem.find({ cartId }), session).lean();
    },
    async clearExactCart(cartId, session) {
      const updatedCart = await withOptionalSession(
        Cart.findOneAndUpdate({ _id: cartId, status: 'Active' }, { status: 'CheckedOut' }, { new: true, runValidators: true }),
        session
      ).lean();
      if (updatedCart) {
        await withOptionalSession(CartItem.deleteMany({ cartId }), session);
      }
      return updatedCart;
    },
  };
}

function createModelProductRepository() {
  return {
    async findSellableById(id, session) {
      return withOptionalSession(Product.findOne({ _id: id, status: 'Active' }), session).lean();
    },
  };
}

function createModelInventoryRepository() {
  return {
    async reserve(productId, quantity, session) {
      const inventory = await withOptionalSession(
        Inventory.findOneAndUpdate(
          {
            productId,
            $expr: { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, Number(quantity)] },
          },
          { $inc: { reservedQuantity: Number(quantity) } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
      if (!inventory) throw new ApiError(409, 'Insufficient available inventory for checkout');
      return inventory;
    },
  };
}

function createModelOrderRepository() {
  return {
    async findCompletedByIdempotencyKey(customerId, idempotencyKey, session) {
      return withOptionalSession(Order.findOne({ customerId, idempotencyKey }), session).lean();
    },
    async createOrder(data, session) {
      const [order] = await Order.create([data], session ? { session } : undefined);
      return order.toObject();
    },
    async createOrderDetail(data, session) {
      const [detail] = await OrderDetail.create([data], session ? { session } : undefined);
      return detail.toObject();
    },
    async createPayment(data, session) {
      const [payment] = await Payment.create([data], session ? { session } : undefined);
      return payment.toObject();
    },
    async createPaymentAttempt(data, session) {
      const [attempt] = await PaymentAttempt.create([data], session ? { session } : undefined);
      return attempt.toObject();
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
      return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
  };
}

function createOrderService({
  transactionManager = createModelTransactionManager(),
  cartRepository = createModelCartRepository(),
  productRepository = createModelProductRepository(),
  inventoryRepository = createModelInventoryRepository(),
  orderRepository = createModelOrderRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  function normalizeIdempotencyKey(input = {}) {
    const key = String(input.idempotencyKey || '').trim();
    if (!key) throw new ApiError(400, 'Idempotency-Key is required for checkout');
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new ApiError(400, 'Idempotency-Key must be 8-128 characters using letters, numbers, ., _, :, or -');
    }
    return key;
  }

  async function buildOrderLines(cartItems, session) {
    const lines = [];
    for (const item of cartItems) {
      const product = await productRepository.findSellableById(item.productId, session);
      if (!product) throw new ApiError(400, `Product is no longer available: ${item.productName}`);
      if (product.stockQuantity !== undefined && item.quantity > product.stockQuantity) {
        throw new ApiError(400, `Product quantity exceeds available stock: ${product.name}`);
      }
      lines.push({
        productId: item.productId,
        productNameSnapshot: product.name,
        productSkuSnapshot: product.sku || '',
        unitSnapshot: product.unit || '',
        productImageSnapshot: Array.isArray(product.imageUrls) ? product.imageUrls[0] || '' : '',
        priceSnapshot: product.price,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
      });
    }
    return lines;
  }

  async function loadExisting(customerId, idempotencyKey) {
    const existing = await orderRepository.findCompletedByIdempotencyKey(customerId, idempotencyKey);
    if (!existing) return null;
    const details = orderRepository.listDetails ? await orderRepository.listDetails(existing._id) : [];
    return toOrderResponse(existing, details);
  }

  return {
    async placeOrder(customerId, input = {}) {
      if (!input.shippingAddress || !String(input.shippingAddress).trim()) {
        throw new ApiError(400, 'Shipping address is required');
      }
      const idempotencyKey = normalizeIdempotencyKey(input);
      const paymentMethod = input.paymentMethod || 'COD';
      if (!['COD', 'ONLINE'].includes(paymentMethod)) throw new ApiError(400, 'Invalid payment method');

      const existing = await loadExisting(customerId, idempotencyKey);
      if (existing) return existing;

      let result;
      try {
        result = await transactionManager.withTransaction(async (session) => {
          const alreadyCompleted = await orderRepository.findCompletedByIdempotencyKey(customerId, idempotencyKey, session);
          if (alreadyCompleted) {
            const details = orderRepository.listDetails ? await orderRepository.listDetails(alreadyCompleted._id) : [];
            return { order: alreadyCompleted, lines: details, replay: true };
          }

          const cart = await cartRepository.findActiveByCustomer(customerId, session);
          if (!cart) throw new ApiError(400, 'Cart must have at least one item before checkout');
          const cartItems = await cartRepository.listItems(cart._id, session);
          if (!cartItems.length) throw new ApiError(400, 'Cart must have at least one item before checkout');

          const lines = await buildOrderLines(cartItems, session);
          const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
          const initialPaymentStatus = paymentMethod === 'COD' ? 'Unpaid' : 'Pending';
          const order = await orderRepository.createOrder(
            {
              orderCode: generateOrderCode(),
              customerId,
              idempotencyKey,
              totalAmount,
              subtotal: totalAmount,
              paymentMethod,
              paymentStatus: initialPaymentStatus,
              orderStatus: paymentMethod === 'ONLINE' ? 'WaitingForPayment' : 'Pending',
              shippingAddress: String(input.shippingAddress).trim(),
              receiverName: String(input.receiverName || '').trim(),
              receiverPhone: String(input.receiverPhone || '').trim(),
              customerNote: String(input.customerNote || '').trim(),
            },
            session
          );

          for (const line of lines) {
            await inventoryRepository.reserve(line.productId, line.quantity, session);
            await orderRepository.createOrderDetail({ orderId: order._id, ...line }, session);
          }

          const paymentPayload = {
            orderId: order._id,
            paymentMethod,
            amount: totalAmount,
            currency: 'VND',
            paymentStatus: initialPaymentStatus,
          };
          await orderRepository.createPayment(paymentPayload, session);
          await orderRepository.createPaymentAttempt(
            { ...paymentPayload, attemptCode: generateAttemptCode(), paymentProvider: paymentMethod === 'COD' ? 'COD' : 'MOCK' },
            session
          );
          const clearedCart = await cartRepository.clearExactCart(cart._id, session);
          if (!clearedCart) throw new ApiError(409, 'Cart was changed during checkout. Please retry with a new key.');
          return { order, lines, replay: false };
        });
      } catch (error) {
        if (error && error.code === 11000) {
          const replay = await loadExisting(customerId, idempotencyKey);
          if (replay) return replay;
        }
        throw error;
      }

      if (!result.replay) {
        await auditLogger.log({
          userId: customerId,
          action: 'ORDER_CREATE',
          targetEntity: 'Order',
          targetId: String(result.order._id),
          description: `Order created: ${result.order.orderCode}`,
        });
      }
      return toOrderResponse(result.order, result.lines);
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

    async cancelOrder(customerId, orderId, input = {}) {
      const order = await orderRepository.findById(orderId);
      if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
      const isPreConfirmation = ['Pending', 'WaitingForPayment'].includes(order.orderStatus);
      const isUnpaid = ['Unpaid', 'Pending', 'Failed'].includes(order.paymentStatus);
      if (!isPreConfirmation || !isUnpaid) {
        throw new ApiError(409, 'Only unpaid pre-confirmation orders can be cancelled');
      }
      const cancelled = await orderRepository.updateOrder(orderId, {
        orderStatus: 'Cancelled',
        paymentStatus: order.paymentStatus === 'Pending' ? 'Cancelled' : order.paymentStatus,
        cancelReason: String(input.cancelReason || '').trim(),
      });
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
