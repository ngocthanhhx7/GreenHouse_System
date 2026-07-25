const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

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
const MONGOD_PATH = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
const MONGOD_AVAILABLE = fs.existsSync(MONGOD_PATH);

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
        if (!present || (Number.isFinite(value) && value >= 0)) continue;
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForMongoPort(child, port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Disposable mongod exited (${child.exitCode})`);
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(200);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      const unavailable = () => { socket.destroy(); resolve(false); };
      socket.once('error', unavailable);
      socket.once('timeout', unavailable);
    });
    if (connected) return;
    await delay(50);
  }
  throw new Error('Disposable mongod did not become ready');
}

async function stopMongo(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function removeVerifiedMongoDirectory(directory) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(tempRoot)
    || !path.basename(resolved).startsWith('greenhome-receipt-migration-')) {
    throw new Error(`Refusing to remove unverified Mongo directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
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

  it('keeps a disposable MongoDB 8.2 empty database collection list unchanged on dry-run', {
    skip: !MONGOD_AVAILABLE,
    timeout: 60_000,
  }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'greenhome-receipt-migration-'));
    const port = await reservePort();
    const child = spawn(MONGOD_PATH, [
      '--dbpath', directory,
      '--port', String(port),
      '--bind_ip', '127.0.0.1',
      '--quiet',
    ], {
      stdio: 'ignore',
      windowsHide: true,
    });
    const database = `greenhome_receipt_dry_run_${randomUUID().replaceAll('-', '')}`;
    const uri = `mongodb://127.0.0.1:${port}/${database}`;
    const names = async () => (
      await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()
    ).map((entry) => entry.name).sort();

    try {
      await waitForMongoPort(child, port);
      await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
      const buildInfo = await mongoose.connection.db.admin().command({ buildInfo: 1 });
      assert.match(buildInfo.version, /^8\.2\./);
      const before = await names();
      await mongoose.disconnect();

      await migration.runCli({
        argv: ['--dry-run'],
        loadEnv() {},
        mongooseClient: mongoose,
        async connect(_ignoredUri, { mongooseClient }) {
          await mongooseClient.connect(uri);
          return mongooseClient.connection;
        },
        logger: { log() {}, table() {} },
      });

      await mongoose.connect(uri, { autoCreate: false, autoIndex: false });
      const after = await names();
      assert.deepEqual(before, []);
      assert.deepEqual(after, before);
    } finally {
      await mongoose.disconnect().catch(() => {});
      await stopMongo(child);
      removeVerifiedMongoDirectory(directory);
    }
  });
});
