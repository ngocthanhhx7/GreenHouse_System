const { staffOrderService } = require('../services/staffOrder.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listOrders(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.listOrders(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.getOrder(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function confirmOrder(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.confirmOrder(
      req.user.id,
      req.params.id,
      {
        note: req.body?.note,
        idempotencyKey: req.get('Idempotency-Key'),
      },
    ), 'Order confirmed');
  } catch (error) {
    return next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.cancelOrder(
      req.user.id,
      req.params.id,
      { ...(req.body || {}), idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey },
    ), 'Order cancelled');
  } catch (error) {
    return next(error);
  }
}

async function getInvoice(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.getInvoice(req.user.id, req.params.id));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listOrders,
  getOrder,
  confirmOrder,
  cancelOrder,
  getInvoice,
};
