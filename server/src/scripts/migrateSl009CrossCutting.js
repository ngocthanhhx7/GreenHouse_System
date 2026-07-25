const { createHash } = require('node:crypto');
const mongoose = require('mongoose');

const AuditLog = require('../models/auditLog.model');
const DomainOutbox = require('../models/domainOutbox.model');
const EmailOutbox = require('../models/emailOutbox.model');
const Notification = require('../models/notification.model');
const SystemSetting = require('../models/systemSetting.model');
const SystemSettingVersion = require('../models/systemSettingVersion.model');
const { connectDatabase } = require('../config/database');
const { canonicalEnvelope } = require('../services/domainEventProducer.service');
const { normalizeAuditEntry } = require('../utils/auditLogger');
const {
  NOTIFICATION_TYPES,
  normalizeNotificationType,
  sanitizeDisplayValues,
} = require('../utils/notificationContract');

const COLLECTION_ORDER = Object.freeze([
  'AuditLog',
  'Notification',
  'EmailOutbox',
  'DomainOutbox',
  'SystemSetting',
  'SystemSettingVersion',
]);
const SETTING_DEFAULTS = Object.freeze({
  PAYMENT_TIMEOUT_MINUTES: 15,
  LOW_STOCK_DEFAULT_THRESHOLD: 5,
});

function text(value) {
  return String(value == null ? '' : value).trim();
}

function idOf(document) {
  return text(document?._id);
}

function normalizedDate(value, fallback) {
  const result = new Date(value || fallback);
  return Number.isNaN(result.getTime()) ? new Date(fallback) : result;
}

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function hash(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function same(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function snapshotPredicate(document = {}) {
  return Object.fromEntries(
    Object.entries(document).map(([key, value]) => [key, value]),
  );
}

function updateOperation(collection, document, set) {
  const changed = Object.fromEntries(
    Object.entries(set).filter(([key, value]) => !same(document?.[key], value)),
  );
  if (!Object.keys(changed).length) return null;
  return {
    collection,
    kind: 'update',
    filter: snapshotPredicate(document),
    update: { $set: changed },
  };
}

function addUnresolved(unresolved, collection, document, code, message) {
  unresolved.push({
    collection,
    id: idOf(document) || 'unknown',
    code,
    message,
  });
}

function auditOperations(audits, now, unresolved) {
  return [...audits]
    .sort((left, right) => idOf(left).localeCompare(idOf(right)))
    .flatMap((document) => {
      if (!idOf(document)) {
        addUnresolved(unresolved, 'AuditLog', document, 'AUDIT_ID_MISSING', 'Audit row has no stable identity');
        return [];
      }
      const businessEventId = text(
        document.businessEventId || document.eventId || `legacy-audit:${idOf(document)}`,
      );
      const timestamp = normalizedDate(document.timestamp || document.createdAt, now);
      const canonical = normalizeAuditEntry({
        ...document,
        auditId: document.auditId || `legacy-audit:${idOf(document)}`,
        businessEventId,
        correlationId: document.correlationId || businessEventId,
        actorType: document.actorType || (document.actorId || document.userId ? 'User' : 'System'),
        actorId: document.actorId || document.userId || null,
        source: document.source || 'SL009Migration',
        targetType: document.targetType || document.targetEntity || 'Unknown',
        targetId: document.targetId || 'unknown',
        outcome: document.outcome || 'Success',
        reason: document.reason || document.description || 'Legacy audit canonicalized',
        timestamp,
      });
      const set = {
        auditId: canonical.auditId,
        actorType: canonical.actorType,
        actorId: canonical.actorId,
        source: canonical.source,
        targetType: canonical.targetType,
        targetId: canonical.targetId,
        outcome: canonical.outcome,
        businessEventId: canonical.businessEventId,
        correlationId: canonical.correlationId,
        reason: canonical.reason,
        safeFacts: canonical.safeFacts,
        timestamp,
      };
      const operation = updateOperation('AuditLog', document, set);
      return operation ? [operation] : [];
    });
}

function recipientIdentityFor(document) {
  const explicit = text(document.recipientIdentity);
  if (explicit) return explicit;
  const userId = text(document.userId || document.recipientId);
  if (userId) return `user:${userId}`;
  const email = text(document.recipientEmail || document.recipient).toLowerCase();
  return email ? `email:${email}` : '';
}

function notificationOperations(notifications, now, unresolved) {
  return [...notifications]
    .sort((left, right) => idOf(left).localeCompare(idOf(right)))
    .flatMap((document) => {
      const businessEventId = text(document.businessEventId || document.eventId);
      const recipientIdentity = recipientIdentityFor(document);
      if (!idOf(document) || !businessEventId || !recipientIdentity) {
        addUnresolved(
          unresolved,
          'Notification',
          document,
          'NOTIFICATION_IDENTITY_AMBIGUOUS',
          'Notification requires a row id, business event id, and recipient identity',
        );
        return [];
      }
      let type;
      let displayValues;
      try {
        type = normalizeNotificationType(document.type);
        displayValues = sanitizeDisplayValues(type, document.displayValues || {});
      } catch (error) {
        addUnresolved(
          unresolved,
          'Notification',
          document,
          'NOTIFICATION_CONTRACT_INVALID',
          error.message,
        );
        return [];
      }
      const channel = document.channel === 'Email' ? 'Email' : 'InApp';
      const archivedAt = document.archivedAt || document.deletedAt || null;
      const readAt = document.readAt
        || (document.isRead ? document.updatedAt || document.createdAt || now : null);
      let state = 'Unread';
      if (channel === 'Email') state = 'NotApplicable';
      else if (archivedAt) state = 'Archived';
      else if (readAt) state = 'Read';
      const set = {
        businessEventId,
        recipientIdentity,
        type,
        templateKey: type,
        displayValues,
        channel,
        state,
        readAt: state === 'Read' || state === 'Archived'
          ? normalizedDate(readAt || archivedAt, now)
          : null,
        archivedAt: state === 'Archived' ? normalizedDate(archivedAt, now) : null,
      };
      const operation = updateOperation('Notification', document, set);
      return operation ? [operation] : [];
    });
}

function emailOutboxOperations(emailOutboxes, now, unresolved) {
  return [...emailOutboxes]
    .sort((left, right) => idOf(left).localeCompare(idOf(right)))
    .flatMap((document) => {
      if (!idOf(document) || !text(document.eventType)
        || !text(document.idempotencyKey) || !text(document.recipient)) {
        addUnresolved(
          unresolved,
          'EmailOutbox',
          document,
          'EMAIL_IDENTITY_AMBIGUOUS',
          'Email outbox requires a row id, event type, idempotency key, and recipient',
        );
        return [];
      }
      const attemptCount = Number.isInteger(Number(document.attemptCount))
        ? Math.max(0, Number(document.attemptCount))
        : 0;
      let status = document.status || 'Pending';
      if (status === 'Failed' && attemptCount < 5) status = 'RetryScheduled';
      if (attemptCount >= 5 && status !== 'Sent') status = 'Failed';
      const set = {
        status,
        attemptCount,
        deliveryPolicyVersion: 2,
        attempts: Array.isArray(document.attempts) ? document.attempts : [],
        availableAt: normalizedDate(document.availableAt || document.createdAt, now),
      };
      const operation = updateOperation('EmailOutbox', document, set);
      return operation ? [operation] : [];
    });
}

function domainOutboxOperations(domainOutboxes, now, unresolved) {
  return [...domainOutboxes]
    .sort((left, right) => idOf(left).localeCompare(idOf(right)))
    .flatMap((document) => {
      if (Number(document.payloadSchemaVersion) === 1
        && /^[a-f0-9]{64}$/i.test(text(document.eventHash))) return [];
      const payload = document.payload && typeof document.payload === 'object'
        ? document.payload
        : {};
      const businessEventId = text(document.businessEventId
        || payload.businessEventId
        || document.identityKey);
      const recipientId = text(payload.recipientId || payload.userId);
      const recipientEmail = text(payload.recipientEmail || payload.recipient);
      const targetCollection = text(payload.targetCollection);
      const targetId = text(payload.targetId);
      let eventType;
      try {
        eventType = normalizeNotificationType(document.eventType);
      } catch (error) {
        if (!NOTIFICATION_TYPES.includes(text(document.eventType).toUpperCase())) return [];
        eventType = text(document.eventType).toUpperCase();
      }
      if (!idOf(document) || !businessEventId || (!recipientId && !recipientEmail)
        || !targetCollection || !targetId) {
        addUnresolved(
          unresolved,
          'DomainOutbox',
          document,
          'DOMAIN_OUTBOX_IDENTITY_AMBIGUOUS',
          'Notification domain outbox requires event, recipient, and target identities',
        );
        return [];
      }
      let displayValues;
      try {
        displayValues = sanitizeDisplayValues(eventType, payload.displayValues || {});
      } catch (error) {
        addUnresolved(
          unresolved,
          'DomainOutbox',
          document,
          'DOMAIN_OUTBOX_PAYLOAD_INVALID',
          error.message,
        );
        return [];
      }
      const envelope = canonicalEnvelope({
        identityKey: document.identityKey || businessEventId,
        businessEventId,
        eventType,
        aggregateType: targetCollection,
        aggregateId: targetId,
        aggregateVersion: document.aggregateVersion,
        occurredAt: document.occurredAt || document.createdAt || now,
        displayValues,
        ...(recipientId ? { recipientId } : {}),
        ...(recipientEmail ? { recipientEmail } : {}),
        targetCollection,
        targetId,
      }, () => now);
      const operation = updateOperation('DomainOutbox', document, {
        businessEventId: envelope.businessEventId,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        ...(Object.hasOwn(envelope, 'aggregateVersion')
          ? { aggregateVersion: envelope.aggregateVersion }
          : {}),
        occurredAt: envelope.occurredAt,
        payloadSchemaVersion: envelope.payloadSchemaVersion,
        payload: envelope.payload,
        eventHash: envelope.eventHash,
      });
      return operation ? [operation] : [];
    });
}

function validPaymentTimeout(value) {
  return Number.isInteger(value) && value >= 5 && value <= 60;
}

function validLowStockThreshold(value) {
  return Number.isInteger(value) && value >= 0;
}

function settingOperations(settings, settingVersions, now, unresolved) {
  const operations = [...settings]
    .filter((setting) => setting.key === 'RETURN_WINDOW_DAYS')
    .sort((left, right) => idOf(left).localeCompare(idOf(right)))
    .map((setting) => ({
      collection: 'SystemSetting',
      kind: 'delete',
      filter: snapshotPredicate(setting),
    }));
  if (settingVersions.length) return operations;

  const byKey = Object.fromEntries(settings.map((setting) => [setting.key, Number(setting.value)]));
  const values = {
    PAYMENT_TIMEOUT_MINUTES: validPaymentTimeout(byKey.PAYMENT_TIMEOUT_MINUTES)
      ? byKey.PAYMENT_TIMEOUT_MINUTES
      : SETTING_DEFAULTS.PAYMENT_TIMEOUT_MINUTES,
    LOW_STOCK_DEFAULT_THRESHOLD: validLowStockThreshold(byKey.LOW_STOCK_DEFAULT_THRESHOLD)
      ? byKey.LOW_STOCK_DEFAULT_THRESHOLD
      : SETTING_DEFAULTS.LOW_STOCK_DEFAULT_THRESHOLD,
  };
  if (!validPaymentTimeout(values.PAYMENT_TIMEOUT_MINUTES)
    || !validLowStockThreshold(values.LOW_STOCK_DEFAULT_THRESHOLD)) {
    addUnresolved(
      unresolved,
      'SystemSettingVersion',
      {},
      'SETTING_BASELINE_INVALID',
      'Canonical setting values cannot be proven',
    );
    return operations;
  }
  const reason = 'SL-009 migration baseline';
  const command = { expectedVersion: 0, reason, values };
  operations.push({
    collection: 'SystemSettingVersion',
    kind: 'insert',
    document: {
      version: 1,
      values,
      reason,
      effectiveAt: new Date(now),
      updatedBy: null,
      idempotencyKey: 'sl009-migration-baseline-v1',
      requestHash: hash(command),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  });
  return operations;
}

function summarize(operations) {
  const summary = {};
  for (const operation of operations) {
    summary[operation.collection] ||= {};
    summary[operation.collection][operation.kind] =
      (summary[operation.collection][operation.kind] || 0) + 1;
  }
  return summary;
}

function buildSl009MigrationPlan(input = {}, options = {}) {
  const now = normalizedDate(options.now, new Date());
  const unresolved = [];
  const operations = [
    ...auditOperations(input.audits || [], now, unresolved),
    ...notificationOperations(input.notifications || [], now, unresolved),
    ...emailOutboxOperations(input.emailOutboxes || [], now, unresolved),
    ...domainOutboxOperations(input.domainOutboxes || [], now, unresolved),
    ...settingOperations(
      input.settings || [],
      input.settingVersions || [],
      now,
      unresolved,
    ),
  ].sort((left, right) => {
    const collectionDifference = COLLECTION_ORDER.indexOf(left.collection)
      - COLLECTION_ORDER.indexOf(right.collection);
    if (collectionDifference) return collectionDifference;
    const leftIdentity = idOf(left.filter) || text(left.document?.idempotencyKey);
    const rightIdentity = idOf(right.filter) || text(right.document?.idempotencyKey);
    return leftIdentity.localeCompare(rightIdentity);
  });
  unresolved.sort((left, right) => (
    `${left.collection}:${left.id}:${left.code}`
      .localeCompare(`${right.collection}:${right.id}:${right.code}`)
  ));
  return {
    operations,
    unresolved,
    checksum: hash({ operations, unresolved }),
    summary: summarize(operations),
  };
}

async function runSl009Migration(input = {}, options = {}) {
  const {
    repository = createMigrationRepository(),
    dryRun = true,
    now = new Date(),
  } = input;
  const snapshot = await repository.loadSnapshot();
  const plan = buildSl009MigrationPlan(snapshot, { now, ...options });
  if (dryRun) return { ...plan, dryRun: true, applied: 0 };
  if (plan.unresolved.length) {
    const error = new Error('SL-009 migration has unresolved identities');
    error.code = 'SL009_MIGRATION_UNRESOLVED';
    error.unresolved = plan.unresolved;
    throw error;
  }
  if (!plan.operations.length) return { ...plan, dryRun: false, applied: 0 };
  await repository.applyPlan(plan);
  const verification = await verifySl009Migration(
    await repository.loadSnapshot(),
    { now, ...options },
  );
  if (!verification.valid) {
    const error = new Error('SL-009 migration verification failed');
    error.code = 'SL009_MIGRATION_VERIFY_FAILED';
    error.errors = verification.errors;
    throw error;
  }
  return {
    ...plan,
    dryRun: false,
    applied: plan.operations.length,
    verification,
  };
}

async function verifySl009Migration(input = {}, options = {}) {
  const errors = [];
  const plan = buildSl009MigrationPlan(input, options);
  for (const unresolved of plan.unresolved) errors.push(unresolved);
  if (plan.operations.length) {
    errors.push({
      collection: 'Migration',
      id: 'sl009',
      code: 'SL009_MIGRATION_INCOMPLETE',
      message: `${plan.operations.length} canonicalization operations remain`,
    });
  }

  const tuples = new Map();
  for (const notification of input.notifications || []) {
    const key = [
      text(notification.businessEventId),
      text(notification.recipientIdentity),
      text(notification.type),
      text(notification.channel),
    ].join('|');
    if (tuples.has(key)) {
      errors.push({
        collection: 'Notification',
        id: idOf(notification) || 'unknown',
        code: 'NOTIFICATION_TUPLE_DUPLICATE',
        message: `Logical Notification tuple duplicates ${tuples.get(key)}`,
      });
    } else {
      tuples.set(key, idOf(notification) || 'unknown');
    }
  }
  for (const email of input.emailOutboxes || []) {
    if (Number(email.attemptCount) >= 5 && !['Sent', 'Failed'].includes(email.status)) {
      errors.push({
        collection: 'EmailOutbox',
        id: idOf(email) || 'unknown',
        code: 'EMAIL_ATTEMPT_LIMIT_NONTERMINAL',
        message: 'Email delivery at the attempt limit must be terminal',
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

function createMigrationRepository({
  models = {
    AuditLog,
    Notification,
    EmailOutbox,
    DomainOutbox,
    SystemSetting,
    SystemSettingVersion,
  },
  sessionFactory = () => mongoose.startSession(),
} = {}) {
  const snapshotKeys = {
    AuditLog: 'audits',
    Notification: 'notifications',
    EmailOutbox: 'emailOutboxes',
    DomainOutbox: 'domainOutboxes',
    SystemSetting: 'settings',
    SystemSettingVersion: 'settingVersions',
  };
  return {
    async loadSnapshot() {
      const entries = await Promise.all(
        COLLECTION_ORDER.map(async (name) => [
          snapshotKeys[name],
          await models[name].find({}).lean(),
        ]),
      );
      return Object.fromEntries(entries);
    },
    async applyPlan(plan) {
      const session = await sessionFactory();
      try {
        await session.withTransaction(async () => {
          for (const operation of plan.operations) {
            const collection = models[operation.collection].collection;
            if (operation.kind === 'update') {
              const result = await collection.updateOne(
                operation.filter,
                operation.update,
                { session }
              );
              if (result.matchedCount !== 1) {
                throw migrationError(
                  'SL009_MIGRATION_CONCURRENT_WRITE',
                  `Concurrent write detected while updating ${operation.collection}`
                );
              }
            } else if (operation.kind === 'delete') {
              const result = await collection.deleteOne(operation.filter, { session });
              if (result.deletedCount !== 1) {
                throw migrationError(
                  'SL009_MIGRATION_CONCURRENT_WRITE',
                  `Concurrent write detected while deleting ${operation.collection}`
                );
              }
            } else if (operation.kind === 'insert') {
              const result = await collection.insertOne(operation.document, { session });
              if (!result.acknowledged || !result.insertedId) {
                throw migrationError(
                  'SL009_MIGRATION_WRITE_NOT_ACKNOWLEDGED',
                  `Insert was not acknowledged for ${operation.collection}`
                );
              }
            } else {
              throw new Error(`Unsupported SL-009 migration operation ${operation.kind}`);
            }
          }
        });
      } finally {
        await session.endSession();
      }
    },
  };
}

function migrationError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseCliArgs(argv = []) {
  const allowed = new Set(['--dry-run', '--apply', '--verify']);
  if (argv.some((argument) => !allowed.has(argument)) || argv.length > 1) {
    throw migrationError(
      'SL009_MIGRATION_CLI_ARGUMENT_INVALID',
      'Choose exactly one of --dry-run, --apply, or --verify',
    );
  }
  if (argv.includes('--apply')) return { mode: 'apply' };
  if (argv.includes('--verify')) return { mode: 'verify' };
  return { mode: 'dry-run' };
}

function formatDiagnostic(error) {
  const candidate = text(error?.code || 'SL009_MIGRATION_UNEXPECTED_ERROR');
  const code = /^[A-Z0-9_]{1,96}$/.test(candidate)
    ? candidate
    : 'SL009_MIGRATION_UNEXPECTED_ERROR';
  return `SL-009 migration failed (${code}).`;
}

async function runCli({
  argv = process.argv.slice(2),
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  repositoryFactory = createMigrationRepository,
  migrate = runSl009Migration,
  verify = verifySl009Migration,
  logger = console,
} = {}) {
  const { mode } = parseCliArgs(argv);
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect(process.env.MONGODB_URI, { mongooseClient, requireTransactions: true });
  try {
    const repository = repositoryFactory();
    if (mode === 'verify') {
      const result = await verify(await repository.loadSnapshot());
      if (!result.valid) {
        throw migrationError(
          'SL009_MIGRATION_VERIFY_FAILED',
          'SL-009 canonical data verification failed',
        );
      }
      logger.log('SL-009 migration verification completed.');
      return result;
    }
    const result = await migrate({
      repository,
      dryRun: mode !== 'apply',
    });
    logger.log(mode === 'apply'
      ? 'SL-009 migration completed.'
      : 'SL-009 migration dry run completed.');
    logger.table([{
      checksum: result.checksum,
      planned: result.operations.length,
      unresolved: result.unresolved.length,
      applied: result.applied,
    }]);
    return result;
  } finally {
    await mongooseClient.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(formatDiagnostic(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildSl009MigrationPlan,
  createMigrationRepository,
  formatDiagnostic,
  parseCliArgs,
  runSl009Migration,
  runCli,
  updateOperation,
  verifySl009Migration,
};
