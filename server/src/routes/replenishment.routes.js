const express = require('express');
const replenishmentController = require('../controller/replenishment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/warehouse/replenishments', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.createRequest);
router.get('/warehouse/replenishments', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.listWarehouseRequests);
router.post('/warehouse/replenishments/:id/receive', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.receiveRequest);

router.get('/admin/replenishments', authenticate, authorizeRoles('Admin'), replenishmentController.listAdminRequests);
router.patch('/admin/replenishments/:id/status', authenticate, authorizeRoles('Admin'), replenishmentController.updateRequestStatus);

module.exports = router;
