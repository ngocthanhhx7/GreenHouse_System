const { systemSettingService } = require('../services/systemSetting.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listSettings(req, res, next) {
  try {
    return sendSuccess(res, await systemSettingService.listSettings());
  } catch (error) {
    return next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    return sendSuccess(res, await systemSettingService.updateSettings(
      req.user.id,
      req.body,
      req.get('Idempotency-Key'),
      { role: req.user.role },
    ), 'System settings updated');
  } catch (error) {
    return next(error);
  }
}

async function listHistory(req, res, next) {
  try {
    return sendSuccess(res, await systemSettingService.listHistory());
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listSettings,
  updateSettings,
  listHistory,
};
