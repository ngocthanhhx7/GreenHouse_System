const express = require('express');
const reportController = require('../controller/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/admin/reports/overview', authenticate, authorizeRoles('Admin'), reportController.getAdminOverview);
router.get('/admin/reports/revenue', authenticate, authorizeRoles('Admin'), reportController.getRevenueReport);
router.get('/admin/reports/orders', authenticate, authorizeRoles('Admin'), reportController.getOrderReport);
router.get('/admin/reports/products', authenticate, authorizeRoles('Admin'), reportController.getProductReport);
router.get('/admin/reports/customers', authenticate, authorizeRoles('Admin'), reportController.getCustomerReport);
router.get('/admin/reports/staff', authenticate, authorizeRoles('Admin'), reportController.getStaffReport);
router.get('/admin/reports/inventory', authenticate, authorizeRoles('Admin'), reportController.getInventoryReport);

module.exports = router;
