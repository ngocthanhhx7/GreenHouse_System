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

module.exports = {
  createRequest,
  listWarehouseRequests,
  receiveRequest,
  listAdminRequests,
  updateRequestStatus,
};
