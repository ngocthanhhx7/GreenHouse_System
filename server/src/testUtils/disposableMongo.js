const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const TEMP_DIRECTORY_PREFIX = 'greenhome-email-outbox-';
const DEFAULT_START_ATTEMPTS = 3;
const MAX_START_ATTEMPTS = 5;
const COMMON_MONGOD_PATHS = Object.freeze({
  win32: [
    'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
  ],
  darwin: [
    '/opt/homebrew/bin/mongod',
    '/usr/local/bin/mongod',
  ],
  linux: [
    '/usr/bin/mongod',
    '/usr/local/bin/mongod',
    '/snap/bin/mongod',
  ],
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lookupMongodOnPath({
  platform = process.platform,
  execFileSync: run = execFileSync,
} = {}) {
  const command = platform === 'win32' ? 'where.exe' : 'which';
  try {
    const output = run(command, ['mongod'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output || '')
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .find(Boolean) || '';
  } catch {
    return '';
  }
}

function resolveMongodBinary({
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
  lookupOnPath = (options) => lookupMongodOnPath(options),
  fallbackPaths = COMMON_MONGOD_PATHS[platform] || [],
} = {}) {
  const explicit = String(env.MONGOD_BINARY || '').trim();
  if (explicit && existsSync(explicit)) return explicit;

  const pathCandidate = lookupOnPath({ platform });
  if (pathCandidate && existsSync(pathCandidate)) return pathCandidate;

  return fallbackPaths.find((candidate) => existsSync(candidate)) || '';
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  return port;
}

function readLog(logPath) {
  try {
    return fs.readFileSync(logPath, 'utf8');
  } catch {
    return '';
  }
}

async function waitForMongoReady({ child, logPath, timeoutMs = 15_000 }) {
  let spawnError;
  child.once('error', (error) => { spawnError = error; });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    const log = readLog(logPath);
    if (/waiting for connections/i.test(log)) return;
    if (child.exitCode !== null) {
      const error = new Error(`Disposable mongod exited before readiness (${child.exitCode})`);
      if (/address already in use|eaddrinuse|socket.*listen/i.test(log)) error.code = 'EADDRINUSE';
      throw error;
    }
    await delay(50);
  }
  throw new Error('Disposable mongod did not become ready within 15 seconds');
}

function signalAndWaitForExit(child, signal, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (result) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(result);
    };
    const onExit = () => finish(true);
    child.once('exit', onExit);
    timer = setTimeout(() => finish(child.exitCode !== null), timeoutMs);
    try {
      if (!child.kill(signal) && child.exitCode === null) finish(false);
    } catch (error) {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      reject(error);
    }
  });
}

async function stopSpawnedMongo(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (await signalAndWaitForExit(child, 'SIGTERM', 5_000)) return;
  if (await signalAndWaitForExit(child, 'SIGKILL', 2_000)) return;
  throw new Error(`Disposable mongod process ${child.pid} did not stop`);
}

function removeVerifiedTempDirectory(directory, {
  tempRoot = os.tmpdir(),
  rmSync = fs.rmSync,
} = {}) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const resolvedTempRoot = path.resolve(tempRoot);
  if (path.dirname(resolved) !== resolvedTempRoot
      || !path.basename(resolved).startsWith(TEMP_DIRECTORY_PREFIX)) {
    throw new Error(`Refusing to remove unverified disposable Mongo directory: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}

function createTempDirectory(tempRoot = os.tmpdir()) {
  return fs.mkdtempSync(path.join(tempRoot, TEMP_DIRECTORY_PREFIX));
}

async function startDisposableMongo({
  binary,
  maxAttempts = DEFAULT_START_ATTEMPTS,
  tempRoot = os.tmpdir(),
  dependencies = {},
} = {}) {
  if (!binary) throw new Error('Disposable mongod binary is required');
  const attempts = Math.max(1, Math.min(MAX_START_ATTEMPTS, Number(maxAttempts) || 1));
  const createOwnedTempDirectory = dependencies.createTempDirectory
    || (() => createTempDirectory(tempRoot));
  const reserveOwnedPort = dependencies.reservePort || reservePort;
  const spawnProcess = dependencies.spawnProcess || spawn;
  const waitForReady = dependencies.waitForReady || waitForMongoReady;
  const stopProcess = dependencies.stopProcess || stopSpawnedMongo;
  const removeTempDirectory = dependencies.removeTempDirectory
    || ((dbPath) => removeVerifiedTempDirectory(dbPath, { tempRoot }));
  const failures = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let child;
    let dbPath;
    try {
      dbPath = createOwnedTempDirectory();
      const port = await reserveOwnedPort();
      const logPath = path.join(dbPath, 'mongod.log');
      const args = [
        '--dbpath', dbPath,
        '--port', String(port),
        '--bind_ip', '127.0.0.1',
        '--quiet',
        '--logpath', logPath,
      ];
      child = spawnProcess(binary, args, {
        windowsHide: true,
        stdio: 'ignore',
      });
      await waitForReady({ child, port, logPath });
      return { child, dbPath, port, logPath };
    } catch (error) {
      failures.push(error);
      try {
        await stopProcess(child);
      } catch (cleanupError) {
        throw new Error('Disposable mongod failed to stop after startup failure', {
          cause: cleanupError,
        });
      }
      if (dbPath) removeTempDirectory(dbPath);
    }
  }

  const lastFailure = failures.at(-1);
  throw new Error(
    `Disposable mongod failed to start after ${attempts} attempts: ${lastFailure?.message || 'unknown error'}`,
    { cause: lastFailure }
  );
}

async function cleanupDisposableMongo(instance, { tempRoot = os.tmpdir() } = {}) {
  if (!instance) return;
  await stopSpawnedMongo(instance.child);
  removeVerifiedTempDirectory(instance.dbPath, { tempRoot });
}

module.exports = {
  TEMP_DIRECTORY_PREFIX,
  cleanupDisposableMongo,
  lookupMongodOnPath,
  removeVerifiedTempDirectory,
  reservePort,
  resolveMongodBinary,
  startDisposableMongo,
  stopSpawnedMongo,
  waitForMongoReady,
};
