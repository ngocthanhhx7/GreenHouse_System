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
    return sendSuccess(res, await systemSettingService.updateSettings(req.user.id, req.body), 'System settings updated');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listSettings,
  updateSettings,
};
