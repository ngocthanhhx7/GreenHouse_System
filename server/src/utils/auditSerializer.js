const BLOCKED_KEY = /(?:password|hash|token|otp|session|cookie|address|phone|refund.*destination|destination.*refund|accountnumber|accountholder|raw|callback|payload|review|support|message|content|secret|authorization|credential|card)/i;
const SENSITIVE_ASSIGNMENT = /(?:password|passcode|hash|token|otp|session|cookie|authorization|credential|account\s*(?:number|holder)|card|phone|address|refund\s*destination|secret)\s*(?::\s*|=\s*|\s+)(?:bearer\s+)?[^\s,;}\])]+/iu;
const BEARER_CREDENTIAL = /(?:^|[\s:={[(])bearer\s+[^\s,;}\])]+/iu;
const SENSITIVE_PAYLOAD = /(?:raw\s*callback|callback\s*(?:body|payload)|review\s*(?:body|content)|support\s*(?:body|message)|full\s*evidence\s*body)/i;
const SENSITIVE_FACT_TEXT = /(?:password|passcode|hash|token|otp|session|cookie|authorization|credential|accountnumber|accountholder|card|phone|address|secret)/i;
const EMAIL_ADDRESS = /(?:^|[^\p{L}\p{N}])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}(?=$|[^\p{L}\p{N}])/iu;
const PHONE_NUMBER = /(?:^|[^\p{L}\p{N}])(?:\+(?:\d[\s.-]?){7,14}\d|0(?:\d[\s.-]?){8}\d)(?!\d)/u;

const CONTAINER_KEYS = new Set(['metadata', 'next', 'previous']);
const NUMBER_KEYS = new Set([
  'amount',
  'attempt',
  'count',
  'delta',
  'price',
  'quantity',
  'version',
]);
const DATE_KEYS = new Set(['occurredAt']);
const STRING_LIMITS = new Map([
  ['aggregateId', 200],
  ['aggregateType', 120],
  ['businessEventId', 240],
  ['code', 120],
  ['commandId', 240],
  ['correlationId', 240],
  ['currency', 12],
  ['direction', 80],
  ['eventId', 240],
  ['eventType', 160],
  ['evidenceReference', 240],
  ['id', 200],
  ['idempotencyKey', 240],
  ['newRole', 80],
  ['newStatus', 120],
  ['orderCode', 120],
  ['outcome', 80],
  ['previousRole', 80],
  ['previousStatus', 120],
  ['providerReference', 240],
  ['reasonCode', 120],
  ['requestCode', 120],
  ['role', 80],
  ['sku', 120],
  ['source', 120],
  ['state', 120],
  ['status', 120],
  ['targetId', 200],
  ['targetType', 120],
  ['trackingReference', 240],
  ['type', 120],
]);
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/;
const MAX_DEPTH = 6;
const MAX_FIELDS = 100;

function normalizeWhitespace(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeAuditReason(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  if (
    SENSITIVE_ASSIGNMENT.test(normalized)
    || BEARER_CREDENTIAL.test(normalized)
    || SENSITIVE_PAYLOAD.test(normalized)
    || EMAIL_ADDRESS.test(normalized)
    || PHONE_NUMBER.test(normalized)
  ) {
    return '[REDACTED]';
  }
  return normalized.slice(0, 500);
}

function serializeString(key, value) {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeWhitespace(value);
  if (
    !normalized
    || SENSITIVE_FACT_TEXT.test(normalized)
    || SENSITIVE_ASSIGNMENT.test(normalized)
    || SENSITIVE_PAYLOAD.test(normalized)
  ) {
    return undefined;
  }
  if (key === 'evidenceReference' && !SAFE_REFERENCE.test(normalized)) return undefined;
  return normalized.slice(0, STRING_LIMITS.get(key));
}

function serializeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function serializeDate(value) {
  if (!(value instanceof Date) && typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function serializeAuditFacts(input, depth = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || depth >= MAX_DEPTH) {
    return {};
  }

  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_FIELDS)) {
    if (BLOCKED_KEY.test(key) || Array.isArray(value)) continue;

    let serialized;
    if (CONTAINER_KEYS.has(key)) {
      if (value && typeof value === 'object') {
        serialized = serializeAuditFacts(value, depth + 1);
      }
    } else if (NUMBER_KEYS.has(key)) {
      serialized = serializeNumber(value);
    } else if (DATE_KEYS.has(key)) {
      serialized = serializeDate(value);
    } else if (STRING_LIMITS.has(key)) {
      serialized = serializeString(key, value);
    }

    if (serialized !== undefined) output[key] = serialized;
  }
  return output;
}

module.exports = {
  normalizeAuditReason,
  serializeAuditFacts,
};
