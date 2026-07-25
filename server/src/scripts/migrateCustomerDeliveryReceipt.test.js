const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');
const {
  cleanupDisposableMongo,
  resolveMongodBinary,
  startDisposableMongo,
} = require('../testUtils/disposableMongo');

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
const MONGOD_PATH = resolveMongodBinary();
const MONGOD_AVAILABLE = Boolean(MONGOD_PATH);

function clone(value) {
  return structuredClone(value);
}

class MemoryCollection {
  constructor(name, documents = [], indexes = [], operations = [], pipelines = []) {
    this.name = name;
    this.documents = clone(documents);
    this.indexes = clone([{ name: '_id_', key: { _id: 1 }, unique: true }, ...indexes]);
    this.operations = operations;
    this.pipelines = pipelines;
  }

  find() {
    return { toArray: async () => clone(this.documents) };
  }

  aggregate(pipeline) {
    this.pipelines.push(clone(pipeline));
    const serialized = JSON.stringify(pipeline);
    const isCommand = serialized.includes('"idempotencyKey":"$idempotencyKey"');
    const isTerminal = serialized.includes('"outcome":"RECEIVED"');
    const isInitial = serialized.includes('"supersedesId":null');
    const isUnsafeGuard = serialized.includes('"customerReceiptGuardVersion"')
      && serialized.includes('"$expr"');
    const groups = new Map();
    for (const document of this.documents) {
      if (isTerminal && document.outcome !== 'RECEIVED') continue;
      if (isInitial && document.supersedesId !== null && document.supersedesId !== undefined) continue;
      if (isUnsafeGuard) {
        const present = Object.hasOwn(document, 'customerReceiptGuardVersion');
        const value = document.customerReceiptGuardVersion;
        const intended = typeof value === 'number'
          && Number.isFinite(value)
          && Number.isInteger(value)
          && value >= 0
          && value <= Number.MAX_SAFE_INTEGER - 1;
        if (!present || intended) continue;
      }
      const identity = isCommand
        ? `${String(document.customerId || '')}\u0000${String(document.idempotencyKey || '')}`
        : isUnsafeGuard
          ? String(document._id)
          : String(document.orderId || '');
      if (!identity) continue;
      groups.set(identity, Number(groups.get(identity) || 0) + 1);
    }
    const conflictGroups = isUnsafeGuard
      ? groups.size
      : [...groups.values()].filter((count) => count > 1).length;
    return {
      toArray: async () => (conflictGroups ? [{ conflictGroups }] : []),
    };
  }

  async countDocuments(filter) {
    if (filter?.customerReceiptGuardVersion?.$exists === false) {
      return this.documents.filter(
        (document) => !Object.hasOwn(document, 'customerReceiptGuardVersion'),
      ).length;
    }
    throw new Error(`Unsupported count filter for ${this.name}`);
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
  const pipelines = [];
  return {
    operations,
    pipelines,
    collections: {
      receipts: new MemoryCollection(
        'customerdeliveryreceipts',
        receipts,
        indexes,
        operations,
        pipelines,
      ),
      shipments: new MemoryCollection('shipments', shipments, [], operations, pipelines),
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
          {
            _id: 'a',
            orderId: 'order-1',
            customerId: 'customer-1',
            idempotencyKey: 'receipt-command-a',
            outcome: 'RECEIVED',
            supersedesId: null,
          },
          {
            _id: 'b',
            orderId: 'order-1',
            customerId: 'customer-1',
            idempotencyKey: 'receipt-command-b',
            outcome: 'RECEIVED',
            supersedesId: 'a',
          },
        ],
        code: 'CUSTOMER_DELIVERY_RECEIPT_TERMINAL_AMBIGUOUS',
      },
      {
        name: 'two initial decisions',
        receipts: [
          {
            _id: 'a',
            orderId: 'order-1',
            customerId: 'customer-1',
            idempotencyKey: 'receipt-command-a',
            outcome: 'NOT_RECEIVED',
            supersedesId: null,
          },
          {
            _id: 'b',
            orderId: 'order-1',
            customerId: 'customer-1',
            idempotencyKey: 'receipt-command-b',
            outcome: 'NOT_RECEIVED',
            supersedesId: null,
          },
        ],
        code: 'CUSTOMER_DELIVERY_RECEIPT_INITIAL_AMBIGUOUS',
      },
      {
        name: 'unsafe guard type',
        shipments: [{ _id: 'shipment-1', customerReceiptGuardVersion: 'zero' }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
      },
      {
        name: 'positive infinity guard',
        shipments: [{ _id: 'shipment-1', customerReceiptGuardVersion: Number.POSITIVE_INFINITY }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
      },
      {
        name: 'negative infinity guard',
        shipments: [{ _id: 'shipment-1', customerReceiptGuardVersion: Number.NEGATIVE_INFINITY }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
      },
      {
        name: 'NaN guard',
        shipments: [{ _id: 'shipment-1', customerReceiptGuardVersion: Number.NaN }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
      },
      {
        name: 'fractional guard',
        shipments: [{ _id: 'shipment-1', customerReceiptGuardVersion: 1.5 }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
      },
      {
        name: 'increment would exceed Number.MAX_SAFE_INTEGER',
        shipments: [{
          _id: 'shipment-1',
          customerReceiptGuardVersion: Number.MAX_SAFE_INTEGER,
        }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
      },
      {
        name: 'Decimal128 guard',
        shipments: [{
          _id: 'shipment-1',
          customerReceiptGuardVersion: mongoose.Types.Decimal128.fromString('1'),
        }],
        code: 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
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

  it('accepts only finite non-negative integer guards that remain safe after one increment', async () => {
    assert.equal(migration.MAX_RECEIPT_GUARD_VERSION, Number.MAX_SAFE_INTEGER - 1);
    const data = fixture({
      shipments: [
        { _id: 'shipment-zero', customerReceiptGuardVersion: 0 },
        { _id: 'shipment-one', customerReceiptGuardVersion: 1 },
        {
          _id: 'shipment-max',
          customerReceiptGuardVersion: Number.MAX_SAFE_INTEGER - 1,
        },
      ],
    });

    const result = await migration.migrateCustomerDeliveryReceipt({
      repository: repositoryFor(data),
      mode: 'dry-run',
    });

    assert.equal(result.shipmentsMissingGuard, 0);
    assert.equal(result.businessWrites, 0);
    assert.deepEqual(data.operations, []);
    const guardPipeline = data.pipelines.find(
      (pipeline) => JSON.stringify(pipeline).includes('customerReceiptGuardVersion'),
    );
    const serialized = JSON.stringify(guardPipeline);
    assert.match(serialized, /\"int\",\"long\",\"double\"/);
    assert.match(serialized, new RegExp(String(Number.MAX_SAFE_INTEGER - 1)));
  });

  it('fails dry-run and apply before any index or business write when command identities are duplicated', async () => {
    for (const mode of ['dry-run', 'apply']) {
      const data = fixture({
        receipts: [
          {
            _id: 'receipt-a',
            orderId: 'order-1',
            customerId: 'customer-1',
            idempotencyKey: 'receipt-command-001',
            outcome: 'NOT_RECEIVED',
            supersedesId: null,
            reason: 'private customer reason A',
          },
          {
            _id: 'receipt-b',
            orderId: 'order-2',
            customerId: 'customer-1',
            idempotencyKey: 'receipt-command-001',
            outcome: 'NOT_RECEIVED',
            supersedesId: null,
            reason: 'private customer reason B',
          },
        ],
      });

      let rejected;
      await assert.rejects(
        () => migration.migrateCustomerDeliveryReceipt({
          repository: repositoryFor(data),
          mode,
        }),
        (error) => {
          rejected = error;
          return error?.code === 'CUSTOMER_DELIVERY_RECEIPT_COMMAND_AMBIGUOUS';
        },
        mode,
      );
      assert.deepEqual(rejected.data, {
        conflictGroups: 1,
      });
      assert.doesNotMatch(
        JSON.stringify(rejected),
        /receipt-command-001|private customer reason|receipt-a|receipt-b/,
      );
      assert.deepEqual(data.operations, [], `${mode} must not create indexes or write data`);
      assert.equal(data.collections.receipts.documents.length, 2);
    }
  });

  it('uses bounded server-side conflict pipelines for a large receipt history', async () => {
    const receipts = Array.from({ length: 5_000 }, (_value, index) => ({
      _id: `receipt-${index}`,
      orderId: `order-${index}`,
      customerId: `customer-${index % 100}`,
      idempotencyKey: `receipt-command-${index % 100}`,
      outcome: 'NOT_RECEIVED',
      supersedesId: index < 100 ? null : `receipt-${index - 100}`,
      reason: `private reason ${index}`,
    }));
    const data = fixture({ receipts });

    let rejected;
    await assert.rejects(
      () => migration.migrateCustomerDeliveryReceipt({
        repository: repositoryFor(data),
        mode: 'dry-run',
      }),
      (error) => {
        rejected = error;
        return error?.code === 'CUSTOMER_DELIVERY_RECEIPT_COMMAND_AMBIGUOUS';
      },
    );

    assert.deepEqual(rejected.data, { conflictGroups: 100 });
    assert.ok(data.pipelines.length >= 4);
    for (const pipeline of data.pipelines) {
      const serialized = JSON.stringify(pipeline);
      assert.doesNotMatch(serialized, /\$push|reason/);
      assert.match(serialized, /\$count/);
    }
    assert.equal(JSON.stringify(rejected).length < 240, true);
    assert.deepEqual(data.operations, []);
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
      ['set', 'autoCreate', false],
      'connect',
    ]);
    assert.deepEqual(calls[4], ['migrate', { mode: 'verify' }]);
    assert.equal(calls.at(-1), 'disconnect');
  });

  it('keeps a portable disposable MongoDB empty database unchanged and rejects unsafe BSON guards', {
    skip: MONGOD_AVAILABLE
      ? false
      : 'Disposable MongoDB skipped: no binary found via MONGOD_BINARY, PATH, or common locations',
    timeout: 60_000,
  }, async () => {
    let mongoInstance;
    const names = async () => (
      await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()
    ).map((entry) => entry.name).sort();
    const runDryRun = async (uri) => migration.runCli({
      argv: ['--dry-run'],
      loadEnv() {},
      mongooseClient: mongoose,
      async connect(_ignoredUri, { mongooseClient }) {
        await mongooseClient.connect(uri);
        return mongooseClient.connection;
      },
      logger: { log() {}, table() {} },
    });

    try {
      mongoInstance = await startDisposableMongo({ binary: MONGOD_PATH });
      const database = `greenhome_receipt_dry_run_${randomUUID().replaceAll('-', '')}`;
      const uri = `mongodb://127.0.0.1:${mongoInstance.port}/${database}`;
      await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
      const buildInfo = await mongoose.connection.db.admin().command({ buildInfo: 1 });
      assert.match(buildInfo.version, /^(?:6|7|8)\./);
      const before = await names();
      await mongoose.disconnect();

      await runDryRun(uri);

      await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
      const after = await names();
      assert.deepEqual(before, []);
      assert.deepEqual(after, before);
      await mongoose.disconnect();

      const invalidCases = [
        {
          name: 'positive infinity',
          value: Number.POSITIVE_INFINITY,
          assertPersisted(value) { assert.equal(value, Number.POSITIVE_INFINITY); },
        },
        {
          name: 'Decimal128',
          value: mongoose.Types.Decimal128.fromString('1'),
          assertPersisted(value) {
            assert.equal(value?._bsontype, 'Decimal128');
            assert.equal(value.toString(), '1');
          },
        },
      ];
      for (const row of invalidCases) {
        const caseDatabase = `greenhome_receipt_guard_${randomUUID().replaceAll('-', '')}`;
        const caseUri = `mongodb://127.0.0.1:${mongoInstance.port}/${caseDatabase}`;
        await mongoose.connect(caseUri, { autoCreate: false, autoIndex: false });
        const shipments = mongoose.connection.db.collection('shipments');
        await shipments.insertOne({
          shipmentKey: `guard-${row.name}`,
          customerReceiptGuardVersion: row.value,
        });
        const beforeNames = await names();
        await mongoose.disconnect();

        await assert.rejects(
          () => runDryRun(caseUri),
          (error) => error?.code === 'CUSTOMER_RECEIPT_GUARD_VERSION_AMBIGUOUS',
          row.name,
        );

        await mongoose.connect(caseUri, { autoCreate: false, autoIndex: false });
        const afterNames = await names();
        const persisted = await mongoose.connection.db.collection('shipments').findOne({});
        assert.deepEqual(afterNames, beforeNames);
        assert.equal(await mongoose.connection.db.collection('shipments').countDocuments({}), 1);
        row.assertPersisted(persisted.customerReceiptGuardVersion);
        await mongoose.disconnect();
      }
    } finally {
      await mongoose.disconnect().catch(() => {});
      await cleanupDisposableMongo(mongoInstance);
    }
  });
});
