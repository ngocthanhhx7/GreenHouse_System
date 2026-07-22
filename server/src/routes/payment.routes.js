const express = require('express');
const paymentController = require('../controller/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/orders/:id/payments', authenticate, authorizeRoles('Customer'), paymentController.createOnlinePayment);
router.post('/payments/payos/webhook', paymentController.payosWebhook);

module.exports = router;
