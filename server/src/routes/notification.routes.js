const express = require('express');
const notificationController = require('../controller/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/notifications', authenticate, notificationController.listMyNotifications);
router.patch('/notifications/:id/read', authenticate, notificationController.markAsRead);

module.exports = router;
