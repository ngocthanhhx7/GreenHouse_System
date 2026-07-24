const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');

const PUBLICATION_STATUSES = new Set(['Published', 'Withdrawn']);
const MODERATION_STATUSES = new Set(['Allowed', 'HiddenByStaff']);
const HTML_ENTITY_REPLACEMENTS = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function reviewError(statusCode, errorCode, message, data = null) {
  return new ApiError(statusCode, message, [], errorCode, data);
}

function valueId(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && (value.id !== undefined || value._id !== undefined)) {
    return String(value.id ?? value._id);
  }
  return String(value);
}

function actorId(actor) {
  return valueId(actor?.id ?? actor?._id ?? actor);
}

function isCastError(error) {
  return error?.name === 'CastError' || error?.constructor?.name === 'CastError';
}

function requireCustomer(actor) {
  if (
    actor?.role !== 'Customer'
    || !actorId(actor)
    || actor?.status !== 'Active'
  ) {
    throw reviewError(403, 'REVIEW_FORBIDDEN', 'Review operation is forbidden');
  }
}

function requireActiveStaff(actor) {
  if (actor?.role !== 'Staff' || actor?.status !== 'Active' || !actorId(actor)) {
    throw reviewError(403, 'REVIEW_FORBIDDEN', 'Review operation is forbidden');
  }
}

function validateCommandEnvelope(command, options, { create = false } = {}) {
  const key = typeof options?.idempotencyKey === 'string'
    ? options.idempotencyKey.trim()
    : '';
  const expectedVersion = command?.expectedVersion;
  if (
    !command
    || typeof command !== 'object'
    || Array.isArray(command)
    || Object.prototype.hasOwnProperty.call(command, 'idempotencyKey')
    || key.length < 8
    || key.length > 128
    || !Number.isInteger(expectedVersion)
    || expectedVersion < 0
    || (create && expectedVersion !== 0)
  ) {
    throw reviewError(
      400,
      'COMMAND_VALIDATION_FAILED',
      'Review command metadata is invalid',
    );
  }
  return { idempotencyKey: key, expectedVersion };
}

function normalizeContent(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw reviewError(400, 'REVIEW_VALIDATION_FAILED', 'Review input is invalid');
  }
  const normalized = sanitizePlainText(value);
  if (normalized.length > 1000) {
    throw reviewError(400, 'REVIEW_VALIDATION_FAILED', 'Review input is invalid');
  }
  return normalized;
}

function sanitizePlainText(value) {
  return String(value ?? '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (match, entity) => {
      const lower = entity.toLowerCase();
      if (HTML_ENTITY_REPLACEMENTS[lower]) return HTML_ENTITY_REPLACEMENTS[lower];
      if (lower.startsWith('#x')) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        return codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }
      if (lower.startsWith('#')) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        return codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }
      return match;
    })
    .replace(/<[^>]*>/gu, ' ')
    .replace(/[<>]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function validateContentCommand(command) {
  if (
    typeof command?.rating !== 'number'
    || !Number.isInteger(command.rating)
    || command.rating < 1
    || command.rating > 5
  ) {
    throw reviewError(400, 'REVIEW_VALIDATION_FAILED', 'Review input is invalid');
  }
  return {
    rating: command.rating,
    content: normalizeContent(command.content),
  };
}

function validatePublicationCommand(command) {
  if (!PUBLICATION_STATUSES.has(command?.publicationStatus)) {
    throw reviewError(400, 'REVIEW_VALIDATION_FAILED', 'Review input is invalid');
  }
  return { publicationStatus: command.publicationStatus };
}

function validateModerationCommand(command) {
  const reason = typeof command?.reason === 'string' ? command.reason.trim() : '';
  if (
    !MODERATION_STATUSES.has(command?.moderationStatus)
    || reason.length < 5
    || reason.length > 500
  ) {
    throw reviewError(400, 'REVIEW_VALIDATION_FAILED', 'Review input is invalid');
  }
  return {
    moderationStatus: command.moderationStatus,
    reason,
  };
}

function commandFingerprint({
  actorId: commandActorId,
  aggregateId,
  aggregateType,
  operation,
  command,
}) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalizeFacts({
    actorId: String(commandActorId),
    aggregateId: String(aggregateId),
    aggregateType,
    operation,
    command,
  }))).digest('hex');
}

function canonicalizeFacts(value) {
  if (Array.isArray(value)) return value.map(canonicalizeFacts);
  if (
    value
    && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeFacts(value[key])]),
    );
  }
  return value;
}

function normalizedReview(review) {
  const legacyVisible = review.publicationStatus === undefined
    && review.status !== 'Hidden';
  return {
    id: valueId(review),
    customerId: valueId(review.customerId),
    productId: valueId(review.productId),
    orderId: valueId(review.orderId) || null,
    orderDetailId: valueId(review.orderDetailId) || null,
    rating: Number(review.rating),
    content: sanitizePlainText(review.content),
    publicationStatus: review.publicationStatus
      || (legacyVisible ? 'Published' : 'Withdrawn'),
    moderationStatus: review.moderationStatus || 'Allowed',
    moderationReason: String(review.moderationReason || ''),
    version: Number(review.version || 1),
    createdAt: review.createdAt,
    updatedAt: review.updatedAt || review.createdAt,
  };
}

function toManagementDto(review) {
  const item = normalizedReview(review);
  return {
    id: item.id,
    customerId: item.customerId,
    productId: item.productId,
    orderDetailId: item.orderDetailId,
    rating: item.rating,
    content: item.content,
    publicationStatus: item.publicationStatus,
    moderationStatus: item.moderationStatus,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toOwnDto(review, historySummary) {
  const item = normalizedReview(review);
  return {
    id: item.id,
    productId: item.productId,
    rating: item.rating,
    content: item.content,
    publicationStatus: item.publicationStatus,
    moderationStatus: item.moderationStatus,
    version: item.version,
    historySummary: {
      contentEntries: Number(historySummary?.contentEntries || 0),
      publicationEntries: Number(historySummary?.publicationEntries || 0),
      moderationEntries: Number(historySummary?.moderationEntries || 0),
    },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toModerationDto(review) {
  const item = normalizedReview(review);
  return {
    id: item.id,
    productId: item.productId,
    rating: item.rating,
    content: item.content,
    publicationStatus: item.publicationStatus,
    moderationStatus: item.moderationStatus,
    moderationReason: item.moderationReason,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function maskDisplayName(value) {
  const tokens = String(value || '').trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return '***';
  const initial = Array.from(tokens[0])[0] || '';
  if (tokens.length === 1) return `${initial}***`;
  return `${tokens.at(-1)} ${initial}.`;
}

function toPublicDto(review, user) {
  const item = normalizedReview(review);
  return {
    displayName: maskDisplayName(user?.displayName || user?.fullName),
    verifiedPurchase: true,
    rating: item.rating,
    content: item.content,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function reviewSort(left, right) {
  const byCreatedAt = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (byCreatedAt !== 0) return byCreatedAt;
  return valueId(right).localeCompare(valueId(left), 'en');
}

function parsePaging(filters = {}) {
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const pageSize = filters.pageSize === undefined ? 20 : Number(filters.pageSize);
  if (
    !Number.isInteger(page)
    || page < 1
    || !Number.isInteger(pageSize)
    || pageSize < 1
    || pageSize > 50
  ) {
    throw reviewError(400, 'REVIEW_FILTER_INVALID', 'Review filter is invalid');
  }
  return { page, pageSize };
}

function pageItems(items, { page, pageSize }, additions = {}) {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    ...additions,
  };
}

function boundedPage(items, { page, pageSize }, total, additions = {}) {
  return {
    items,
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.ceil(Number(total) / pageSize),
    ...additions,
  };
}

module.exports = {
  PUBLICATION_STATUSES,
  MODERATION_STATUSES,
  actorId,
  boundedPage,
  commandFingerprint,
  isCastError,
  normalizedReview,
  pageItems,
  parsePaging,
  requireActiveStaff,
  requireCustomer,
  reviewError,
  reviewSort,
  toManagementDto,
  toModerationDto,
  toOwnDto,
  toPublicDto,
  validateCommandEnvelope,
  validateContentCommand,
  validateModerationCommand,
  validatePublicationCommand,
  valueId,
};
