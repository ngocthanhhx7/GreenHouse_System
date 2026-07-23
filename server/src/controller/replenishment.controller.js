const { replenishmentService } = require('../services/replenishment.service');
const { sendSuccess } = require('../utils/apiResponse');

async function createRequest(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.createRequest(req.user.id, req.body), 'Replenishment request created', 201);
  } catch (error) {
    return next(error);
  }
}

async function listWarehouseRequests(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.listWarehouseRequests(req.query));
  } catch (error) {
    return next(error);
  }
}

async function receiveRequest(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.receiveRequest(req.user.id, req.params.id, req.body), 'Replenishment received');
  } catch (error) {
    return next(error);
  }
}

async function listAdminRequests(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.listAdminRequests(req.query));
  } catch (error) {
    return next(error);
  }
}

async function updateRequestStatus(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.updateRequestStatus(req.user.id, req.params.id, req.body), 'Replenishment decision updated');
  } catch (error) {
    return next(error);
  }
}

async function withdrawRequest(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.withdrawRequest(req.user.id, req.params.id, req.body), 'Replenishment request withdrawn');
  } catch (error) {
    return next(error);
  }
}

async function requestShortClosure(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.requestShortClosure(req.user.id, req.params.id, req.body), 'Short closure requested');
  } catch (error) {
    return next(error);
  }
}

async function decideShortClosure(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.decideShortClosure(req.user.id, req.params.id, req.body), 'Short closure decision updated');
  } catch (error) {
    return next(error);
  }
}

async function correctReceipt(req, res, next) {
  try {
    return sendSuccess(res, await replenishmentService.correctReceipt(req.user.id, req.params.id, req.body), 'Receipt correction recorded');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createRequest,
  listWarehouseRequests,
  receiveRequest,
  listAdminRequests,
  updateRequestStatus,
  withdrawRequest,
  requestShortClosure,
  decideShortClosure,
  correctReceipt,
};
