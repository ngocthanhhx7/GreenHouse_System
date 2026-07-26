const { orderService } = require('../services/order.service');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const {
  createCustomerDeliveryReceiptService,
} = require('../services/customerDeliveryReceipt.service');

function normalizeCheckoutInput(body = {}) {
  const paymentMethod = String(body.paymentMethod || 'COD').trim().toUpperCase();
  if (!['COD', 'ONLINE'].includes(paymentMethod)) {
    throw new ApiError(
      400,
      'Phương thức thanh toán không được hỗ trợ.',
      [{ field: 'paymentMethod', message: 'Chọn COD hoặc thanh toán trực tuyến' }],
      'CHECKOUT_PAYMENT_METHOD_INVALID',
    );
  }
  return {
    cartId: body.cartId,
    cartVersion: body.cartVersion,
    paymentMethod,
    ...(body.savedAddressId !== undefined ? { savedAddressId: body.savedAddressId } : {}),
    ...(body.deliveryAddress !== undefined ? { deliveryAddress: body.deliveryAddress } : {}),
    customerNote: body.customerNote,
    expectedItems: body.expectedItems,
    idempotencyKey: body.idempotencyKey,
  };
}

async function placeOrder(req, res, next) {
  try {
    const body = normalizeCheckoutInput(req.body || {});
    return sendSuccess(
      res,
      await orderService.placeOrder(req.user.id, {
        ...body,
        idempotencyKey: req.get('Idempotency-Key') || body.idempotencyKey,
      }),
      'Order created',
      201
    );
  } catch (error) {
    return next(error);
  }
}

async function listMyOrders(req, res, next) {
  try {
    return sendSuccess(res, await orderService.listMyOrders(req.user.id));
  } catch (error) {
    return next(error);
  }
}

async function getMyOrder(req, res, next) {
  try {
    return sendSuccess(res, await orderService.getMyOrder(req.user.id, req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    return sendSuccess(
      res,
      await orderService.cancelOrder(req.user.id, req.params.id, {
        ...req.body,
        idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey,
      }),
      'Order cancelled'
    );
  } catch (error) {
    return next(error);
  }
}

function normalizeDeliveryConfirmationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(
      422,
      'Delivery receipt input must be an object',
      [],
      'DELIVERY_RECEIPT_INPUT_INVALID',
    );
  }
  const allowedFields = new Set(['outcome', 'expectedDeliveryEventId', 'reason']);
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
  if (unknownFields.length) {
    throw new ApiError(
      422,
      'Delivery receipt input contains unsupported fields',
      unknownFields.map((field) => ({ field, message: 'This field is not accepted' })),
      'DELIVERY_RECEIPT_INPUT_INVALID',
    );
  }
  return {
    outcome: body.outcome,
    expectedDeliveryEventId: body.expectedDeliveryEventId,
    ...(Object.hasOwn(body, 'reason') ? { reason: body.reason } : {}),
  };
}

function createConfirmDeliveryController(
  deliveryReceiptService = createCustomerDeliveryReceiptService(),
) {
  return async function confirmCustomerDelivery(req, res, next) {
    try {
      const command = normalizeDeliveryConfirmationInput(req.body);
      return sendSuccess(
        res,
        await deliveryReceiptService.recordDecision(
          req.user.id,
          req.params.id,
          {
            ...command,
            idempotencyKey: req.get('Idempotency-Key'),
          },
        ),
        'Delivery confirmation recorded',
        201,
      );
    } catch (error) {
      return next(error);
    }
  };
}

const confirmDelivery = createConfirmDeliveryController();

module.exports = {
  placeOrder,
  listMyOrders,
  getMyOrder,
  cancelOrder,
  confirmDelivery,
  createConfirmDeliveryController,
};
