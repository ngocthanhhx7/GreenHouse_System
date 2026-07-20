const { damageReportService } = require('../services/damageReport.service');
const { sendSuccess } = require('../utils/apiResponse');

async function createStaffReport(req, res, next) {
  try {
    return sendSuccess(res, await damageReportService.createStaffReport(req.user.id, req.body), 'Damage report created', 201);
  } catch (error) {
    return next(error);
  }
}

async function listWarehouseReports(req, res, next) {
  try {
    return sendSuccess(res, await damageReportService.listWarehouseReports(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getWarehouseReport(req, res, next) {
  try {
    return sendSuccess(res, await damageReportService.getWarehouseReport(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function confirmWarehouseReport(req, res, next) {
  try {
    return sendSuccess(
      res,
      await damageReportService.confirmWarehouseReport(req.user.id, req.params.id),
      'Damage report confirmed'
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createStaffReport,
  listWarehouseReports,
  getWarehouseReport,
  confirmWarehouseReport,
};
