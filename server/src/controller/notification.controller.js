const { notificationService } = require('../services/notification.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listMyNotifications(req, res, next) {
  try {
    return sendSuccess(res, await notificationService.listMyNotifications(req.user.id, req.query));
  } catch (error) {
    return next(error);
  }
}

async function getNotification(req, res, next) {
  try {
    return sendSuccess(res, await notificationService.getNotification(req.user.id, req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    return sendSuccess(res, await notificationService.markAsRead(req.user.id, req.params.id), 'Notification marked as read');
  } catch (error) {
    return next(error);
  }
}

async function deleteNotification(req, res, next) {
  try {
    return sendSuccess(res, await notificationService.deleteNotification(req.user.id, req.params.id), 'Notification deleted');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listMyNotifications,
  getNotification,
  markAsRead,
  deleteNotification,
};
