const mongoose = require('mongoose');

const ApiError = require('../utils/apiError');
const AuditLog = require('../models/auditLog.model');
const { normalizeAuditReason, serializeAuditFacts } = require('../utils/auditSerializer');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ACTOR_TYPES = new Set(['User', 'System', 'payOS', 'Carrier', 'EmailService']);
const ACTOR_ROLES = new Set(['Customer', 'Staff', 'WarehouseManager', 'Admin']);
const OUTCOMES = new Set(['Success', 'Denied', 'Failed']);
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/;
const SAFE_ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/;
const AUDIT_LIST_PROJECTION = Object.freeze({
  _id: 1,
  auditId: 1,
  actorType: 1,
  actorId: 1,
  actorRole: 1,
  source: 1,
  action: 1,
  targetType: 1,
  targetId: 1,
  outcome: 1,
  correlationId: 1,
  businessEventId: 1,
  reasonCode: 1,
  reason: 1,
  previousState: 1,
  newState: 1,
  stateVersion: 1,
  safeFacts: 1,
  timestamp: 1,
  userId: 1,
  eventId: 1,
  targetEntity: 1,
  description: 1,
});

function fieldError(field, message) {
  return { field, message };
}

function parseDate(value, field, errors) {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(fieldError(field, `Bộ lọc ${field} phải là ngày giờ hợp lệ.`));
    return undefined;
  }
  return date;
}

function parseEnum(value, field, allowed, errors) {
  if (value === undefined || value === '') return undefined;
  const normalized = String(value).trim();
  if (!allowed.has(normalized)) {
    errors.push(fieldError(field, `Bộ lọc ${field} không hợp lệ.`));
    return undefined;
  }
  return normalized;
}

function parseName(value, field, errors) {
  if (value === undefined || value === '') return undefined;
  const normalized = String(value).trim();
  if (!SAFE_NAME.test(normalized)) {
    errors.push(fieldError(field, `Bộ lọc ${field} không hợp lệ.`));
    return undefined;
  }
  return normalized;
}

function parseBoundedText(value, field, errors, maxLength = 200) {
  if (value === undefined || value === '') return undefined;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    errors.push(fieldError(field, `Bộ lọc ${field} không hợp lệ.`));
    return undefined;
  }
  return normalized;
}

function encodeCursor(entry) {
  if (!entry) return null;
  return Buffer.from(JSON.stringify({
    timestamp: new Date(entry.timestamp).toISOString(),
    id: String(entry._id),
  })).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const timestamp = new Date(parsed.timestamp);
    if (
      typeof parsed.id !== 'string'
      || !mongoose.isObjectIdOrHexString(parsed.id)
      || Number.isNaN(timestamp.getTime())
      || Object.keys(parsed).sort().join(',') !== 'id,timestamp'
    ) {
      throw new Error('invalid cursor');
    }
    return { timestamp, id: String(parsed.id) };
  } catch (_error) {
    return null;
  }
}

function normalizeFilters(query = {}) {
  const errors = [];
  const actorType = parseEnum(query.actorType, 'actorType', ACTOR_TYPES, errors);
  const actorIdInput = query.actorId ?? query.userId;
  const actorId = actorIdInput === undefined || actorIdInput === ''
    ? undefined
    : String(actorIdInput).trim();
  const requiresUserObjectId = actorType === 'User' || query.userId !== undefined;
  if (
    actorId
    && (!SAFE_ACTOR_ID.test(actorId) || (requiresUserObjectId && !mongoose.isValidObjectId(actorId)))
  ) {
    errors.push(fieldError('actorId', 'Bộ lọc actorId phải là định danh hợp lệ.'));
  }
  const from = parseDate(query.from, 'from', errors);
  const to = parseDate(query.to, 'to', errors);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) {
    errors.push(fieldError('cursor', 'Con trỏ phân trang không hợp lệ.'));
  }
  const numericLimit = query.limit === undefined || query.limit === ''
    ? DEFAULT_LIMIT
    : Number(query.limit);
  if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > MAX_LIMIT) {
    errors.push(fieldError('limit', `Số bản ghi mỗi trang phải từ 1 đến ${MAX_LIMIT}.`));
  }
  if (from && to && from.getTime() > to.getTime()) {
    errors.push(fieldError(
      'period',
      'Thời điểm bắt đầu phải trước hoặc bằng thời điểm kết thúc.'
    ));
  }
  const filters = {
    actorType,
    actorId: actorId && SAFE_ACTOR_ID.test(actorId)
      && (!requiresUserObjectId || mongoose.isValidObjectId(actorId))
      ? actorId
      : undefined,
    actorRole: parseEnum(query.role ?? query.actorRole, 'role', ACTOR_ROLES, errors),
    action: parseName(query.action, 'action', errors),
    targetType: parseName(query.targetType ?? query.targetEntity, 'targetType', errors),
    targetId: parseBoundedText(query.targetId, 'targetId', errors),
    outcome: parseEnum(query.outcome, 'outcome', OUTCOMES, errors),
    from,
    to,
    cursor,
    limit: Number.isInteger(numericLimit) ? numericLimit : DEFAULT_LIMIT,
  };
  if (errors.length) {
    throw new ApiError(
      400,
      'Bộ lọc nhật ký kiểm toán không hợp lệ.',
      errors,
      'AUDIT_FILTER_INVALID'
    );
  }
  return filters;
}

function toAuditResponse(entry) {
  const recordId = String(entry.auditId || entry._id);
  const actorId = entry.actorId || entry.userId;
  const targetType = entry.targetType || entry.targetEntity;
  const reason = normalizeAuditReason(entry.reason || entry.description);
  const businessEventId = entry.businessEventId || entry.eventId || `legacy:${recordId}`;
  const response = {
    auditId: recordId,
    actorType: entry.actorType || (actorId ? 'User' : 'System'),
    actorId: actorId ? String(actorId) : null,
    actorRole: entry.actorRole || '',
    source: entry.source || 'LegacyApplication',
    action: entry.action,
    targetType,
    targetId: entry.targetId,
    outcome: entry.outcome || 'Success',
    correlationId: entry.correlationId || businessEventId,
    businessEventId,
    reasonCode: entry.reasonCode || '',
    reason,
    previousState: entry.previousState || '',
    newState: entry.newState || '',
    stateVersion: entry.stateVersion ?? null,
    safeFacts: serializeAuditFacts(entry.safeFacts || {}),
    timestamp: entry.timestamp,
  };
  return {
    ...response,
    id: response.auditId,
    userId: response.actorType === 'User' ? response.actorId : null,
    targetEntity: response.targetType,
    description: response.reason,
  };
}

function createModelRepository(model = AuditLog) {
  return {
    async list(filters = {}) {
      const query = {};
      const predicates = [];
      for (const field of ['actorRole', 'action', 'targetId']) {
        if (filters[field] !== undefined) query[field] = filters[field];
      }
      if (filters.actorType === 'User') {
        predicates.push({
          $or: [
            { actorType: 'User' },
            { actorType: { $exists: false }, userId: { $type: 'objectId' } },
          ],
        });
      } else if (filters.actorType !== undefined) {
        query.actorType = filters.actorType;
      }
      if (filters.actorId !== undefined) {
        if (filters.actorType !== 'User' && !mongoose.isValidObjectId(filters.actorId)) {
          query.actorId = filters.actorId;
        } else {
          predicates.push({
            $or: [
              { actorId: filters.actorId },
              { userId: filters.actorId },
            ],
          });
        }
      }
      if (filters.targetType !== undefined) {
        predicates.push({
          $or: [
            { targetType: filters.targetType },
            { targetEntity: filters.targetType },
          ],
        });
      }
      if (filters.outcome === 'Success') {
        predicates.push({
          $or: [
            { outcome: 'Success' },
            { outcome: { $exists: false } },
          ],
        });
      } else if (filters.outcome !== undefined) {
        query.outcome = filters.outcome;
      }
      if (filters.from || filters.to) {
        query.timestamp = {};
        if (filters.from) query.timestamp.$gte = filters.from;
        if (filters.to) query.timestamp.$lte = filters.to;
      }
      const cursor = typeof filters.cursor === 'string'
        ? decodeCursor(filters.cursor)
        : filters.cursor;
      if (cursor) {
        const cursorPredicate = { $or: [
          { timestamp: { $lt: cursor.timestamp } },
          { timestamp: cursor.timestamp, _id: { $lt: cursor.id } },
        ] };
        if (predicates.length) predicates.push(cursorPredicate);
        else query.$or = cursorPredicate.$or;
      }
      if (predicates.length) query.$and = predicates;
      const documents = await model.find(query, AUDIT_LIST_PROJECTION)
        .sort({ timestamp: -1, _id: -1 })
        .limit(filters.limit + 1)
        .lean();
      const hasMore = documents.length > filters.limit;
      const items = hasMore ? documents.slice(0, filters.limit) : documents;
      return {
        items,
        nextCursor: hasMore ? encodeCursor(items.at(-1)) : null,
      };
    },
  };
}

function createAuditLogService({ repository = createModelRepository() } = {}) {
  return {
    async listAuditLogs(query = {}) {
      const filters = normalizeFilters(query);
      const page = await repository.list(filters);
      const rawItems = Array.isArray(page) ? page : page.items;
      const items = rawItems.map(toAuditResponse);
      return {
        items,
        nextCursor: Array.isArray(page) ? null : page.nextCursor || null,
        total: items.length,
      };
    },
  };
}

module.exports = {
  createAuditLogService,
  createModelRepository,
  auditLogService: createAuditLogService(),
  decodeCursor,
  encodeCursor,
  normalizeFilters,
  toAuditResponse,
};
