const { orderService } = require('../services/order.service');
const { sendSuccess } = require('../utils/apiResponse');

async function placeOrder(req, res, next) {
  try {
    return sendSuccess(
      res,
      await orderService.placeOrder(req.user.id, {
        ...req.body,
        idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey,
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
    return sendSuccess(res, await orderService.cancelOrder(req.user.id, req.params.id, req.body), 'Order cancelled');
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
