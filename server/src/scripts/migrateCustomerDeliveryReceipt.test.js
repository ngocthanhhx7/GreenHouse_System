const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

let migration = {};
try {
  migration = require('./migrateCustomerDeliveryReceipt');
} catch (_error) {
  // The RED phase intentionally starts before the migration exists.
}

const REQUIRED_INDEX_NAMES = [
  'customer_receipt_command_unique',
  'customer_receipt_terminal_unique',
  'customer_receipt_initial_decision_unique',
  'customer_receipt_history',
  'customer_receipt_not_received_history',
];

function clone(value) {
  return structuredClone(value);
}

class MemoryCollection {
  constructor(name, documents = [], indexes = [], operations = []) {
    this.name = name;
    this.documents = clone(documents);
    this.indexes = clone([{ name: '_id_', key: { _id: 1 }, unique: true }, ...indexes]);
    this.operations = operations;
  }

  find() {
    return { toArray: async () => clone(this.documents) };
  }

  listIndexes() {
    return { toArray: async () => clone(this.indexes) };
  }

  async createIndex(key, options) {
    this.operations.push({ type: 'createIndex', collection: this.name, key: clone(key), options: clone(options) });
    this.indexes.push({ name: options.name, key: clone(key), ...clone(options) });
    return options.name;
  }
}

function fixture({ receipts = [], shipments = [], indexes = [] } = {}) {
  const operations = [];
  return {
    operations,
    collections: {
      receipts: new MemoryCollection('customerdeliveryreceipts', receipts, indexes, operations),
      shipments: new MemoryCollection('shipments', shipments, [], operations),
    },
  };
}

function repositoryFor(value) {
  return migration.createMigrationRepository({ collections: value.collections });
}

describe('Customer delivery receipt migration', () => {
  it('exposes safe dry-run/apply/verify package commands and migration seams', () => {
    const packageJson = require('../../package.json');
    assert.equal(
      packageJson.scripts['migrate:customer-delivery-receipt'],
      'node src/scripts/migrateCustomerDeliveryReceipt.js --dry-run',
    );
    assert.equal(
      packageJson.scripts['migrate:customer-delivery-receipt:apply'],
      'node src/scripts/migrateCustomerDeliveryReceipt.js --apply',
    );
    assert.equal(
      packageJson.scripts['verify:customer-delivery-receipt'],
      'node src/scripts/migrateCustomerDeliveryReceipt.js --verify',
    );
    assert.equal(typeof migration.createMigrationRepository, 'function');
    assert.equal(typeof migration.migrateCustomerDeliveryReceipt, 'function');
    assert.equal(typeof migration.runCli, 'function');
    assert.deepEqual(migration.REQUIRED_INDEXES.map((index) => index.name), REQUIRED_INDEX_NAMES);
  });

  it('dry-runs with zero database mutation and never infers RECEIVED from a legacy Delivered order', async () => {
    const data = fixture({
      shipments: [{ _id: 'shipment-1', status: 'Delivered' }],
    });

    const result = await migration.migrateCustomerDeliveryReceipt({
      repository: repositoryFor(data),
      mode: 'dry-run',
    });

    assert.deepEqual(result, {
      mode: 'dry-run',
      plannedIndexes: 5,
      indexesCreated: 0,
      indexesVerified: 0,
      businessWrites: 0,
      legacyDeliveredReceiptBackfills: 0,
      shipmentsMissingGuard: 1,
    });
    assert.deepEqual(data.operations, []);
    assert.deepEqual(data.collections.receipts.documents, []);
  });

  it('fails closed before any mutation when receipt identities or shipment guard types are ambiguous', async () => {
    const cases = [
      {
        name: 'two terminal RECEIVED decisions',
        receipts: [
          { _id: 'a', orderId: 'order-1', outcome: 'RECEIVED', supersedesId: null },
          { _id: 'b', orderId: 'order-1', outcome: 'RECEIVED', supersedesId: 'a' },
        ],
        code: 'CUSTOMER_DELIVERY_RECEIPT_TERMINAL_AMBIGUOUS',
      },
      {
        name: 'two initial decisions',
        receipts: [
          { _id: 'a', orderId: 'order-1', outcome: 'NOT_RECEIVED', supersedesId: null },
          { _id: 'b', orderId: 'order-1', outcome: 'NOT_RECEIVED', supersedesId: null },
        ],
        code: 'CUSTOMER_DELIVERY_RECEIPT_INITIAL_AMBIGUOUS',
      },
      {
        name: 'unsafe guard type',
        shipments: [{ _id: 'shipment-1', customerReceiptGuardVersion: 'zero' }],
        code: 'CUSTOMER_DELIVERY_RECEIPT_GUARD_AMBIGUOUS',
      },
    ];

    for (const row of cases) {
      const data = fixture(row);
      await assert.rejects(
        () => migration.migrateCustomerDeliveryReceipt({ repository: repositoryFor(data), mode: 'apply' }),
        (error) => error?.code === row.code,
        row.name,
      );
      assert.deepEqual(data.operations, [], row.name);
    }
  });

  it('creates only exact repeat-safe technical indexes, verifies them, and repeats with zero business writes', async () => {
    const data = fixture({ shipments: [{ _id: 'shipment-1' }] });
    const repository = repositoryFor(data);

    const first = await migration.migrateCustomerDeliveryReceipt({ repository, mode: 'apply' });
    const firstOperations = clone(data.operations);
    const verified = await migration.migrateCustomerDeliveryReceipt({ repository, mode: 'verify' });
    const second = await migration.migrateCustomerDeliveryReceipt({ repository, mode: 'apply' });
    const secondOperations = data.operations.slice(firstOperations.length);

    assert.equal(first.indexesCreated, 5);
    assert.equal(first.businessWrites, 0);
    assert.equal(first.legacyDeliveredReceiptBackfills, 0);
    assert.equal(verified.indexesVerified, 5);
    assert.equal(second.indexesCreated, 0);
    assert.equal(second.businessWrites, 0);
    assert.deepEqual(secondOperations, []);
    assert.ok(firstOperations.every((operation) => operation.type === 'createIndex'));
  });

  it('rejects a same-key index whose semantic options or name are not exact', async () => {
    const data = fixture({
      indexes: [{
        name: 'unsafe_terminal',
        key: { orderId: 1, outcome: 1 },
        unique: true,
        partialFilterExpression: { outcome: 'NOT_RECEIVED' },
      }],
    });

    await assert.rejects(
      () => migration.migrateCustomerDeliveryReceipt({ repository: repositoryFor(data), mode: 'apply' }),
      (error) => error?.code === 'CUSTOMER_DELIVERY_RECEIPT_INDEX_CONFLICT',
    );
    assert.deepEqual(data.operations, []);
  });

  it('uses bounded diagnostics and passes the explicit mode to the CLI seam', async () => {
    const diagnostic = migration.formatDiagnostic({
      code: 'CUSTOMER_DELIVERY_RECEIPT_GUARD_AMBIGUOUS',
      message: `private reason ${'x'.repeat(1000)}`,
    });
    assert.match(diagnostic, /CUSTOMER_DELIVERY_RECEIPT_GUARD_AMBIGUOUS/);
    assert.doesNotMatch(diagnostic, /private reason/);
    assert.ok(diagnostic.length <= 180);

    const calls = [];
    await migration.runCli({
      argv: ['--verify'],
      loadEnv() { calls.push('env'); },
      mongooseClient: {
        set(...args) { calls.push(['set', ...args]); },
        async disconnect() { calls.push('disconnect'); },
      },
      async connect() { calls.push('connect'); },
      async migrate(options) { calls.push(['migrate', options]); return { mode: 'verify', indexesVerified: 5 }; },
      logger: { log(message) { calls.push(['log', message]); }, table(value) { calls.push(['table', value]); } },
    });
    assert.deepEqual(calls.slice(0, 4), [
      'env',
      ['set', 'autoIndex', false],
      'connect',
      ['migrate', { mode: 'verify' }],
    ]);
    assert.equal(calls.at(-1), 'disconnect');
  });
});
