const express = require('express');
const replenishmentController = require('../controller/replenishment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/warehouse/replenishments', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.createRequest);
router.get('/warehouse/replenishments', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.listWarehouseRequests);
router.post('/warehouse/replenishments/:id/receive', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.receiveRequest);
router.post('/warehouse/replenishments/:id/withdraw', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.withdrawRequest);
router.post('/warehouse/replenishments/:id/short-closure', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.requestShortClosure);
router.post('/warehouse/replenishments/:id/receipt-correction', authenticate, authorizeRoles('WarehouseManager'), replenishmentController.correctReceipt);

router.get('/admin/replenishments', authenticate, authorizeRoles('Admin'), replenishmentController.listAdminRequests);
router.patch('/admin/replenishments/:id/status', authenticate, authorizeRoles('Admin'), replenishmentController.updateRequestStatus);
router.patch('/admin/replenishments/:id/short-closure', authenticate, authorizeRoles('Admin'), replenishmentController.decideShortClosure);

module.exports = router;
