const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createSessionService, hashSessionSelector } = require('./session.service');

function createRepositories() {
  const sessions = [];
  const user = {
    _id: 'user-1',
    fullName: 'Nguyễn Ngọc Thành',
    email: 'thanh@example.com',
    phoneNumber: '0912345678',
    status: 'Active',
    roleId: { _id: 'role-customer', roleName: 'Customer' },
  };
  return {
    sessions,
    user,
    sessionRepository: {
      async create(data) {
        const value = { _id: `session-${sessions.length + 1}`, ...data };
        sessions.push(value);
        return value;
      },
      async findBySelectorHash(selectorHash) {
        return sessions.find((item) => item.selectorHash === selectorHash) || null;
      },
      async touch(id, lastSeenAt, idleExpiresAt) {
        const value = sessions.find((item) => item._id === id);
        Object.assign(value, { lastSeenAt, idleExpiresAt });
        return value;
      },
      async revoke(id, revokedAt, reason) {
        const value = sessions.find((item) => item._id === id);
        if (!value || value.revokedAt) return value || null;
        Object.assign(value, { revokedAt, revokeReason: reason });
        return value;
      },
      async revokeAllForUser(userId, revokedAt, reason) {
        let count = 0;
        for (const value of sessions.filter((item) => item.userId === userId && !item.revokedAt)) {
          Object.assign(value, { revokedAt, revokeReason: reason });
          count += 1;
        }
        return count;
      },
    },
    userRepository: {
      async findById(id) {
        return id === user._id ? user : null;
      },
    },
  };
}

describe('server-side session service', () => {
  it('AT-139 creates a hashed opaque session with 24-hour idle and 7-day absolute deadlines', async () => {
    const repositories = createRepositories();
    const now = new Date('2026-07-24T00:00:00.000Z');
    const service = createSessionService({
      ...repositories,
      now: () => now,
      selectorGenerator: () => 'opaque-selector',
      csrfSecretGenerator: () => 'csrf-secret',
    });

    const result = await service.createSession({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

    assert.equal(result.selector, 'opaque-selector');
    assert.equal(repositories.sessions[0].selectorHash, hashSessionSelector('opaque-selector'));
    assert.equal(repositories.sessions[0].idleExpiresAt.toISOString(), '2026-07-25T00:00:00.000Z');
    assert.equal(repositories.sessions[0].absoluteExpiresAt.toISOString(), '2026-07-31T00:00:00.000Z');
    assert.equal(JSON.stringify(repositories.sessions[0]).includes('opaque-selector'), false);
  });

  it('AT-140 revalidates current status role idle and absolute deadlines on every request', async () => {
    const repositories = createRepositories();
    let now = new Date('2026-07-24T00:00:00.000Z');
    const service = createSessionService({
      ...repositories,
      now: () => now,
      selectorGenerator: () => 'selector-a',
      csrfSecretGenerator: () => 'csrf-a',
    });
    await service.createSession({ userId: 'user-1' });
    const authenticated = await service.authenticate('selector-a');
    assert.equal(authenticated.user.role, 'Customer');

    repositories.user.status = 'Disabled';
    await assert.rejects(() => service.authenticate('selector-a'), (error) => error.errorCode === 'SESSION_ACCOUNT_INVALID');
    repositories.user.status = 'Active';
    now = new Date('2026-08-01T00:00:00.000Z');
    await assert.rejects(() => service.authenticate('selector-a'), (error) => error.errorCode === 'SESSION_EXPIRED');
  });

  it('AT-141 revokes exactly the current session on logout replay while another device remains valid', async () => {
    const repositories = createRepositories();
    const selectors = ['selector-a', 'selector-b'];
    const service = createSessionService({
      ...repositories,
      selectorGenerator: () => selectors.shift(),
      csrfSecretGenerator: () => 'csrf',
    });
    await service.createSession({ userId: 'user-1' });
    await service.createSession({ userId: 'user-1' });

    assert.equal((await service.revokeCurrent('selector-a')).alreadyProcessed, false);
    assert.equal((await service.revokeCurrent('selector-a')).alreadyProcessed, true);
    assert.equal((await service.authenticate('selector-b')).user.id, 'user-1');
  });
});
