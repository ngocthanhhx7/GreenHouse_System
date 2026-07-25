const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('demo seed destructive safety', () => {
  const valid = {
    nodeEnv: 'development',
    allowReset: 'true',
    databaseName: 'greenhouse_demo',
    confirmation: 'RESET:greenhouse_demo',
    supportsTransactions: true,
  };

  it('accepts only a fully confirmed disposable transaction-capable database', () => {
    const { assertResetAllowed } = require('./demoSeedSafety');
    assert.deepEqual(assertResetAllowed(valid), { databaseName: 'greenhouse_demo' });
  });

  for (const [label, override] of [
    ['production', { nodeEnv: 'production' }],
    ['missing opt-in', { allowReset: 'false' }],
    ['shared database', { databaseName: 'greenhouse' }],
    ['prefixed database', { databaseName: 'customer_greenhouse_demo', confirmation: 'RESET:customer_greenhouse_demo' }],
    ['admin database', { databaseName: 'admin', confirmation: 'RESET:admin' }],
    ['wrong confirmation', { confirmation: 'RESET:greenhouse_test' }],
    ['no transactions', { supportsTransactions: false }],
  ]) {
    it(`rejects ${label}`, () => {
      const { assertResetAllowed } = require('./demoSeedSafety');
      assert.throws(() => assertResetAllowed({ ...valid, ...override }), /reset demo bị từ chối/i);
    });
  }

  it('parses database basenames safely from MongoDB URIs', () => {
    const { getDatabaseNameFromUri } = require('./demoSeedSafety');
    assert.equal(getDatabaseNameFromUri('mongodb://127.0.0.1:27017/greenhouse_test?replicaSet=rs0'), 'greenhouse_test');
    assert.equal(getDatabaseNameFromUri('mongodb+srv://user:pass@example.test/greenhouse_e2e?retryWrites=true'), 'greenhouse_e2e');
    assert.throws(() => getDatabaseNameFromUri('mongodb://127.0.0.1:27017/'), /tên database/i);
  });

  it('never exposes a dropDatabase operation and keeps dependency-safe delete order', () => {
    const { DEMO_DELETE_ORDER } = require('./demoSeedSafety');
    assert.ok(DEMO_DELETE_ORDER.indexOf('ReturnItem') < DEMO_DELETE_ORDER.indexOf('ReturnRefundRequest'));
    assert.ok(DEMO_DELETE_ORDER.indexOf('OrderDetail') < DEMO_DELETE_ORDER.indexOf('Order'));
    assert.ok(DEMO_DELETE_ORDER.indexOf('ShipmentEvent') < DEMO_DELETE_ORDER.indexOf('Shipment'));
    assert.ok(DEMO_DELETE_ORDER.indexOf('InventoryTransaction') < DEMO_DELETE_ORDER.indexOf('Inventory'));
    assert.ok(!DEMO_DELETE_ORDER.includes('Role'), 'Roles dùng chung không thuộc phạm vi xóa demo');
    assert.ok(!DEMO_DELETE_ORDER.includes('dropDatabase'));
  });
});

describe('demo product image manifest', () => {
  it('declares fifteen deterministic UUID-v4 destinations and SHA-256 checksums', () => {
    const { DEMO_IMAGE_MANIFEST } = require('./demoImageManifest');
    assert.equal(DEMO_IMAGE_MANIFEST.length, 15);
    assert.equal(new Set(DEMO_IMAGE_MANIFEST.map((image) => image.sku)).size, 15);
    assert.equal(new Set(DEMO_IMAGE_MANIFEST.map((image) => image.destination)).size, 15);
    assert.ok(DEMO_IMAGE_MANIFEST.every((image) => /^\/uploads\/products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(image.destination)));
    assert.ok(DEMO_IMAGE_MANIFEST.every((image) => /^[0-9a-f]{64}$/.test(image.sha256)));
    assert.ok(DEMO_IMAGE_MANIFEST.every((image) => image.source.startsWith('server/src/assets/demo-products/')));
  });

  it('preflights count, missing files and checksums without copying assets', async () => {
    const { preflightDemoImages } = require('./demoImageManifest');
    await assert.rejects(() => preflightDemoImages({ workspaceRoot: 'Z:/definitely-missing-greenhome' }), /thiếu 15 ảnh/i);
  });

  it('validates WebP magic bytes and exact 1600x1200 dimensions', () => {
    const { inspectDemoWebp } = require('./demoImageManifest');
    const valid = Buffer.alloc(30);
    valid.write('RIFF', 0, 'ascii');
    valid.writeUInt32LE(22, 4);
    valid.write('WEBP', 8, 'ascii');
    valid.write('VP8X', 12, 'ascii');
    valid.writeUInt32LE(10, 16);
    valid.writeUIntLE(1599, 24, 3);
    valid.writeUIntLE(1199, 27, 3);
    assert.deepEqual(inspectDemoWebp(valid), { format: 'webp', width: 1600, height: 1200 });
    assert.throws(() => inspectDemoWebp(Buffer.from('not-webp')), /WebP/i);
    const wrongSize = Buffer.from(valid);
    wrongSize.writeUIntLE(799, 24, 3);
    assert.throws(() => inspectDemoWebp(wrongSize), /1600x1200/i);
  });
});

describe('demo seed CLI parser', () => {
  it('supports dry-run and guarded reset modes only', () => {
    const { parseSeedArgs } = require('./demoSeedCli');
    assert.deepEqual(parseSeedArgs(['--dry-run']), { mode: 'dry-run', confirmation: '' });
    assert.deepEqual(parseSeedArgs(['--reset', '--confirm=RESET:greenhouse_demo']), {
      mode: 'reset',
      confirmation: 'RESET:greenhouse_demo',
    });
    assert.deepEqual(parseSeedArgs([]), { mode: 'upsert', confirmation: '' });
    assert.throws(() => parseSeedArgs(['--reset', '--dry-run']), /không thể dùng đồng thời/i);
    assert.throws(() => parseSeedArgs(['--force']), /tham số seed không hỗ trợ/i);
  });

  it('runs dry-run entirely offline and reports graph plus pending image assets', async () => {
    const { runDemoSeedCli } = require('./demoSeedCli');
    let databaseCalls = 0;
    const output = [];
    const result = await runDemoSeedCli({
      args: ['--dry-run'],
      workspaceRoot: 'Z:/definitely-missing-greenhome',
      databaseProbe: async () => { databaseCalls += 1; },
      logger: { log: (message) => output.push(message), error: (message) => output.push(message) },
    });
    assert.equal(databaseCalls, 0);
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.graph.valid, true);
    assert.equal(result.assets.ready, false);
    assert.ok(result.scenarios.lowStockCount >= 2);
    assert.equal(result.scenarios.orders.Delivered, 8);
    assert.equal(result.scenarios.returns.AwaitingInspection, 1);
    assert.match(output.join('\n'), /"scenarios"/i);
    assert.match(output.join('\n'), /không kết nối MongoDB/i);
  });

  it('routes npm seed demo through the guarded CLI', () => {
    const packageJson = require('../../package.json');
    assert.equal(packageJson.scripts['seed:demo'], 'node src/demo-data/demoSeedCli.js');
  });

  it('preflights graph/assets/indexes and all reset guards before exposing a writer boundary', async () => {
    const { runDemoSeedCli } = require('./demoSeedCli');
    const calls = [];
    const result = await runDemoSeedCli({
      args: ['--reset', '--confirm=RESET:greenhouse_demo'],
      workspaceRoot: 'D:/fixture-root',
      env: { NODE_ENV: 'development', DEMO_SEED_ALLOW_RESET: 'true', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse_demo' },
      imagePreflight: async () => { calls.push('assets'); return { valid: true, count: 15 }; },
      databaseProbe: async () => { calls.push('database'); return { databaseName: 'greenhouse_demo', supportsTransactions: true, indexesReady: true }; },
      connect: async () => ({ db: { databaseName: 'greenhouse_demo' } }),
      disconnect: async () => {},
      reset: async () => { calls.push('reset'); },
      logger: { log() {}, error() {} },
    });
    assert.equal(result.mode, 'reset');
    assert.deepEqual(calls, ['assets', 'database', 'reset']);
  });

  it('runs the injected seed adapter in default upsert mode', async () => {
    const { runDemoSeedCli } = require('./demoSeedCli');
    let seeded = 0;
    const result = await runDemoSeedCli({
      args: [],
      env: {
        NODE_ENV: 'development',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/greenhouse_e2e?replicaSet=rs0',
      },
      imagePreflight: async () => ({ valid: true, count: 15 }),
      connect: async () => {},
      disconnect: async () => {},
      seed: async () => {
        seeded += 1;
        return { demoPassword: 'GreenHome@123' };
      },
      logger: { log() {}, error() {} },
    });
    assert.equal(seeded, 1);
    assert.equal(result.mode, 'upsert');
  });

  it('runs reset only after all disposable-target guards pass', async () => {
    const { runDemoSeedCli } = require('./demoSeedCli');
    let reset = 0;
    const result = await runDemoSeedCli({
      args: ['--reset', '--confirm=RESET:greenhouse_e2e'],
      env: {
        NODE_ENV: 'development',
        DEMO_SEED_ALLOW_RESET: 'true',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/greenhouse_e2e?replicaSet=rs0',
      },
      imagePreflight: async () => ({ valid: true, count: 15 }),
      connect: async () => ({ db: { databaseName: 'greenhouse_e2e' } }),
      disconnect: async () => {},
      databaseProbe: async () => ({
        databaseName: 'greenhouse_e2e',
        indexesReady: true,
        supportsTransactions: true,
      }),
      reset: async () => { reset += 1; },
      logger: { log() {}, error() {} },
    });
    assert.equal(reset, 1);
    assert.equal(result.mode, 'reset');
  });

  it('blocks reset before a database probe when image assets are not ready', async () => {
    const { runDemoSeedCli } = require('./demoSeedCli');
    let databaseCalls = 0;
    await assert.rejects(() => runDemoSeedCli({
      args: ['--reset', '--confirm=RESET:greenhouse_demo'],
      workspaceRoot: 'Z:/definitely-missing-greenhome',
      env: { NODE_ENV: 'development', DEMO_SEED_ALLOW_RESET: 'true', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse_demo' },
      databaseProbe: async () => { databaseCalls += 1; },
      logger: { log() {}, error() {} },
    }), /thiếu 15 ảnh/i);
    assert.equal(databaseCalls, 0);
  });

  for (const [label, env, args] of [
    ['production', { NODE_ENV: 'production', DEMO_SEED_ALLOW_RESET: 'true', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse_demo' }, ['--reset', '--confirm=RESET:greenhouse_demo']],
    ['missing opt-in', { NODE_ENV: 'development', DEMO_SEED_ALLOW_RESET: 'false', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse_demo' }, ['--reset', '--confirm=RESET:greenhouse_demo']],
    ['wrong database', { NODE_ENV: 'development', DEMO_SEED_ALLOW_RESET: 'true', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse' }, ['--reset', '--confirm=RESET:greenhouse']],
    ['wrong confirmation', { NODE_ENV: 'development', DEMO_SEED_ALLOW_RESET: 'true', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse_demo' }, ['--reset', '--confirm=RESET:greenhouse_test']],
  ]) {
    it(`applies static ${label} guard before image or database probes`, async () => {
      const { runDemoSeedCli } = require('./demoSeedCli');
      let probeCalls = 0;
      await assert.rejects(() => runDemoSeedCli({
        args, env,
        imagePreflight: async () => { probeCalls += 1; return { valid: true, count: 15 }; },
        databaseProbe: async () => { probeCalls += 1; return { databaseName: 'greenhouse_demo', supportsTransactions: true, indexesReady: true }; },
        logger: { log() {}, error() {} },
      }), /reset demo bị từ chối/i);
      assert.equal(probeCalls, 0);
    });
  }

  it('forwards the legacy direct entrypoint to the guarded CLI without calling MongoDB', () => {
    const { readFileSync } = require('node:fs');
    const path = require('node:path');
    const source = readFileSync(path.join(__dirname, '../config/seedDemoData.js'), 'utf8');
    const directBlock = source.slice(source.indexOf('if (require.main === module)'));
    assert.match(directBlock, /runDemoSeedCli/);
    assert.doesNotMatch(directBlock, /connectDatabase|seedDemoData\(/);
  });
});
