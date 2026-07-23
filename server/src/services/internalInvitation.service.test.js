const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createInternalInvitationService, hashInvitationToken } = require('./internalInvitation.service');

function createState() {
  const invitations = [];
  const users = [];
  return {
    invitations,
    users,
    repository: {
      async findUserByEmail(email) { return users.find((item) => item.email === email) || null; },
      async findLatest(email) { return [...invitations].reverse().find((item) => item.email === email && item.state === 'PendingAcceptance') || null; },
      async create(data) { const item = { _id: `invite-${invitations.length + 1}`, ...data }; invitations.push(item); return item; },
      async revoke(id, now, reason) { const item = invitations.find((entry) => entry._id === id); item.state = 'Revoked'; item.revokedAt = now; item.reason = reason; return item; },
      async invalidate(email, now) { invitations.filter((item) => item.email === email && item.state === 'PendingAcceptance').forEach((item) => { item.state = 'Revoked'; item.revokedAt = now; }); },
      async consume(id, now) { const item = invitations.find((entry) => entry._id === id && entry.state !== 'Revoked'); if (!item || item.state !== 'PendingAcceptance') return null; item.state = 'Accepted'; item.acceptedAt = now; return item; },
      async createUser(data) { const item = { _id: `user-${users.length + 1}`, ...data }; users.push(item); return item; },
      async findRole(roleName) { return { _id: `role-${roleName}`, roleName }; },
      async audit() {},
      async enqueue() {},
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
    await service.createInvitation({ email: 'warehouse@example.com', roleName: 'WarehouseManager', idempotencyKey: 'invite-1' });
    const result = await service.acceptInvitation({
      email: 'warehouse@example.com', token: 'invite-token', fullName: 'Warehouse User', phoneNumber: '0912345678',
      password: 'Matkhau123', confirmPassword: 'Matkhau123', idempotencyKey: 'accept-1',
    });
    assert.equal(result.user.role.roleName, 'WarehouseManager');
    assert.equal(state.users[0].status, 'Active');
    assert.equal(state.invitations[0].state, 'Accepted');
  });

  it('AT-131 rejects Customer/Admin invitation roles and former or existing-email acceptance', async () => {
    const state = createState();
    const service = createInternalInvitationService({
      repository: state.repository,
      tokenGenerator: () => 'invite-token',
      tokenSecret: 'invitation-test-secret',
    });
    await assert.rejects(
      () => service.createInvitation({ email: 'x@example.com', roleName: 'Admin', idempotencyKey: 'bad' }),
      (error) => error.errorCode === 'INVITATION_ROLE_FORBIDDEN'
    );
  });
});
