const { auditLogService } = require('../services/auditLog.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listAuditLogs(req, res, next) {
  try {
    return sendSuccess(res, await auditLogService.listAuditLogs(req.query));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAuditLogs,
};
