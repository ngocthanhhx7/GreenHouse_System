const { supportService } = require('../services/support.service');
const { sendSuccess } = require('../utils/apiResponse');

async function createCustomerRequest(req, res, next) {
  try {
    return sendSuccess(res, await supportService.createCustomerRequest(req.user.id, req.body), 'Support request created', 201);
  } catch (error) {
    return next(error);
  }
}

async function listMyRequests(req, res, next) {
  try {
    return sendSuccess(res, await supportService.listMyRequests(req.user.id));
  } catch (error) {
    return next(error);
  }
}

async function listStaffRequests(req, res, next) {
  try {
    return sendSuccess(res, await supportService.listStaffRequests(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getStaffRequest(req, res, next) {
  try {
    return sendSuccess(res, await supportService.getStaffRequest(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function respondToRequest(req, res, next) {
  try {
    return sendSuccess(res, await supportService.respondToRequest(req.user.id, req.params.id, req.body), 'Support response saved');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCustomerRequest,
  listMyRequests,
  listStaffRequests,
  getStaffRequest,
  respondToRequest,
};
