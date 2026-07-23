const express = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const controller = require('../controller/adminAccount.controller');

const router = express.Router();
const adminOnly = [authenticate, authorizeRoles('Admin')];

router.get('/admin/accounts', ...adminOnly, controller.listAccounts);
router.post('/admin/accounts/:id/status', ...adminOnly, controller.changeStatus);
router.post('/admin/accounts/:id/role-transfer', ...adminOnly, controller.transferRole);
router.post('/admin/internal-invitations', ...adminOnly, controller.createInvitation);
router.post('/admin/internal-invitations/:id/resend', ...adminOnly, controller.resendInvitation);
router.post('/admin/internal-invitations/:id/revoke', ...adminOnly, controller.revokeInvitation);

module.exports = router;
