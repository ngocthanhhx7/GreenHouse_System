const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createRegistrationService, hashRegistrationOtp } = require('./registration.service');
const { hashPassword } = require('../utils/password');

function createRepositories() {
  const challenges = [];
  const users = [];
  const audit = [];
  const outbox = [];
  const role = { _id: 'role-customer', roleName: 'Customer' };
  const repository = {
    challenges,
    users,
    async findUserByEmail(email) { return users.find((item) => item.email === email) || null; },
    async findLatest(email) { return [...challenges].reverse().find((item) => item.email === email && item.state === 'PendingVerification') || null; },
    async findLatestAny(email) { return [...challenges].reverse().find((item) => item.email === email) || null; },
    async findByIdempotency(email, idempotencyKey) { return challenges.find((item) => item.email === email && item.idempotencyKey === idempotencyKey) || null; },
    async invalidate(email, now) {
      challenges.filter((item) => item.email === email && item.state === 'PendingVerification')
        .forEach((item) => { item.state = 'Invalidated'; item.invalidatedAt = now; });
    },
    async createChallenge(data) { const item = { _id: `challenge-${challenges.length + 1}`, ...data }; challenges.push(item); return item; },
    async consume(id, now) {
      const item = challenges.find((entry) => entry._id === id && entry.state === 'PendingVerification');
      if (!item) return null;
      item.state = 'Consumed'; item.usedAt = now; return item;
    },
    async incrementAttempt(id) {
      const item = challenges.find((entry) => entry._id === id);
      item.attemptCount += 1;
      if (item.attemptCount >= 5) item.state = 'Invalidated';
      return item;
    },
    async createUser(data) { const item = { _id: `user-${users.length + 1}`, ...data }; users.push(item); return item; },
    async findCustomerRole() { return role; },
    async audit(entry) { audit.push(entry); },
    async enqueue(event) { outbox.push(event); },
  };
  return { repository, challenges, users, audit, outbox };
}

describe('verified Customer registration', () => {
  it('AT-125 creates one latest hashed registration challenge without User/session/address', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work(null); } },
    });
    const result = await service.requestRegistrationChallenge({
      email: ' Thanh@Example.com ',
      idempotencyKey: 'request-1',
      ip: '127.0.0.1',
    });
    assert.equal(result.accepted, true);
    assert.equal(state.users.length, 0);
    assert.equal(state.challenges[0].otpHash, hashRegistrationOtp('thanh@example.com', '123456', 'registration-test-secret'));
    assert.equal(JSON.stringify(state.challenges).includes('123456'), false);
    assert.equal(state.outbox.length, 1);
  });

  it('AT-126 consumes a valid latest OTP into one Active Customer without registration address or session', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work({ id: 'tx-1' }); } },
    });
    await service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'request-1' });
    const result = await service.completeRegistration({
      email: 'thanh@example.com',
      otp: '123456',
      fullName: 'Nguyễn Ngọc Thành',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'complete-1',
    });
    assert.equal(result.user.role.roleName, 'Customer');
    assert.equal(state.users[0].status, 'Active');
    assert.equal(state.users[0].address, undefined);
    assert.equal(state.challenges[0].state, 'Consumed');
    assert.equal(state.audit[0].action, 'AUTH_REGISTER_VERIFIED');
  });

  it('replays a registration challenge idempotency key without issuing another OTP', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work(null); } },
    });
    const first = await service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'same-key' });
    const replay = await service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'same-key' });
    assert.equal(state.challenges.length, 1);
    assert.equal(replay.challengeId, first.challengeId);
    assert.equal(replay.replay, true);
  });

  it('AT-127 bounds wrong fifth expired former used and early resend OTP attempts', async () => {
    const state = createRepositories();
    let now = new Date('2026-07-24T00:00:00.000Z');
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      now: () => now,
      transactionManager: { async withTransaction(work) { return work(null); } },
    });
    await service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'request-1' });
    for (let index = 0; index < 4; index += 1) {
      await assert.rejects(
        () => service.completeRegistration({
          email: 'thanh@example.com', otp: '000000', fullName: 'A B', phoneNumber: '0912345678',
          password: 'Matkhau123', confirmPassword: 'Matkhau123', idempotencyKey: `wrong-${index}`,
        }),
        (error) => error.errorCode === 'OTP_INCORRECT'
      );
    }
    await assert.rejects(
      () => service.completeRegistration({
        email: 'thanh@example.com', otp: '000000', fullName: 'A B', phoneNumber: '0912345678',
        password: 'Matkhau123', confirmPassword: 'Matkhau123', idempotencyKey: 'wrong-5',
      }),
      (error) => error.errorCode === 'OTP_ATTEMPT_LIMIT'
    );
    await assert.rejects(
      () => service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'request-2' }),
      (error) => error.errorCode === 'OTP_RESEND_COOLDOWN'
    );
    now = new Date('2026-07-24T00:11:00.000Z');
    await service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'request-3' });
    state.challenges.at(-1).expiresAt = new Date('2026-07-24T00:10:00.000Z');
    await assert.rejects(
      () => service.completeRegistration({
        email: 'thanh@example.com', otp: '123456', fullName: 'A B', phoneNumber: '0912345678',
        password: 'Matkhau123', confirmPassword: 'Matkhau123', idempotencyKey: 'expired',
      }),
      (error) => error.errorCode === 'OTP_EXPIRED'
    );
  });

  it('AT-128 deduplicates concurrent registration by normalized email and idempotency', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      transactionManager: { async withTransaction(work) { return work(null); } },
    });
    await service.requestRegistrationChallenge({ email: 'thanh@example.com', idempotencyKey: 'request-1' });
    const input = {
      email: 'thanh@example.com', otp: '123456', fullName: 'A B', phoneNumber: '0912345678',
      password: 'Matkhau123', confirmPassword: 'Matkhau123', idempotencyKey: 'complete-1',
    };
    const results = await Promise.allSettled([service.completeRegistration(input), service.completeRegistration(input)]);
    assert.equal(state.users.length, 1);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  });
});
