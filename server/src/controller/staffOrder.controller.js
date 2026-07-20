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
    return sendSuccess(res, await staffOrderService.confirmOrder(req.user.id, req.params.id, req.body), 'Order confirmed');
  } catch (error) {
    return next(error);
  }
}

async function requestStockExport(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.requestStockExport(req.user.id, req.params.id, req.body), 'Stock export requested', 201);
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.updateStatus(req.user.id, req.params.id, req.body), 'Order status updated');
  } catch (error) {
    return next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.cancelOrder(req.user.id, req.params.id, req.body), 'Order cancelled');
  } catch (error) {
    return next(error);
  }
}

async function markCodCollected(req, res, next) {
  try {
    return sendSuccess(res, await staffOrderService.markCodCollected(req.user.id, req.params.id, req.body), 'COD payment collected');
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
  requestStockExport,
  updateStatus,
  cancelOrder,
  markCodCollected,
  getInvoice,
};
