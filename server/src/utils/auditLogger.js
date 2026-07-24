const { randomUUID } = require('node:crypto');

const AuditLog = require('../models/auditLog.model');
const { serializeAuditFacts } = require('./auditSerializer');

function text(value, fallback = '') {
  const normalized = String(value == null ? fallback : value).trim();
  return normalized;
}

function normalizeAuditEntry(entry = {}) {
  const actorId = entry.actorId ?? entry.userId ?? null;
  const actorType = entry.actorType || (actorId ? 'User' : 'System');
  const suppliedBusinessEventId = text(
    entry.businessEventId || entry.eventId || entry.idempotencyKey || entry.correlationId
  );
  const suppliedCorrelationId = text(
    entry.correlationId || entry.commandId || entry.idempotencyKey || suppliedBusinessEventId
  );
  const fallbackIdentity = suppliedBusinessEventId || suppliedCorrelationId
    ? ''
    : `legacy:${randomUUID()}`;
  const businessEventId = suppliedBusinessEventId || suppliedCorrelationId || fallbackIdentity;
  const correlationId = suppliedCorrelationId || businessEventId;
  const previous = serializeAuditFacts(entry.before || entry.previous || {});
  const next = serializeAuditFacts(entry.after || entry.next || {});
  const metadata = serializeAuditFacts(entry.metadata || {});
  const safeFacts = serializeAuditFacts({
    ...entry.safeFacts,
    ...(Object.keys(previous).length ? { previous } : {}),
    ...(Object.keys(next).length ? { next } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    occurredAt: entry.occurredAt,
    idempotencyKey: entry.idempotencyKey,
  });
  const previousState = text(
    entry.previousState || entry.before?.state || entry.before?.status || entry.before?.role
  );
  const newState = text(
    entry.newState || entry.after?.state || entry.after?.status || entry.after?.role
  );
  const stateVersionValue = entry.stateVersion ?? entry.version ?? entry.after?.version;
  const stateVersion = stateVersionValue == null || stateVersionValue === ''
    ? null
    : Number(stateVersionValue);
  const targetType = text(entry.targetType || entry.targetEntity || entry.aggregateType);
  const reason = text(entry.reason || entry.description);

  return {
    auditId: entry.auditId,
    actorType,
    actorId: actorId == null ? null : String(actorId),
    actorRole: text(entry.actorRole || entry.roleSnapshot || entry.role),
    source: text(entry.source, actorType === 'User' ? 'Application' : actorType),
    action: text(entry.action),
    targetType,
    targetId: text(entry.targetId || entry.aggregateId, 'unknown'),
    outcome: entry.outcome || 'Success',
    correlationId,
    businessEventId,
    reasonCode: text(entry.reasonCode),
    reason,
    previousState,
    newState,
    stateVersion: Number.isInteger(stateVersion) && stateVersion >= 0 ? stateVersion : null,
    safeFacts,
    timestamp: entry.timestamp || entry.occurredAt,

    // Compatibility projections for existing idempotency checks and cleanup scripts.
    userId: actorType === 'User' ? actorId : null,
    eventId: businessEventId,
    targetEntity: targetType,
    description: reason,
  };
}

async function logAudit(entry, session) {
  const data = normalizeAuditEntry(entry);
  if (session) {
    await AuditLog.create([data], { session });
    return;
  }
  await AuditLog.create(data);
}

module.exports = {
  logAudit,
  normalizeAuditEntry,
  serializeAuditFacts,
};
