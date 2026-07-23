const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  SL007_INDEX_DEFINITIONS,
  analyzeLegacyUsers,
  createMongoRepository,
  runAccountAuthMigration,
} = require('./migrateAccountAuthRbac');

describe('SL-007 account migration', () => {
  it('scans every User so fieldless legacy records are reported and backfills are not skipped', async () => {
    const fieldlessUser = { _id: '507f1f77bcf86cd799439010' };
    let capturedFilter;
    let capturedOptions;
    const repository = createMongoRepository({
      collection(collectionName) {
        assert.equal(collectionName, 'users');
        return {
          find(filter, options) {
            capturedFilter = filter;
            capturedOptions = options;
            return { toArray: async () => [fieldlessUser] };
          },
        };
      },
    });

    const users = await repository.listUsers();

    assert.deepEqual(capturedFilter, {});
    assert.deepEqual(users, [fieldlessUser]);
    assert.deepEqual(capturedOptions.projection, {
      phone: 1,
      phoneNumber: 1,
      address: 1,
      version: 1,
      credentialVersion: 1,
    });
    assert.deepEqual(analyzeLegacyUsers(users).missingPhones, [
      { id: '507f1f77bcf86cd799439010' },
    ]);
  });

  it('AT-145 leaves one canonical phone and no free-form User address authority', async () => {
    const users = [
      { _id: 'equal', phone: '0912345678', phoneNumber: '0912345678', address: '' },
      { _id: 'missing', phone: '0987654321', phoneNumber: '', address: '' },
      { _id: 'conflict', phone: '0912345678', phoneNumber: '0987654321', address: '' },
      { _id: 'free-form', phone: '0912345678', phoneNumber: '0912345678', address: 'Hà Nội' },
    ];
    const report = analyzeLegacyUsers(users);
    assert.deepEqual(report.conflictingPhones.map((item) => item.id), ['conflict']);
    assert.deepEqual(report.unstructuredAddresses.map((item) => item.id), ['free-form']);
    assert.deepEqual(report.migratableUsers.map((item) => item.id), ['equal', 'missing']);
    assert.deepEqual(report.unresolvedUsers, ['conflict', 'free-form']);

    const writes = [];
    const repository = {
      async listUsers() { return users.slice(0, 2); },
      async applyUserMigration(id, changes) {
        const target = users.find((item) => item._id === id);
        if (!Object.hasOwn(target, 'phone') && !Object.hasOwn(target, 'address')) return 0;
        writes.push({ id, changes });
        target.phoneNumber = changes.$set.phoneNumber;
        delete target.phone;
        delete target.address;
        return 1;
      },
      async ensureIndexes() { return ['sl007_user_role_status_version']; },
    };
    const first = await runAccountAuthMigration({ repository, dryRun: false });
    const second = await runAccountAuthMigration({ repository, dryRun: false });
    assert.equal(first.appliedUsers, 2);
    assert.equal(second.appliedUsers, 0);
  });

  it('backfills version for a canonical user that has no legacy fields', async () => {
    const users = [{
      _id: '507f1f77bcf86cd799439011',
      phoneNumber: '0912345678',
    }];
    const writes = [];
    const mongoRepository = createMongoRepository({
      collection(name) {
        if (name === 'usersessions') {
          return { find: () => ({ toArray: async () => [] }) };
        }
        assert.equal(name, 'users');
        return {
          async updateOne(filter, changes) {
            const permitsVersionBackfill = filter.$or.some(
              (condition) => condition.version?.$exists === false
            );
            if (!permitsVersionBackfill || Object.hasOwn(users[0], 'version')) {
              return { modifiedCount: 0 };
            }
            writes.push({ filter, changes });
            users[0].version = changes.$set.version;
            return { modifiedCount: 1 };
          },
        };
      },
    });
    const repository = {
      ...mongoRepository,
      async listUsers() { return users; },
      async findIndexConflicts() { return []; },
      async ensureIndexes() { return []; },
    };

    const first = await runAccountAuthMigration({ repository, dryRun: false });
    const second = await runAccountAuthMigration({ repository, dryRun: false });

    assert.equal(first.appliedUsers, 1);
    assert.equal(second.appliedUsers, 0);
    assert.equal(users[0].version, 0);
    assert.deepEqual(writes[0].changes.$unset, { phone: '', address: '' });
  });

  it('backfills credentialVersion for an otherwise canonical user repeat-safely', async () => {
    const users = [{
      _id: '507f1f77bcf86cd799439012',
      phoneNumber: '0987654321',
      version: 0,
    }];
    const connection = {
      collection(collectionName) {
        if (collectionName === 'users') {
          return {
            async updateOne(filter, changes) {
              const permitsCredentialBackfill = filter.$or.some(
                (condition) => condition.credentialVersion?.$exists === false
              );
              if (!permitsCredentialBackfill || Object.hasOwn(users[0], 'credentialVersion')) {
                return { modifiedCount: 0 };
              }
              users[0].credentialVersion = changes.$set.credentialVersion;
              return { modifiedCount: 1 };
            },
          };
        }
        if (collectionName === 'usersessions') {
          return { find: () => ({ toArray: async () => [] }) };
        }
        throw new Error(`Unexpected collection: ${collectionName}`);
      },
    };
    const repository = {
      ...createMongoRepository(connection),
      async listUsers() { return users; },
      async findIndexConflicts() { return []; },
      async ensureIndexes() { return []; },
    };

    const first = await runAccountAuthMigration({ repository, dryRun: false });
    const second = await runAccountAuthMigration({ repository, dryRun: false });

    assert.equal(first.appliedUsers, 1);
    assert.equal(second.appliedUsers, 0);
    assert.equal(users[0].credentialVersion, 0);
  });

  it('backfills session credentialVersionAtCreation and reports the count repeat-safely', async () => {
    const sessions = [{ _id: '507f1f77bcf86cd799439013' }];
    const connection = {
      collection(collectionName) {
        if (collectionName === 'users') return {};
        if (collectionName === 'usersessions') {
          return {
            find() {
              return {
                async toArray() {
                  return sessions.filter(
                    (session) => !Object.hasOwn(session, 'credentialVersionAtCreation')
                  );
                },
              };
            },
            async updateOne(filter, changes) {
              const target = sessions.find((session) => String(session._id) === String(filter._id));
              if (!target || Object.hasOwn(target, 'credentialVersionAtCreation')) {
                return { modifiedCount: 0 };
              }
              target.credentialVersionAtCreation = changes.$set.credentialVersionAtCreation;
              return { modifiedCount: 1 };
            },
          };
        }
        throw new Error(`Unexpected collection: ${collectionName}`);
      },
    };
    const repository = {
      ...createMongoRepository(connection),
      async listUsers() { return []; },
      async findIndexConflicts() { return []; },
      async ensureIndexes() { return []; },
    };

    const first = await runAccountAuthMigration({ repository, dryRun: false });
    const second = await runAccountAuthMigration({ repository, dryRun: false });

    assert.equal(first.appliedUserSessions, 1);
    assert.equal(second.appliedUserSessions, 0);
    assert.equal(sessions[0].credentialVersionAtCreation, 0);
  });

  it('creates every SL-007 TTL, idempotency, session and address invariant index repeat-safely', async () => {
    const expected = new Set([
      'sl007_registration_latest_identity',
      'sl007_registration_expiry',
      'sl007_registration_idempotency',
      'sl007_registration_single_live_identity',
      'sl007_invitation_latest_identity',
      'sl007_invitation_expiry',
      'sl007_invitation_idempotency',
      'sl007_invitation_single_live_identity',
      'sl007_session_selector_hash_unique',
      'sl007_user_active_sessions',
      'sl007_login_attempt_window',
      'sl007_login_attempt_ttl',
      'sl007_login_throttle_bucket_ttl',
      'one_default_address_per_user',
    ]);
    const actual = new Set(SL007_INDEX_DEFINITIONS.map((definition) => definition.options.name));
    for (const name of expected) assert.equal(actual.has(name), true, name);

    let created = false;
    const repository = {
      async listUsers() { return []; },
      async findIndexConflicts() { return []; },
      async ensureIndexes() {
        if (created) return [];
        created = true;
        return [...actual];
      },
    };
    const first = await runAccountAuthMigration({ repository, dryRun: false });
    const second = await runAccountAuthMigration({ repository, dryRun: false });
    assert.equal(first.createdIndexes.length, actual.size);
    assert.equal(second.createdIndexes.length, 0);
  });

  it('defines the production single-live identity and durable login-throttle indexes', () => {
    const definitions = new Map(
      SL007_INDEX_DEFINITIONS.map((definition) => [definition.options.name, definition])
    );

    assert.deepEqual(definitions.get('sl007_registration_single_live_identity'), {
      collectionName: 'registrationchallenges',
      key: { email: 1 },
      options: {
        name: 'sl007_registration_single_live_identity',
        unique: true,
        partialFilterExpression: { state: 'PendingVerification' },
      },
    });
    assert.deepEqual(definitions.get('sl007_invitation_single_live_identity'), {
      collectionName: 'internalinvitations',
      key: { email: 1 },
      options: {
        name: 'sl007_invitation_single_live_identity',
        unique: true,
        partialFilterExpression: { state: 'PendingAcceptance' },
      },
    });
    assert.deepEqual(definitions.get('sl007_login_throttle_bucket_ttl'), {
      collectionName: 'loginthrottlebuckets',
      key: { expiresAt: 1 },
      options: {
        name: 'sl007_login_throttle_bucket_ttl',
        expireAfterSeconds: 0,
      },
    });
  });

  it('preflights duplicate pending registration and invitation identities', async () => {
    const connection = {
      collection(collectionName) {
        return {
          aggregate(pipeline) {
            return {
              async toArray() {
                const state = pipeline[0]?.$match?.state;
                if (collectionName === 'registrationchallenges' && state === 'PendingVerification') {
                  return [{ _id: { email: 'customer@example.com' }, count: 2 }];
                }
                if (collectionName === 'internalinvitations' && state === 'PendingAcceptance') {
                  return [{ _id: { email: 'staff@example.com' }, count: 2 }];
                }
                return [];
              },
            };
          },
        };
      },
    };

    const conflicts = await createMongoRepository(connection).findIndexConflicts();

    assert.deepEqual(conflicts.map((item) => item.indexName), [
      'sl007_registration_single_live_identity',
      'sl007_invitation_single_live_identity',
    ]);
  });

  it('preflights unique-index conflicts before changing legacy users', async () => {
    let writes = 0;
    const repository = {
      async listUsers() {
        return [{ _id: 'migratable', phone: '0912345678', address: '' }];
      },
      async listUserSessionsForCredentialBackfill() {
        return [{ _id: '507f1f77bcf86cd799439014' }];
      },
      async findIndexConflicts() {
        return [{
          indexName: 'one_default_address_per_user',
          key: { userId: 'customer-1' },
          count: 2,
        }];
      },
      async applyUserMigration() { writes += 1; return 1; },
      async applyUserSessionCredentialBackfill() { writes += 1; return 1; },
      async ensureIndexes() { throw new Error('must not create'); },
    };

    const result = await runAccountAuthMigration({ repository, dryRun: false });
    assert.equal(result.indexConflicts.length, 1);
    assert.equal(result.appliedUsers, 0);
    assert.equal(result.appliedUserSessions, 0);
    assert.equal(writes, 0);
  });
});
