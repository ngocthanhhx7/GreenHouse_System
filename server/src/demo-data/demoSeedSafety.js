const FORBIDDEN_DATABASES = new Set(['admin', 'local', 'config']);
const ALLOWED_DATABASES = new Set(['greenhouse_demo', 'greenhouse_test', 'greenhouse_e2e']);

const DEMO_DELETE_ORDER = Object.freeze([
  'paymentCallbacks', 'returnItems', 'refundPendings', 'returnRequests', 'reviews',
  'supportRequests', 'notifications', 'auditLogs', 'invoices', 'inventoryTransactions',
  'stockExports', 'paymentAttempts', 'payments', 'orderDetails', 'orders', 'cartItems',
  'carts', 'damageReports', 'replenishments', 'inventories', 'products', 'categories',
  'addresses', 'systemSettings', 'users',
]);

function reject(reason) {
  throw new Error(`Reset demo bị từ chối: ${reason}`);
}

function getDatabaseNameFromUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Không đọc được tên database từ MONGODB_URI.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '').trim();
  if (!databaseName) throw new Error('MONGODB_URI phải chứa tên database rõ ràng.');
  return databaseName;
}

function assertResetAllowed({ nodeEnv, allowReset, databaseName, confirmation, supportsTransactions }) {
  const normalized = String(databaseName || '').trim();
  if (String(nodeEnv).toLowerCase() === 'production') reject('NODE_ENV=production.');
  if (allowReset !== 'true') reject('DEMO_SEED_ALLOW_RESET phải bằng true.');
  if (!normalized || FORBIDDEN_DATABASES.has(normalized.toLowerCase())) reject('database hệ thống hoặc không xác định.');
  if (!ALLOWED_DATABASES.has(normalized.toLowerCase())) reject('tên database không thuộc greenhouse_demo/greenhouse_test/greenhouse_e2e.');
  if (confirmation !== `RESET:${normalized}`) reject(`cần --confirm=RESET:${normalized}.`);
  if (supportsTransactions !== true) reject('MongoDB không hỗ trợ transaction; không được xóa từng phần.');
  return { databaseName: normalized };
}

module.exports = { assertResetAllowed, DEMO_DELETE_ORDER, getDatabaseNameFromUri };
