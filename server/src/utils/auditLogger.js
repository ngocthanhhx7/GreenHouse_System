const AuditLog = require('../models/auditLog.model');

async function logAudit(entry, session) {
  const data = {
    userId: entry.userId || null,
    action: entry.action,
    eventId: entry.eventId || '',
    targetEntity: entry.targetEntity,
    targetId: entry.targetId || '',
    description: entry.description || '',
    before: entry.before || null,
    after: entry.after || null,
    ip: entry.ip || '',
    userAgent: entry.userAgent || '',
  };
  if (session) {
    await AuditLog.create([data], { session });
    return;
  }
  await AuditLog.create(data);
}

module.exports = {
  logAudit,
};
