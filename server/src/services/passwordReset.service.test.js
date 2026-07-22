const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createPasswordResetService, hashOtp } = require('./passwordReset.service');

const NOW = new Date('2026-07-22T03:00:00.000Z');

function repositories({ createdAt = new Date(NOW.getTime() - 61_000) } = {}) {
  const users = [{ _id: 'user-1', email: 'thanh@example.com', passwordHash: 'old-hash', passwordChangedAt: null, status: 'Active' }];
  const tokens = [];
  const outbox = [];
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
    },
    outboxService: { async enqueue(event) { outbox.push(event); return event; }, events: outbox },
  };
}

function createService(repos, overrides = {}) {
  return createPasswordResetService({
    ...repos,
    now: () => NOW,
    otpGenerator: () => '123456',
    otpSecret: 'test-otp-secret-at-least-32-characters',
    hashPassword: async (password) => `hashed:${password}`,
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
    await assert.rejects(
      () => service.resetPassword({ email: 'thanh@example.com', otp: '123456', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
      (error) => error.errorCode === 'OTP_INVALID_OR_USED'
    );
  });

  it('locks the OTP after five incorrect attempts with a distinct error', async () => {
    const repos = repositories();
    const service = createService(repos);
    await service.requestReset('thanh@example.com');

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await assert.rejects(
        () => service.resetPassword({ email: 'thanh@example.com', otp: '000000', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
        (error) => error.errorCode === 'OTP_INCORRECT' && error.errors[0].field === 'otp'
      );
    }
    await assert.rejects(
      () => service.resetPassword({ email: 'thanh@example.com', otp: '000000', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
      (error) => error.errorCode === 'OTP_ATTEMPT_LIMIT'
    );
  });

  it('reports expiry separately from an incorrect OTP', async () => {
    const repos = repositories();
    const service = createService(repos, { ttlMs: -1 });
    await service.requestReset('thanh@example.com');

    await assert.rejects(
      () => service.resetPassword({ email: 'thanh@example.com', otp: '123456', password: 'NewPassword123', confirmPassword: 'NewPassword123' }),
      (error) => error.errorCode === 'OTP_EXPIRED'
    );
  });

  it('does not send another OTP during the resend cooldown', async () => {
    const repos = repositories();
    const service = createService(repos);
    await service.requestReset('thanh@example.com');
    await service.requestReset('thanh@example.com');
    assert.equal(repos.tokens.length, 1);
    assert.equal(repos.outboxService.events.length, 1);
  });
});
