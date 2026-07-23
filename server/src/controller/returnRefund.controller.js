const { returnRefundService } = require('../services/returnRefund.service');
const { sendSuccess } = require('../utils/apiResponse');

function preventSensitiveCaching(res) {
  res.set('Cache-Control', 'no-store');
}

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
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.listStaffRequests(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getStaffRequest(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.getStaffRequest(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function decideRequest(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.decideRequest(req.user.id, req.params.id, req.body), 'Return/refund decision updated');
  } catch (error) {
    return next(error);
  }
}

async function getWarehouseRequest(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.getWarehouseRequest(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function listWarehouseRequests(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.listWarehouseRequests(req.query));
  } catch (error) {
    return next(error);
  }
}

async function inspectRequest(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.inspectRequest(req.user.id, req.params.id, req.body), 'Return/refund inspected');
  } catch (error) {
    return next(error);
  }
}

async function completeRefund(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.completeRefund(req.user.id, req.params.id, req.body), 'Refund completed');
  } catch (error) {
    return next(error);
  }
}

async function recordHandoffProof(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.recordHandoffProof(req.user.id, req.params.id, req.body), 'Return handoff proof recorded');
  } catch (error) {
    return next(error);
  }
}

async function submitDestination(req, res, next) {
  try {
    return sendSuccess(res, await returnRefundService.submitDestination(req.user.id, req.params.id, req.body), 'Refund destination submitted', 201);
  } catch (error) {
    return next(error);
  }
}

async function verifyDestination(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.verifyDestination(req.user.id, req.params.id, req.body), 'Refund destination decision recorded');
  } catch (error) {
    return next(error);
  }
}

async function expireRequest(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.expireRequest(req.user.id, req.params.id), 'Return/refund request expired');
  } catch (error) {
    return next(error);
  }
}

async function recordPayoutEvidence(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.recordPayoutEvidence(req.user.id, req.params.id, req.body), 'Refund payout evidence recorded', 201);
  } catch (error) {
    return next(error);
  }
}

async function startPayOSPayout(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.startPayOSPayout(req.user.id, req.params.id, req.body), 'payOS payout started');
  } catch (error) {
    return next(error);
  }
}

async function reconcilePayOSPayout(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.reconcilePayOSPayout(req.user.id, req.params.id), 'payOS payout reconciled');
  } catch (error) {
    return next(error);
  }
}

async function reportPayoutIncident(req, res, next) {
  try {
    preventSensitiveCaching(res);
    return sendSuccess(res, await returnRefundService.reportPayoutIncident(req.user.id, req.params.id, req.body), 'Payout recovery incident opened', 201);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCustomerRequest,
  listMyRequests,
  listStaffRequests,
  listWarehouseRequests,
  getStaffRequest,
  getWarehouseRequest,
  decideRequest,
  inspectRequest,
  completeRefund,
  recordHandoffProof,
  submitDestination,
  verifyDestination,
  expireRequest,
  recordPayoutEvidence,
  startPayOSPayout,
  reconcilePayOSPayout,
  reportPayoutIncident,
};
