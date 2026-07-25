const { createHash } = require('node:crypto');
const mongoose = require('mongoose');

const DomainOutbox = require('../models/domainOutbox.model');
const { logAudit } = require('../utils/auditLogger');

function createTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function createOutboxWriter({ model = DomainOutbox } = {}) {
  async function findExisting(identityKey, session) {
    const query = model.findOne({ identityKey });
    return (session ? query.session(session) : query).lean();
  }

  function replayOrThrow(existing, entry) {
    if (existing && existing.eventHash === entry.eventHash) return existing;
    const error = new Error('Domain event identity was already used with different facts');
    error.code = 'DOMAIN_EVENT_IDEMPOTENCY_REUSE';
    throw error;
  }

  return {
    async publish(entry, session) {
      const existing = await findExisting(entry.identityKey, session);
      if (existing) return replayOrThrow(existing, entry);
      try {
        const [created] = await model.create([entry], session ? { session } : undefined);
        return created.toObject();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        return replayOrThrow(await findExisting(entry.identityKey, session), entry);
      }
    },
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function canonicalEnvelope(input = {}, clock = () => new Date()) {
  const businessEventId = String(input.businessEventId || '').trim();
  const eventType = String(input.eventType || input.type || '').trim().toUpperCase();
  const aggregateType = String(input.aggregateType || '').trim();
  const aggregateId = String(input.aggregateId || '').trim();
  if (!businessEventId || !eventType || !aggregateType || !aggregateId) {
    throw new Error('Canonical domain event identity is incomplete');
  }
  const occurredAt = new Date(input.occurredAt || clock());
  if (Number.isNaN(occurredAt.getTime())) throw new Error('Canonical domain event time is invalid');
  const payload = {
    businessEventId,
    type: eventType,
    displayValues: input.displayValues || {},
  };
  for (const key of [
    'recipient',
    'recipientRole',
    'recipientId',
    'recipientEmail',
    'userId',
    'target',
    'targetCollection',
    'targetId',
  ]) {
    if (Object.hasOwn(input, key)) payload[key] = input[key];
  }
  const aggregateVersion = Number(input.aggregateVersion);
  const envelope = {
    identityKey: String(input.identityKey || businessEventId).trim(),
    businessEventId,
    eventType,
    aggregateType,
    aggregateId,
    ...(Number.isInteger(aggregateVersion) && aggregateVersion >= 0
      ? { aggregateVersion }
      : {}),
    occurredAt,
    payloadSchemaVersion: 1,
    payload,
    status: 'Pending',
  };
  return {
    ...envelope,
    eventHash: createHash('sha256')
      .update(JSON.stringify(canonicalJson(envelope)))
      .digest('hex'),
  };
}

function createDomainEventProducer({
  transactionManager = createTransactionManager(),
  auditWriter = { write: logAudit },
  outboxWriter = createOutboxWriter(),
  clock = () => new Date(),
} = {}) {
  async function append({ audit, event }, session) {
    const envelope = canonicalEnvelope(event, clock);
    const auditEntry = {
      ...audit,
      businessEventId: envelope.businessEventId,
      correlationId: audit?.correlationId || envelope.businessEventId,
      timestamp: audit?.timestamp || envelope.occurredAt,
    };
    await auditWriter.write(auditEntry, session);
    await outboxWriter.publish(envelope, session);
    return envelope;
  }

  return {
    append,
    async execute({ mutate, buildAudit, buildEvent }) {
      if (typeof mutate !== 'function'
        || typeof buildAudit !== 'function'
        || typeof buildEvent !== 'function') {
        throw new Error('Atomic domain event command requires mutate, buildAudit, and buildEvent');
      }
      return transactionManager.withTransaction(async (session) => {
        const result = await mutate(session);
        await append({
          audit: buildAudit(result),
          event: buildEvent(result),
        }, session);
        return result;
      });
    },
  };
}

module.exports = {
  canonicalEnvelope,
  createDomainEventProducer,
  createOutboxWriter,
  createTransactionManager,
  domainEventProducer: createDomainEventProducer(),
};
