const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const CustomerDeliveryReceipt = require('../models/customerDeliveryReceipt.model');
const Shipment = require('../models/shipment.model');

// The next $inc must remain an exactly representable JavaScript/Mongoose Number.
const MAX_RECEIPT_GUARD_VERSION = Number.MAX_SAFE_INTEGER - 1;
const REQUIRED_INDEXES = Object.freeze([
  Object.freeze({
    name: 'customer_receipt_command_unique',
    key: Object.freeze({ customerId: 1, idempotencyKey: 1 }),
    unique: true,
  }),
  Object.freeze({
    name: 'customer_receipt_terminal_unique',
    key: Object.freeze({ orderId: 1, outcome: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ outcome: 'RECEIVED' }),
  }),
  Object.freeze({
    name: 'customer_receipt_initial_decision_unique',
    key: Object.freeze({ orderId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ supersedesId: null }),
  }),
  Object.freeze({
    name: 'customer_receipt_history',
    key: Object.freeze({ orderId: 1, createdAt: -1 }),
  }),
  Object.freeze({
    name: 'customer_receipt_not_received_history',
    key: Object.freeze({ outcome: 1, createdAt: 1 }),
    partialFilterExpression: Object.freeze({ outcome: 'NOT_RECEIVED' }),
  }),
]);

function migrationError(code, data = null) {
  const error = new Error(code);
  error.code = code;
  if (data) error.data = data;
  return error;
}

function sameKey(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([field, direction], index) => (
      rightEntries[index]?.[0] === field && rightEntries[index]?.[1] === direction
    ));
}

function comparableOptions(source) {
  const metadata = new Set(['v', 'ns', 'key', 'name', 'background']);
  return Object.fromEntries(
    Object.entries(source || {}).flatMap(([key, value]) => {
      if (metadata.has(key) || value === undefined) return [];
      if (['unique', 'sparse', 'hidden'].includes(key) && value !== true) return [];
      return [[key, value]];
    }),
  );
}

function hasExactDefinition(index, spec) {
  return sameKey(index.key, spec.key)
    && JSON.stringify(comparableOptions(index)) === JSON.stringify(comparableOptions(spec));
}

async function countConflictGroups(collection, pipeline) {
  const rows = await collection.aggregate(
    [...pipeline, { $count: 'conflictGroups' }],
    { allowDiskUse: false },
  ).toArray();
  return Number(rows[0]?.conflictGroups || 0);
}

async function readIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

function defaultCollections() {
  return {
    receipts: CustomerDeliveryReceipt.collection,
    shipments: Shipment.collection,
  };
}

function createMigrationRepository({ collections = defaultCollections() } = {}) {
  async function inspectIndexes() {
    const existing = await readIndexes(collections.receipts);
    const missing = [];
    for (const spec of REQUIRED_INDEXES) {
      const named = existing.find((index) => index.name === spec.name);
      const samePattern = existing.filter((index) => sameKey(index.key, spec.key));
      if (
        (named && !hasExactDefinition(named, spec))
        || samePattern.some((index) => index.name !== spec.name || !hasExactDefinition(index, spec))
      ) {
        throw migrationError('CUSTOMER_DELIVERY_RECEIPT_INDEX_CONFLICT');
      }
      if (!named) missing.push(spec);
    }
    return { existing, missing };
  }

  return {
    async preflight() {
      const [
        duplicateCommandGroups,
        duplicateTerminalGroups,
        duplicateInitialGroups,
        unsafeGuardDocuments,
        shipmentsMissingGuard,
      ] = await Promise.all([
        countConflictGroups(collections.receipts, [
          {
            $group: {
              _id: {
                customerId: '$customerId',
                idempotencyKey: '$idempotencyKey',
              },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ]),
        countConflictGroups(collections.receipts, [
          { $match: { outcome: 'RECEIVED' } },
          {
            $group: {
              _id: '$orderId',
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ]),
        countConflictGroups(collections.receipts, [
          { $match: { supersedesId: null } },
          {
            $group: {
              _id: '$orderId',
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
        ]),
        countConflictGroups(collections.shipments, [
          { $match: { customerReceiptGuardVersion: { $exists: true } } },
          {
            $match: {
              $expr: {
                $not: [{
                  $switch: {
                    branches: [{
                      case: {
                        $in: [
                          { $type: '$customerReceiptGuardVersion' },
                          ['int', 'long', 'double'],
                        ],
                      },
                      then: {
                        $and: [
                          { $gte: ['$customerReceiptGuardVersion', 0] },
                          {
                            $lte: [
                              '$customerReceiptGuardVersion',
                              MAX_RECEIPT_GUARD_VERSION,
                            ],
                          },
                          {
                            $eq: [
                              '$customerReceiptGuardVersion',
                              { $trunc: '$customerReceiptGuardVersion' },
                            ],
                          },
                        ],
                      },
                    }],
                    default: false,
                  },
                }],
              },
            },
          },
          {
            $group: {
              _id: '$_id',
              count: { $sum: 1 },
            },
          },
        ]),
        collections.shipments.countDocuments({
          customerReceiptGuardVersion: { $exists: false },
        }),
      ]);

      if (duplicateCommandGroups) {
        throw migrationError('CUSTOMER_DELIVERY_RECEIPT_COMMAND_AMBIGUOUS', {
          conflictGroups: duplicateCommandGroups,
        });
      }
      if (duplicateTerminalGroups) {
        throw migrationError('CUSTOMER_DELIVERY_RECEIPT_TERMINAL_AMBIGUOUS', {
          conflictGroups: duplicateTerminalGroups,
        });
      }
      if (duplicateInitialGroups) {
        throw migrationError('CUSTOMER_DELIVERY_RECEIPT_INITIAL_AMBIGUOUS', {
          conflictGroups: duplicateInitialGroups,
        });
      }
      if (unsafeGuardDocuments) {
        throw migrationError('CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS', {
          conflictGroups: unsafeGuardDocuments,
        });
      }

      const indexPlan = await inspectIndexes();
      return {
        missingIndexes: indexPlan.missing,
        shipmentsMissingGuard,
      };
    },

    async ensureIndexes(indexes) {
      let created = 0;
      for (const spec of indexes) {
        const existing = await readIndexes(collections.receipts);
        const named = existing.find((index) => index.name === spec.name);
        if (named) {
          if (!hasExactDefinition(named, spec)) {
            throw migrationError('CUSTOMER_DELIVERY_RECEIPT_INDEX_CONFLICT');
          }
          continue;
        }
        await collections.receipts.createIndex(spec.key, {
          name: spec.name,
          ...(spec.unique ? { unique: true } : {}),
          ...(spec.partialFilterExpression
            ? { partialFilterExpression: spec.partialFilterExpression }
            : {}),
        });
        created += 1;
      }
      return created;
    },

    async verifyIndexes() {
      const plan = await inspectIndexes();
      if (plan.missing.length) throw migrationError('CUSTOMER_DELIVERY_RECEIPT_INDEX_MISSING');
      return REQUIRED_INDEXES.length;
    },
  };
}

async function migrateCustomerDeliveryReceipt({
  repository = createMigrationRepository(),
  mode = 'dry-run',
} = {}) {
  const plan = await repository.preflight();
  if (mode === 'dry-run') {
    return {
      mode,
      plannedIndexes: plan.missingIndexes.length,
      indexesCreated: 0,
      indexesVerified: 0,
      businessWrites: 0,
      legacyDeliveredReceiptBackfills: 0,
      shipmentsMissingGuard: plan.shipmentsMissingGuard,
    };
  }
  if (mode === 'verify') {
    const indexesVerified = await repository.verifyIndexes();
    return {
      mode,
      plannedIndexes: 0,
      indexesCreated: 0,
      indexesVerified,
      businessWrites: 0,
      legacyDeliveredReceiptBackfills: 0,
      shipmentsMissingGuard: plan.shipmentsMissingGuard,
    };
  }
  if (mode !== 'apply') throw migrationError('CUSTOMER_DELIVERY_RECEIPT_MODE_INVALID');

  const indexesCreated = await repository.ensureIndexes(plan.missingIndexes);
  const indexesVerified = await repository.verifyIndexes();
  return {
    mode,
    plannedIndexes: plan.missingIndexes.length,
    indexesCreated,
    indexesVerified,
    businessWrites: 0,
    legacyDeliveredReceiptBackfills: 0,
    shipmentsMissingGuard: plan.shipmentsMissingGuard,
  };
}

function parseCliArgs(argv) {
  const modes = argv.filter((argument) => ['--dry-run', '--apply', '--verify'].includes(argument));
  const unknown = argv.filter((argument) => !['--dry-run', '--apply', '--verify'].includes(argument));
  if (unknown.length || modes.length > 1) {
    throw migrationError('CUSTOMER_DELIVERY_RECEIPT_CLI_ARGUMENT_INVALID');
  }
  if (modes[0] === '--apply') return { mode: 'apply' };
  if (modes[0] === '--verify') return { mode: 'verify' };
  return { mode: 'dry-run' };
}

function formatDiagnostic(error) {
  const candidate = String(error?.code || 'CUSTOMER_DELIVERY_RECEIPT_UNEXPECTED_ERROR');
  const code = /^[A-Z0-9_]{1,120}$/u.test(candidate)
    ? candidate
    : 'CUSTOMER_DELIVERY_RECEIPT_UNEXPECTED_ERROR';
  return `Customer delivery receipt migration failed (${code}).`;
}

async function runCli({
  argv = process.argv.slice(2),
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateCustomerDeliveryReceipt,
  logger = console,
} = {}) {
  const options = parseCliArgs(argv);
  loadEnv();
  mongooseClient.set('autoIndex', false);
  mongooseClient.set('autoCreate', false);
  await connect(process.env.MONGODB_URI, { mongooseClient, requireTransactions: false });
  try {
    const result = await migrate(options);
    logger.log(`Customer delivery receipt migration ${result.mode} completed.`);
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
  MAX_RECEIPT_GUARD_VERSION,
  REQUIRED_INDEXES,
  createMigrationRepository,
  formatDiagnostic,
  migrateCustomerDeliveryReceipt,
  parseCliArgs,
  runCli,
};
