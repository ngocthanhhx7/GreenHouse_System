const { notificationService: defaultNotificationService } = require('../services/notification.service');
const { sendSuccess } = require('../utils/apiResponse');

function createNotificationController({ notificationService = defaultNotificationService } = {}) {
  return {
    async listMyNotifications(req, res, next) {
      try {
        return sendSuccess(res, await notificationService.listMyNotifications(req.user.id, req.query));
      } catch (error) {
        return next(error);
      }
    },

    async getNotification(req, res, next) {
      try {
        return sendSuccess(res, await notificationService.getNotification(req.user.id, req.params.id));
      } catch (error) {
        return next(error);
      }
    },

    async markAsRead(req, res, next) {
      try {
        return sendSuccess(res, await notificationService.markAsRead(req.user.id, req.params.id), 'Notification marked as read');
      } catch (error) {
        return next(error);
      }
    },

    async archiveNotification(req, res, next) {
      try {
        return sendSuccess(res, await notificationService.archiveNotification(req.user.id, req.params.id), 'Notification archived');
      } catch (error) {
        return next(error);
      }
    },

    async resolveTarget(req, res, next) {
      try {
        return sendSuccess(res, await notificationService.resolveTarget(req.user, req.params.id));
      } catch (error) {
        return next(error);
      }
    },
  };
}

module.exports = {
  createNotificationController,
  ...createNotificationController(),
};
