const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createAdminAccountService } = require('./adminAccount.service');

function createState() {
  const users = [
    { _id: 'admin-1', email: 'admin@example.com', fullName: 'Admin', roleId: { roleName: 'Admin' }, status: 'Active', version: 1 },
    { _id: 'staff-1', email: 'staff@example.com', fullName: 'Staff', roleId: { roleName: 'Staff' }, status: 'Active', version: 2 },
    { _id: 'customer-1', email: 'customer@example.com', fullName: 'Customer', roleId: { roleName: 'Customer' }, status: 'Active', version: 3 },
  ];
  const audits = [];
  const state = {
    users,
    audits,
    repository: {
      async findById(id) { return users.find((user) => user._id === id) || null; },
      async search() { return users.filter((user) => user.roleId.roleName !== 'Admin'); },
      async updateStatus(id, expectedVersion, nextStatus) {
        const user = users.find((item) => item._id === id);
        if (!user || user.version !== expectedVersion) return null;
        user.status = nextStatus; user.version += 1; return { ...user };
      },
      async updateRole(id, expectedVersion, roleName) {
        const user = users.find((item) => item._id === id);
        if (!user || user.version !== expectedVersion) return null;
        user.roleId = { roleName }; user.version += 1; return { ...user };
      },
    },
    sessionService: {
      revoked: [],
      async revokeAllForUser(userId, reason) { this.revoked.push({ userId, reason }); return { revokedCount: 2 }; },
    },
    assignmentService: {
      async hasActiveAssignments() { return { active: false, assignments: [] }; },
      async handleDisabledAccount(input) { return { activeAssignments: [], ...input }; },
    },
    auditLogger: { async log(entry) { audits.push(entry); } },
  };
  return state;
}

describe('Admin account governance', () => {
  it('AT-133 permits only guarded Staff/Warehouse transfer and revokes all sessions', async () => {
    const state = createState();
    const service = createAdminAccountService(state);
    const result = await service.transferRole({
      actorUserId: 'admin-1',
      targetUserId: 'staff-1',
      targetRole: 'WarehouseManager',
      reason: 'Phân công kho',
      expectedVersion: 2,
      idempotencyKey: 'transfer-1',
    });
    assert.equal(result.user.role, 'WarehouseManager');
    assert.equal(state.sessionService.revoked.length, 1);
  });

  it('AT-134 exposes only minimum metadata and denies prohibited commands', async () => {
    const state = createState();
    const service = createAdminAccountService(state);
    const list = await service.listAccounts({ actorUserId: 'admin-1' });
    assert.equal(list.items[0].passwordHash, undefined);
    assert.equal(list.items[0].email, 'staff@example.com');
    for (const command of ['setPassword', 'editProfile', 'editAddress', 'impersonate', 'delete', 'assignAdmin', 'convertCustomer']) {
      await assert.rejects(
        () => service.assertCommandAllowed(command),
        (error) => error.errorCode === 'ADMIN_COMMAND_FORBIDDEN'
      );
    }
  });

  it('AT-135 atomically disables/re-activates once with reason, version and all-session revocation', async () => {
    const state = createState();
    const service = createAdminAccountService(state);
    const disabled = await service.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Yêu cầu khóa',
      expectedVersion: 3,
      idempotencyKey: 'disable-1',
    });
    assert.equal(disabled.user.status, 'Disabled');
    assert.equal(state.sessionService.revoked.length, 1);
    const replay = await service.changeStatus({
      actorUserId: 'admin-1', targetUserId: 'customer-1', nextStatus: 'Disabled',
      reason: 'Yêu cầu khóa', expectedVersion: 3, idempotencyKey: 'disable-1',
    });
    assert.equal(replay.alreadyProcessed, true);
    await assert.rejects(
      () => service.changeStatus({
        actorUserId: 'admin-1', targetUserId: 'customer-1', nextStatus: 'Active',
        reason: 'Mở lại', expectedVersion: 3, idempotencyKey: 'reactivate-1',
      }),
      (error) => error.errorCode === 'ACCOUNT_VERSION_CONFLICT'
    );
  });
});
