const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

let helper = {};
try {
  helper = require('./disposableMongo');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const {
  lookupMongodOnPath,
  removeVerifiedTempDirectory,
  resolveMongodBinary,
  startDisposableMongo,
} = helper;

describe('disposable Mongo test helper', () => {
  it('resolves explicit MONGOD_BINARY before PATH and platform fallbacks', () => {
    assert.equal(typeof resolveMongodBinary, 'function');
    let lookups = 0;
    const explicit = path.join(os.tmpdir(), 'explicit-mongod');

    const resolved = resolveMongodBinary({
      env: { MONGOD_BINARY: explicit },
      platform: 'win32',
      existsSync: (candidate) => candidate === explicit,
      lookupOnPath: () => { lookups += 1; return 'path-mongod'; },
      fallbackPaths: ['fallback-mongod'],
    });

    assert.equal(resolved, explicit);
    assert.equal(lookups, 0);
  });

  it('uses PATH before an existing platform fallback', () => {
    assert.equal(typeof resolveMongodBinary, 'function');

    const resolved = resolveMongodBinary({
      env: {},
      platform: 'linux',
      existsSync: (candidate) => candidate === '/path/mongod' || candidate === '/usr/bin/mongod',
      lookupOnPath: () => '/path/mongod',
      fallbackPaths: ['/usr/bin/mongod'],
    });

    assert.equal(resolved, '/path/mongod');
  });

  it('uses a platform fallback when explicit and PATH candidates are unavailable', () => {
    assert.equal(typeof resolveMongodBinary, 'function');

    const resolved = resolveMongodBinary({
      env: { MONGOD_BINARY: '/missing/explicit' },
      platform: 'linux',
      existsSync: (candidate) => candidate === '/usr/local/bin/mongod',
      lookupOnPath: () => '',
      fallbackPaths: ['/usr/bin/mongod', '/usr/local/bin/mongod'],
    });

    assert.equal(resolved, '/usr/local/bin/mongod');
  });

  it('uses where.exe on Windows and which on other platforms', () => {
    assert.equal(typeof lookupMongodOnPath, 'function');
    const calls = [];
    const execFileSync = (command, args) => {
      calls.push({ command, args });
      return command === 'where.exe'
        ? 'C:\\MongoDB\\mongod.exe\r\nC:\\Other\\mongod.exe\r\n'
        : '/usr/local/bin/mongod\n';
    };

    assert.equal(
      lookupMongodOnPath({ platform: 'win32', execFileSync }),
      'C:\\MongoDB\\mongod.exe'
    );
    assert.equal(
      lookupMongodOnPath({ platform: 'linux', execFileSync }),
      '/usr/local/bin/mongod'
    );
    assert.deepEqual(calls, [
      { command: 'where.exe', args: ['mongod'] },
      { command: 'which', args: ['mongod'] },
    ]);
  });

  it('retries an early address collision with a fresh owned directory and port', async () => {
    assert.equal(typeof startDisposableMongo, 'function');
    const dbPaths = ['owned-db-1', 'owned-db-2'];
    const ports = [37001, 37002];
    const children = [
      { pid: 101, exitCode: 48 },
      { pid: 102, exitCode: null },
    ];
    const spawned = [];
    const stopped = [];
    const removed = [];

    const instance = await startDisposableMongo({
      binary: 'mongod-test',
      maxAttempts: 3,
      dependencies: {
        createTempDirectory: () => dbPaths.shift(),
        reservePort: async () => ports.shift(),
        spawnProcess(binary, args) {
          const child = children.shift();
          spawned.push({ binary, args, child });
          return child;
        },
        async waitForReady({ port }) {
          if (port === 37001) throw Object.assign(new Error('address in use'), { code: 'EADDRINUSE' });
        },
        async stopProcess(child) { stopped.push(child.pid); },
        removeTempDirectory(dbPath) { removed.push(dbPath); },
      },
    });

    assert.equal(instance.child.pid, 102);
    assert.equal(instance.dbPath, 'owned-db-2');
    assert.equal(instance.port, 37002);
    assert.equal(spawned.length, 2);
    assert.ok(spawned[0].args.includes('owned-db-1'));
    assert.ok(spawned[0].args.includes('37001'));
    assert.ok(spawned[1].args.includes('owned-db-2'));
    assert.ok(spawned[1].args.includes('37002'));
    assert.deepEqual(stopped, [101]);
    assert.deepEqual(removed, ['owned-db-1']);
  });

  it('stops after the configured bounded startup attempts and cleans each owned failure', async () => {
    assert.equal(typeof startDisposableMongo, 'function');
    let attempt = 0;
    const stopped = [];
    const removed = [];

    await assert.rejects(
      startDisposableMongo({
        binary: 'mongod-test',
        maxAttempts: 2,
        dependencies: {
          createTempDirectory: () => `owned-db-${attempt + 1}`,
          reservePort: async () => 38000 + attempt,
          spawnProcess() {
            attempt += 1;
            return { pid: 200 + attempt, exitCode: 48 };
          },
          async waitForReady() { throw new Error('early startup failure'); },
          async stopProcess(child) { stopped.push(child.pid); },
          removeTempDirectory(dbPath) { removed.push(dbPath); },
        },
      }),
      /failed to start after 2 attempts/
    );

    assert.equal(attempt, 2);
    assert.deepEqual(stopped, [201, 202]);
    assert.deepEqual(removed, ['owned-db-1', 'owned-db-2']);
  });

  it('refuses to remove a directory outside the exact disposable prefix', () => {
    assert.equal(typeof removeVerifiedTempDirectory, 'function');
    const removed = [];
    const tempRoot = path.resolve(os.tmpdir());

    assert.throws(
      () => removeVerifiedTempDirectory(path.join(tempRoot, 'unrelated-data'), {
        tempRoot,
        rmSync: (target) => removed.push(target),
      }),
      /Refusing to remove unverified disposable Mongo directory/
    );
    assert.deepEqual(removed, []);
  });
});
