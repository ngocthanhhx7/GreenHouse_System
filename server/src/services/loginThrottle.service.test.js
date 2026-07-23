const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createLoginThrottleService } = require('./loginThrottle.service');

function createRepository() {
  const entries = [];
  return {
    entries,
    async count({ kind, key, since }) {
      return entries.filter((entry) => entry.kind === kind && entry.key === key && entry.createdAt >= since).length;
    },
    async record(entry) {
      entries.push(entry);
    },
    async clearEmail(key) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].kind === 'email' && entries[index].key === key) entries.splice(index, 1);
      }
    },
    async claim({ kind, key, since, limit, createdAt }) {
      const current = entries.filter(
        (entry) => entry.kind === kind && entry.key === key && entry.createdAt >= since,
      );
      if (current.length >= limit) return false;
      entries.push({ kind, key, createdAt });
      return true;
    },
  };
}

describe('login throttle', () => {
  it('AT-138 applies independent five-email and thirty-IP temporary login limits', async () => {
    const repository = createRepository();
    const now = new Date('2026-07-24T00:00:00.000Z');
    const service = createLoginThrottleService({ repository, now: () => now });

    for (let index = 0; index < 5; index += 1) {
      await service.recordAttempt({ ip: '10.0.0.1' });
      await service.recordFailure({ email: 'USER@example.com', ip: '10.0.0.1' });
    }
    await assert.rejects(
      () => service.assertAllowed({ email: 'user@example.com', ip: '10.0.0.2' }),
      (error) => error.errorCode === 'LOGIN_EMAIL_THROTTLED'
    );
    await service.clearEmail('user@example.com');

    for (let index = 0; index < 30; index += 1) {
      await service.recordAttempt({ ip: '10.0.0.9' });
    }
    await assert.rejects(
      () => service.assertAllowed({ email: 'other@example.com', ip: '10.0.0.9' }),
      (error) => error.errorCode === 'LOGIN_IP_THROTTLED'
    );
  });

  it('atomically admits exactly five concurrent failures at the email boundary', async () => {
    const repository = createRepository();
    const now = new Date('2026-07-24T00:00:00.000Z');
    const service = createLoginThrottleService({
      repository,
      now: () => now,
      emailLimit: 5,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.claimFailure({
        email: 'RACE@example.com',
        ip: '10.0.0.1',
      })),
    );

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 5);
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.errorCode, 'LOGIN_EMAIL_THROTTLED');
  });

  it('atomically admits exactly thirty concurrent attempts at the IP boundary', async () => {
    const repository = createRepository();
    const now = new Date('2026-07-24T00:00:00.000Z');
    const service = createLoginThrottleService({
      repository,
      now: () => now,
      ipLimit: 30,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 31 }, () => service.claimAttempt({
        email: 'race@example.com',
        ip: '10.0.0.9',
      })),
    );

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 30);
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.errorCode, 'LOGIN_IP_THROTTLED');
  });
});
