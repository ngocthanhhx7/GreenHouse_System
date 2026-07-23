const mongoose = require('mongoose');

function supportsTransactions(hello = {}) {
  return Boolean(hello.setName || hello.msg === 'isdbgrid');
}

async function assertTransactionSupport(connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (supportsTransactions(hello)) return hello;

  const error = new Error(
    'MongoDB phải chạy ở chế độ replica set (ví dụ rs0) hoặc mongos để hỗ trợ transaction. '
    + 'Hãy cấu hình replica set và thêm ?replicaSet=rs0 vào MONGODB_URI.'
  );
  error.code = 'DATABASE_TRANSACTIONS_UNSUPPORTED';
  throw error;
}

async function connectDatabase(
  uri = process.env.MONGODB_URI,
  { mongooseClient = mongoose, requireTransactions = true } = {}
) {
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }
  await mongooseClient.connect(uri);
  if (!requireTransactions) return mongooseClient.connection;

  try {
    await assertTransactionSupport(mongooseClient.connection);
    return mongooseClient.connection;
  } catch (error) {
    await mongooseClient.disconnect();
    throw error;
  }
}

module.exports = {
  assertTransactionSupport,
  connectDatabase,
  supportsTransactions,
};
