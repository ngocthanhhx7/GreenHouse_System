const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');

function clean(value) {
  return String(value || '').trim();
}

function analyzeLegacyUsers(users = []) {
  const conflictingPhones = [];
  const unstructuredAddresses = [];
  const missingPhones = [];
  const migratableUsers = [];
  for (const user of users) {
    const phone = clean(user.phone);
    const phoneNumber = clean(user.phoneNumber);
    const id = String(user._id);
    if (phone && phoneNumber && phone !== phoneNumber) {
      conflictingPhones.push({ id, phone, phoneNumber });
    }
    if (clean(user.address)) {
      unstructuredAddresses.push({ id });
    }
    if (!phone && !phoneNumber) {
      missingPhones.push({ id });
    }
    if ((!phone || !phoneNumber || phone === phoneNumber) && !clean(user.address)) {
      migratableUsers.push({ id, phoneNumber: phoneNumber || phone });
    }
  }
  const unresolvedUsers = [...new Set([
    ...conflictingPhones.map((item) => item.id),
    ...unstructuredAddresses.map((item) => item.id),
    ...missingPhones.map((item) => item.id),
  ])];
  return {
    conflictingPhones,
    unstructuredAddresses,
    missingPhones,
    migratableUsers: migratableUsers.filter((item) => item.phoneNumber),
    unresolvedUsers,
  };
}

function createMongoRepository(connection = mongoose.connection) {
  const users = connection.collection('users');
  return {
    async listUsers() {
      return users.find(
        { $or: [{ phone: { $exists: true } }, { address: { $exists: true } }, { phoneNumber: { $exists: true } }] },
        { projection: { phone: 1, phoneNumber: 1, address: 1 } }
      ).toArray();
    },
    async applyUserMigration(id, changes) {
      const result = await users.updateOne(
        { _id: new mongoose.Types.ObjectId(id), $or: [{ phone: { $exists: true } }, { address: { $exists: true } }] },
        { $set: changes.$set, $unset: changes.$unset }
      );
      return result.modifiedCount;
    },
    async ensureIndexes() {
      const definitions = [
        ['users', { roleId: 1, status: 1, version: 1 }, { name: 'sl007_user_role_status_version' }],
        ['usersessions', { selectorHash: 1 }, { name: 'sl007_session_selector_hash_unique', unique: true }],
        ['loginattempts', { kind: 1, key: 1, createdAt: -1 }, { name: 'sl007_login_attempt_window' }],
        ['useraddresses', { userId: 1, version: 1 }, { name: 'sl007_address_owner_version' }],
      ];
      const created = [];
      for (const [collectionName, key, options] of definitions) {
        const collection = connection.collection(collectionName);
        const existing = await collection.indexes().catch((error) => {
          if (error?.codeName === 'NamespaceNotFound') return [];
          throw error;
        });
        if (!existing.some((index) => index.name === options.name)) {
          await collection.createIndex(key, options);
          created.push(options.name);
        }
      }
      return created;
    },
  };
}

async function runAccountAuthMigration({ repository, dryRun = true } = {}) {
  if (!repository) throw new Error('repository is required');
  const users = await repository.listUsers();
  const report = analyzeLegacyUsers(users);
  const result = { ...report, dryRun, appliedUsers: 0, createdIndexes: [] };
  if (dryRun || report.unresolvedUsers.length) return result;
  for (const item of report.migratableUsers) {
    const modified = await repository.applyUserMigration(item.id, {
      $set: { phoneNumber: item.phoneNumber, version: 0 },
      $unset: { phone: '', address: '' },
    });
    if (modified !== 0) result.appliedUsers += 1;
  }
  result.createdIndexes = await repository.ensureIndexes();
  return result;
}

async function runCli({ argv = process.argv.slice(2), logger = console } = {}) {
  const dryRun = argv.includes('--dry-run');
  await connectDatabase();
  try {
    const result = await runAccountAuthMigration({
      repository: createMongoRepository(),
      dryRun,
    });
    logger.log(JSON.stringify(result, null, 2));
    if (!dryRun && result.unresolvedUsers.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('SL-007 account migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  analyzeLegacyUsers,
  createMongoRepository,
  runAccountAuthMigration,
  runCli,
};
