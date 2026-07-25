const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { it } = require('node:test');
const mongoose = require('mongoose');

const AuditLog = require('../models/auditLog.model');
const DomainOutbox = require('../models/domainOutbox.model');
const LowStockAlert = require('../models/lowStockAlert.model');
const SystemSetting = require('../models/systemSetting.model');
const SystemSettingVersion = require('../models/systemSettingVersion.model');
const { createLowStockAlertLifecycle } = require('./lowStockAlertLifecycle.service');
const { createSystemSettingService } = require('./systemSetting.service');

const MONGOD_PATH = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
const MONGOD_AVAILABLE = fs.existsSync(MONGOD_PATH);

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

async function waitForPrimary(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      if (hello.isWritablePrimary) return;
    } catch (_error) { /* replica-set election is still in progress */ }
    await delay(100);
  }
  throw new Error('Disposable MongoDB replica set did not elect a primary');
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

function removeVerifiedTempDirectory(directory) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('greenhome-settings-rs-')) {
    throw new Error(`Refusing to remove unverified Mongo directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function command(expectedVersion, reason, values = {}) {
  return {
    expectedVersion,
    reason,
    values: {
      PAYMENT_TIMEOUT_MINUTES: 20,
      LOW_STOCK_DEFAULT_THRESHOLD: 6,
      ...values,
    },
  };
}

it('AT-204 transactionally rolls back Audit/outbox failures and serializes same/different-key races', {
  timeout: 60_000,
  skip: MONGOD_AVAILABLE ? false : `Disposable MongoDB skipped: ${MONGOD_PATH} is unavailable`,
}, async () => {
  let child;
  let dbPath;
  try {
    dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'greenhome-settings-rs-'));
    const port = await reservePort();
    child = spawn(MONGOD_PATH, [
      '--dbpath', dbPath,
      '--port', String(port),
      '--bind_ip', '127.0.0.1',
      '--replSet', 'settings-rs',
      '--quiet',
      '--logpath', path.join(dbPath, 'mongod.log'),
    ], { windowsHide: true, stdio: 'ignore' });
    await waitForMongoPort(child, port);

    const database = `greenhome_settings_${randomUUID().replaceAll('-', '')}`;
    await mongoose.connect(`mongodb://127.0.0.1:${port}/${database}?directConnection=true`, {
      serverSelectionTimeoutMS: 5_000,
    });
    await mongoose.connection.db.admin().command({
      replSetInitiate: {
        _id: 'settings-rs',
        members: [{ _id: 0, host: `127.0.0.1:${port}` }],
      },
    });
    await waitForPrimary();

    await Promise.all([
      AuditLog.createCollection(),
      DomainOutbox.createCollection(),
      LowStockAlert.createCollection(),
      SystemSetting.createCollection(),
      SystemSettingVersion.createCollection(),
    ]);
    await Promise.all([
      AuditLog.syncIndexes(),
      DomainOutbox.syncIndexes(),
      LowStockAlert.syncIndexes(),
      SystemSetting.syncIndexes(),
      SystemSettingVersion.syncIndexes(),
    ]);

    const adminId = new mongoose.Types.ObjectId();
    const auditFailureService = createSystemSettingService({
      auditLogger: { async log() { throw new Error('injected audit failure'); } },
      clock: () => new Date('2026-07-25T01:00:00.000Z'),
    });
    await assert.rejects(
      () => auditFailureService.updateSettings(adminId, command(0, 'Audit rollback'), 'settings-audit-rollback', { role: 'Admin' }),
      /injected audit failure/,
    );
    assert.equal(await SystemSettingVersion.countDocuments(), 0);
    assert.equal(await SystemSetting.countDocuments(), 0);
    assert.equal(await DomainOutbox.countDocuments(), 0);

    const outboxFailureService = createSystemSettingService({
      outboxPublisher: { async publish() { throw new Error('injected outbox failure'); } },
      clock: () => new Date('2026-07-25T01:01:00.000Z'),
    });
    await assert.rejects(
      () => outboxFailureService.updateSettings(adminId, command(0, 'Outbox rollback'), 'settings-outbox-rollback', { role: 'Admin' }),
      /injected outbox failure/,
    );
    assert.equal(await SystemSettingVersion.countDocuments(), 0);
    assert.equal(await SystemSetting.countDocuments(), 0);
    assert.equal(await AuditLog.countDocuments(), 0);
    assert.equal(await DomainOutbox.countDocuments(), 0);

    const service = createSystemSettingService({
      clock: () => new Date('2026-07-25T01:02:00.000Z'),
    });
    const sameFacts = command(0, 'Same-key concurrency');
    const sameKeyResults = await Promise.all([
      service.updateSettings(adminId, sameFacts, 'settings-same-key-race', { role: 'Admin' }),
      service.updateSettings(adminId, sameFacts, 'settings-same-key-race', { role: 'Admin' }),
    ]);
    assert.equal(await SystemSettingVersion.countDocuments(), 1);
    assert.deepEqual(sameKeyResults.map((result) => result.current.version), [1, 1]);
    assert.equal(sameKeyResults.filter((result) => result.replay).length, 1);
    assert.equal(await AuditLog.countDocuments(), 1);
    assert.equal(await DomainOutbox.countDocuments(), 1);

    const differentKeyResults = await Promise.allSettled([
      service.updateSettings(adminId, command(1, 'Different-key A', { PAYMENT_TIMEOUT_MINUTES: 25 }), 'settings-different-key-a', { role: 'Admin' }),
      service.updateSettings(adminId, command(1, 'Different-key B', { PAYMENT_TIMEOUT_MINUTES: 30 }), 'settings-different-key-b', { role: 'Admin' }),
    ]);
    const fulfilled = differentKeyResults.filter((result) => result.status === 'fulfilled');
    const rejected = differentKeyResults.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.errorCode, 'SETTINGS_VERSION_STALE');
    assert.equal(rejected[0].reason.data.current.version, 2);
    assert.equal(await SystemSettingVersion.countDocuments(), 2);
    assert.equal(await AuditLog.countDocuments(), 2);
    assert.equal(await DomainOutbox.countDocuments(), 2);

    const productId = new mongoose.Types.ObjectId();
    const inventoryId = new mongoose.Types.ObjectId();
    const open = await LowStockAlert.create({
      productId,
      inventoryId,
      status: 'Open',
      availableQuantity: 9,
      effectiveThreshold: 10,
      settingVersion: 2,
      openedAt: new Date('2026-07-25T01:03:00.000Z'),
      crossingKey: 'system-settings:2',
    });
    const staleResult = await createLowStockAlertLifecycle().evaluate({
      _id: inventoryId,
      productId,
      sellableQuantity: 9,
      reservedQuantity: 0,
      inventoryHealth: 'Normal',
      lowStockThresholdOverride: null,
    }, {
      eventKey: 'system-settings:1',
      settingVersion: 1,
      globalThreshold: 4,
      replay: true,
    });
    const persistedOpen = await LowStockAlert.findById(open._id).lean();
    assert.equal(staleResult.staleSettingVersion, true);
    assert.equal(persistedOpen.status, 'Open');
    assert.equal(persistedOpen.settingVersion, 2);
    assert.equal(persistedOpen.effectiveThreshold, 10);
    assert.equal(persistedOpen.crossingKey, 'system-settings:2');
  } finally {
    await mongoose.disconnect().catch(() => {});
    await stopMongo(child);
    removeVerifiedTempDirectory(dbPath);
  }
});
