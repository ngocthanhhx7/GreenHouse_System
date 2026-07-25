const mongoose = require('mongoose');
const { connectDatabase, supportsTransactions } = require('../config/database');

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

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const value = item[field] ?? 'Unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function buildScenarioMatrix(graph) {
  return {
    orders: countBy(graph.orders, 'orderStatus'),
    payments: countBy(graph.payments, 'paymentStatus'),
    stockExports: countBy(graph.stockExports, 'status'),
    returns: countBy(graph.returnRequests, 'status'),
    support: countBy(graph.supportRequests, 'status'),
    replenishments: countBy(graph.replenishments, 'status'),
    damageReports: countBy(graph.damageReports, 'status'),
    lowStockCount: graph.inventories.filter((inventory) => (
      inventory.stockQuantity - inventory.reservedQuantity <= inventory.lowStockThreshold
    )).length,
  };
}

async function runDemoSeedCli({
  args = process.argv.slice(2),
  workspaceRoot,
  databaseProbe,
  imagePreflight,
  connect,
  disconnect,
  seed,
  reset,
  env = process.env,
  logger = console,
} = {}) {
  const options = parseSeedArgs(args);
  const { DEMO_GRAPH } = require('./demoFixtures');
  const { validateDemoGraph } = require('./demoGraphValidator');
  const { preflightDemoImages } = require('./demoImageManifest');
  const { DEMO_PASSWORD, DEMO_USERS, seedDemoData } = require('../config/seedDemoData');
  const { getDatabaseNameFromUri } = require('./demoSeedSafety');
  const { loadDemoResetModels, resetDemoDatabase } = require('./demoReset');
  const preflightImages = imagePreflight || preflightDemoImages;
  const graph = validateDemoGraph(DEMO_GRAPH);
  const connectDatabaseAdapter = connect || (() => connectDatabase(env.MONGODB_URI));
  const disconnectDatabaseAdapter = disconnect || (() => mongoose.disconnect());
  const seedAdapter = seed || seedDemoData;
  const resetAdapter = reset || resetDemoDatabase;

  if (options.mode === 'dry-run') {
    let assets;
    try {
      assets = { ...(await preflightImages({ workspaceRoot })), ready: true };
    } catch (error) {
      assets = { ready: false, message: error.message };
    }
    const scenarios = buildScenarioMatrix(DEMO_GRAPH);
    logger.log('Dry-run hợp lệ: fixture được kiểm tra hoàn toàn offline, không kết nối MongoDB.');
    logger.log(JSON.stringify({ counts: graph.counts, scenarios, assets }, null, 2));
    return { mode: options.mode, graph, scenarios, assets };
  }

  if (options.mode === 'reset') {
    const { assertResetAllowed, assertStaticResetAllowed } = require('./demoSeedSafety');
    const requestedDatabaseName = getDatabaseNameFromUri(env.MONGODB_URI || '');
    assertStaticResetAllowed({
      nodeEnv: env.NODE_ENV,
      allowReset: env.DEMO_SEED_ALLOW_RESET,
      databaseName: requestedDatabaseName,
      confirmation: options.confirmation,
    });
    await preflightImages({ workspaceRoot });
    if (typeof databaseProbe !== 'function') {
      databaseProbe = createDatabaseProbe;
    }
    let connection;
    let probe;
    try {
      connection = await connectDatabaseAdapter();
      probe = await databaseProbe(connection, requestedDatabaseName);
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
      const result = await resetAdapter({
        connection,
        databaseName: probe.databaseName,
        models: loadDemoResetModels(),
      });
      logger.log(`Đã reset dữ liệu demo trên database ${probe.databaseName}.`);
      return { mode: options.mode, graph, probe, result };
    } finally {
      await disconnectDatabaseAdapter();
    }
  }

  await preflightImages({ workspaceRoot });
  let connection;
  try {
    connection = await connectDatabaseAdapter();
    const result = await seedAdapter();
    logger.log('GreenHome demo data seeded successfully.');
    logger.log(`Demo password for all accounts: ${result?.demoPassword || DEMO_PASSWORD}`);
    logger.log(`Demo accounts: ${DEMO_USERS.map((user) => user.email).join(', ')}`);
    logger.log(JSON.stringify(result, null, 2));
    return {
      mode: options.mode,
      graph,
      result,
      databaseName: connection?.db?.databaseName || getDatabaseNameFromUri(env.MONGODB_URI || ''),
    };
  } finally {
    await disconnectDatabaseAdapter();
  }
}

async function createDatabaseProbe(connection, requestedDatabaseName) {
  if (!connection?.db) {
    throw new Error('Reset demo bị từ chối: không có kết nối database thực tế.');
  }
  const actualDatabaseName = connection.db.databaseName;
  const hello = await connection.db.admin().command({ hello: 1 });
  const requiredCollections = ['users', 'products', 'inventories', 'orders', 'orderdetails'];
  const availableCollections = new Set(
    (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name),
  );
  const indexesReady = requiredCollections.every((name) => availableCollections.has(name))
    ? await Promise.all(requiredCollections.map(async (name) => {
      await connection.db.collection(name).indexes();
      return true;
    })).then((values) => values.every(Boolean))
    : true;
  return {
    databaseName: actualDatabaseName || requestedDatabaseName,
    indexesReady,
    supportsTransactions: supportsTransactions(hello),
  };
}

if (require.main === module) {
  const path = require('node:path');
  runDemoSeedCli({ workspaceRoot: path.resolve(__dirname, '../../..') }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildScenarioMatrix,
  createDatabaseProbe,
  parseSeedArgs,
  runDemoSeedCli,
};
