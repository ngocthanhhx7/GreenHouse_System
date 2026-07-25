const { orderService } = require('../services/order.service');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');

function normalizeCodCheckoutInput(body = {}) {
  const paymentMethod = String(body.paymentMethod || 'COD').trim().toUpperCase();
  if (paymentMethod !== 'COD') {
    throw new ApiError(
      400,
      'Checkout hiện chỉ hỗ trợ thanh toán khi nhận hàng (COD).',
      [{ field: 'paymentMethod', message: 'Chọn phương thức COD' }],
      'CHECKOUT_COD_ONLY',
    );
  }
  return {
    cartId: body.cartId,
    cartVersion: body.cartVersion,
    paymentMethod: 'COD',
    ...(body.savedAddressId !== undefined ? { savedAddressId: body.savedAddressId } : {}),
    ...(body.deliveryAddress !== undefined ? { deliveryAddress: body.deliveryAddress } : {}),
    customerNote: body.customerNote,
    expectedItems: body.expectedItems,
    idempotencyKey: body.idempotencyKey,
  };
}

async function placeOrder(req, res, next) {
  try {
    const body = normalizeCodCheckoutInput(req.body || {});
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

module.exports = {
  placeOrder,
  listMyOrders,
  getMyOrder,
  cancelOrder,
};
