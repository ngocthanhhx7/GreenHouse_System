const express = require('express');
const damageReportController = require('../controller/damageReport.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.post('/staff/damage-reports', authenticate, authorizeRoles('Staff'), damageReportController.createStaffReport);

router.get('/warehouse/damage-reports', authenticate, authorizeRoles('WarehouseManager'), damageReportController.listWarehouseReports);
router.get('/warehouse/damage-reports/:id', authenticate, authorizeRoles('WarehouseManager'), damageReportController.getWarehouseReport);
router.post('/warehouse/damage-reports/:id/confirm', authenticate, authorizeRoles('WarehouseManager'), damageReportController.confirmWarehouseReport);

module.exports = router;
