const express = require('express');
const damageReportController = require('../controller/damageReport.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/staff/damage-reports', authenticate, authorizeRoles('Staff'), damageReportController.createStaffReport);
router.get('/staff/damage-reports/:id', authenticate, authorizeRoles('Staff'), damageReportController.getStaffReport);
router.post('/staff/damage-reports/:id/withdraw', authenticate, authorizeRoles('Staff'), damageReportController.withdrawStaffReport);
router.patch('/staff/damage-reports/:id/withdraw', authenticate, authorizeRoles('Staff'), damageReportController.withdrawStaffReport);

router.get('/warehouse/damage-reports', authenticate, authorizeRoles('WarehouseManager'), damageReportController.listWarehouseReports);
router.get('/warehouse/damage-reports/:id', authenticate, authorizeRoles('WarehouseManager'), damageReportController.getWarehouseReport);
router.post('/warehouse/damage-reports/:id/confirm', authenticate, authorizeRoles('WarehouseManager'), damageReportController.confirmWarehouseReport);
router.post('/warehouse/damage-reports/:id/decision', authenticate, authorizeRoles('WarehouseManager'), damageReportController.confirmWarehouseReport);
router.post('/warehouse/inventory/:inventoryId/damaged-disposition', authenticate, authorizeRoles('WarehouseManager'), damageReportController.disposeConfirmedDamage);

module.exports = router;
