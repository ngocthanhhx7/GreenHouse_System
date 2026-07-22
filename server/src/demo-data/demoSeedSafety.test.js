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
    assert.ok(DEMO_DELETE_ORDER.indexOf('returnItems') < DEMO_DELETE_ORDER.indexOf('returnRequests'));
    assert.ok(DEMO_DELETE_ORDER.indexOf('orderDetails') < DEMO_DELETE_ORDER.indexOf('orders'));
    assert.ok(!DEMO_DELETE_ORDER.includes('roles'), 'Roles dùng chung không thuộc phạm vi xóa demo');
    assert.ok(!DEMO_DELETE_ORDER.includes('dropDatabase'));
  });
});

describe('demo product image manifest', () => {
  it('declares twenty deterministic UUID-v4 destinations and SHA-256 checksums', () => {
    const { DEMO_IMAGE_MANIFEST } = require('./demoImageManifest');
    assert.equal(DEMO_IMAGE_MANIFEST.length, 20);
    assert.equal(new Set(DEMO_IMAGE_MANIFEST.map((image) => image.sku)).size, 20);
    assert.equal(new Set(DEMO_IMAGE_MANIFEST.map((image) => image.destination)).size, 20);
    assert.ok(DEMO_IMAGE_MANIFEST.every((image) => /^\/uploads\/products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(image.destination)));
    assert.ok(DEMO_IMAGE_MANIFEST.every((image) => /^[0-9a-f]{64}$/.test(image.sha256)));
    assert.ok(DEMO_IMAGE_MANIFEST.every((image) => image.source.startsWith('server/src/assets/demo-products/')));
  });

  it('preflights count, missing files and checksums without copying assets', async () => {
    const { preflightDemoImages } = require('./demoImageManifest');
    await assert.rejects(() => preflightDemoImages({ workspaceRoot: 'Z:/definitely-missing-greenhome' }), /thiếu 20 ảnh/i);
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
    assert.match(output.join('\n'), /không kết nối MongoDB/i);
  });

  it('routes npm seed demo through the guarded CLI', () => {
    const packageJson = require('../../package.json');
    assert.equal(packageJson.scripts['seed:demo'], 'node src/demo-data/demoSeedCli.js');
  });

  it('preflights graph/assets/indexes and all reset guards before exposing a writer boundary', async () => {
    const { runDemoSeedCli } = require('./demoSeedCli');
    const calls = [];
    await assert.rejects(() => runDemoSeedCli({
      args: ['--reset', '--confirm=RESET:greenhouse_demo'],
      workspaceRoot: 'D:/fixture-root',
      env: { NODE_ENV: 'development', DEMO_SEED_ALLOW_RESET: 'true', MONGODB_URI: 'mongodb://127.0.0.1/greenhouse_demo' },
      imagePreflight: async () => { calls.push('assets'); return { valid: true, count: 20 }; },
      databaseProbe: async () => { calls.push('database'); return { databaseName: 'greenhouse_demo', supportsTransactions: true, indexesReady: true }; },
      logger: { log() {}, error() {} },
    }), /write adapter.*phase 2/i);
    assert.deepEqual(calls, ['assets', 'database']);
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
    }), /thiếu 20 ảnh/i);
    assert.equal(databaseCalls, 0);
  });
});
