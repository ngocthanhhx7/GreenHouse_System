const express = require('express');
const auditLogController = require('../controller/auditLog.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/admin/audit-logs', authenticate, authorizeRoles('Admin'), auditLogController.listAuditLogs);

module.exports = router;
