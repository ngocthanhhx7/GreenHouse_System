const { paymentService } = require('../services/payment.service');
const { sendSuccess } = require('../utils/apiResponse');

async function createOnlinePayment(req, res, next) {
  try {
    return sendSuccess(res, await paymentService.createOnlinePaymentRequest(req.user.id, req.params.id), 'Payment request created');
  } catch (error) {
    return next(error);
  }
}

async function payosWebhook(req, res, next) {
  try {
    return sendSuccess(
      res,
      await paymentService.handlePayOSWebhook(req.body),
      'payOS webhook processed'
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createOnlinePayment,
  payosWebhook,
};
