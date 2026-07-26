const express = require('express');
const returnRefundController = require('../controller/returnRefund.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/orders/:id/return-refund', authenticate, authorizeRoles('Customer'), returnRefundController.createCustomerRequest);
router.get('/return-refunds/my', authenticate, authorizeRoles('Customer'), returnRefundController.listMyRequests);
router.get('/return-refunds/banks', authenticate, authorizeRoles('Customer'), returnRefundController.listPublicBanks);
router.post('/return-refunds/:id/handoff-proof', authenticate, authorizeRoles('Customer'), returnRefundController.recordHandoffProof);
router.post('/return-refunds/:id/destination', authenticate, authorizeRoles('Customer'), returnRefundController.submitDestination);
router.get('/staff/return-refunds', authenticate, authorizeRoles('Staff'), returnRefundController.listStaffRequests);
router.get('/warehouse/return-refunds', authenticate, authorizeRoles('WarehouseManager'), returnRefundController.listWarehouseRequests);
router.get('/warehouse/return-refunds/:id', authenticate, authorizeRoles('WarehouseManager'), returnRefundController.getWarehouseRequest);
router.get('/staff/return-refunds/:id', authenticate, authorizeRoles('Staff'), returnRefundController.getStaffRequest);
router.patch('/staff/return-refunds/:id/status', authenticate, authorizeRoles('Staff'), returnRefundController.decideRequest);
router.patch('/staff/return-refunds/:id/destination', authenticate, authorizeRoles('Staff'), returnRefundController.verifyDestination);
router.post('/staff/return-refunds/:id/expire', authenticate, authorizeRoles('Staff'), returnRefundController.expireRequest);
router.post('/staff/return-refunds/:id/payout-evidence', authenticate, authorizeRoles('Staff'), returnRefundController.recordPayoutEvidence);
router.post('/staff/return-refunds/:id/payos-payout', authenticate, authorizeRoles('Staff'), returnRefundController.startPayOSPayout);
router.post('/staff/return-refunds/:id/payos-reconcile', authenticate, authorizeRoles('Staff'), returnRefundController.reconcilePayOSPayout);
router.post('/staff/return-refunds/:id/payout-reconciliation', authenticate, authorizeRoles('Staff'), returnRefundController.reconcilePayoutOperation);
router.post('/staff/return-refunds/:id/payout-incident', authenticate, authorizeRoles('Staff'), returnRefundController.reportPayoutIncident);
// This endpoint is now a guarded reconciliation confirmation. It cannot create
// a refund without a verified, successful payout-evidence record.
router.post('/staff/return-refunds/:id/complete-refund', authenticate, authorizeRoles('Staff'), returnRefundController.completeRefund);
router.post('/warehouse/return-refunds/:id/inspection', authenticate, authorizeRoles('WarehouseManager'), returnRefundController.inspectRequest);

module.exports = router;
