const express = require('express');
const orderController = require('../controller/order.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/orders', authenticate, authorizeRoles('Customer'), orderController.placeOrder);
router.get('/orders/my', authenticate, authorizeRoles('Customer'), orderController.listMyOrders);
router.get('/orders/:id', authenticate, authorizeRoles('Customer'), orderController.getMyOrder);
router.patch('/orders/:id/cancel', authenticate, authorizeRoles('Customer'), orderController.cancelOrder);
router.post('/orders/:id/delivery-confirmation', authenticate, authorizeRoles('Customer'), orderController.confirmDelivery);

module.exports = router;
