const express = require('express');
const reportController = require('../controller/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/admin/reports/overview', authenticate, authorizeRoles('Admin'), reportController.getAdminOverview);

module.exports = router;
