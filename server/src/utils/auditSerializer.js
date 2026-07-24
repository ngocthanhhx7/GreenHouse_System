const BLOCKED_KEY = /(?:password|hash|token|otp|session|cookie|address|phone|refund.*destination|destination.*refund|accountnumber|accountholder|raw|callback|payload|review|support|message|content|secret|authorization|credential|card)/i;

const ALLOWED_KEYS = new Set([
  'aggregateId',
  'aggregateType',
  'amount',
  'attempt',
  'businessEventId',
  'code',
  'commandId',
  'correlationId',
  'count',
  'currency',
  'delta',
  'direction',
  'eventId',
  'eventType',
  'evidenceReference',
  'id',
  'idempotencyKey',
  'metadata',
  'newRole',
  'newStatus',
  'next',
  'occurredAt',
  'orderCode',
  'outcome',
  'previous',
  'previousRole',
  'previousStatus',
  'price',
  'providerReference',
  'quantity',
  'reasonCode',
  'requestCode',
  'role',
  'sku',
  'source',
  'state',
  'status',
  'targetId',
  'targetType',
  'trackingReference',
  'type',
  'version',
]);

function serializeValue(value, depth) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => serializeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object' || depth >= 6) return undefined;
  return serializeAuditFacts(value, depth + 1);
}

function serializeAuditFacts(input, depth = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || depth >= 6) return {};
  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, 100)) {
    if (BLOCKED_KEY.test(key) || !ALLOWED_KEYS.has(key)) continue;
    const serialized = serializeValue(value, depth);
    if (serialized !== undefined) output[key] = serialized;
  }
  return output;
}

module.exports = {
  serializeAuditFacts,
};
