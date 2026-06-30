const express = require('express');
const returnRefundController = require('../controller/returnRefund.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/orders/:id/return-refund', authenticate, authorizeRoles('Customer'), returnRefundController.createCustomerRequest);
router.get('/return-refunds/my', authenticate, authorizeRoles('Customer'), returnRefundController.listMyRequests);
router.get('/staff/return-refunds', authenticate, authorizeRoles('Staff'), returnRefundController.listStaffRequests);
router.get('/staff/return-refunds/:id', authenticate, authorizeRoles('Staff'), returnRefundController.getStaffRequest);
router.patch('/staff/return-refunds/:id/status', authenticate, authorizeRoles('Staff'), returnRefundController.decideRequest);

module.exports = router;
