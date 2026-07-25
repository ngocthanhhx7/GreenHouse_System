const { randomUUID } = require('node:crypto');

const { reportService: defaultReportService } = require('../services/report.service');
const { sendSuccess } = require('../utils/apiResponse');
const { logAudit } = require('../utils/auditLogger');

function requestedMode(query = {}) {
  if (query.mode) return String(query.mode);
  return query.from || query.to ? 'period' : 'currentMonth';
}

function createReportController({
  reportService = defaultReportService,
  auditLogger = { log: logAudit },
  sendSuccessFn = sendSuccess,
} = {}) {
  function handler(serviceMethod, targetId) {
    return async function getReport(req, res, next) {
      try {
        const data = await reportService[serviceMethod](req.query);
        const correlationId = String(req.requestId || randomUUID());
        await auditLogger.log({
          actorType: 'User',
          actorId: String(req.user.id),
          actorRole: String(req.user.role || 'Admin'),
          source: 'Reporting',
          action: 'REPORT_READ',
          targetType: 'Report',
          targetId,
          outcome: 'Success',
          correlationId,
          businessEventId: `report-read:${correlationId}`,
          safeFacts: { mode: requestedMode(req.query) },
        });
        return sendSuccessFn(res, data);
      } catch (error) {
        return next(error);
      }
    };
  }

  return {
    getAdminOverview: handler('getAdminOverview', 'overview'),
    getRevenueReport: handler('getRevenueReport', 'revenue'),
    getOrderReport: handler('getOrderReport', 'orders'),
    getProductReport: handler('getProductReport', 'products'),
    getCustomerReport: handler('getCustomerReport', 'customers'),
    getStaffReport: handler('getStaffReport', 'staff'),
    getInventoryReport: handler('getInventoryReport', 'inventory'),
  };
}

const reportController = createReportController();

module.exports = {
  createReportController,
  ...reportController,
};
