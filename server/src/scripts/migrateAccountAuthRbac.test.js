const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { analyzeLegacyUsers, runAccountAuthMigration } = require('./migrateAccountAuthRbac');

describe('SL-007 account migration', () => {
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
});
