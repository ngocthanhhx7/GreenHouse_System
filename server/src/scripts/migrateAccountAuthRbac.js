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
      migratableUsers.push({
        id,
        phoneNumber: phoneNumber || phone,
        version: user.version,
        credentialVersion: user.credentialVersion,
      });
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

const SL007_INDEX_DEFINITIONS = [
  {
    collectionName: 'users',
    key: { roleId: 1, status: 1, version: 1 },
    options: { name: 'sl007_user_role_status_version' },
  },
  {
    collectionName: 'usersessions',
    key: { selectorHash: 1 },
    options: { name: 'sl007_session_selector_hash_unique', unique: true },
  },
  {
    collectionName: 'usersessions',
    key: { userId: 1, revokedAt: 1, absoluteExpiresAt: 1 },
    options: { name: 'sl007_user_active_sessions' },
  },
  {
    collectionName: 'loginattempts',
    key: { kind: 1, key: 1, createdAt: -1 },
    options: { name: 'sl007_login_attempt_window' },
  },
  {
    collectionName: 'loginattempts',
    key: { createdAt: 1 },
    options: {
      name: 'sl007_login_attempt_ttl',
      expireAfterSeconds: 1800,
    },
  },
  {
    collectionName: 'useraddresses',
    key: { userId: 1, createdAt: -1 },
    options: { name: 'sl007_address_owner_created' },
  },
  {
    collectionName: 'useraddresses',
    key: { userId: 1, isDefault: 1 },
    options: {
      name: 'one_default_address_per_user',
      unique: true,
      partialFilterExpression: { isDefault: true },
    },
  },
  {
    collectionName: 'registrationchallenges',
    key: { email: 1, createdAt: -1 },
    options: { name: 'sl007_registration_latest_identity' },
  },
  {
    collectionName: 'registrationchallenges',
    key: { expiresAt: 1 },
    options: {
      name: 'sl007_registration_expiry',
      expireAfterSeconds: 0,
    },
  },
  {
    collectionName: 'registrationchallenges',
    key: { email: 1, idempotencyKey: 1 },
    options: {
      name: 'sl007_registration_idempotency',
      unique: true,
    },
  },
  {
    collectionName: 'registrationchallenges',
    key: { email: 1 },
    options: {
      name: 'sl007_registration_single_live_identity',
      unique: true,
      partialFilterExpression: { state: 'PendingVerification' },
    },
  },
  {
    collectionName: 'internalinvitations',
    key: { email: 1, createdAt: -1 },
    options: { name: 'sl007_invitation_latest_identity' },
  },
  {
    collectionName: 'internalinvitations',
    key: { expiresAt: 1 },
    options: {
      name: 'sl007_invitation_expiry',
      expireAfterSeconds: 0,
    },
  },
  {
    collectionName: 'internalinvitations',
    key: { email: 1, idempotencyKey: 1 },
    options: {
      name: 'sl007_invitation_idempotency',
      unique: true,
    },
  },
  {
    collectionName: 'internalinvitations',
    key: { email: 1 },
    options: {
      name: 'sl007_invitation_single_live_identity',
      unique: true,
      partialFilterExpression: { state: 'PendingAcceptance' },
    },
  },
  {
    collectionName: 'loginthrottlebuckets',
    key: { expiresAt: 1 },
    options: {
      name: 'sl007_login_throttle_bucket_ttl',
      expireAfterSeconds: 0,
    },
  },
];

function createMongoRepository(connection = mongoose.connection) {
  const users = connection.collection('users');
  return {
    async listUsers() {
      return users.find(
        {},
        {
          projection: {
            phone: 1,
            phoneNumber: 1,
            address: 1,
            version: 1,
            credentialVersion: 1,
          },
        }
      ).toArray();
    },
    async applyUserMigration(id, changes) {
      const result = await users.updateOne(
        {
          _id: new mongoose.Types.ObjectId(id),
          $or: [
            { phone: { $exists: true } },
            { address: { $exists: true } },
            { version: { $exists: false } },
            { credentialVersion: { $exists: false } },
          ],
        },
        { $set: changes.$set, $unset: changes.$unset }
      );
      return result.modifiedCount;
    },
    async listUserSessionsForCredentialBackfill() {
      return connection.collection('usersessions').find(
        { credentialVersionAtCreation: { $exists: false } },
        { projection: { _id: 1 } }
      ).toArray();
    },
    async applyUserSessionCredentialBackfill(id) {
      const result = await connection.collection('usersessions').updateOne(
        {
          _id: new mongoose.Types.ObjectId(id),
          credentialVersionAtCreation: { $exists: false },
        },
        { $set: { credentialVersionAtCreation: 0 } }
      );
      return result.modifiedCount;
    },
    async findIndexConflicts() {
      const checks = [
        {
          collectionName: 'usersessions',
          indexName: 'sl007_session_selector_hash_unique',
          pipeline: [
            { $match: { selectorHash: { $type: 'string', $gt: '' } } },
            { $group: { _id: { selectorHash: '$selectorHash' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
          ],
        },
        {
          collectionName: 'registrationchallenges',
          indexName: 'sl007_registration_idempotency',
          pipeline: [
            { $match: { idempotencyKey: { $type: 'string', $gt: '' } } },
            {
              $group: {
                _id: { email: '$email', idempotencyKey: '$idempotencyKey' },
                count: { $sum: 1 },
              },
            },
            { $match: { count: { $gt: 1 } } },
          ],
        },
        {
          collectionName: 'registrationchallenges',
          indexName: 'sl007_registration_single_live_identity',
          pipeline: [
            {
              $match: {
                state: 'PendingVerification',
                email: { $type: 'string', $gt: '' },
              },
            },
            { $group: { _id: { email: '$email' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
          ],
        },
        {
          collectionName: 'internalinvitations',
          indexName: 'sl007_invitation_idempotency',
          pipeline: [
            { $match: { idempotencyKey: { $type: 'string', $gt: '' } } },
            {
              $group: {
                _id: { email: '$email', idempotencyKey: '$idempotencyKey' },
                count: { $sum: 1 },
              },
            },
            { $match: { count: { $gt: 1 } } },
          ],
        },
        {
          collectionName: 'internalinvitations',
          indexName: 'sl007_invitation_single_live_identity',
          pipeline: [
            {
              $match: {
                state: 'PendingAcceptance',
                email: { $type: 'string', $gt: '' },
              },
            },
            { $group: { _id: { email: '$email' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
          ],
        },
        {
          collectionName: 'useraddresses',
          indexName: 'one_default_address_per_user',
          pipeline: [
            { $match: { isDefault: true } },
            { $group: { _id: { userId: '$userId' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
          ],
        },
      ];
      const conflicts = [];
      for (const check of checks) {
        let duplicates;
        try {
          duplicates = await connection.collection(check.collectionName)
            .aggregate(check.pipeline)
            .toArray();
        } catch (error) {
          if (error?.codeName === 'NamespaceNotFound') continue;
          throw error;
        }
        for (const duplicate of duplicates) {
          conflicts.push({
            indexName: check.indexName,
            key: duplicate._id,
            count: duplicate.count,
          });
        }
      }
      return conflicts;
    },
    async ensureIndexes() {
      const created = [];
      for (const { collectionName, key, options } of SL007_INDEX_DEFINITIONS) {
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
  const userSessions = repository.listUserSessionsForCredentialBackfill
    ? await repository.listUserSessionsForCredentialBackfill()
    : [];
  const indexConflicts = repository.findIndexConflicts
    ? await repository.findIndexConflicts()
    : [];
  const result = {
    ...report,
    indexConflicts,
    dryRun,
    appliedUsers: 0,
    appliedUserSessions: 0,
    createdIndexes: [],
  };
  if (dryRun || report.unresolvedUsers.length || indexConflicts.length) return result;
  for (const item of report.migratableUsers) {
    const set = { phoneNumber: item.phoneNumber };
    if (item.version === undefined) set.version = 0;
    if (item.credentialVersion === undefined) set.credentialVersion = 0;
    const modified = await repository.applyUserMigration(item.id, {
      $set: set,
      $unset: { phone: '', address: '' },
    });
    if (modified !== 0) result.appliedUsers += 1;
  }
  if (repository.applyUserSessionCredentialBackfill) {
    for (const session of userSessions) {
      const modified = await repository.applyUserSessionCredentialBackfill(String(session._id));
      if (modified !== 0) result.appliedUserSessions += 1;
    }
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
    if (!dryRun && (result.unresolvedUsers.length || result.indexConflicts.length)) {
      process.exitCode = 2;
    }
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
  SL007_INDEX_DEFINITIONS,
  analyzeLegacyUsers,
  createMongoRepository,
  runAccountAuthMigration,
  runCli,
};
