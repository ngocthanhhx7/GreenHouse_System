const express = require('express');
const staffOrderController = require('../controller/staffOrder.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const { validateObjectIdParam } = require('../middlewares/validateRequest.middleware');

const router = express.Router();

router.get('/staff/orders', authenticate, authorizeRoles('Staff'), staffOrderController.listOrders);
router.get('/staff/orders/:id', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), staffOrderController.getOrder);
router.post('/staff/orders/:id/confirm', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), staffOrderController.confirmOrder);
router.post('/staff/orders/:id/cancel', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), staffOrderController.cancelOrder);
router.get('/staff/orders/:id/invoice', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), staffOrderController.getInvoice);

module.exports = router;
