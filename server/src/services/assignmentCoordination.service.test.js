const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const assignmentCoordination = require('./assignmentCoordination.service');
const { createAdminAccountService } = require('./adminAccount.service');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function transientWriteConflict() {
  const error = new Error('Write conflict during plan execution');
  error.addErrorLabel = () => {};
  error.hasErrorLabel = (label) => label === 'TransientTransactionError';
  return error;
}

function createInterleavingHarness({ initialRole, targetRole }) {
  const user = {
    _id: 'actor-1',
    email: 'actor@example.com',
    fullName: 'Actor',
    roleId: { roleName: initialRole },
    status: 'Active',
    version: 2,
    assignmentEpoch: 0,
  };
  const admin = {
    _id: 'admin-1',
    email: 'admin@example.com',
    fullName: 'Admin',
    roleId: { roleName: 'Admin' },
    status: 'Active',
    version: 1,
  };
  const assignments = [];
  const firstGuardEntered = deferred();
  const transferCommitted = deferred();
  let assignmentAttempts = 0;

  const coordinator = assignmentCoordination.createAssignmentCoordinator({
    repository: {
      async claimActorRole(userId, expectedRole, session) {
        assert.equal(userId, user._id);
        if (session.attempt === 1) {
          firstGuardEntered.resolve();
          await transferCommitted.promise;
        }
        if (session.snapshot.version !== user.version) throw transientWriteConflict();
        if (
          session.snapshot.status !== 'Active'
          || session.snapshot.roleId.roleName !== expectedRole
        ) {
          return null;
        }
        session.snapshot.assignmentEpoch += 1;
        session.userWrite = true;
        return session.snapshot;
      },
    },
  });

  const assignmentTransactionManager = {
    async withTransaction(work) {
      while (true) {
        assignmentAttempts += 1;
        const session = {
          attempt: assignmentAttempts,
          snapshot: structuredClone(user),
          stagedAssignments: [],
          userWrite: false,
        };
        try {
          const result = await work(session);
          if (session.userWrite) {
            user.assignmentEpoch = session.snapshot.assignmentEpoch;
            user.version = session.snapshot.version;
          }
          assignments.push(...session.stagedAssignments);
          return result;
        } catch (error) {
          if (error.hasErrorLabel?.('TransientTransactionError')) continue;
          throw error;
        }
      }
    },
  };

  const adminService = createAdminAccountService({
    repository: {
      async findById(id) {
        if (id === admin._id) return admin;
        if (id === user._id) return structuredClone(user);
        return null;
      },
      async findAuditByEventId() { return null; },
      async updateRole(id, expectedVersion, roleName) {
        if (id !== user._id || user.version !== expectedVersion) return null;
        user.roleId = { roleName };
        user.version += 1;
        return structuredClone(user);
      },
    },
    assignmentService: {
      async hasActiveAssignments() {
        return { active: assignments.length > 0, assignments: [...assignments] };
      },
    },
    sessionService: { async revokeAllForUser() { return { revokedCount: 1 }; } },
    auditLogger: { async log() {} },
    transactionManager: { async withTransaction(work) { return work({ id: 'role-transfer-tx' }); } },
  });

  return {
    user,
    assignments,
    coordinator,
    assignmentTransactionManager,
    adminService,
    firstGuardEntered: firstGuardEntered.promise,
    transferCommitted,
    targetRole,
    get assignmentAttempts() { return assignmentAttempts; },
  };
}

describe('assignment/role-transfer write-conflict coordination', () => {
  it('uses an assignmentEpoch write on the same session-bound User document', async () => {
    const calls = [];
    function query(result, call) {
      return {
        select(selection) {
          call.selection = selection;
          return this;
        },
        session(session) {
          call.session = session;
          return this;
        },
        async lean() {
          return result;
        },
      };
    }
    const repository = assignmentCoordination.createModelAssignmentRepository({
      RoleModel: {
        findOne(filter) {
          const call = { model: 'Role', filter };
          calls.push(call);
          return query({ _id: 'role-staff' }, call);
        },
      },
      UserModel: {
        findOneAndUpdate(filter, update, options) {
          const call = { model: 'User', filter, update, options };
          calls.push(call);
          return query({ _id: 'staff-1', assignmentEpoch: 4 }, call);
        },
      },
    });
    const session = { id: 'mongo-assignment-session' };

    const actor = await repository.claimActorRole('staff-1', 'Staff', session);

    assert.equal(actor.assignmentEpoch, 4);
    assert.deepEqual(calls[0], {
      model: 'Role',
      filter: { roleName: 'Staff' },
      selection: '_id',
      session,
    });
    assert.deepEqual(calls[1], {
      model: 'User',
      filter: {
        _id: 'staff-1',
        roleId: 'role-staff',
        status: 'Active',
      },
      update: { $inc: { assignmentEpoch: 1 } },
      options: { new: true, runValidators: true },
      selection: '+assignmentEpoch',
      session,
    });
  });

  it('retries the exact stale-middleware interleaving and creates no registered slice assignment', async () => {
    const cases = [
      ['Support', 'Staff', 'WarehouseManager'],
      ['StockExport', 'Staff', 'WarehouseManager'],
      ['Damage', 'Staff', 'WarehouseManager'],
      ['Replenishment', 'WarehouseManager', 'Staff'],
      ['Return', 'Staff', 'WarehouseManager'],
      ['Exchange', 'Staff', 'WarehouseManager'],
    ];

    for (const [slice, initialRole, targetRole] of cases) {
      const harness = createInterleavingHarness({ initialRole, targetRole });
      const staleRequest = harness.assignmentTransactionManager.withTransaction(
        async (session) => {
          await harness.coordinator.coordinate({
            userId: harness.user._id,
            expectedRole: initialRole,
            session,
          });
          session.stagedAssignments.push(slice);
        },
      );

      await harness.firstGuardEntered;
      const transfer = await harness.adminService.transferRole({
        actorUserId: 'admin-1',
        targetUserId: harness.user._id,
        targetRole,
        reason: `Move actor away from ${slice}`,
        expectedVersion: 2,
        idempotencyKey: `role-transfer-${slice}`,
      });
      harness.transferCommitted.resolve();

      await assert.rejects(
        () => staleRequest,
        (error) => error.errorCode === 'ASSIGNMENT_ACTOR_STALE',
      );
      assert.equal(transfer.user.role, targetRole);
      assert.equal(harness.assignmentAttempts, 2);
      assert.deepEqual(harness.assignments, []);
      assert.equal(harness.user.assignmentEpoch, 0);
    }
  });
});
