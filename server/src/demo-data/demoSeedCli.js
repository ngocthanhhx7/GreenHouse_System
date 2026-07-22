function parseSeedArgs(args = []) {
  const allowed = new Set(['--dry-run', '--reset']);
  let confirmation = '';
  let dryRun = false;
  let reset = false;

  for (const arg of args) {
    if (arg.startsWith('--confirm=')) {
      confirmation = arg.slice('--confirm='.length);
      continue;
    }
    if (!allowed.has(arg)) throw new Error(`Tham số seed không hỗ trợ: ${arg}`);
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--reset') reset = true;
  }
  if (dryRun && reset) throw new Error('Không thể dùng đồng thời --dry-run và --reset.');
  return { mode: dryRun ? 'dry-run' : reset ? 'reset' : 'upsert', confirmation };
}

async function runDemoSeedCli({
  args = process.argv.slice(2),
  workspaceRoot,
  databaseProbe,
  imagePreflight,
  env = process.env,
  logger = console,
} = {}) {
  const options = parseSeedArgs(args);
  const { DEMO_GRAPH } = require('./demoFixtures');
  const { validateDemoGraph } = require('./demoGraphValidator');
  const { preflightDemoImages } = require('./demoImageManifest');
  const preflightImages = imagePreflight || preflightDemoImages;
  const graph = validateDemoGraph(DEMO_GRAPH);

  if (options.mode === 'dry-run') {
    let assets;
    try {
      assets = { ...(await preflightImages({ workspaceRoot })), ready: true };
    } catch (error) {
      assets = { ready: false, message: error.message };
    }
    logger.log('Dry-run hợp lệ: fixture được kiểm tra hoàn toàn offline, không kết nối MongoDB.');
    logger.log(JSON.stringify({ counts: graph.counts, assets }, null, 2));
    return { mode: options.mode, graph, assets };
  }

  if (options.mode === 'reset') {
    const { assertResetAllowed, getDatabaseNameFromUri } = require('./demoSeedSafety');
    await preflightImages({ workspaceRoot });
    if (typeof databaseProbe !== 'function') {
      throw new Error('Reset chưa được bật: chưa có database probe an toàn của Phase 2.');
    }
    const requestedDatabaseName = getDatabaseNameFromUri(env.MONGODB_URI || '');
    const probe = await databaseProbe();
    if (!probe || probe.databaseName !== requestedDatabaseName) {
      throw new Error('Reset demo bị từ chối: tên database thực tế không khớp MONGODB_URI.');
    }
    if (probe.indexesReady !== true) throw new Error('Reset demo bị từ chối: tiền kiểm indexes chưa đạt.');
    assertResetAllowed({
      nodeEnv: env.NODE_ENV,
      allowReset: env.DEMO_SEED_ALLOW_RESET,
      databaseName: probe.databaseName,
      confirmation: options.confirmation,
      supportsTransactions: probe.supportsTransactions,
    });
    throw new Error('Reset đã qua toàn bộ tiền kiểm nhưng write adapter chỉ được cài ở Phase 2; chưa có thao tác xóa nào diễn ra.');
  }

  // Phase 1 deliberately exposes no write adapter. This prevents the old sparse seed
  // from mutating an unknown database before the exact disposable database is approved.
  throw new Error('Upsert chưa được bật: hãy chạy --dry-run; transaction-capable write adapter thuộc Phase 2.');
}

if (require.main === module) {
  const path = require('node:path');
  runDemoSeedCli({ workspaceRoot: path.resolve(__dirname, '../../..') }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseSeedArgs, runDemoSeedCli };
