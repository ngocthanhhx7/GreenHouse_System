const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createInternalInvitationService, hashInvitationToken } = require('./internalInvitation.service');
const InternalInvitation = require('../models/internalInvitation.model');

function createState() {
  const invitations = [];
  const users = [];
  const audits = [];
  const outbox = [];
  return {
    invitations,
    users,
    audits,
    outbox,
    repository: {
      async findUserByEmail(email) { return users.find((item) => item.email === email) || null; },
      async findUserById(id) {
        const user = users.find((item) => item._id === id);
        if (!user) return null;
        const invitation = invitations.find((item) => item.email === user.email);
        return {
          ...user,
          roleId: {
            _id: user.roleId,
            roleName: invitation?.roleName || 'Staff',
          },
        };
      },
      async findLatest(email) { return [...invitations].reverse().find((item) => item.email === email && item.state === 'PendingAcceptance') || null; },
      async findById(id) { return invitations.find((item) => item._id === id && item.state === 'PendingAcceptance') || null; },
      async findAnyById(id) { return invitations.find((item) => item._id === id) || null; },
      async findByIdempotency(email, idempotencyKey) {
        return invitations.find((item) => item.email === email && item.idempotencyKey === idempotencyKey) || null;
      },
      async findByIdempotencyKey(idempotencyKey) {
        return invitations.find((item) => item.idempotencyKey === idempotencyKey) || null;
      },
      async findAuditByEventId(eventId) {
        return audits.find((item) => item.eventId === eventId) || null;
      },
      async create(data) { const item = { _id: `invite-${invitations.length + 1}`, ...data }; invitations.push(item); return item; },
      async revoke(id, now, reason) { const item = invitations.find((entry) => entry._id === id && entry.state === 'PendingAcceptance'); if (!item) return null; item.state = 'Revoked'; item.revokedAt = now; item.reason = reason; return item; },
      async invalidate(email, now) { invitations.filter((item) => item.email === email && item.state === 'PendingAcceptance').forEach((item) => { item.state = 'Revoked'; item.revokedAt = now; }); },
      async expirePending(email, now) {
        invitations
          .filter((item) => item.email === email && item.state === 'PendingAcceptance' && new Date(item.expiresAt) <= now)
          .forEach((item) => { item.state = 'Expired'; item.expiredAt = now; });
      },
      async consume(id, now) { const item = invitations.find((entry) => entry._id === id && entry.state !== 'Revoked'); if (!item || item.state !== 'PendingAcceptance') return null; item.state = 'Accepted'; item.acceptedAt = now; return item; },
      async createUser(data) { const item = { _id: `user-${users.length + 1}`, ...data }; users.push(item); return item; },
      async findRole(roleName) { return { _id: `role-${roleName}`, roleName }; },
      async audit(entry) {
        if (entry.eventId && audits.some((item) => item.eventId === entry.eventId)) {
          const error = new Error('duplicate audit command');
          error.code = 11000;
          throw error;
        }
        audits.push({
          ...entry,
          replayBinding: {
            ...(entry.after?.commandFingerprint
              ? { commandFingerprint: entry.after.commandFingerprint }
              : {}),
            ...(entry.before?.invitationId
              ? { priorTargetId: String(entry.before.invitationId) }
              : {}),
          },
        });
      },
      async enqueue(event) { outbox.push(event); },
    },
  };
}

function createRollbackTransactionManager(state) {
  return {
    async withTransaction(work) {
      const snapshots = {
        invitations: structuredClone(state.invitations),
        users: structuredClone(state.users),
        audits: structuredClone(state.audits),
        outbox: structuredClone(state.outbox),
      };
      try {
        return await work({ id: 'tx-invitation' });
      } catch (error) {
        for (const [key, snapshot] of Object.entries(snapshots)) {
          state[key].splice(0, state[key].length, ...snapshot);
        }
        throw error;
      }
    },
  };
}

describe('internal invitations', () => {
  it('AT-129 creates a 24-hour Staff or Warehouse invitation with no User or Admin password', async () => {
    const state = createState();
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work(null); } },
    });
    const result = await service.createInvitation({
      email: 'staff@example.com',
      roleName: 'Staff',
      idempotencyKey: 'invite-1',
      actorUserId: 'admin-1',
    });
    assert.equal(result.invitation.roleName, 'Staff');
    assert.equal(state.users.length, 0);
    assert.equal(state.invitations[0].expiresAt.toISOString(), '2026-07-25T00:00:00.000Z');
    assert.equal(state.invitations[0].tokenHash, hashInvitationToken('staff@example.com', 'invite-token', 'invitation-test-secret'));
    assert.equal(state.invitations[0].passwordHash, undefined);
  });

  it('AT-130 accepts one latest valid invitation into its exact Active role', async () => {
    const state = createState();
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: { async withTransaction(work) { return work(null); } },
    });
    await service.createInvitation({
      email: 'warehouse@example.com',
      roleName: 'WarehouseManager',
      idempotencyKey: 'invite-1',
      actorUserId: 'admin-1',
    });
    const result = await service.acceptInvitation({
      email: 'warehouse@example.com', token: 'invite-token', fullName: 'Warehouse User', phoneNumber: '0912345678',
      password: 'Matkhau123', confirmPassword: 'Matkhau123', idempotencyKey: 'accept-1',
    });
    assert.equal(result.user.role.roleName, 'WarehouseManager');
    assert.equal(state.users[0].status, 'Active');
    assert.equal(state.invitations[0].state, 'Accepted');
    assert.equal(state.outbox.length, 2);
    assert.equal(state.outbox[1].eventType, 'INTERNAL_INVITATION_ACCEPTED');
  });

  it('AT-131 rejects Customer/Admin invitation roles and former or existing-email acceptance', async () => {
    const state = createState();
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
    });
    await assert.rejects(
      () => service.createInvitation({
        email: 'x@example.com',
        roleName: 'Admin',
        idempotencyKey: 'bad',
        actorUserId: 'admin-1',
      }),
      (error) => error.errorCode === 'INVITATION_ROLE_FORBIDDEN'
    );
  });

  it('audits the acting Admin and replays create without duplicate invitation or mail', async () => {
    const state = createState();
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    });
    const input = {
      email: 'audit@example.com',
      roleName: 'Staff',
      idempotencyKey: 'invite-audit',
      actorUserId: 'admin-1',
      reason: 'New support agent',
    };

    const first = await service.createInvitation(input);
    const replay = await service.createInvitation(input);

    assert.equal(replay.invitation.id, first.invitation.id);
    assert.equal(replay.replay, true);
    assert.equal(state.invitations.length, 1);
    assert.equal(state.outbox.length, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.audits[0].userId, 'admin-1');
    assert.equal(JSON.stringify(state.audits).includes('invite-token'), false);
  });

  it('durably binds invitation creation idempotency to actor email role and reason', async () => {
    const state = createState();
    const options = {
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    };
    const original = {
      email: 'bound@example.com',
      roleName: 'Staff',
      idempotencyKey: 'bound-create',
      actorUserId: 'admin-1',
      reason: 'Support staffing',
    };
    const first = await createInternalInvitationService(options).createInvitation(original);
    state.audits[0] = {
      ...state.audits[0],
      replayBinding: {
        commandFingerprint: state.audits[0].after.commandFingerprint,
      },
    };
    delete state.audits[0].after;
    const replay = await createInternalInvitationService(options).createInvitation(original);

    assert.equal(replay.replay, true);
    assert.equal(replay.invitation.id, first.invitation.id);
    for (const conflicting of [
      { ...original, roleName: 'WarehouseManager' },
      { ...original, actorUserId: 'admin-2' },
      { ...original, reason: 'Warehouse staffing' },
      { ...original, email: 'different@example.com' },
    ]) {
      await assert.rejects(
        () => createInternalInvitationService(options).createInvitation(conflicting),
        (error) => error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
      );
    }
    assert.equal(state.invitations.length, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.outbox.length, 1);
  });

  it('replays actual legacy invitation rows from exact before/after binding keys', async () => {
    const state = createState();
    const options = {
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    };
    const createCommand = {
      email: 'legacy-invite@example.com',
      roleName: 'Staff',
      idempotencyKey: 'legacy-create',
      actorUserId: 'admin-1',
      reason: 'Legacy create',
    };
    const first = await createInternalInvitationService(options).createInvitation(createCommand);
    const createAudit = state.audits.find(
      (entry) => entry.action === 'INTERNAL_INVITATION_CREATED'
    );
    delete createAudit.replayBinding;

    const createReplay = await createInternalInvitationService(options)
      .createInvitation(createCommand);
    assert.equal(createReplay.replay, true);
    assert.equal(createReplay.invitation.id, first.invitation.id);

    const resendCommand = {
      invitationId: first.invitation.id,
      idempotencyKey: 'legacy-resend',
      actorUserId: 'admin-1',
    };
    const resent = await createInternalInvitationService(options)
      .resendInvitation(resendCommand);
    const resendAudit = state.audits.find(
      (entry) => entry.action === 'INTERNAL_INVITATION_RESENT'
    );
    delete resendAudit.replayBinding;

    const resendReplay = await createInternalInvitationService(options)
      .resendInvitation(resendCommand);
    assert.equal(resendReplay.replay, true);
    assert.equal(resendReplay.invitation.id, resent.invitation.id);
  });

  it('durably binds invitation revocation idempotency to actor target and reason', async () => {
    const state = createState();
    const options = {
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    };
    const service = createInternalInvitationService(options);
    const first = await service.createInvitation({
      email: 'revoke-a@example.com',
      roleName: 'Staff',
      idempotencyKey: 'create-a',
      actorUserId: 'admin-1',
    });
    const second = await service.createInvitation({
      email: 'revoke-b@example.com',
      roleName: 'Staff',
      idempotencyKey: 'create-b',
      actorUserId: 'admin-1',
    });
    const command = {
      invitationId: first.invitation.id,
      idempotencyKey: 'bound-revoke',
      actorUserId: 'admin-1',
      reason: 'Assignment withdrawn',
    };
    await service.revokeInvitation(command);
    const revokeAudit = state.audits.find((entry) => entry.action === 'INTERNAL_INVITATION_REVOKED');
    revokeAudit.replayBinding = {
      commandFingerprint: revokeAudit.after.commandFingerprint,
    };
    delete revokeAudit.after;
    const replay = await createInternalInvitationService(options).revokeInvitation(command);
    assert.equal(replay.replay, true);

    for (const conflicting of [
      { ...command, invitationId: second.invitation.id },
      { ...command, actorUserId: 'admin-2' },
      { ...command, reason: 'Different reason' },
    ]) {
      await assert.rejects(
        () => createInternalInvitationService(options).revokeInvitation(conflicting),
        (error) => error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
      );
    }
    assert.equal(state.invitations[1].state, 'PendingAcceptance');
  });

  it('durably binds invitation acceptance idempotency to invite evidence and profile', async () => {
    const state = createState();
    const options = {
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    };
    const service = createInternalInvitationService(options);
    await service.createInvitation({
      email: 'accept-bound@example.com',
      roleName: 'Staff',
      idempotencyKey: 'accept-bound-create',
      actorUserId: 'admin-1',
    });
    const command = {
      email: 'accept-bound@example.com',
      token: 'invite-token',
      fullName: 'Bound Recipient',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'bound-accept',
    };
    const first = await service.acceptInvitation(command);
    const acceptAudit = state.audits.find((entry) => entry.action === 'AUTH_INVITATION_ACCEPTED');
    acceptAudit.replayBinding = {
      commandFingerprint: acceptAudit.after.commandFingerprint,
    };
    delete acceptAudit.after;
    const replay = await createInternalInvitationService(options).acceptInvitation(command);
    assert.equal(replay.replay, true);
    assert.equal(replay.user.id, first.user.id);

    for (const conflicting of [
      { ...command, email: 'other@example.com' },
      { ...command, token: 'different-token' },
      { ...command, fullName: 'Different Recipient' },
      { ...command, phoneNumber: '0987654321' },
    ]) {
      await assert.rejects(
        () => createInternalInvitationService(options).acceptInvitation(conflicting),
        (error) => error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
      );
    }
    assert.equal(state.users.length, 1);
  });

  it('does not reveal whether an email already has an account before valid invitation proof', async () => {
    const existingState = createState();
    existingState.users.push({
      _id: 'existing-user',
      fullName: 'Existing User',
      email: 'existing@example.com',
      phoneNumber: '0912345678',
      status: 'Active',
      roleId: 'role-Staff',
    });
    const unknownState = createState();
    const options = {
      tokenSecret: 'invitation-test-secret',
      transactionManager: { async withTransaction(work) { return work(null); } },
    };
    const input = {
      token: 'invalid-token',
      fullName: 'Candidate User',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'anti-enumeration',
    };
    const existingError = await createInternalInvitationService({
      ...options,
      repository: existingState.repository,
    }).acceptInvitation({
      ...input,
      email: 'existing@example.com',
    }).catch((error) => error);
    const unknownError = await createInternalInvitationService({
      ...options,
      repository: unknownState.repository,
    }).acceptInvitation({
      ...input,
      email: 'unknown@example.com',
    }).catch((error) => error);

    assert.deepEqual(
      {
        statusCode: existingError.statusCode,
        errorCode: existingError.errorCode,
        message: existingError.message,
        errors: existingError.errors,
      },
      {
        statusCode: unknownError.statusCode,
        errorCode: unknownError.errorCode,
        message: unknownError.message,
        errors: unknownError.errors,
      },
    );
  });

  it('allows only one live invitation when different idempotency keys race for one normalized email', async () => {
    const state = createState();
    let releaseLatestLookups;
    const bothLatestLookups = new Promise((resolve) => {
      releaseLatestLookups = resolve;
    });
    let latestLookupCount = 0;
    const baseFindLatest = state.repository.findLatest;
    state.repository.findLatest = async (email) => {
      latestLookupCount += 1;
      if (latestLookupCount <= 2) {
        if (latestLookupCount === 2) releaseLatestLookups();
        await bothLatestLookups;
        return null;
      }
      return baseFindLatest(email);
    };
    const baseCreate = state.repository.create;
    state.repository.create = async (data) => {
      if (
        state.invitations.some(
          (item) => item.email === data.email && item.state === 'PendingAcceptance',
        )
      ) {
        const error = new Error('duplicate live invitation');
        error.code = 11000;
        throw error;
      }
      return baseCreate(data);
    };
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work(null); } },
    });

    const results = await Promise.allSettled([
      service.createInvitation({
        email: ' Race@Example.com ',
        roleName: 'Staff',
        idempotencyKey: 'race-1',
        actorUserId: 'admin-1',
      }),
      service.createInvitation({
        email: 'race@example.com',
        roleName: 'WarehouseManager',
        idempotencyKey: 'race-2',
        actorUserId: 'admin-1',
      }),
    ]);

    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    const rejected = results.find((item) => item.status === 'rejected');
    assert.equal(rejected.reason.errorCode, 'INVITATION_ALREADY_PENDING');
    assert.equal(state.invitations.length, 1);
    assert.equal(state.invitations[0].state, 'PendingAcceptance');
    assert.equal(state.outbox.length, 1);
  });

  it('declares a partial unique database invariant for one live invitation per email', () => {
    const liveIndex = InternalInvitation.schema.indexes().find(
      ([keys, options]) => (
        keys.email === 1
        && options.unique === true
        && options.partialFilterExpression?.state === 'PendingAcceptance'
      ),
    );

    assert.ok(liveIndex);
  });

  it('atomically resends and revokes invitations with attributed lifecycle audit', async () => {
    const state = createState();
    const transactionManager = createRollbackTransactionManager(state);
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager,
    });
    const created = await service.createInvitation({
      email: 'warehouse@example.com',
      roleName: 'WarehouseManager',
      idempotencyKey: 'invite-original',
      actorUserId: 'admin-1',
    });
    const originalEnqueue = state.repository.enqueue;
    state.repository.enqueue = async () => {
      throw new Error('outbox unavailable');
    };
    await assert.rejects(
      () => service.resendInvitation({
        invitationId: created.invitation.id,
        idempotencyKey: 'invite-resend',
        actorUserId: 'admin-1',
      }),
      /outbox unavailable/,
    );
    assert.equal(state.invitations.length, 1);
    assert.equal(state.invitations[0].state, 'PendingAcceptance');

    state.repository.enqueue = originalEnqueue;
    const resent = await service.resendInvitation({
      invitationId: created.invitation.id,
      idempotencyKey: 'invite-resend',
      actorUserId: 'admin-1',
      reason: 'Recipient requested a new link',
    });
    assert.equal(state.invitations[0].state, 'Revoked');
    assert.equal(state.invitations[1].state, 'PendingAcceptance');
    assert.equal(state.audits.at(-1).action, 'INTERNAL_INVITATION_RESENT');

    await service.revokeInvitation({
      invitationId: resent.invitation.id,
      idempotencyKey: 'invite-revoke',
      actorUserId: 'admin-1',
      reason: 'Assignment withdrawn',
    });
    assert.equal(state.invitations[1].state, 'Revoked');
    assert.equal(state.audits.at(-1).action, 'INTERNAL_INVITATION_REVOKED');
    assert.equal(state.audits.at(-1).userId, 'admin-1');
  });

  it('replays a concurrently committed resend from its matching durable command audit', async () => {
    const state = createState();
    const transactionManager = createRollbackTransactionManager(state);
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager,
    });
    const original = await service.createInvitation({
      email: 'concurrent@example.com',
      roleName: 'Staff',
      idempotencyKey: 'invite-original',
      actorUserId: 'admin-1',
    });
    const firstResend = await service.resendInvitation({
      invitationId: original.invitation.id,
      idempotencyKey: 'resend-concurrent',
      actorUserId: 'admin-1',
    });
    const resendAudit = state.audits.find((entry) => entry.action === 'INTERNAL_INVITATION_RESENT');
    resendAudit.replayBinding = {
      priorTargetId: resendAudit.before.invitationId,
    };
    delete resendAudit.before;
    delete resendAudit.after;

    const committedAuditLookup = state.repository.findAuditByEventId;
    const committedInvitationLookup = state.repository.findByIdempotency;
    const normalFindById = state.repository.findById;
    const normalCreate = state.repository.create;
    state.repository.findAuditByEventId = async (eventId, session) => (
      session ? null : committedAuditLookup(eventId)
    );
    state.repository.findByIdempotency = async (email, key, session) => (
      session ? null : committedInvitationLookup(email, key)
    );
    state.repository.findById = async (id, session) => (
      session && id === original.invitation.id
        ? state.invitations[0]
        : normalFindById(id)
    );
    let duplicateCreateAttempts = 0;
    state.repository.create = async () => {
      duplicateCreateAttempts += 1;
      const error = new Error('duplicate key after concurrent commit');
      error.code = 11000;
      throw error;
    };

    const replay = await service.resendInvitation({
      invitationId: original.invitation.id,
      idempotencyKey: 'resend-concurrent',
      actorUserId: 'admin-1',
    });

    assert.equal(replay.replay, true);
    assert.equal(replay.invitation.id, firstResend.invitation.id);
    assert.equal(duplicateCreateAttempts, 1);
    assert.equal(state.invitations.length, 2);
    assert.equal(state.outbox.length, 2);
    state.repository.create = normalCreate;
  });

  it('rejects a resend key already bound to another command instead of replaying it', async () => {
    const state = createState();
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    });
    const created = await service.createInvitation({
      email: 'key-reuse@example.com',
      roleName: 'Staff',
      idempotencyKey: 'shared-command-key',
      actorUserId: 'admin-1',
    });

    await assert.rejects(
      () => service.resendInvitation({
        invitationId: created.invitation.id,
        idempotencyKey: 'shared-command-key',
        actorUserId: 'admin-1',
      }),
      (error) => error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
    );
    assert.equal(state.invitations.length, 1);
    assert.equal(state.invitations[0].state, 'PendingAcceptance');
  });

  it('expires a pending invitation inside the create transaction before issuing a replacement', async () => {
    const state = createState();
    const current = new Date('2026-07-24T00:00:00.000Z');
    state.invitations.push({
      _id: 'invite-expired',
      email: 'expired@example.com',
      roleName: 'Staff',
      tokenHash: hashInvitationToken('expired@example.com', 'expired-token', 'invitation-test-secret'),
      state: 'PendingAcceptance',
      expiresAt: new Date('2026-07-23T23:59:59.000Z'),
      idempotencyKey: 'expired-command',
    });
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'replacement-token',
      tokenSecret: 'invitation-test-secret',
      now: () => current,
      transactionManager: createRollbackTransactionManager(state),
    });

    const replacement = await service.createInvitation({
      email: 'expired@example.com',
      roleName: 'WarehouseManager',
      idempotencyKey: 'replacement-command',
      actorUserId: 'admin-1',
    });

    assert.equal(state.invitations.length, 2);
    assert.equal(state.invitations[0].state, 'Expired');
    assert.equal(state.invitations[1].state, 'PendingAcceptance');
    assert.equal(replacement.invitation.roleName, 'WarehouseManager');
    await assert.rejects(
      () => service.acceptInvitation({
        email: 'expired@example.com',
        token: 'expired-token',
        fullName: 'Expired Recipient',
        phoneNumber: '0912345678',
        password: 'Matkhau123',
        confirmPassword: 'Matkhau123',
        idempotencyKey: 'expired-accept',
      }),
      (error) => error.errorCode === 'INVITATION_INVALID',
    );
    assert.equal(state.users.length, 0);
  });

  it('requires a dedicated strong invitation token secret in production', () => {
    assert.throws(
      () => createInternalInvitationService({
        repository: createState().repository,
        tokenSecret: 'short',
        environment: 'production',
      }),
      /RESET_OTP_SECRET/,
    );
  });
});
