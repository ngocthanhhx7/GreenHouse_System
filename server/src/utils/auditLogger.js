const AuditLog = require('../models/auditLog.model');

async function logAudit(entry) {
  await AuditLog.create({
    userId: entry.userId || null,
    action: entry.action,
    targetEntity: entry.targetEntity,
    targetId: entry.targetId || '',
    description: entry.description || '',
    before: entry.before || null,
    after: entry.after || null,
    ip: entry.ip || '',
    userAgent: entry.userAgent || '',
  });
}

module.exports = {
  logAudit,
};
