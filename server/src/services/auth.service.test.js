const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createAuthService } = require('./auth.service');
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
        async assertAllowed() {},
        async recordAttempt() {},
        async recordFailure(input) { this.failures.push(input); },
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
});
