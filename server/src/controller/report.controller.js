const { reportService } = require('../services/report.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getAdminOverview(req, res, next) {
  try {
    return sendSuccess(res, await reportService.getAdminOverview(req.query));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAdminOverview,
};
