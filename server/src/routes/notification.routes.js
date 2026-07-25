const express = require('express');
const notificationController = require('../controller/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();
const ownInbox = [
  authenticate,
  authorizeRoles('Customer', 'Staff', 'WarehouseManager', 'Admin'),
];

router.get('/notifications', ...ownInbox, notificationController.listMyNotifications);
router.get('/notifications/:id/target', ...ownInbox, notificationController.resolveTarget);
router.get('/notifications/:id', ...ownInbox, notificationController.getNotification);
router.patch('/notifications/:id/read', ...ownInbox, notificationController.markAsRead);
router.patch('/notifications/:id/archive', ...ownInbox, notificationController.archiveNotification);

module.exports = router;
