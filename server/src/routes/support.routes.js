const express = require('express');
const supportController = require('../controller/support.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/support-requests', authenticate, authorizeRoles('Customer'), supportController.createCustomerRequest);
router.get('/support-requests/my', authenticate, authorizeRoles('Customer'), supportController.listMyRequests);
router.get('/staff/support-requests', authenticate, authorizeRoles('Staff'), supportController.listStaffRequests);
router.get('/staff/support-requests/:id', authenticate, authorizeRoles('Staff'), supportController.getStaffRequest);
router.patch('/staff/support-requests/:id/response', authenticate, authorizeRoles('Staff'), supportController.respondToRequest);

module.exports = router;
