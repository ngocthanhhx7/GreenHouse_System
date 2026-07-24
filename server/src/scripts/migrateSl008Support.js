const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const SupportRequest = require('../models/supportRequest.model');
const SupportMessage = require('../models/supportMessage.model');
const SupportHistory = require('../models/supportHistory.model');
const SupportCommand = require('../models/supportCommand.model');

const REQUEST_TYPES = new Set([
  'Order', 'Payment', 'ReturnRefund', 'Exchange', 'Product', 'Account', 'Other',
]);
const REQUEST_STATUSES = new Set(['New', 'InProgress', 'Resolved', 'Withdrawn']);
const PRIORITIES = new Set(['Low', 'Normal', 'High', 'Urgent']);

const REQUIRED_INDEXES = Object.freeze([
  Object.freeze({
    collection: 'requests',
    name: 'support_ticket_code_unique',
    key: Object.freeze({ ticketCode: 1 }),
    unique: true,
  }),
  Object.freeze({
    collection: 'requests',
    name: 'support_customer_created_page',
    key: Object.freeze({ customerId: 1, createdAt: -1, _id: -1 }),
  }),
  Object.freeze({
    collection: 'requests',
    name: 'support_queue_filter_page',
    key: Object.freeze({
      type: 1,
      status: 1,
      priority: 1,
      assigneeId: 1,
      createdAt: -1,
      _id: -1,
    }),
  }),
  Object.freeze({
    collection: 'requests',
    name: 'support_assignee_status_page',
    key: Object.freeze({ assigneeId: 1, status: 1, createdAt: -1, _id: -1 }),
  }),
  Object.freeze({
    collection: 'messages',
    name: 'support_message_chronological',
    key: Object.freeze({ ticketId: 1, createdAt: 1, _id: 1 }),
  }),
  Object.freeze({
    collection: 'messages',
    name: 'support_message_command_unique',
    key: Object.freeze({ ticketId: 1, commandId: 1 }),
    unique: true,
  }),
  Object.freeze({
    collection: 'histories',
    name: 'support_history_chronological',
    key: Object.freeze({ ticketId: 1, kind: 1, createdAt: 1, _id: 1 }),
  }),
  Object.freeze({
    collection: 'commands',
    name: 'support_command_identity_unique',
    key: Object.freeze({
      actorId: 1,
      aggregateId: 1,
      operation: 1,
      idempotencyKey: 1,
    }),
    unique: true,
  }),
]);

const OBSOLETE_INDEXES = Object.freeze([
  Object.freeze({
    collection: 'commands',
    key: Object.freeze({ actorId: 1, idempotencyKey: 1 }),
    unique: true,
  }),
]);

function migrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function valueId(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sameTimestamp(left, right) {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function sameKey(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([field, direction], index) => (
      rightEntries[index]?.[0] === field && rightEntries[index]?.[1] === direction
    ));
}

function sameIndexOptions(index, spec) {
  return sameKey(index.key, spec.key) && Boolean(index.unique) === Boolean(spec.unique);
}

async function readAll(collection) {
  return collection.find({}).toArray();
}

async function readIndexes(collection) {
  try {
    const cursor = await collection.listIndexes();
    return cursor.toArray();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

function deterministicTicketCode(ticketId) {
  const raw = valueId(ticketId).toUpperCase().replace(/[^A-Z0-9]+/gu, '-');
  const stable = raw.replace(/^TICKET-LEGACY-/u, 'TICKET-').replace(/^-|-$/gu, '');
  if (!stable) throw migrationError('SL008_SUPPORT_TICKET_CODE_AMBIGUOUS');
  return `SUP-LEGACY-${stable}`;
}

function assertUniqueTicketCodes(requests) {
  const identities = new Set();
  for (const request of requests) {
    const code = normalizedText(request.ticketCode) || deterministicTicketCode(request._id);
    if (identities.has(code)) throw migrationError('SL008_SUPPORT_TICKET_CODE_DUPLICATE');
    identities.add(code);
  }
}

function assertMessagesIndexable(messages) {
  const identities = new Set();
  for (const message of messages) {
    const ticketId = valueId(message.ticketId);
    const commandId = normalizedText(message.commandId);
    const identity = `${ticketId}\u0000${commandId}`;
    if (!ticketId || !commandId || identities.has(identity)) {
      throw migrationError('SL008_SUPPORT_MESSAGE_COMMAND_DUPLICATE');
    }
    identities.add(identity);
  }
}

function assertCommandsIndexable(commands) {
  const identities = new Set();
  for (const command of commands) {
    const fields = [
      valueId(command.actorId),
      valueId(command.aggregateId),
      normalizedText(command.operation),
      normalizedText(command.idempotencyKey),
    ];
    const identity = fields.join('\u0000');
    if (fields.some((field) => !field) || identities.has(identity)) {
      throw migrationError('SL008_SUPPORT_COMMAND_DUPLICATE');
    }
    identities.add(identity);
  }
}

function existingInitialMessage(messages, request) {
  const ticketId = valueId(request._id);
  const expectedCommand = `SL008-MIGRATION-${ticketId}-initial`;
  const migrationMessage = messages.find((message) => (
    valueId(message.ticketId) === ticketId
    && normalizedText(message.commandId) === expectedCommand
  ));
  if (migrationMessage) return migrationMessage;
  const canonicalCandidates = messages.filter((message) => (
    valueId(message.ticketId) === ticketId
    && valueId(message.actorId) === valueId(request.customerId)
    && message.actorRole === 'Customer'
    && sameTimestamp(message.createdAt, request.createdAt)
  ));
  if (canonicalCandidates.length > 1) {
    throw migrationError('SL008_SUPPORT_MESSAGE_AMBIGUOUS');
  }
  return canonicalCandidates[0];
}

function latestHistory(histories, kind) {
  return histories
    .filter((history) => history.kind === kind)
    .slice()
    .sort((left, right) => (
      Number(right.version || 0) - Number(left.version || 0)
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))[0] || null;
}

function assertHistoryProof(request, messages, histories, canonical) {
  const ticketId = valueId(request._id);
  const requestCreatedAt = new Date(request.createdAt).getTime();
  for (const history of histories) {
    const historyCreatedAt = new Date(history.createdAt).getTime();
    if (
      valueId(history.ticketId) !== ticketId
      || !Number.isInteger(history.version)
      || history.version < 1
      || history.version > canonical.version
      || Number.isNaN(historyCreatedAt)
      || historyCreatedAt < requestCreatedAt
      || (request.updatedAt && historyCreatedAt > new Date(request.updatedAt).getTime())
    ) {
      throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
    }
    if (history.kind === 'Assignment' && (
      history.version < 2
      || valueId(history.beforeAssigneeId) === valueId(history.afterAssigneeId)
    )) {
      throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
    }
    if (history.kind === 'Assignment') {
      const beforeAssigneeId = valueId(history.beforeAssigneeId);
      const afterAssigneeId = valueId(history.afterAssigneeId);
      const staffClaimOrTransfer = history.actorRole === 'Staff'
        && Boolean(afterAssigneeId)
        && beforeAssigneeId !== afterAssigneeId
        && valueId(history.actorId) === (beforeAssigneeId || afterAssigneeId);
      const systemDisabledClear = history.actorRole === 'System'
        && Boolean(beforeAssigneeId)
        && !afterAssigneeId
        && valueId(history.actorId) === beforeAssigneeId
        && history.reason === 'ASSIGNEE_DISABLED';
      if (!staffClaimOrTransfer && !systemDisabledClear) {
        throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
      }
    }
    if (history.kind === 'Priority' && (
      history.version < 2
      || history.actorRole !== 'Staff'
      || !PRIORITIES.has(history.beforePriority)
      || !PRIORITIES.has(history.afterPriority)
      || history.beforePriority === history.afterPriority
    )) {
      throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
    }
    if (history.kind === 'Resolution') {
      const resolvedShape = history.transition === 'Resolved'
        && history.actorRole === 'Staff'
        && history.beforeStatus === 'InProgress'
        && history.afterStatus === 'Resolved';
      const reopenedShape = history.transition === 'Reopened'
        && history.actorRole === 'Customer'
        && history.beforeStatus === 'Resolved'
        && history.afterStatus === 'InProgress';
      if (history.version < 2 || (!resolvedShape && !reopenedShape)) {
        throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
      }
    }
  }

  const assigneeId = valueId(canonical.assigneeId);
  const assignment = latestHistory(histories, 'Assignment');
  if (canonical.status === 'New' && assigneeId) {
    throw migrationError('SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS');
  }
  if (canonical.status === 'Withdrawn' && assigneeId) {
    throw migrationError('SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS');
  }
  if (canonical.status === 'InProgress') {
    if (canonical.version < 2
      || !assignment
      || valueId(assignment.afterAssigneeId) !== assigneeId) {
      throw migrationError('SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS');
    }
  }
  if (canonical.status === 'Withdrawn' && canonical.version < 2) {
    throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
  }
  if (canonical.status === 'Resolved') {
    if (!assigneeId
      || !assignment
      || valueId(assignment.afterAssigneeId) !== assigneeId) {
      throw migrationError('SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS');
    }
    const resolvedHistory = latestHistory(histories, 'Resolution');
    if (resolvedHistory && valueId(resolvedHistory.actorId) !== assigneeId) {
      throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
    }
  }

  if (canonical.priority !== 'Normal') {
    const priority = latestHistory(histories, 'Priority');
    if (!priority || priority.afterPriority !== canonical.priority) {
      throw migrationError('SL008_SUPPORT_PRIORITY_AMBIGUOUS');
    }
  }

  const latestResolution = latestHistory(histories, 'Resolution');
  if (canonical.status === 'InProgress' && latestResolution && (
    latestResolution.transition !== 'Reopened'
    || latestResolution.afterStatus !== 'InProgress'
  )) {
    throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
  }
  if (['New', 'Withdrawn'].includes(canonical.status) && latestResolution) {
    throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
  }

  if (canonical.status !== 'Resolved') return null;
  const resolvedAt = request.resolvedAt || request.closedAt;
  const resolution = latestResolution;
  if (
    !resolvedAt
    || !resolution
    || resolution.transition !== 'Resolved'
    || resolution.afterStatus !== 'Resolved'
    || Number(resolution.version) !== canonical.version
    || !sameTimestamp(resolution.resolvedAt, resolvedAt)
    || !resolution.reopenDeadline
    || (request.reopenDeadlineAt
      && !sameTimestamp(request.reopenDeadlineAt, resolution.reopenDeadline))
  ) {
    throw migrationError('SL008_SUPPORT_RESOLUTION_AMBIGUOUS');
  }
  const finalMessage = messages.find((message) => (
    valueId(message.ticketId) === ticketId
    && message.actorRole === 'Staff'
    && sameTimestamp(message.createdAt, resolvedAt)
    && (!assigneeId || valueId(message.actorId) === assigneeId)
  ));
  if (!finalMessage) throw migrationError('SL008_SUPPORT_RESOLUTION_AMBIGUOUS');
  return { resolvedAt, reopenDeadlineAt: resolution.reopenDeadline };
}

function canonicalRequestPlan(request, messages, histories = []) {
  const ticketId = valueId(request._id);
  const customerId = valueId(request.customerId);
  if (!ticketId || !customerId || !request.createdAt) {
    throw migrationError('SL008_SUPPORT_REQUEST_AMBIGUOUS');
  }

  const response = normalizedText(request.response);
  if (request.status === 'Open' && response) {
    throw migrationError('SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS');
  }
  if (response || (request.respondedAt && !request.resolvedAt && !request.closedAt)) {
    throw migrationError('SL008_SUPPORT_MESSAGE_AMBIGUOUS');
  }

  const legacyContent = normalizedText(request.content);
  const initial = existingInitialMessage(messages, request);
  if (initial) {
    if (
      valueId(initial.actorId) !== customerId
      || initial.actorRole !== 'Customer'
      || (Object.hasOwn(request, 'content')
        && String(initial.content ?? '') !== String(request.content ?? ''))
      || !sameTimestamp(initial.createdAt, request.createdAt)
    ) {
      throw migrationError('SL008_SUPPORT_MESSAGE_AMBIGUOUS');
    }
  } else if (!legacyContent) {
    throw migrationError('SL008_SUPPORT_MESSAGE_AMBIGUOUS');
  } else if (messages.some((message) => valueId(message.ticketId) === ticketId)) {
    throw migrationError('SL008_SUPPORT_MESSAGE_AMBIGUOUS');
  }

  const type = request.type || request.requestType;
  if (!REQUEST_TYPES.has(type)) throw migrationError('SL008_SUPPORT_TYPE_AMBIGUOUS');
  const status = request.status === 'Open' ? 'New' : request.status;
  if (!REQUEST_STATUSES.has(status)) throw migrationError('SL008_SUPPORT_STATUS_AMBIGUOUS');
  const priority = request.priority || 'Normal';
  if (!PRIORITIES.has(priority)) throw migrationError('SL008_SUPPORT_PRIORITY_AMBIGUOUS');

  const handledBy = valueId(request.handledBy);
  const assigneeId = valueId(request.assigneeId);
  if (handledBy && assigneeId && handledBy !== assigneeId) {
    throw migrationError('SL008_SUPPORT_ASSIGNMENT_AMBIGUOUS');
  }
  const set = {};
  const canonical = {
    ticketCode: normalizedText(request.ticketCode) || deterministicTicketCode(request._id),
    type,
    requestType: type,
    status,
    priority,
    version: Number.isInteger(request.version) && request.version >= 1 ? request.version : 1,
    assigneeId: request.assigneeId ?? request.handledBy ?? null,
  };
  const resolutionProof = assertHistoryProof(request, messages, histories, canonical);
  for (const [field, value] of Object.entries(canonical)) {
    if (String(request[field] ?? '') !== String(value ?? '')) set[field] = value;
  }
  if (resolutionProof) {
    if (!request.resolvedAt) set.resolvedAt = resolutionProof.resolvedAt;
    if (!request.reopenDeadlineAt) set.reopenDeadlineAt = resolutionProof.reopenDeadlineAt;
  }

  const unset = {};
  if (Object.hasOwn(request, 'content')) unset.content = '';
  if (Object.hasOwn(request, 'response')) unset.response = '';

  const requestWrite = Object.keys(set).length || Object.keys(unset).length
    ? {
      filter: {
        _id: request._id,
        ticketCode: request.ticketCode,
        content: request.content,
        response: request.response,
        updatedAt: request.updatedAt,
      },
      update: {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
    }
    : null;

  const messageWrite = initial ? null : {
    ticketId: request._id,
    actorId: request.customerId,
    actorRole: 'Customer',
    content: String(request.content),
    commandId: `SL008-MIGRATION-${ticketId}-initial`,
    createdAt: request.createdAt,
  };
  return { requestWrite, messageWrite };
}

function defaultCollections() {
  return {
    requests: SupportRequest.collection,
    messages: SupportMessage.collection,
    histories: SupportHistory.collection,
    commands: SupportCommand.collection,
  };
}

function createModelTransactionManager({ mongooseClient = mongoose } = {}) {
  return {
    async withTransaction(work) {
      const session = await mongooseClient.startSession();
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

function createMigrationRepository({
  collections = defaultCollections(),
  transactionManager = createModelTransactionManager(),
} = {}) {
  async function inspectIndexes() {
    const byCollection = {};
    for (const name of new Set(REQUIRED_INDEXES.map((spec) => spec.collection))) {
      byCollection[name] = await readIndexes(collections[name]);
    }
    const missingRequired = [];
    const legacyEquivalent = [];
    for (const spec of REQUIRED_INDEXES) {
      const indexes = byCollection[spec.collection];
      const named = indexes.find((index) => index.name === spec.name);
      if (named && !sameIndexOptions(named, spec)) {
        throw migrationError('SL008_SUPPORT_INDEX_CONFLICT');
      }
      const samePattern = indexes.filter((index) => sameKey(index.key, spec.key));
      if (samePattern.some((index) => !sameIndexOptions(index, spec))) {
        throw migrationError('SL008_SUPPORT_INDEX_CONFLICT');
      }
      if (!named) {
        missingRequired.push(spec);
        legacyEquivalent.push(...samePattern.filter((index) => index.name !== spec.name).map((index) => ({
          collection: spec.collection,
          name: index.name,
        })));
      }
    }
    for (const spec of OBSOLETE_INDEXES) {
      legacyEquivalent.push(
        ...byCollection[spec.collection]
          .filter((index) => (
            sameKey(index.key, spec.key)
            && Boolean(index.unique) === Boolean(spec.unique)
          ))
          .map((index) => ({
            collection: spec.collection,
            name: index.name,
            dropAfterCreate: true,
          })),
      );
    }
    return { missingRequired, legacyEquivalent };
  }

  return {
    async preflight() {
      const [requests, messages, histories, commands] = await Promise.all([
        readAll(collections.requests),
        readAll(collections.messages),
        readAll(collections.histories),
        readAll(collections.commands),
      ]);
      assertUniqueTicketCodes(requests);
      assertMessagesIndexable(messages);
      assertCommandsIndexable(commands);
      for (const history of histories) {
        if (!valueId(history.ticketId) || !history.kind || !history.createdAt) {
          throw migrationError('SL008_SUPPORT_HISTORY_AMBIGUOUS');
        }
      }

      const requestWrites = [];
      const messageWrites = [];
      for (const request of requests) {
        const ticketHistories = histories.filter(
          (history) => valueId(history.ticketId) === valueId(request._id),
        );
        const plan = canonicalRequestPlan(request, messages, ticketHistories);
        if (plan.requestWrite) requestWrites.push(plan.requestWrite);
        if (plan.messageWrite) messageWrites.push(plan.messageWrite);
      }
      const indexes = await inspectIndexes();
      return { requestWrites, messageWrites, ...indexes };
    },

    async applyBusinessWrites(plan) {
      return transactionManager.withTransaction(async (session) => {
        let messageWrites = 0;
        for (const message of plan.messageWrites) {
          await collections.messages.insertOne(message, { session });
          messageWrites += 1;
        }
        let requestWrites = 0;
        for (const request of plan.requestWrites) {
          const result = await collections.requests.updateOne(
            request.filter,
            request.update,
            { timestamps: false, session },
          );
          if (Number(result.modifiedCount || 0) !== 1) {
            throw migrationError('SL008_SUPPORT_CONCURRENT_CHANGE');
          }
          requestWrites += 1;
        }
        return { requestWrites, messageWrites };
      });
    },

    async ensureRequiredIndexes(plan) {
      const dropped = new Set();
      const dropIndexes = async (indexes) => {
        for (const legacy of indexes) {
          const identity = `${legacy.collection}\u0000${legacy.name}`;
          if (dropped.has(identity)) continue;
          await collections[legacy.collection].dropIndex(legacy.name);
          dropped.add(identity);
        }
      };
      await dropIndexes(plan.legacyEquivalent.filter((index) => !index.dropAfterCreate));
      let created = 0;
      for (const spec of plan.missingRequired) {
        await collections[spec.collection].createIndex(spec.key, {
          name: spec.name,
          ...(spec.unique ? { unique: true } : {}),
        });
        created += 1;
      }
      await dropIndexes(plan.legacyEquivalent.filter((index) => index.dropAfterCreate));
      return created;
    },
  };
}

async function migrateSl008Support({
  repository = createMigrationRepository(),
  dryRun = false,
} = {}) {
  const plan = await repository.preflight();
  if (dryRun) {
    return {
      dryRun: true,
      plannedRequestWrites: plan.requestWrites.length,
      plannedMessageWrites: plan.messageWrites.length,
      plannedIndexes: plan.missingRequired.length,
      requestWrites: 0,
      messageWrites: 0,
      indexesCreated: 0,
      businessWrites: 0,
    };
  }
  const writes = await repository.applyBusinessWrites(plan);
  const indexesCreated = await repository.ensureRequiredIndexes(plan);
  return {
    dryRun: false,
    plannedRequestWrites: plan.requestWrites.length,
    plannedMessageWrites: plan.messageWrites.length,
    plannedIndexes: plan.missingRequired.length,
    ...writes,
    indexesCreated,
    businessWrites: writes.requestWrites + writes.messageWrites,
  };
}

function parseCliArgs(argv) {
  const unknown = argv.filter((argument) => argument !== '--dry-run');
  if (unknown.length) throw migrationError('SL008_SUPPORT_CLI_ARGUMENT_INVALID');
  return { dryRun: argv.includes('--dry-run') };
}

function formatDiagnostic(error) {
  const candidate = String(error?.code || 'SL008_SUPPORT_UNEXPECTED_ERROR');
  const code = /^[A-Z0-9_]{1,96}$/u.test(candidate)
    ? candidate
    : 'SL008_SUPPORT_UNEXPECTED_ERROR';
  return `SL-008 Support migration failed (${code}).`;
}

async function runCli({
  argv = process.argv.slice(2),
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateSl008Support,
  logger = console,
} = {}) {
  const options = parseCliArgs(argv);
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect(process.env.MONGODB_URI, { mongooseClient, requireTransactions: true });
  try {
    const result = await migrate(options);
    logger.log(result.dryRun
      ? 'SL-008 Support migration dry run completed.'
      : 'SL-008 Support migration completed.');
    logger.table([result]);
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
  REQUIRED_INDEXES,
  createMigrationRepository,
  createModelTransactionManager,
  formatDiagnostic,
  migrateSl008Support,
  parseCliArgs,
  runCli,
};
