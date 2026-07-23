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
const RefundPending = require('../models/refundPending.model');
const OrderReservation = require('../models/orderReservation.model');
const DomainOutbox = require('../models/domainOutbox.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const User = require('../models/user.model');
const UserAddress = require('../models/userAddress.model');
const { createPayOSGateway } = require('../config/payos');
const { logAudit } = require('../utils/auditLogger');
const { createEmailOutboxService } = require('./email.service');
const { systemSettingService } = require('./systemSetting.service');

function toOrderResponse(order, details = []) {
  return {
    id: String(order._id),
    orderCode: order.orderCode,
    customerId: String(order.customerId),
    totalAmount: order.totalAmount,
    codExpectedAmount: Number(order.codExpectedAmount ?? order.totalAmount ?? 0),
    customerCollectedAmount: Number(order.customerCollectedAmount || 0),
    customerCollectedAt: order.customerCollectedAt || null,
    carrierSettlementAmount: Number(order.carrierSettlementAmount || 0),
    carrierSettledAt: order.carrierSettledAt || null,
    codDiscrepancyStatus: order.codDiscrepancyStatus || 'None',
    codRecoveryReceiptId: order.codRecoveryReceiptId || '',
    codRecoveryReceivedAt: order.codRecoveryReceivedAt || null,
    settlementReconciliationStatus: order.settlementReconciliationStatus || 'NotApplicable',
    completedSaleAt: order.completedSaleAt || null,
    returnDeadlineAt: order.returnDeadlineAt || null,
    exchangeDeadlineAt: order.exchangeDeadlineAt || null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    moneyObligationsSettled: order.moneyObligationsSettled !== false,
    orderStatus: order.orderStatus,
    shippingAddress: order.shippingAddress,
    receiverName: order.receiverName || '',
    receiverPhone: order.receiverPhone || '',
    customerNote: order.customerNote || '',
    subtotal: Number(order.subtotal ?? order.totalAmount ?? 0),
    shippingFee: Number(order.shippingFee || 0),
    currency: order.currency || 'VND',
    cancelReason: order.cancelReason || '',
    paymentDeadlineAt: order.paymentDeadlineAt ? new Date(order.paymentDeadlineAt).toISOString() : null,
    details,
    createdAt: order.createdAt,
  };
}

function generateOrderCode() {
  return `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalizeStructuredDeliveryAddress(address = {}, customerNote = '') {
  const fieldLimits = {
    receiverName: { maxLength: 120, label: 'Tên người nhận' },
    phoneNumber: { maxLength: 20, label: 'Số điện thoại' },
    province: { maxLength: 100, label: 'Tỉnh/Thành' },
    district: { maxLength: 100, label: 'Quận/Huyện' },
    ward: { maxLength: 100, label: 'Phường/Xã' },
    addressLine: { maxLength: 300, label: 'Địa chỉ chi tiết' },
  };
  const values = {};
  const errors = [];

  for (const [field, { maxLength, label }] of Object.entries(fieldLimits)) {
    const value = String(address[field] || '').trim();
    if (!value) errors.push({ field, message: `${label} là bắt buộc` });
    if (value.length > maxLength) {
      errors.push({ field, message: `${label} không được vượt quá ${maxLength} ký tự` });
    }
    values[field] = value;
  }

  const receiverPhone = values.phoneNumber.replace(/[.\s-]/g, '');
  if (values.phoneNumber && !/^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(receiverPhone)) {
    errors.push({ field: 'phoneNumber', message: 'Số điện thoại người nhận không hợp lệ' });
  }
  const normalizedNote = String(customerNote || '').trim();
  if (normalizedNote.length > 500) {
    errors.push({ field: 'customerNote', message: 'Ghi chú đơn hàng không được vượt quá 500 ký tự' });
  }
  if (errors.length) {
    throw new ApiError(400, 'Thông tin địa chỉ nhận hàng không hợp lệ', errors, 'CHECKOUT_ADDRESS_INVALID');
  }

  return {
    receiverName: values.receiverName,
    receiverPhone,
    shippingAddress: [values.addressLine, values.ward, values.district, values.province].join(', '),
    customerNote: normalizedNote,
  };
}

function normalizeExpectedItems(expectedItems) {
  if (!Array.isArray(expectedItems) || expectedItems.length === 0) {
    throw new ApiError(
      400,
      'Checkout price confirmation is required',
      [{ field: 'expectedItems', message: 'Refresh the cart and confirm the displayed price before checkout' }],
      'CHECKOUT_PRICE_CONFIRMATION_REQUIRED'
    );
  }

  const normalized = [];
  const seenProductIds = new Set();
  const errors = [];
  for (const item of expectedItems) {
    const productId = String(item?.productId || '').trim();
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unitPrice);
    const priceVersion = String(item?.priceVersion || '').trim();
    const fieldPrefix = `expectedItems.${productId || normalized.length}`;

    if (!productId) errors.push({ field: `${fieldPrefix}.productId`, message: 'Product is required' });
    if (seenProductIds.has(productId)) errors.push({ field: `${fieldPrefix}.productId`, message: 'Product must appear only once' });
    if (!Number.isInteger(quantity) || quantity <= 0) {
      errors.push({ field: `${fieldPrefix}.quantity`, message: 'Quantity must be a positive integer' });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push({ field: `${fieldPrefix}.unitPrice`, message: 'Displayed price must be a non-negative number' });
    }
    if (!priceVersion) errors.push({ field: `${fieldPrefix}.priceVersion`, message: 'Displayed price version is required' });

    if (productId) seenProductIds.add(productId);
    normalized.push({ productId, quantity, unitPrice, priceVersion });
  }
  if (errors.length) {
    throw new ApiError(400, 'Checkout price confirmation is invalid', errors, 'CHECKOUT_PRICE_CONFIRMATION_INVALID');
  }
  return normalized.sort((left, right) => left.productId.localeCompare(right.productId));
}

function hashCheckoutRequest({
  customerId,
  paymentMethod,
  savedAddressId,
  deliveryAddress,
  customerNote,
  expectedItems,
}) {
  const addressSource = savedAddressId
    // A saved-address checkout is replayed from the immutable Order snapshot.
    // Do not resolve the mutable address resource as part of idempotency.
    ? { type: 'saved', savedAddressId }
    : {
        type: 'one-time',
        receiverName: deliveryAddress.receiverName,
        receiverPhone: deliveryAddress.receiverPhone,
        shippingAddress: deliveryAddress.shippingAddress,
      };
  const canonicalPayload = {
    command: 'PLACE_ORDER',
    customerId: String(customerId),
    paymentMethod,
    addressSource,
    customerNote: String(customerNote || '').trim(),
    expectedItems,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
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
    async release(productId, quantity, session) {
      const inventory = await withOptionalSession(
        Inventory.findOneAndUpdate(
          { productId, reservedQuantity: { $gte: Number(quantity) } },
          { $inc: { reservedQuantity: -Number(quantity) } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
      if (!inventory) throw new ApiError(409, 'Order reservation could not be released');
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
    async createReservation(data, session) {
      const [reservation] = await OrderReservation.create([data], session ? { session } : undefined);
      return reservation.toObject();
    },
    async findReservationsByOrder(orderId, session) {
      return withOptionalSession(OrderReservation.find({ orderId, status: 'Reserved' }), session).lean();
    },
    async claimReservationRelease(reservationKey, releaseReason, session) {
      return withOptionalSession(
        OrderReservation.findOneAndUpdate(
          { reservationKey, status: 'Reserved' },
          { $set: { status: 'Released', releasedAt: new Date(), releaseReason } },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async createPayment(data, session) {
      const [payment] = await Payment.create([data], session ? { session } : undefined);
      return payment.toObject();
    },
    async createPaymentAttempt(data, session) {
      const [attempt] = await PaymentAttempt.create([data], session ? { session } : undefined);
      return attempt.toObject();
    },
    async createRefundRequest(data, session) {
      const [request] = await ReturnRefundRequest.create([data], session ? { session } : undefined);
      return request.toObject();
    },
    async findRefundRequestByObligationKey(orderId, obligationKey, session) {
      return withOptionalSession(
        ReturnRefundRequest.findOne({ orderId, obligationKey }),
        session
      ).lean();
    },
    async updateRefundRequest(id, data, session) {
      return withOptionalSession(
        ReturnRefundRequest.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }),
        session
      ).lean();
    },
    async enqueuePostCommitWork(data, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { identityKey: data.identityKey },
          { $setOnInsert: data },
          { upsert: true, new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async listPendingPostCommitWork(eventTypes, staleBefore, session) {
      return withOptionalSession(
        DomainOutbox.find({
          eventType: { $in: eventTypes },
          $or: [
            { status: { $in: ['Pending', 'Failed'] } },
            { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
          ],
        }).sort({ createdAt: 1 }),
        session
      ).lean();
    },
    async claimPostCommitWork(id, staleBefore, now, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          {
            _id: id,
            $or: [
              { status: { $in: ['Pending', 'Failed'] } },
              { status: 'Processing', processingStartedAt: { $lte: staleBefore } },
            ],
          },
          {
            $set: { status: 'Processing', processingStartedAt: now, lastError: '' },
            $inc: { attemptCount: 1 },
          },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async markPostCommitWorkDone(id, processingStartedAt, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { _id: id, status: 'Processing', processingStartedAt },
          { $set: { status: 'Completed', completedAt: new Date(), processingStartedAt: null, lastError: '' } },
          { new: true }
        ),
        session
      ).lean();
    },
    async markPostCommitWorkFailed(id, processingStartedAt, error, session) {
      return withOptionalSession(
        DomainOutbox.findOneAndUpdate(
          { _id: id, status: 'Processing', processingStartedAt },
          { $set: { status: 'Failed', processingStartedAt: null, lastError: String(error?.message || error || '') } },
          { new: true }
        ),
        session
      ).lean();
    },
    async listByCustomer(customerId) {
      return Order.find({ customerId }).sort({ createdAt: -1 }).lean();
    },
    async findById(id, session) {
      return withOptionalSession(Order.findById(id), session).lean();
    },
    async listDetails(orderId, session) {
      return withOptionalSession(OrderDetail.find({ orderId }), session).lean();
    },
    async updateOrder(id, data, session) {
      return withOptionalSession(Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean();
    },
    async claimCustomerCancellation(customerId, id, expectedPaymentStatus, data, session) {
      return withOptionalSession(
        Order.findOneAndUpdate(
          {
            _id: id,
            customerId,
            orderStatus: 'Pending',
            paymentStatus: expectedPaymentStatus,
          },
          { $set: data },
          { new: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async findPaymentByOrderId(orderId, session) {
      return withOptionalSession(Payment.findOne({ orderId }), session).lean();
    },
    async updatePayment(id, data, session) {
      return withOptionalSession(Payment.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean();
    },
    async findActivePaymentAttemptByOrder(orderId, session) {
      return withOptionalSession(
        PaymentAttempt.findOne({ orderId, paymentStatus: 'Pending' }).sort({ createdAt: -1, _id: -1 }),
        session
      ).lean();
    },
    async findPrimaryPaidPaymentAttemptByOrder(orderId, session) {
      return withOptionalSession(
        PaymentAttempt.findOne({ orderId, paymentStatus: 'Paid' }).sort({ createdAt: 1, _id: 1 }),
        session
      ).lean();
    },
    async updatePaymentAttempt(id, data, session) {
      return withOptionalSession(PaymentAttempt.findByIdAndUpdate(id, data, { new: true, runValidators: true }), session).lean();
    },
    async upsertRefundPending(data, session) {
      return withOptionalSession(
        RefundPending.findOneAndUpdate(
          { obligationKey: data.obligationKey },
          { $setOnInsert: data },
          { new: true, upsert: true, runValidators: true }
        ),
        session
      ).lean();
    },
    async markMoneyObligationsUnsettled(orderId, session) {
      return withOptionalSession(
        Order.findByIdAndUpdate(orderId, { $set: { moneyObligationsSettled: false } }, { new: true, runValidators: true }),
        session
      ).lean();
    },
  };
}

function createModelCustomerRepository() {
  return {
    async findEmail(customerId) {
      const user = await User.findById(customerId).select('email').lean();
      return user ? user.email : null;
    },
  };
}

function createModelAddressRepository() {
  return {
    async findByIdForUser(userId, id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserAddress.findOne({ _id: id, userId }).lean();
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
  customerRepository = null,
  emailOutboxService = null,
  addressRepository = createModelAddressRepository(),
  settingsService = systemSettingService,
  payosGateway = createPayOSGateway(),
  clock = () => new Date(),
} = {}) {
  const localPostCommitWork = new Map();

  async function runPostCommitWork(item) {
    if (item.eventType === 'ORDER_CANCEL_AUDIT') await auditLogger.log(item.payload);
  }

  async function drainPostCommitWork() {
    const drainStartedAt = new Date(clock());
    const staleBefore = new Date(drainStartedAt.getTime() - 60_000);
    const items = [
      ...localPostCommitWork.values(),
      ...(orderRepository.listPendingPostCommitWork
        ? await orderRepository.listPendingPostCommitWork(
          ['ORDER_CANCEL_AUDIT'],
          staleBefore
        )
        : []),
    ];
    const seen = new Set();
    for (const item of items) {
      const key = String(item.identityKey || item._id || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const now = new Date(clock());
      const claimed = item._id && orderRepository.claimPostCommitWork
        ? await orderRepository.claimPostCommitWork(
          item._id,
          staleBefore,
          now
        )
        : item;
      if (!claimed) {
        localPostCommitWork.delete(key);
        continue;
      }
      try {
        await runPostCommitWork(claimed);
        localPostCommitWork.delete(key);
        if (claimed._id && orderRepository.markPostCommitWorkDone) {
          await orderRepository.markPostCommitWorkDone(claimed._id, claimed.processingStartedAt);
        }
      } catch (error) {
        localPostCommitWork.set(key, { ...claimed, lastError: error.message });
        if (claimed._id && orderRepository.markPostCommitWorkFailed) {
          try {
            await orderRepository.markPostCommitWorkFailed(
              claimed._id,
              claimed.processingStartedAt,
              error
            );
          } catch {
            // Keep the local copy if the outbox persistence path is unavailable.
          }
        }
      }
    }
  }

  async function schedulePostCommitWork(eventType, payload, session) {
    const identityKey = `${eventType}:${payload.eventId}`;
    const item = { identityKey, eventType, payload, status: 'Pending' };
    if (orderRepository.enqueuePostCommitWork) {
      // Do not mirror transaction-local data in process memory. The durable
      // row becomes visible to the drain only after the business transaction
      // commits; a failed commit must not publish a false audit event.
      await orderRepository.enqueuePostCommitWork(item, session);
      return;
    }
    localPostCommitWork.set(identityKey, item);
  }

  function normalizeIdempotencyKey(input = {}, operation = 'checkout') {
    const key = String(input.idempotencyKey || '').trim();
    if (!key) {
      throw new ApiError(
        400,
        `Idempotency-Key is required for ${operation}`,
        [{ field: 'idempotencyKey', message: 'Provide an Idempotency-Key header for safe retries' }],
        'IDEMPOTENCY_KEY_REQUIRED'
      );
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new ApiError(
        400,
        'Idempotency-Key must be 8-128 characters using letters, numbers, ., _, :, or -',
        [{ field: 'idempotencyKey', message: 'Use 8-128 safe characters' }],
        'IDEMPOTENCY_KEY_INVALID'
      );
    }
    return key;
  }

  function normalizeCancellation(input = {}) {
    const cancelReason = String(input.cancelReason || '').trim();
    if (!cancelReason) {
      throw new ApiError(
        400,
        'Cancellation reason is required',
        [{ field: 'cancelReason', message: 'Enter a cancellation reason' }],
        'CANCEL_REASON_REQUIRED'
      );
    }
    if (cancelReason.length > 500) {
      throw new ApiError(
        400,
        'Cancellation reason is too long',
        [{ field: 'cancelReason', message: 'Cancellation reason must not exceed 500 characters' }],
        'CANCEL_REASON_INVALID'
      );
    }
    const idempotencyKey = normalizeIdempotencyKey(input, 'cancellation');
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({
      command: 'CANCEL_ORDER',
      cancelReason,
    })).digest('hex');
    return { cancelReason, idempotencyKey, requestHash };
  }

  async function buildOrderLines(cartItems, expectedItems, session) {
    const expectedByProductId = new Map(expectedItems.map((item) => [item.productId, item]));
    const lines = [];
    for (const item of cartItems) {
      const product = await productRepository.findSellableById(item.productId, session);
      if (!product) throw new ApiError(400, `Product is no longer available: ${item.productName}`);
      const productId = String(item.productId);
      const expected = expectedByProductId.get(productId);
      if (!expected || expected.quantity !== Number(item.quantity)) {
        throw new ApiError(
          409,
          'Cart contents changed before checkout',
          [{ field: `expectedItems.${productId}.quantity`, message: 'Refresh the cart before checkout' }],
          'CART_CHANGED'
        );
      }
      if (expected.unitPrice !== Number(product.price)) {
        throw new ApiError(
          409,
          'Product price changed before checkout',
          [{
            field: `expectedItems.${productId}.unitPrice`,
            message: `Displayed price ${expected.unitPrice} no longer matches current price ${Number(product.price)}`,
          }],
          'PRICE_CHANGED'
        );
      }
      const currentPriceVersion = product.updatedAt ? new Date(product.updatedAt).toISOString() : '';
      if (currentPriceVersion && expected.priceVersion !== currentPriceVersion) {
        throw new ApiError(
          409,
          'Product price changed before checkout',
          [{ field: `expectedItems.${productId}.priceVersion`, message: 'Refresh the cart to confirm the latest price' }],
          'PRICE_CHANGED'
        );
      }
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
        priceVersionSnapshot: currentPriceVersion,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
      });
      expectedByProductId.delete(productId);
    }
    if (expectedByProductId.size > 0) {
      const [productId] = expectedByProductId.keys();
      throw new ApiError(
        409,
        'Cart contents changed before checkout',
        [{ field: `expectedItems.${productId}`, message: 'Refresh the cart before checkout' }],
        'CART_CHANGED'
      );
    }
    return lines;
  }

  async function loadExisting(customerId, idempotencyKey, checkoutRequestHash) {
    const existing = await orderRepository.findCompletedByIdempotencyKey(customerId, idempotencyKey);
    if (!existing) return null;
    if (String(existing.checkoutRequestHash || '') !== checkoutRequestHash) {
      throw new ApiError(
        409,
        'Idempotency-Key was already used with different checkout facts',
        [{ field: 'idempotencyKey', message: 'Use a new Idempotency-Key for a changed checkout request' }],
        'IDEMPOTENCY_KEY_REUSED'
      );
    }
    const details = orderRepository.listDetails ? await orderRepository.listDetails(existing._id) : [];
    return toOrderResponse(existing, details);
  }

  async function releaseOrderReservation(orderId, detail, session, reason) {
    if (orderRepository.claimReservationRelease) {
      const reservationKey = `ORDER:${String(orderId)}:${String(detail._id)}`;
      const claimed = await orderRepository.claimReservationRelease(reservationKey, reason, session);
      if (!claimed) return null;
    }
    return inventoryRepository.release(detail.productId, detail.quantity, session);
  }

  return {
    drainPostCommitWork,
    async placeOrder(customerId, input = {}) {
      const idempotencyKey = normalizeIdempotencyKey(input);
      const paymentMethod = input.paymentMethod || 'COD';
      if (!['COD', 'ONLINE'].includes(paymentMethod)) throw new ApiError(400, 'Invalid payment method');

      const savedAddressId = String(input.savedAddressId || '').trim();
      const hasSavedAddress = Boolean(savedAddressId);
      const hasDeliveryAddress = input.deliveryAddress !== undefined && input.deliveryAddress !== null;
      if (!hasSavedAddress && !hasDeliveryAddress) {
        throw new ApiError(
          400,
          'Vui lòng chọn địa chỉ nhận hàng',
          [{ field: 'addressSource', message: 'Chọn một địa chỉ đã lưu hoặc nhập địa chỉ mới' }],
          'CHECKOUT_ADDRESS_SOURCE_INVALID'
        );
      }
      if (hasSavedAddress && hasDeliveryAddress) {
        throw new ApiError(
          400,
          'Thông tin địa chỉ nhận hàng không hợp lệ',
          [{ field: 'addressSource', message: 'Chỉ được chọn một nguồn địa chỉ nhận hàng' }],
          'CHECKOUT_ADDRESS_SOURCE_INVALID'
        );
      }

      let expectedItems;
      if (hasSavedAddress && Array.isArray(input.expectedItems) && input.expectedItems.length > 0) {
        expectedItems = normalizeExpectedItems(input.expectedItems);
        const preliminaryCheckoutHash = hashCheckoutRequest({
          customerId,
          paymentMethod,
          savedAddressId,
          deliveryAddress: {},
          customerNote: input.customerNote,
          expectedItems,
        });
        const existing = await loadExisting(customerId, idempotencyKey, preliminaryCheckoutHash);
        if (existing) return existing;
      }

      let deliverySnapshot;
      if (hasSavedAddress) {
        const savedAddress = await addressRepository.findByIdForUser(customerId, savedAddressId);
        if (!savedAddress) {
          throw new ApiError(
            404,
            'Không tìm thấy địa chỉ nhận hàng đã chọn',
            [{ field: 'savedAddressId', message: 'Địa chỉ không tồn tại hoặc không thuộc tài khoản này' }],
            'CHECKOUT_ADDRESS_NOT_FOUND'
          );
        }
        deliverySnapshot = normalizeStructuredDeliveryAddress(savedAddress, input.customerNote);
      } else if (typeof input.deliveryAddress === 'object' && !Array.isArray(input.deliveryAddress)) {
        deliverySnapshot = normalizeStructuredDeliveryAddress(input.deliveryAddress, input.customerNote);
      } else {
        throw new ApiError(
          400,
          'Thông tin địa chỉ nhận hàng không hợp lệ',
          [{ field: 'deliveryAddress', message: 'Địa chỉ mới không hợp lệ' }],
          'CHECKOUT_ADDRESS_INVALID'
        );
      }
      if (!expectedItems) expectedItems = normalizeExpectedItems(input.expectedItems);
      const checkoutRequestHash = hashCheckoutRequest({
        customerId,
        paymentMethod,
        savedAddressId,
        deliveryAddress: deliverySnapshot,
        customerNote: deliverySnapshot.customerNote,
        expectedItems,
      });
      const existingAfterAddressResolution = await loadExisting(customerId, idempotencyKey, checkoutRequestHash);
      if (existingAfterAddressResolution) return existingAfterAddressResolution;

      let paymentDeadlineAt = null;
      if (paymentMethod === 'ONLINE') {
        const settings = await settingsService.listSettings();
        const configuredTimeout = Number(settings.PAYMENT_TIMEOUT_MINUTES ?? settings.paymentTimeoutMinutes);
        const paymentTimeoutMinutes = Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 15;
        paymentDeadlineAt = new Date(clock().getTime() + paymentTimeoutMinutes * 60 * 1000);
      }

      let result;
      try {
        result = await transactionManager.withTransaction(async (session) => {
          const alreadyCompleted = await orderRepository.findCompletedByIdempotencyKey(customerId, idempotencyKey, session);
          if (alreadyCompleted) {
            if (String(alreadyCompleted.checkoutRequestHash || '') !== checkoutRequestHash) {
              throw new ApiError(
                409,
                'Idempotency-Key was already used with different checkout facts',
                [{ field: 'idempotencyKey', message: 'Use a new Idempotency-Key for a changed checkout request' }],
                'IDEMPOTENCY_KEY_REUSED'
              );
            }
            const details = orderRepository.listDetails ? await orderRepository.listDetails(alreadyCompleted._id) : [];
            return { order: alreadyCompleted, lines: details, replay: true };
          }

          const cart = await cartRepository.findActiveByCustomer(customerId, session);
          if (!cart) throw new ApiError(400, 'Cart must have at least one item before checkout');
          const cartItems = await cartRepository.listItems(cart._id, session);
          if (!cartItems.length) throw new ApiError(400, 'Cart must have at least one item before checkout');

          const lines = await buildOrderLines(cartItems, expectedItems, session);
          const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
          const initialPaymentStatus = paymentMethod === 'COD' ? 'Unpaid' : 'Pending';
          const order = await orderRepository.createOrder(
            {
              orderCode: generateOrderCode(),
              customerId,
              idempotencyKey,
              checkoutRequestHash,
              totalAmount,
              codExpectedAmount: paymentMethod === 'COD' ? totalAmount : null,
              subtotal: totalAmount,
              paymentMethod,
              paymentStatus: initialPaymentStatus,
              orderStatus: 'Pending',
              paymentDeadlineAt,
              ...deliverySnapshot,
            },
            session
          );

          for (const line of lines) {
            await inventoryRepository.reserve(line.productId, line.quantity, session);
            const detail = await orderRepository.createOrderDetail({ orderId: order._id, ...line }, session);
            if (detail?._id && orderRepository.createReservation) {
              await orderRepository.createReservation({
                reservationKey: `ORDER:${String(order._id)}:${String(detail._id)}`,
                orderId: order._id,
                orderDetailId: detail._id,
                productId: line.productId,
                quantity: line.quantity,
                status: 'Reserved',
              }, session);
            }
          }

          const paymentPayload = {
            orderId: order._id,
            paymentMethod,
            amount: totalAmount,
            currency: 'VND',
            paymentStatus: initialPaymentStatus,
          };
          await orderRepository.createPayment(paymentPayload, session);
          if (paymentMethod === 'COD' && orderRepository.createPaymentAttempt) {
            await orderRepository.createPaymentAttempt({
              orderId: order._id,
              attemptCode: `COD-${order.orderCode}`,
              paymentMethod: 'COD',
              paymentProvider: 'COD',
              amount: totalAmount,
              currency: 'VND',
              paymentStatus: 'Unpaid',
            }, session);
          }
          const clearedCart = await cartRepository.clearExactCart(cart._id, session);
          if (!clearedCart) throw new ApiError(409, 'Cart was changed during checkout. Please retry with a new key.');
          return { order, lines, replay: false };
        });
      } catch (error) {
        if (error && error.code === 11000) {
          const replay = await loadExisting(customerId, idempotencyKey, checkoutRequestHash);
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
        try {
          const recipient = customerRepository ? await customerRepository.findEmail(customerId) : null;
          if (recipient && emailOutboxService) {
            await emailOutboxService.enqueue({
              eventType: 'ORDER_CREATED',
              idempotencyKey: `ORDER_CREATED:${result.order._id}`,
              recipient,
              payload: {
                orderId: String(result.order._id),
                orderCode: result.order.orderCode,
                totalAmount: result.order.totalAmount,
                paymentMethod: result.order.paymentMethod,
              },
            });
          }
        } catch (error) {
            await auditLogger.log({
              userId: customerId,
              action: 'EMAIL_OUTBOX_ENQUEUE_FAILED',
              targetEntity: 'Order',
              targetId: String(result.order._id),
              description: `Order email enqueue failed after commit: ${error.message}`,
            });
        }
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
      const { cancelReason, idempotencyKey, requestHash } = normalizeCancellation(input);
      await drainPostCommitWork();
      const result = await transactionManager.withTransaction(async (session) => {
        const order = await orderRepository.findById(orderId, session);
        if (!order || String(order.customerId) !== String(customerId)) throw new ApiError(404, 'Order not found');
        if (order.cancelIdempotencyKey === idempotencyKey) {
          if (order.cancelRequestHash !== requestHash) {
            throw new ApiError(
              409,
              'Idempotency-Key was already used with different cancellation facts',
              [{ field: 'idempotencyKey', message: 'Use a new Idempotency-Key for a changed cancellation request' }],
              'IDEMPOTENCY_KEY_REUSED'
            );
          }
          if (order.orderStatus === 'Cancelled') {
            return { cancelled: order, orderCode: order.orderCode, replay: true };
          }
        }
        if (order.orderStatus !== 'Pending' || !['Unpaid', 'Pending', 'Failed', 'Paid'].includes(order.paymentStatus)) {
          throw new ApiError(409, 'Only Pending orders can be cancelled by the customer');
        }
        const isPaid = order.paymentStatus === 'Paid';
        const paidAttempt = isPaid
          ? await orderRepository.findPrimaryPaidPaymentAttemptByOrder(orderId, session)
          : null;
        if (isPaid && !paidAttempt) {
          throw new ApiError(409, 'A verified paid attempt is required before cancelling a paid order');
        }
        const cancelledPaymentStatus = isPaid
          ? 'Paid'
          : order.paymentMethod === 'COD'
            ? 'Unpaid'
            : 'Cancelled';
        const cancelData = {
          orderStatus: 'Cancelled',
          paymentStatus: cancelledPaymentStatus,
          cancelReason,
          cancelIdempotencyKey: idempotencyKey,
          cancelRequestHash: requestHash,
        };
        const cancelled = orderRepository.claimCustomerCancellation
          ? await orderRepository.claimCustomerCancellation(customerId, orderId, order.paymentStatus, cancelData, session)
          : await orderRepository.updateOrder(orderId, cancelData, session);
        if (!cancelled) {
          const concurrent = await orderRepository.findById(orderId, session);
          if (
            concurrent
            && concurrent.orderStatus === 'Cancelled'
            && concurrent.cancelIdempotencyKey === idempotencyKey
            && concurrent.cancelRequestHash === requestHash
          ) {
            return { cancelled: concurrent, orderCode: concurrent.orderCode, replay: true };
          }
          throw new ApiError(409, 'Order changed while cancellation was being processed');
        }

        const details = await orderRepository.listDetails(orderId, session);
        let retiredPaymentLinkId = '';
        const payment = orderRepository.findPaymentByOrderId
          ? await orderRepository.findPaymentByOrderId(orderId, session)
          : null;
        if (!isPaid && payment && orderRepository.updatePayment) {
          await orderRepository.updatePayment(payment._id, { paymentStatus: cancelledPaymentStatus }, session);
        }
        if (!isPaid && orderRepository.findActivePaymentAttemptByOrder) {
          const activeAttempt = await orderRepository.findActivePaymentAttemptByOrder(orderId, session);
          if (activeAttempt) {
            await orderRepository.updatePaymentAttempt(activeAttempt._id, {
              paymentStatus: order.paymentMethod === 'COD' ? 'Unpaid' : 'Cancelled',
            }, session);
            retiredPaymentLinkId = activeAttempt.paymentLinkId || '';
          }
        }
        if (isPaid) {
          const obligationKey = `PAYMENT_REVERSAL:${String(paidAttempt._id)}`;
          let refundRequest = orderRepository.findRefundRequestByObligationKey
            ? await orderRepository.findRefundRequestByObligationKey(order._id, obligationKey, session)
            : null;
          if (!refundRequest && orderRepository.createRefundRequest) {
            refundRequest = await orderRepository.createRefundRequest({
              orderId: order._id,
              requestCode: `CAN-${order.orderCode}-${crypto.createHash('sha256').update(obligationKey).digest('hex').slice(0, 12).toUpperCase()}`,
              customerId: order.customerId,
              paymentId: payment?._id || null,
              obligationKey,
              reason: `Customer cancellation: ${cancelReason}`,
              status: 'ReadyForRefund',
              refundAmount: order.totalAmount,
              requestedAt: new Date(clock()),
            }, session);
          }
          const refund = await orderRepository.upsertRefundPending({
            orderId: order._id,
            paymentAttemptId: paidAttempt._id,
            customerId: order.customerId,
            returnRefundRequestId: refundRequest?._id || null,
            amount: order.totalAmount,
            currency: order.currency || paidAttempt.currency || 'VND',
            reason: `Customer cancellation: ${cancelReason}`,
            status: 'RefundPending',
            obligationType: 'PAYMENT_REVERSAL',
            obligationKey,
          }, session);
          if (refundRequest && orderRepository.updateRefundRequest) {
            await orderRepository.updateRefundRequest(refundRequest._id, { refundPendingId: refund._id }, session);
          }
          if (orderRepository.markMoneyObligationsUnsettled) {
            await orderRepository.markMoneyObligationsUnsettled(order._id, session);
          }
        }
        for (const detail of details) {
          const released = await releaseOrderReservation(orderId, detail, session, 'Customer cancelled order');
          if (orderRepository.claimReservationRelease && !released) {
            throw new ApiError(409, 'Order reservation lineage is missing or already released');
          }
        }
        await schedulePostCommitWork('ORDER_CANCEL_AUDIT', {
          userId: customerId,
          action: 'ORDER_CANCEL',
          targetEntity: 'Order',
          targetId: String(orderId),
          description: `Order cancelled: ${order.orderCode}`,
          eventId: `ORDER_CANCEL:${String(orderId)}:${idempotencyKey}`,
        }, session);
        return {
          cancelled,
          orderCode: order.orderCode,
          replay: false,
          retiredPaymentLinkId,
        };
      });
      if (!result.replay) {
        if (result.retiredPaymentLinkId && payosGateway?.cancelPaymentLink) {
          try {
            await payosGateway.cancelPaymentLink(result.retiredPaymentLinkId, 'Customer cancelled order');
          } catch {
            // Local cancellation is authoritative. A provider callback that
            // still reports Paid becomes an explicit refund obligation.
          }
        }
        await drainPostCommitWork();
      }
      return {
        ...toOrderResponse(result.cancelled),
        idempotentReplay: Boolean(result.replay),
      };
    },
  };
}

module.exports = {
  createOrderService,
  orderService: createOrderService({ customerRepository: createModelCustomerRepository(), emailOutboxService: createEmailOutboxService() }),
};
