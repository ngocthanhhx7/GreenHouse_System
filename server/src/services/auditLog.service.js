const ApiError = require('../utils/apiError');
const AuditLog = require('../models/auditLog.model');

function toAuditResponse(entry) {
  return {
    id: String(entry._id),
    userId: entry.userId ? String(entry.userId) : null,
    action: entry.action,
    targetEntity: entry.targetEntity,
    targetId: entry.targetId || '',
    description: entry.description || '',
    ip: entry.ip || '',
    userAgent: entry.userAgent || '',
    timestamp: entry.timestamp,
  };
}

function parseDateFilter(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Invalid audit date filter');
  return date;
}

function createModelRepository() {
  return {
    async list(filters = {}) {
      const query = {};
      if (filters.action) query.action = filters.action;
      if (filters.userId) query.userId = filters.userId;
      if (filters.from || filters.to) {
        query.timestamp = {};
        if (filters.from) query.timestamp.$gte = filters.from;
        if (filters.to) query.timestamp.$lte = filters.to;
      }
      return AuditLog.find(query).sort({ timestamp: -1 }).limit(100).lean();
    },
  };
}

function createAuditLogService({ repository = createModelRepository() } = {}) {
  return {
    async listAuditLogs(query = {}) {
      const filters = {
        action: query.action || undefined,
        userId: query.userId || undefined,
        from: parseDateFilter(query.from),
        to: parseDateFilter(query.to),
      };
      const items = (await repository.list(filters)).map(toAuditResponse);
      return {
        items,
        total: items.length,
      };
    },
  };
}

module.exports = {
  createAuditLogService,
  auditLogService: createAuditLogService(),
};
