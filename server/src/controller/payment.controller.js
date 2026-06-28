const { paymentService } = require('../services/payment.service');
const { sendSuccess } = require('../utils/apiResponse');

async function createOnlinePayment(req, res, next) {
  try {
    return sendSuccess(res, await paymentService.createOnlinePaymentRequest(req.user.id, req.params.id), 'Payment request created');
  } catch (error) {
    return next(error);
  }
}

async function callback(req, res, next) {
  try {
    return sendSuccess(res, await paymentService.handlePaymentCallback(req.body), 'Payment callback processed');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createOnlinePayment,
  callback,
};
