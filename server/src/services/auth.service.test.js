const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createAuthService } = require('./auth.service');
const { createSessionService, hashSessionSelector } = require('./session.service');
const { hashPassword } = require('../utils/password');

function createUserRepository() {
  const users = [];

  return {
    users,
    async findByEmail(email) {
      return users.find((user) => user.email === email) || null;
    },
    async create(data) {
      const user = {
        _id: `user-${users.length + 1}`,
        status: 'Active',
        ...data,
      };
      users.push(user);
      return user;
    },
  };
}

function createRoleRepository() {
  const roles = [
    { _id: 'role-customer', roleName: 'Customer' },
    { _id: 'role-admin', roleName: 'Admin' },
  ];

  return {
    async findByName(roleName) {
      return roles.find((role) => role.roleName === roleName) || null;
    },
  };
}

function createAuditLogger() {
  const entries = [];
  return {
    entries,
    async log(entry) {
      entries.push(entry);
    },
  };
}

describe('auth service', () => {
  let userRepository;
  let roleRepository;
  let auditLogger;
  let authService;

  beforeEach(() => {
    userRepository = createUserRepository();
    roleRepository = createRoleRepository();
    auditLogger = createAuditLogger();
    authService = createAuthService({
      userRepository,
      roleRepository,
      auditLogger,
      sessionService: {
        sessions: [],
        async createSession(input) {
          this.sessions.push(input);
          return { selector: 'opaque-selector', session: { _id: 'session-1' } };
        },
      },
      loginThrottle: {
        failures: [],
        async claimAttempt() {},
        async claimFailure(input) { this.failures.push(input); },
        async clearEmail() {},
      },
    });
  });

  it('AT-125 rejects the legacy direct registration path', async () => {
    await assert.rejects(
      () => authService.registerCustomer({ email: 'thanh@example.com' }),
      (error) => error.errorCode === 'REGISTRATION_TWO_STEP_REQUIRED' && error.statusCode === 410
    );
    assert.equal(userRepository.users.length, 0);
  });

  it('AT-139 logs in an active user through one server session without a bearer token', async () => {
    userRepository.users.push({
      _id: 'user-1',
      fullName: 'Nguyen Ngoc Thanh',
      email: 'thanh@example.com',
      phoneNumber: '0900000000',
      passwordHash: await hashPassword('Password123'),
      status: 'Active',
      roleId: { _id: 'role-customer', roleName: 'Customer' },
    });

    const result = await authService.login({
      email: 'thanh@example.com',
      password: 'Password123',
    }, { ip: '127.0.0.1', userAgent: 'test' });

    assert.equal(result.token, undefined);
    assert.equal(result.sessionSelector, 'opaque-selector');
    assert.equal(result.user.email, 'thanh@example.com');
    assert.equal(result.user.passwordHash, undefined);
    assert.equal(auditLogger.entries.at(-1).action, 'AUTH_LOGIN_SUCCESS');
  });

  it('AT-136 makes unknown email and wrong password indistinguishable without a session', async () => {
    userRepository.users.push({
      _id: 'user-1',
      email: 'thanh@example.com',
      passwordHash: await hashPassword('Password123'),
      status: 'Active',
      roleId: { roleName: 'Customer' },
    });

    const results = [];
    for (const input of [
      { email: 'missing@example.com', password: 'Password123' },
      { email: 'thanh@example.com', password: 'WrongPassword123' },
    ]) {
      await assert.rejects(() => authService.login(input, { ip: '127.0.0.1' }), (error) => {
        results.push({ statusCode: error.statusCode, message: error.message, errorCode: error.errorCode });
        return true;
      });
    }
    assert.deepEqual(results[0], results[1]);
  });

  it('AT-137 reveals Disabled guidance only after password proof and fails closed on invalid role', async () => {
    userRepository.users.push({
      _id: 'disabled',
      email: 'disabled@example.com',
      passwordHash: await hashPassword('Password123'),
      status: 'Disabled',
      roleId: { roleName: 'Customer' },
    });
    await assert.rejects(
      () => authService.login({ email: 'disabled@example.com', password: 'Wrong1234' }, { ip: '127.0.0.1' }),
      (error) => error.errorCode === 'AUTH_INVALID_CREDENTIALS'
    );
    await assert.rejects(
      () => authService.login({ email: 'disabled@example.com', password: 'Password123' }, { ip: '127.0.0.1' }),
      (error) => error.errorCode === 'AUTH_ACCOUNT_DISABLED'
    );
  });

  it('claims the IP attempt and failed-email budget through atomic throttle operations', async () => {
    const calls = [];
    const service = createAuthService({
      userRepository,
      roleRepository,
      auditLogger,
      passwordComparer: async () => false,
      loginThrottle: {
        async claimAttempt(input) { calls.push(['attempt', input]); },
        async claimFailure(input) { calls.push(['failure', input]); },
        async clearEmail() {},
      },
      sessionService: { async createSession() { throw new Error('not expected'); } },
    });

    await assert.rejects(
      () => service.login(
        { email: 'MISSING@example.com', password: 'WrongPassword123' },
        { ip: '10.0.0.7' }
      ),
      (error) => error.errorCode === 'AUTH_INVALID_CREDENTIALS'
    );

    assert.deepEqual(calls, [
      ['attempt', { email: 'missing@example.com', ip: '10.0.0.7' }],
      ['failure', { email: 'missing@example.com', ip: '10.0.0.7' }],
    ]);
  });

  it('binds a slow login to the credential version verified before a concurrent reset', async () => {
    const currentUser = {
      _id: 'race-user',
      fullName: 'Race User',
      email: 'race@example.com',
      phoneNumber: '0912345678',
      passwordHash: 'old-hash',
      credentialVersion: 0,
      status: 'Active',
      roleId: { _id: 'role-customer', roleName: 'Customer' },
    };
    const sessions = [];
    const sessionService = createSessionService({
      userRepository: {
        async findById(id) { return id === currentUser._id ? { ...currentUser } : null; },
      },
      sessionRepository: {
        async create(data) {
          const session = { _id: `session-${sessions.length + 1}`, ...data };
          sessions.push(session);
          return session;
        },
        async findBySelectorHash(selectorHash) {
          return sessions.find((entry) => entry.selectorHash === selectorHash) || null;
        },
        async touch(id, lastSeenAt, idleExpiresAt) {
          const session = sessions.find((entry) => entry._id === id);
          Object.assign(session, { lastSeenAt, idleExpiresAt });
          return session;
        },
      },
      selectorGenerator: () => 'race-selector',
      csrfSecretGenerator: () => 'race-csrf',
    });
    let releasePasswordProof;
    let proofStarted;
    const started = new Promise((resolve) => { proofStarted = resolve; });
    const release = new Promise((resolve) => { releasePasswordProof = resolve; });
    const service = createAuthService({
      userRepository: {
        async findByEmail(email) {
          return email === currentUser.email ? structuredClone(currentUser) : null;
        },
        async updateLastLogin() {},
      },
      auditLogger: { async log() {} },
      sessionService,
      loginThrottle: {
        async claimAttempt() {},
        async claimFailure() {},
        async clearEmail() {},
      },
      passwordComparer: async (_password, verifiedHash) => {
        proofStarted();
        await release;
        return verifiedHash === 'old-hash';
      },
    });

    const pendingLogin = service.login({
      email: 'race@example.com',
      password: 'OldPassword123',
    });
    await started;
    Object.assign(currentUser, {
      passwordHash: 'reset-hash',
      credentialVersion: 1,
      passwordChangedAt: new Date('2026-07-24T00:00:01.000Z'),
    });
    releasePasswordProof();

    const loginResult = await pendingLogin;
    assert.equal(
      sessions[0].selectorHash,
      hashSessionSelector(loginResult.sessionSelector)
    );
    await assert.rejects(
      () => sessionService.authenticate(loginResult.sessionSelector),
      (error) => error.errorCode === 'SESSION_CREDENTIAL_STALE'
    );
  });
});
