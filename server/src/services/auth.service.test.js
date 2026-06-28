const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createAuthService } = require('./auth.service');

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
      jwtSecret: 'test-secret',
    });
  });

  it('registers a Customer account with hashed password and audit log', async () => {
    const result = await authService.registerCustomer({
      fullName: 'Nguyen Ngoc Thanh',
      email: 'thanh@example.com',
      phone: '0900000000',
      password: 'Password123',
      address: 'Ha Noi',
    });

    assert.equal(result.user.email, 'thanh@example.com');
    assert.equal(result.user.role.roleName, 'Customer');
    assert.equal(result.user.passwordHash, undefined);
    assert.notEqual(userRepository.users[0].passwordHash, 'Password123');
    assert.equal(auditLogger.entries[0].action, 'AUTH_REGISTER');
  });

  it('rejects duplicate customer email during register', async () => {
    await authService.registerCustomer({
      fullName: 'Nguyen Ngoc Thanh',
      email: 'thanh@example.com',
      phone: '0900000000',
      password: 'Password123',
      address: 'Ha Noi',
    });

    await assert.rejects(
      () =>
        authService.registerCustomer({
          fullName: 'Nguyen Ngoc Thanh',
          email: 'thanh@example.com',
          phone: '0900000000',
          password: 'Password123',
          address: 'Ha Noi',
        }),
      /Email already exists/
    );
  });

  it('logs in an active user and returns a signed token without password hash', async () => {
    await authService.registerCustomer({
      fullName: 'Nguyen Ngoc Thanh',
      email: 'thanh@example.com',
      phone: '0900000000',
      password: 'Password123',
      address: 'Ha Noi',
    });

    const result = await authService.login({
      email: 'thanh@example.com',
      password: 'Password123',
    });

    assert.equal(typeof result.token, 'string');
    assert.equal(result.user.email, 'thanh@example.com');
    assert.equal(result.user.passwordHash, undefined);
    assert.equal(auditLogger.entries.at(-1).action, 'AUTH_LOGIN_SUCCESS');
  });

  it('rejects login for disabled accounts', async () => {
    await authService.registerCustomer({
      fullName: 'Nguyen Ngoc Thanh',
      email: 'thanh@example.com',
      phone: '0900000000',
      password: 'Password123',
      address: 'Ha Noi',
    });
    userRepository.users[0].status = 'Disabled';

    await assert.rejects(
      () =>
        authService.login({
          email: 'thanh@example.com',
          password: 'Password123',
        }),
      /Account is disabled/
    );
  });
});
