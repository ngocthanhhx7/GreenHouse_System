const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const RefundPending = require('../models/refundPending.model');
const RefundPayoutEvidence = require('../models/refundPayoutEvidence.model');
const RefundDestination = require('../models/refundDestination.model');
const { REFUND_BANK_CATALOG } = require('../config/refundBankCatalog');

const DIAGNOSTIC_LIMIT = 50;
const PAYOUT_STATUSES = Object.freeze(['NotStarted', 'Processing', 'Succeeded', 'Failed', 'Unknown']);
const PAYOUT_METHODS = Object.freeze(['PayOS', 'Manual']);
const REQUIRED_INDEXES = Object.freeze([
  Object.freeze({
    collection: 'refunds',
    name: 'refund_pending_payout_reconciliation_state',
    key: Object.freeze({ payoutStatus: 1, payoutMethod: 1, payoutStartedAt: 1 }),
  }),
  Object.freeze({
    collection: 'evidence',
    name: 'refund_payout_by_obligation_operation',
    key: Object.freeze({ refundPendingId: 1, payoutOperationKey: 1, method: 1, createdAt: -1 }),
  }),
  Object.freeze({
    collection: 'evidence',
    name: 'refund_payout_one_success_per_obligation',
    key: Object.freeze({ refundPendingId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ status: 'Succeeded' }),
  }),
]);

function migrationError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSchemaPath(model, name, instance, enumValues = []) {
  const path = model?.schema?.path(name);
  if (!path || path.instance !== instance) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_SCHEMA_MISMATCH');
  }
  if (enumValues.length) {
    const actual = [...(path.enumValues || [])].sort();
    const expected = [...enumValues].sort();
    if (!sameJson(actual, expected)) {
      throw migrationError('REFUND_PAYOUT_MIGRATION_SCHEMA_MISMATCH');
    }
  }
}

function verifyRuntimeSchema({
  refundPending = RefundPending,
  payoutEvidence = RefundPayoutEvidence,
  refundDestination = RefundDestination,
} = {}) {
  assertSchemaPath(refundPending, 'payoutStatus', 'String', PAYOUT_STATUSES);
  assertSchemaPath(refundPending, 'payoutMethod', 'String', PAYOUT_METHODS);
  assertSchemaPath(refundPending, 'payoutStartedAt', 'Date');
  assertSchemaPath(refundPending, 'payoutOperationKey', 'String');
  assertSchemaPath(payoutEvidence, 'evidenceKind', 'String', ['PAYOUT_EXECUTION', 'OPERATION_RECONCILIATION']);
  assertSchemaPath(payoutEvidence, 'reconcilesOperationKey', 'String');
  assertSchemaPath(payoutEvidence, 'payoutOperationKey', 'String');
  assertSchemaPath(refundDestination, 'bankName', 'String');
  assertSchemaPath(refundDestination, 'bankBin', 'String');
  return true;
}

function normalize(value) {
  return String(value == null ? '' : value).trim();
}

function sameJson(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function indexMatches(index, specification) {
  return sameJson(index?.key, specification.key)
    && Boolean(index?.unique) === Boolean(specification.unique)
    && sameJson(index?.partialFilterExpression, specification.partialFilterExpression);
}

async function listIndexes(collection) {
  try {
    if (typeof collection.listIndexes === 'function') return await collection.listIndexes().toArray();
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

function safeId(document) {
  return normalize(document?._id) || 'unknown';
}

function safePayoutRow(document) {
  return {
    id: safeId(document),
    status: normalize(document?.payoutStatus),
    method: normalize(document?.payoutMethod),
  };
}

function hasValidOperationKey(value) {
  return /^[A-Za-z0-9._:-]{8,160}$/.test(normalize(value));
}

function isPayoutCorrelationInvalid(document) {
  const status = normalize(document?.payoutStatus);
  const method = normalize(document?.payoutMethod);
  const operationKey = normalize(document?.payoutOperationKey);
  if (!PAYOUT_STATUSES.includes(status)) return true;
  if (['Processing', 'Unknown', 'Succeeded'].includes(status)) {
    return !PAYOUT_METHODS.includes(method) || !hasValidOperationKey(operationKey);
  }
  return Boolean(method || operationKey);
}

function isNonCanonicalBank(document) {
  // The migration never exposes or repairs the historical account details. A record is
  // only safe for the newer flow when it has a recognized code (new records) or a
  // six-digit server-owned BIN snapshot (verified historical records).
  const bankName = normalize(document?.bankName);
  const bankBin = normalize(document?.bankBin);
  return !REFUND_BANK_CATALOG.some((bank) => bank.name === bankName && bank.bin === bankBin);
}

async function boundedAggregate(collection, pipeline) {
  const rows = await collection.aggregate([
    ...pipeline,
    { $limit: DIAGNOSTIC_LIMIT },
  ]).toArray();
  return rows;
}

async function buildPreflightDiagnostics(collections) {
  const [unresolved, invalid, nonCanonicalBanks, duplicateSucceeded] = await Promise.all([
    boundedAggregate(collections.refunds, [
      { $match: { payoutStatus: { $in: ['Processing', 'Unknown'] } } },
      { $project: { _id: 1, payoutStatus: 1, payoutMethod: 1, payoutOperationKey: 1 } },
      { $sort: { _id: 1 } },
    ]),
    boundedAggregate(collections.refunds, [
      { $project: { _id: 1, payoutStatus: 1, payoutMethod: 1, payoutOperationKey: 1 } },
      { $sort: { _id: 1 } },
    ]),
    boundedAggregate(collections.destinations, [
      { $project: { _id: 1, bankName: 1, bankBin: 1, status: 1 } },
      { $sort: { _id: 1 } },
    ]),
    boundedAggregate(collections.evidence, [
      { $match: { status: 'Succeeded' } },
      { $group: { _id: '$refundPendingId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $project: { _id: 0, refundPendingId: '$_id', count: 1, ids: { $slice: ['$ids', DIAGNOSTIC_LIMIT] } } },
      { $sort: { refundPendingId: 1 } },
    ]),
  ]);

  const diagnostics = {
    unresolvedPayouts: unresolved.map(safePayoutRow),
    invalidPayoutCorrelations: invalid.filter(isPayoutCorrelationInvalid).map(safePayoutRow),
    nonCanonicalBanks: nonCanonicalBanks
      .filter(isNonCanonicalBank)
      .map((document) => ({ id: safeId(document), status: normalize(document?.status) || 'Unknown' })),
    duplicateSucceeded: duplicateSucceeded.map((document) => ({
      refundPendingId: normalize(document?.refundPendingId) || 'unknown',
      count: Number(document?.count || 0),
    })),
  };
  return diagnostics;
}

function assertSafeToApply(diagnostics) {
  if (diagnostics.invalidPayoutCorrelations.length) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_INVALID_PAYOUT_CORRELATION');
  }
  if (diagnostics.duplicateSucceeded.length) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_DUPLICATE_SUCCEEDED');
  }
}

async function ensureIndexes(collections) {
  let indexesCreated = 0;
  for (const specification of REQUIRED_INDEXES) {
    const collection = collections[specification.collection];
    const indexes = await listIndexes(collection);
    const sameNamed = indexes.find((index) => index.name === specification.name);
    if (sameNamed) {
      if (!indexMatches(sameNamed, specification)) {
        throw migrationError('REFUND_PAYOUT_MIGRATION_INDEX_MISMATCH');
      }
      continue;
    }
    const sameKey = indexes.find((index) => sameJson(index.key, specification.key));
    if (sameKey && !indexMatches(sameKey, specification)) {
      throw migrationError('REFUND_PAYOUT_MIGRATION_INDEX_MISMATCH');
    }
    await collection.createIndex(specification.key, {
      name: specification.name,
      ...(specification.unique ? { unique: true } : {}),
      ...(specification.partialFilterExpression
        ? { partialFilterExpression: specification.partialFilterExpression }
        : {}),
    });
    indexesCreated += 1;
  }
  return indexesCreated;
}

async function verifyIndexes(collections) {
  const invalidIndexes = [];
  for (const specification of REQUIRED_INDEXES) {
    const indexes = await listIndexes(collections[specification.collection]);
    const named = indexes.find((index) => index.name === specification.name);
    if (!indexMatches(named, specification)) invalidIndexes.push(specification.name);
  }
  return invalidIndexes;
}

function defaultCollections() {
  return {
    refunds: RefundPending.collection,
    evidence: RefundPayoutEvidence.collection,
    destinations: RefundDestination.collection,
  };
}

async function runMigration({ collections = defaultCollections(), mode = 'dry-run' } = {}) {
  if (!['preflight', 'dry-run', 'apply', 'verify'].includes(mode)) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_MODE_INVALID');
  }
  if (!collections?.refunds || !collections?.evidence || !collections?.destinations) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_COLLECTIONS_REQUIRED');
  }

  const diagnostics = await buildPreflightDiagnostics(collections);
  if (mode === 'preflight' || mode === 'dry-run') {
    return { mode, diagnostics, businessWrites: 0, indexesCreated: 0 };
  }

  if (mode === 'apply') {
    assertSafeToApply(diagnostics);
    const indexesCreated = await ensureIndexes(collections);
    const invalidIndexes = await verifyIndexes(collections);
    if (invalidIndexes.length) throw migrationError('REFUND_PAYOUT_MIGRATION_VERIFY_FAILED');
    return { mode, diagnostics, businessWrites: 0, indexesCreated };
  }

  const invalidIndexes = await verifyIndexes(collections);
  if (invalidIndexes.length || diagnostics.invalidPayoutCorrelations.length || diagnostics.duplicateSucceeded.length) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_VERIFY_FAILED');
  }
  return { mode, diagnostics, businessWrites: 0, indexesCreated: 0, valid: true };
}

function parseCliArgs(argv = []) {
  const allowed = new Set(['--preflight', '--dry-run', '--apply', '--verify']);
  if (argv.some((argument) => !allowed.has(argument)) || argv.length > 1) {
    throw migrationError('REFUND_PAYOUT_MIGRATION_CLI_ARGUMENT_INVALID', 'Choose exactly one migration mode');
  }
  const argument = argv[0] || '--dry-run';
  return { mode: argument.slice(2) };
}

function formatDiagnostic(error) {
  const code = /^[A-Z0-9_]{1,96}$/.test(normalize(error?.code))
    ? error.code
    : 'REFUND_PAYOUT_MIGRATION_UNEXPECTED';
  return `Refund payout reconciliation migration failed (${code}).`;
}

async function runCli({
  argv = process.argv.slice(2),
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = runMigration,
  logger = console,
} = {}) {
  const { mode } = parseCliArgs(argv);
  loadEnv();
  // Migrations own indexes explicitly. This also guarantees a dry run cannot
  // create collections or indexes as a Mongoose side effect.
  mongooseClient.set('autoIndex', false);
  mongooseClient.set('autoCreate', false);
  verifyRuntimeSchema();
  await connect(process.env.MONGODB_URI, { mongooseClient, requireTransactions: false });
  try {
    const result = await migrate({ mode });
    logger.log(`Refund payout reconciliation ${mode} completed.`);
    logger.table([{
      mode: result.mode,
      indexesCreated: result.indexesCreated,
      unresolvedPayouts: result.diagnostics.unresolvedPayouts.length,
      invalidPayoutCorrelations: result.diagnostics.invalidPayoutCorrelations.length,
      nonCanonicalBanks: result.diagnostics.nonCanonicalBanks.length,
      duplicateSucceeded: result.diagnostics.duplicateSucceeded.length,
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
  DIAGNOSTIC_LIMIT,
  REQUIRED_INDEXES,
  buildPreflightDiagnostics,
  formatDiagnostic,
  indexMatches,
  parseCliArgs,
  runCli,
  runMigration,
  verifyRuntimeSchema,
};
