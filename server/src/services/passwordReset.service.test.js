const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createPasswordResetService, hashOtp } = require('./passwordReset.service');

const NOW = new Date('2026-07-22T03:00:00.000Z');

function repositories({ createdAt = new Date(NOW.getTime() - 61_000) } = {}) {
  const users = [{
    _id: 'user-1',
    email: 'thanh@example.com',
    passwordHash: 'old-hash',
    passwordChangedAt: null,
    credentialVersion: 0,
    status: 'Active',
  }];
  const tokens = [];
  const outbox = [];
  const sessionEvents = [];
  return {
    users,
    tokens,
    tokenRepository: {
      async invalidateForUser(userId, now) {
        tokens.filter((token) => token.userId === userId && !token.usedAt).forEach((token) => { token.usedAt = now; });
      },
      async create(data) {
        const token = { _id: `token-${tokens.length + 1}`, attemptCount: 0, createdAt, ...data };
        tokens.push(token);
        return token;
      },
      async findLatestForUser(userId) {
        return [...tokens].reverse().find((token) => token.userId === userId && !token.usedAt) || null;
      },
      async recordFailedAttempt(id, now, maxAttempts) {
        const token = tokens.find((entry) => entry._id === id);
        if (!token || token.usedAt) return null;
        token.attemptCount += 1;
        if (token.attemptCount >= maxAttempts) token.usedAt = now;
        return token;
      },
      async consume(id, now) {
        const token = tokens.find((entry) => entry._id === id);
        if (!token || token.usedAt || token.expiresAt <= now) return null;
        token.usedAt = now;
        return token;
      },
    },
    userRepository: {
      async findByEmail(email) { return users.find((user) => user.email === email) || null; },
      async updatePassword(id, data) { Object.assign(users.find((user) => user._id === id), data); return users.find((user) => user._id === id); },
      async updatePasswordIfCredentialVersion(id, expectedVersion, data) {
        const user = users.find((entry) => entry._id === id);
        if (!user || user.credentialVersion !== expectedVersion) return null;
        Object.assign(user, data);
        user.credentialVersion += 1;
        return user;
      },
    },
    outboxService: { async enqueue(event) { outbox.push(event); return event; }, events: outbox },
    sessionService: { async revokeAllForUser(userId, reason) { sessionEvents.push({ userId, reason }); return { revokedCount: 2 }; }, events: sessionEvents },
  };
}

function createService(repos, overrides = {}) {
  return createPasswordResetService({
    ...repos,
    now: () => NOW,
    otpGenerator: () => '123456',
    otpSecret: 'test-otp-secret-at-least-32-characters',
    hashPassword: async (password) => `hashed:${password}`,
    transactionManager: { async withTransaction(work) { return work(null); } },
    ...overrides,
  });
}

describe('password reset OTP service', () => {
  it('returns the same anti-enumeration response and stores only an OTP hash', async () => {
    const repos = repositories();
    const service = createService(repos);

    const existing = await service.requestReset('THANH@EXAMPLE.COM');
    const missing = await service.requestReset('unknown@example.com');

    assert.deepEqual(existing, missing);
    assert.equal(repos.tokens.length, 1);
    assert.equal(repos.tokens[0].otpHash, hashOtp('thanh@example.com', '123456', 'test-otp-secret-at-least-32-characters'));
    assert.equal(JSON.stringify(repos.tokens).includes('123456'), false);
    assert.equal(repos.tokens[0].expiresAt.toISOString(), '2026-07-22T03:10:00.000Z');
    assert.equal(repos.outboxService.events[0].eventType, 'PASSWORD_RESET_OTP_REQUESTED');
    assert.equal(JSON.stringify(repos.outboxService.events).includes('123456'), false);
  });

  it('consumes a valid six-digit OTP once and invalidates earlier JWTs', async () => {
    const repos = repositories();
    const service = createService(repos);
    await service.requestReset('thanh@example.com');

    await service.resetPassword({ email: 'thanh@example.com', otp: '123456', password: 'NewPassword123', confirmPassword: 'NewPassword123' });

    assert.equal(repos.users[0].passwordHash, 'hashed:NewPassword123');
    assert.equal(repos.users[0].passwordChangedAt.toISOString(), NOW.toISOString());
    assert.deepEqual(repos.sessionService.events, [{ userId: 'user-1', reason: 'PASSWORD_RESET' }]);
    assert.equal(repos.outboxService.events.at(-1).eventType, 'PASSWORD_RESET_COMPLETED');
    await assert.rejects(
      () => service.resetPassword({ email: 'thanh@example.com', otp: '123456', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
      (error) => error.errorCode === 'OTP_INVALID_OR_USED'
    );
  });

  it('locks the OTP after five incorrect attempts without exposing the boundary', async () => {
    const repos = repositories();
    const service = createService(repos);
    await service.requestReset('thanh@example.com');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await assert.rejects(
        () => service.resetPassword({ email: 'thanh@example.com', otp: '000000', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
        (error) => error.errorCode === 'OTP_INVALID_OR_USED' && error.statusCode === 400
      );
    }
    assert.equal(repos.tokens[0].attemptCount, 5);
    assert.equal(repos.tokens[0].usedAt.toISOString(), NOW.toISOString());
  });

  it('keeps expiry internal to the generic pre-proof OTP envelope', async () => {
    const repos = repositories();
    const service = createService(repos, { ttlMs: -1 });
    await service.requestReset('thanh@example.com');

    await assert.rejects(
      () => service.resetPassword({ email: 'thanh@example.com', otp: '123456', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
      (error) => error.errorCode === 'OTP_INVALID_OR_USED' && error.statusCode === 400
    );
  });

  it('does not expose account state through reset-completion OTP errors before proof', async () => {
    async function captureResetError(repos, otp = '000000') {
      const service = createService(repos);
      try {
        await service.resetPassword({
          email: repos.inputEmail,
          otp,
          password: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        });
        return null;
      } catch (error) {
        return {
          statusCode: error.statusCode,
          errorCode: error.errorCode,
          message: error.message,
          errors: error.errors,
        };
      }
    }

    const unknown = repositories();
    unknown.inputEmail = 'unknown@example.com';

    const disabled = repositories();
    disabled.users[0].status = 'Disabled';
    disabled.inputEmail = 'thanh@example.com';

    const incorrect = repositories();
    incorrect.inputEmail = 'thanh@example.com';
    await createService(incorrect).requestReset(incorrect.inputEmail);

    const expired = repositories();
    expired.inputEmail = 'thanh@example.com';
    await createService(expired, { ttlMs: -1 }).requestReset(expired.inputEmail);

    const envelopes = await Promise.all([
      captureResetError(unknown),
      captureResetError(disabled),
      captureResetError(incorrect),
      captureResetError(expired, '123456'),
    ]);

    assert.deepEqual(envelopes[1], envelopes[0]);
    assert.deepEqual(envelopes[2], envelopes[0]);
    assert.deepEqual(envelopes[3], envelopes[0]);
    assert.equal(incorrect.tokens[0].attemptCount, 1);
  });

  it('does not send another OTP during the resend cooldown', async () => {
    const repos = repositories();
    const service = createService(repos);
    await service.requestReset('thanh@example.com');
    await service.requestReset('thanh@example.com');
    assert.equal(repos.tokens.length, 1);
    assert.equal(repos.outboxService.events.length, 1);
  });

  it('keeps the OTP available when the password update transaction rolls back', async () => {
    const repos = repositories();
    const service = createService(repos, {
      transactionManager: {
        async withTransaction(work) {
          const token = repos.tokens[0];
          try { return await work({ id: 'session-1' }); } catch (error) { token.usedAt = null; throw error; }
        },
      },
      hashPassword: async () => { throw new Error('hash unavailable'); },
    });
    await service.requestReset('thanh@example.com');
    await assert.rejects(() => service.resetPassword({ email: 'thanh@example.com', otp: '123456', password: 'NewPassword123', confirmPassword: 'NewPassword123' }), /hash unavailable/);
    assert.equal(repos.tokens[0].usedAt, null);
  });

  it('does not overwrite a concurrent credential change after OTP verification', async () => {
    const repos = repositories();
    let releaseHash;
    let hashStarted;
    const started = new Promise((resolve) => { hashStarted = resolve; });
    const release = new Promise((resolve) => { releaseHash = resolve; });
    const service = createService(repos, {
      hashPassword: async () => {
        hashStarted();
        await release;
        return 'otp-reset-hash';
      },
      transactionManager: {
        async withTransaction(work) {
          const tokenSnapshot = structuredClone(repos.tokens);
          try {
            return await work({ id: 'otp-reset-tx' });
          } catch (error) {
            repos.tokens.splice(0, repos.tokens.length, ...tokenSnapshot);
            throw error;
          }
        },
      },
    });
    await service.requestReset('thanh@example.com');

    const pendingReset = service.resetPassword({
      email: 'thanh@example.com',
      otp: '123456',
      password: 'NewPassword123',
      confirmPassword: 'NewPassword123',
    });
    await started;
    Object.assign(repos.users[0], {
      passwordHash: 'self-change-hash',
      credentialVersion: 1,
      passwordChangedAt: new Date('2026-07-22T03:00:01.000Z'),
    });
    releaseHash();

    await assert.rejects(
      pendingReset,
      (error) => error.errorCode === 'CREDENTIAL_CHANGED_CONCURRENTLY'
    );
    assert.equal(repos.users[0].passwordHash, 'self-change-hash');
    assert.equal(repos.tokens[0].usedAt, null);
  });

  it('rolls back reset-token replacement when outbox persistence fails', async () => {
    const repos = repositories();
    const transactionManager = {
      async withTransaction(work) {
        const tokens = structuredClone(repos.tokens);
        const outbox = structuredClone(repos.outboxService.events);
        try {
          return await work({ id: 'tx-reset-request' });
        } catch (error) {
          repos.tokens.splice(0, repos.tokens.length, ...tokens);
          repos.outboxService.events.splice(
            0,
            repos.outboxService.events.length,
            ...outbox,
          );
          throw error;
        }
      },
    };
    const service = createService(repos, { transactionManager });
    await service.requestReset('thanh@example.com');
    repos.tokens[0].createdAt = new Date(NOW.getTime() - 61_000);
    repos.outboxService.enqueue = async () => {
      throw new Error('outbox unavailable');
    };

    await assert.rejects(
      () => service.requestReset('thanh@example.com'),
      /outbox unavailable/,
    );
    assert.equal(repos.tokens.length, 1);
    assert.equal(repos.tokens[0].usedAt, null);
  });

  it('requires a dedicated strong reset secret in production', () => {
    const repos = repositories();
    assert.throws(
      () => createPasswordResetService({
        ...repos,
        otpSecret: 'short',
        environment: 'production',
      }),
      /RESET_OTP_SECRET/,
    );
  });
});
