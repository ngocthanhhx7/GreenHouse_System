const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createRegistrationService, hashRegistrationOtp } = require('./registration.service');
const { hashPassword } = require('../utils/password');
const RegistrationChallenge = require('../models/registrationChallenge.model');

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
    async findUserById(id) {
      const user = users.find((item) => item._id === id);
      return user ? { ...user, roleId: role } : null;
    },
    async findAuditByEventId(eventId) {
      return audit.find((item) => item.eventId === eventId) || null;
    },
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
    async audit(entry) {
      audit.push({
        ...entry,
        replayBinding: entry.after?.commandFingerprint
          ? { commandFingerprint: entry.after.commandFingerprint }
          : undefined,
      });
    },
    async enqueue(event) { outbox.push(event); },
  };
  return { repository, challenges, users, audit, outbox };
}

function createRollbackTransactionManager(state) {
  return {
    async withTransaction(work) {
      const snapshots = {
        challenges: structuredClone(state.challenges),
        users: structuredClone(state.users),
        audit: structuredClone(state.audit),
        outbox: structuredClone(state.outbox),
      };
      try {
        return await work({ id: 'tx-rollback-aware' });
      } catch (error) {
        for (const [key, snapshot] of Object.entries(snapshots)) {
          state[key].splice(0, state[key].length, ...snapshot);
        }
        throw error;
      }
    },
  };
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
    assert.equal(state.outbox.length, 2);
    assert.equal(state.outbox[1].eventType, 'ACCOUNT_REGISTRATION_COMPLETED');
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
    assert.deepEqual(replay, first);
    assert.deepEqual(replay, { accepted: true });
  });

  it('keeps registration challenge responses uniform for existing fresh replay and cooldown identities', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work(null); } },
    });

    const fresh = await service.requestRegistrationChallenge({
      email: 'fresh@example.com',
      idempotencyKey: 'fresh-1',
    });
    const replay = await service.requestRegistrationChallenge({
      email: 'fresh@example.com',
      idempotencyKey: 'fresh-1',
    });
    const cooldown = await service.requestRegistrationChallenge({
      email: 'fresh@example.com',
      idempotencyKey: 'fresh-2',
    });
    state.users.push({ _id: 'existing-user', email: 'existing@example.com' });
    const existing = await service.requestRegistrationChallenge({
      email: 'existing@example.com',
      idempotencyKey: 'existing-1',
    });

    assert.deepEqual(fresh, { accepted: true });
    assert.deepEqual(replay, fresh);
    assert.deepEqual(cooldown, fresh);
    assert.deepEqual(existing, fresh);
    assert.equal(state.challenges.length, 1);
    assert.equal(state.outbox.length, 1);
  });

  it('does not distinguish an existing registration identity from an unknown challenge', async () => {
    const existingState = createRepositories();
    existingState.users.push({
      _id: 'existing-user',
      fullName: 'Existing User',
      email: 'existing@example.com',
      phoneNumber: '0912345678',
      status: 'Active',
    });
    const unknownState = createRepositories();
    const serviceOptions = {
      otpSecret: 'registration-test-secret',
      transactionManager: { async withTransaction(work) { return work(null); } },
    };
    const existingService = createRegistrationService({
      ...serviceOptions,
      repository: existingState.repository,
    });
    const unknownService = createRegistrationService({
      ...serviceOptions,
      repository: unknownState.repository,
    });
    const input = {
      otp: '123456',
      fullName: 'Candidate User',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'completion-1',
    };

    const existingError = await existingService.completeRegistration({
      ...input,
      email: 'existing@example.com',
    }).catch((error) => error);
    const unknownError = await unknownService.completeRegistration({
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

  it('allows only one live challenge when different idempotency keys race for one normalized email', async () => {
    const state = createRepositories();
    let releaseLatestLookups;
    const bothLatestLookups = new Promise((resolve) => {
      releaseLatestLookups = resolve;
    });
    let latestLookupCount = 0;
    state.repository.findLatestAny = async () => {
      latestLookupCount += 1;
      if (latestLookupCount === 2) releaseLatestLookups();
      await bothLatestLookups;
      return null;
    };
    const baseCreate = state.repository.createChallenge;
    state.repository.createChallenge = async (data) => {
      if (
        state.challenges.some(
          (item) => item.email === data.email && item.state === 'PendingVerification',
        )
      ) {
        const error = new Error('duplicate live registration challenge');
        error.code = 11000;
        throw error;
      }
      return baseCreate(data);
    };
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      now: () => new Date('2026-07-24T00:00:00.000Z'),
      transactionManager: { async withTransaction(work) { return work(null); } },
    });

    const responses = await Promise.all([
      service.requestRegistrationChallenge({
        email: ' Race@Example.com ',
        idempotencyKey: 'race-1',
      }),
      service.requestRegistrationChallenge({
        email: 'race@example.com',
        idempotencyKey: 'race-2',
      }),
    ]);

    assert.deepEqual(responses, [{ accepted: true }, { accepted: true }]);
    assert.equal(state.challenges.length, 1);
    assert.equal(state.challenges[0].state, 'PendingVerification');
    assert.equal(state.outbox.length, 1);
  });

  it('declares a partial unique database invariant for one live registration challenge per email', () => {
    const liveIndex = RegistrationChallenge.schema.indexes().find(
      ([keys, options]) => (
        keys.email === 1
        && options.unique === true
        && options.partialFilterExpression?.state === 'PendingVerification'
      ),
    );

    assert.ok(liveIndex);
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
    const cooldown = await service.requestRegistrationChallenge({
      email: 'thanh@example.com',
      idempotencyKey: 'request-2',
    });
    assert.deepEqual(cooldown, { accepted: true });
    assert.equal(state.challenges.length, 1);
    assert.equal(state.outbox.length, 1);
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

  it('replays a completed registration after service restart from durable audit evidence', async () => {
    const state = createRepositories();
    const options = {
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    };
    const firstService = createRegistrationService(options);
    await firstService.requestRegistrationChallenge({
      email: 'durable@example.com',
      idempotencyKey: 'durable-request',
    });
    const command = {
      email: 'durable@example.com',
      otp: '123456',
      fullName: 'Durable Customer',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'durable-complete',
    };
    const first = await firstService.completeRegistration(command);
    state.audit[0] = {
      ...state.audit[0],
      replayBinding: {
        commandFingerprint: state.audit[0].after.commandFingerprint,
      },
    };
    delete state.audit[0].after;

    const restartedService = createRegistrationService(options);
    const replay = await restartedService.completeRegistration(command);

    assert.equal(replay.replay, true);
    assert.equal(replay.user.id, first.user.id);
    assert.equal(state.users.length, 1);
    assert.equal(state.audit.length, 1);
    assert.equal(state.outbox.filter((item) => item.eventType === 'ACCOUNT_REGISTRATION_COMPLETED').length, 1);
  });

  it('replays an actual legacy registration row with only after.commandFingerprint', async () => {
    const state = createRepositories();
    const options = {
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    };
    const firstService = createRegistrationService(options);
    await firstService.requestRegistrationChallenge({
      email: 'legacy-registration@example.com',
      idempotencyKey: 'legacy-request',
    });
    const command = {
      email: 'legacy-registration@example.com',
      otp: '123456',
      fullName: 'Legacy Customer',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'legacy-complete',
    };
    const first = await firstService.completeRegistration(command);
    delete state.audit[0].replayBinding;

    const replay = await createRegistrationService(options).completeRegistration(command);

    assert.equal(replay.replay, true);
    assert.equal(replay.user.id, first.user.id);
    assert.equal(state.audit.length, 1);
  });

  it('rejects reuse of a completion idempotency key for different registration data', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    });
    await service.requestRegistrationChallenge({
      email: 'fingerprint@example.com',
      idempotencyKey: 'fingerprint-request',
    });
    const command = {
      email: 'fingerprint@example.com',
      otp: '123456',
      fullName: 'Original Customer',
      phoneNumber: '0912345678',
      password: 'Matkhau123',
      confirmPassword: 'Matkhau123',
      idempotencyKey: 'fingerprint-complete',
    };
    await service.completeRegistration(command);

    await assert.rejects(
      () => service.completeRegistration({ ...command, fullName: 'Different Customer' }),
      (error) => error.errorCode === 'IDEMPOTENCY_KEY_REUSED',
    );
    assert.equal(state.users.length, 1);
  });

  it('AT-127 commits each wrong OTP attempt before returning its distinct error', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    });
    await service.requestRegistrationChallenge({
      email: 'bounded@example.com',
      idempotencyKey: 'bounded-request',
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await assert.rejects(
        () => service.completeRegistration({
          email: 'bounded@example.com',
          otp: '000000',
          fullName: 'Bounded User',
          phoneNumber: '0912345678',
          password: 'Matkhau123',
          confirmPassword: 'Matkhau123',
          idempotencyKey: `bounded-${attempt}`,
        }),
        (error) => error.errorCode === (attempt === 5 ? 'OTP_ATTEMPT_LIMIT' : 'OTP_INCORRECT'),
      );
    }

    assert.equal(state.challenges[0].attemptCount, 5);
    assert.equal(state.challenges[0].state, 'Invalidated');
    assert.equal(state.users.length, 0);
    assert.equal(state.audit.length, 0);
  });

  it('AT-128 rolls back challenge replacement when the email outbox cannot be persisted', async () => {
    const state = createRepositories();
    const service = createRegistrationService({
      repository: state.repository,
      otpGenerator: () => '123456',
      otpSecret: 'registration-test-secret',
      transactionManager: createRollbackTransactionManager(state),
    });
    await service.requestRegistrationChallenge({
      email: 'atomic@example.com',
      idempotencyKey: 'atomic-first',
    });
    state.challenges[0].createdAt = new Date(Date.now() - 61_000);
    state.repository.enqueue = async () => {
      throw new Error('outbox unavailable');
    };

    await assert.rejects(
      () => service.requestRegistrationChallenge({
        email: 'atomic@example.com',
        idempotencyKey: 'atomic-second',
      }),
      /outbox unavailable/,
    );
    assert.equal(state.challenges.length, 1);
    assert.equal(state.challenges[0].state, 'PendingVerification');
    assert.equal(state.outbox.length, 1);
  });

  it('requires a dedicated strong OTP secret in production', () => {
    assert.throws(
      () => createRegistrationService({
        repository: createRepositories().repository,
        otpSecret: 'short',
        environment: 'production',
      }),
      /RESET_OTP_SECRET/,
    );
  });
});
