const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/;
const SAFE_FINGERPRINT = /^[a-f0-9]{64}$/i;
const SAFE_ATOM = /^[A-Za-z0-9][A-Za-z0-9_.:@ -]*$/;
const SAFE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ROLES = new Set(['Customer', 'Staff', 'WarehouseManager']);
const ACCOUNT_STATUSES = new Set(['Active', 'Disabled']);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedString(value, maximum, pattern = SAFE_ATOM) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (
    !normalized
    || normalized.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(normalized)
    || (pattern && !pattern.test(normalized))
  ) {
    return null;
  }
  return normalized;
}

function optionalDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractAuditReplayBinding(audit = {}) {
  const privateBinding = isRecord(audit.replayBinding) ? audit.replayBinding : {};
  const legacyAfter = isRecord(audit.after) ? audit.after : {};
  const legacyBefore = isRecord(audit.before) ? audit.before : {};
  const commandFingerprint = [
    privateBinding.commandFingerprint,
    legacyAfter.commandFingerprint,
  ].find((value) => typeof value === 'string' && SAFE_FINGERPRINT.test(value));
  const priorTargetId = [
    privateBinding.priorTargetId,
    legacyBefore.invitationId,
  ].find((value) => typeof value === 'string' && SAFE_ID.test(value));

  return {
    ...(commandFingerprint ? { commandFingerprint } : {}),
    ...(priorTargetId ? { priorTargetId } : {}),
  };
}

function serializeAssignmentDetail(value) {
  if (!isRecord(value)) return undefined;
  const entity = boundedString(value.entity, 120);
  const activeStatuses = Array.isArray(value.activeStatuses)
    ? value.activeStatuses.slice(0, 30)
      .map((status) => boundedString(status, 120))
      .filter(Boolean)
    : [];
  if (!entity) return undefined;
  return {
    entity,
    activeStatuses,
  };
}

function serializeActiveAssignment(value) {
  if (!isRecord(value)) return null;
  const sliceId = boundedString(value.sliceId, 80);
  if (!sliceId) return null;
  const detail = serializeAssignmentDetail(value.detail);
  return {
    sliceId,
    ...(detail ? { detail } : {}),
  };
}

function serializeRecovery(value) {
  if (!isRecord(value)) return null;
  const sliceId = boundedString(value.sliceId, 80);
  if (!sliceId || typeof value.recovered !== 'boolean') return null;
  return { sliceId, recovered: value.recovered };
}

function serializeHandoff(value) {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    activeAssignments: Array.isArray(value.activeAssignments)
      ? value.activeAssignments.slice(0, 100).map(serializeActiveAssignment).filter(Boolean)
      : [],
    assignmentCheckUnavailable: value.assignmentCheckUnavailable === true,
    recoveries: Array.isArray(value.recoveries)
      ? value.recoveries.slice(0, 100).map(serializeRecovery).filter(Boolean)
      : [],
  };
}

function serializeAdminCommandResult(value) {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const user = value.user;
  const id = boundedString(user.id, 200, SAFE_ID);
  const fullName = boundedString(user.fullName, 120, null);
  const email = boundedString(user.email, 254, SAFE_EMAIL);
  const role = boundedString(user.role, 80);
  const status = boundedString(user.status, 20);
  const version = Number(user.version);
  const revokedSessions = Number(value.revokedSessions);
  if (
    !id
    || !fullName
    || !email
    || !ADMIN_ROLES.has(role)
    || !ACCOUNT_STATUSES.has(status)
    || !Number.isSafeInteger(version)
    || version < 0
    || !Number.isSafeInteger(revokedSessions)
    || revokedSessions < 0
  ) {
    return null;
  }

  const handoff = serializeHandoff(value.handoff);
  return {
    user: {
      id,
      fullName,
      email,
      role,
      status,
      createdAt: optionalDate(user.createdAt),
      lastLoginAt: optionalDate(user.lastLoginAt),
      version,
    },
    revokedSessions,
    ...(handoff !== undefined ? { handoff } : {}),
  };
}

function extractAdminCommandResult(audit = {}) {
  const privateResult = serializeAdminCommandResult(audit.commandResult);
  if (privateResult) return privateResult;
  const legacyAfter = isRecord(audit.after) ? audit.after : {};
  return serializeAdminCommandResult(legacyAfter.result);
}

module.exports = {
  extractAdminCommandResult,
  extractAuditReplayBinding,
  serializeAdminCommandResult,
};
