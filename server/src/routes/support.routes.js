const express = require('express');
const supportController = require('../controller/support.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/support-requests', authenticate, authorizeRoles('Customer'), supportController.createCustomerRequest);
router.get('/support-requests/my', authenticate, authorizeRoles('Customer'), supportController.listMyRequests);
router.get('/support-requests/:id', authenticate, authorizeRoles('Customer'), supportController.getCustomerRequest);
router.post('/support-requests/:id/messages', authenticate, authorizeRoles('Customer'), supportController.appendCustomerMessage);
router.patch('/support-requests/:id/withdraw', authenticate, authorizeRoles('Customer'), supportController.withdrawCustomerRequest);
router.post('/support-requests/:id/reopen', authenticate, authorizeRoles('Customer'), supportController.reopenCustomerRequest);

router.get('/staff/support-requests', authenticate, authorizeRoles('Staff'), supportController.listStaffRequests);
router.get('/staff/support-requests/:id', authenticate, authorizeRoles('Staff'), supportController.getStaffRequest);
router.post('/staff/support-requests/:id/claim', authenticate, authorizeRoles('Staff'), supportController.claimRequest);
router.post('/staff/support-requests/:id/messages', authenticate, authorizeRoles('Staff'), supportController.appendStaffMessage);
router.patch('/staff/support-requests/:id/priority', authenticate, authorizeRoles('Staff'), supportController.changePriority);
router.patch('/staff/support-requests/:id/transfer', authenticate, authorizeRoles('Staff'), supportController.transferRequest);
router.post('/staff/support-requests/:id/resolve', authenticate, authorizeRoles('Staff'), supportController.resolveRequest);

module.exports = router;
