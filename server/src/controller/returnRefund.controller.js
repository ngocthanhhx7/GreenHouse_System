const { returnRefundService } = require('../services/returnRefund.service');
const { sendSuccess } = require('../utils/apiResponse');

async function createCustomerRequest(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.createCustomerRequest(req.user.id, { ...req.body, orderId: req.params.id }), 'Return/refund request created', 201);
  } catch (error) {
    return next(error);
  }
}

async function listMyRequests(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.listMyRequests(req.user.id));
  } catch (error) {
    return next(error);
  }
}

async function listStaffRequests(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.listStaffRequests(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getStaffRequest(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.getStaffRequest(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function decideRequest(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.decideRequest(req.user.id, req.params.id, req.body), 'Return/refund decision updated');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCustomerRequest,
  listMyRequests,
  listStaffRequests,
  getStaffRequest,
  decideRequest,
};
