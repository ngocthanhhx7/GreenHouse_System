const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it } = require('node:test');

const {
  createAdminAccountService,
  createLiteralSearchRegex,
} = require('./adminAccount.service');

function createState() {
  const users = [
    { _id: 'admin-1', email: 'admin@example.com', fullName: 'Admin', roleId: { roleName: 'Admin' }, status: 'Active', version: 1 },
    { _id: 'staff-1', email: 'staff@example.com', fullName: 'Staff', roleId: { roleName: 'Staff' }, status: 'Active', version: 2 },
    { _id: 'customer-1', email: 'customer@example.com', fullName: 'Customer', roleId: { roleName: 'Customer' }, status: 'Active', version: 3 },
    { _id: 'customer-2', email: 'customer2@example.com', fullName: 'Customer 2', roleId: { roleName: 'Customer' }, status: 'Active', version: 1 },
  ];
  const audits = [];
  const state = {
    users,
    audits,
    repository: {
      async findById(id) { return users.find((user) => user._id === id) || null; },
      async findAuditByEventId(eventId) {
        return audits.find((entry) => entry.eventId === eventId) || null;
      },
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
      async revokeAllForUser(userId, reason, session) { this.revoked.push({ userId, reason, session }); return { revokedCount: 2 }; },
    },
    assignmentService: {
      checks: [],
      async hasActiveAssignments(userId, session) {
        this.checks.push({ userId, session });
        return { active: false, assignments: [] };
      },
      async handleDisabledAccount(input, session) { return { activeAssignments: [], ...input, session }; },
    },
    auditLogger: {
      async log(entry, session) {
        audits.push({
          ...entry,
          replayBinding: entry.after?.commandFingerprint
            ? { commandFingerprint: entry.after.commandFingerprint }
            : undefined,
          session,
        });
      },
    },
    transactionManager: {
      sessions: [],
      async withTransaction(work) {
        const session = { id: `tx-${this.sessions.length + 1}` };
        this.sessions.push(session);
        return work(session);
      },
    },
  };
  return state;
}

describe('Admin account governance', () => {
  it('bounds pagination and treats Admin search text as a literal value', async () => {
    const state = createState();
    let receivedSearch;
    state.repository.search = async (input) => {
      receivedSearch = input;
      return { items: [], total: 0 };
    };
    const service = createAdminAccountService(state);

    await service.listAccounts({
      actorUserId: 'admin-1',
      query: '  a.*  ',
      page: '-4',
      pageSize: '100000',
    });

    assert.deepEqual(receivedSearch, {
      query: 'a.*',
      roleName: undefined,
      status: undefined,
      page: 1,
      pageSize: 100,
    });
    const regex = createLiteralSearchRegex(receivedSearch.query);
    assert.equal(regex.test('A.*'), true);
    assert.equal(regex.test('anything'), false);
  });

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
    assert.deepEqual(state.sessionService.revoked[0].session, state.transactionManager.sessions[0]);
    assert.deepEqual(state.assignmentService.checks[0].session, state.transactionManager.sessions[0]);
    assert.deepEqual(state.audits[0].session, state.transactionManager.sessions[0]);
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
    assert.deepEqual(state.sessionService.revoked[0].session, state.transactionManager.sessions[0]);
    assert.deepEqual(disabled.handoff.session, state.transactionManager.sessions[0]);
    assert.deepEqual(state.audits[0].session, state.transactionManager.sessions[0]);
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

  it('rolls back the governed account mutation when a transaction-bound handoff fails', async () => {
    const state = createState();
    const initialUsers = structuredClone(state.users);
    state.transactionManager.withTransaction = async (work) => {
      try {
        return await work({ id: 'tx-rollback' });
      } catch (error) {
        state.users.splice(0, state.users.length, ...structuredClone(initialUsers));
        throw error;
      }
    };
    state.assignmentService.handleDisabledAccount = async () => {
      throw new Error('outbox unavailable');
    };
    const service = createAdminAccountService(state);

    await assert.rejects(
      () => service.changeStatus({
        actorUserId: 'admin-1',
        targetUserId: 'customer-1',
        nextStatus: 'Disabled',
        reason: 'Security lock',
        expectedVersion: 3,
        idempotencyKey: 'disable-rollback',
      }),
      /outbox unavailable/,
    );
    assert.equal(state.users.find((user) => user._id === 'customer-1').status, 'Active');
  });

  it('replays a committed command after service restart from durable audit evidence', async () => {
    const state = createState();
    const firstService = createAdminAccountService(state);
    await firstService.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Security lock',
      expectedVersion: 3,
      idempotencyKey: 'durable-disable',
    });
    state.audits[0] = {
      ...state.audits[0],
      replayBinding: {
        commandFingerprint: state.audits[0].after.commandFingerprint,
      },
    };
    delete state.audits[0].after;

    const restartedService = createAdminAccountService(state);
    const replay = await restartedService.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Security lock',
      expectedVersion: 3,
      idempotencyKey: 'durable-disable',
    });

    assert.equal(replay.alreadyProcessed, true);
    assert.equal(replay.user.status, 'Disabled');
    assert.equal(state.audits.length, 1);
    assert.equal(state.sessionService.revoked.length, 1);
  });

  it('does not replay the same raw key onto a different command target', async () => {
    const state = createState();
    const service = createAdminAccountService(state);
    await service.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Security lock',
      expectedVersion: 3,
      idempotencyKey: 'shared-raw-key',
    });

    const second = await service.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-2',
      nextStatus: 'Disabled',
      reason: 'Second account lock',
      expectedVersion: 1,
      idempotencyKey: 'shared-raw-key',
    });

    assert.equal(second.alreadyProcessed, undefined);
    assert.equal(second.user.id, 'customer-2');
    assert.equal(state.audits.length, 2);
  });

  it('durably replays a role transfer after the service restarts', async () => {
    const state = createState();
    const firstService = createAdminAccountService(state);
    await firstService.transferRole({
      actorUserId: 'admin-1',
      targetUserId: 'staff-1',
      targetRole: 'WarehouseManager',
      reason: 'Warehouse assignment',
      expectedVersion: 2,
      idempotencyKey: 'durable-transfer',
    });
    state.audits[0] = {
      ...state.audits[0],
      replayBinding: {
        commandFingerprint: state.audits[0].after.commandFingerprint,
      },
    };
    delete state.audits[0].after;

    const restartedService = createAdminAccountService(state);
    const replay = await restartedService.transferRole({
      actorUserId: 'admin-1',
      targetUserId: 'staff-1',
      targetRole: 'WarehouseManager',
      reason: 'Warehouse assignment',
      expectedVersion: 2,
      idempotencyKey: 'durable-transfer',
    });

    assert.equal(replay.alreadyProcessed, true);
    assert.equal(replay.user.role, 'WarehouseManager');
    assert.equal(state.audits.length, 1);
    assert.equal(state.sessionService.revoked.length, 1);
  });

  it('rejects a scoped idempotency key reused with a different command fingerprint', async () => {
    const state = createState();
    const service = createAdminAccountService(state);
    await service.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Security lock',
      expectedVersion: 3,
      idempotencyKey: 'fingerprint-key',
    });

    await assert.rejects(
      () => service.changeStatus({
        actorUserId: 'admin-1',
        targetUserId: 'customer-1',
        nextStatus: 'Active',
        reason: 'Different command',
        expectedVersion: 4,
        idempotencyKey: 'fingerprint-key',
      }),
      (error) => error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('replays the committed winner when a concurrent duplicate loses the version race', async () => {
    const state = createState();
    const winner = {
      user: {
        id: 'customer-1',
        fullName: 'Customer',
        email: 'customer@example.com',
        role: 'Customer',
        status: 'Disabled',
        createdAt: null,
        lastLoginAt: null,
        version: 4,
      },
      revokedSessions: 2,
      handoff: { activeAssignments: [] },
    };
    const originalFindAudit = state.repository.findAuditByEventId;
    let lookupCount = 0;
    const commandFingerprint = crypto.createHash('sha256').update(JSON.stringify({
      operation: 'ACCOUNT_STATUS',
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Security lock',
      expectedVersion: 3,
    })).digest('hex');
    state.repository.findAuditByEventId = async (eventId) => {
      lookupCount += 1;
      if (lookupCount <= 2) return null;
      const committedUser = state.users.find((user) => user._id === 'customer-1');
      committedUser.status = 'Disabled';
      committedUser.version = 4;
      return {
        eventId,
        userId: 'admin-1',
        action: 'ACCOUNT_STATUS_DISABLED',
        targetId: 'customer-1',
        replayBinding: { commandFingerprint },
      };
    };
    state.repository.updateStatus = async () => null;
    const service = createAdminAccountService(state);

    const result = await service.changeStatus({
      actorUserId: 'admin-1',
      targetUserId: 'customer-1',
      nextStatus: 'Disabled',
      reason: 'Security lock',
      expectedVersion: 3,
      idempotencyKey: 'concurrent-key',
    });

    assert.equal(result.alreadyProcessed, true);
    assert.deepEqual(result.user, winner.user);
    state.repository.findAuditByEventId = originalFindAudit;
  });
});
