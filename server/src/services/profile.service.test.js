const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createProfileService } = require('./profile.service');

function createUserRepository() {
  const user = {
    _id: 'user-1',
    fullName: 'Nguyen Ngoc Thanh',
    email: 'thanh@example.com',
    phone: '0900000000',
    phoneNumber: '0900000000',
    address: 'Ha Noi',
    avatarUrl: '',
    passwordHash: 'old-hash',
    status: 'Active',
    roleId: { _id: 'role-1', roleName: 'Customer' },
  };

  return {
    user,
    async findById(id) {
      return id === user._id ? { ...user } : null;
    },
    async updateProfile(id, changes) {
      if (id !== user._id) return null;
      Object.assign(user, changes);
      return { ...user };
    },
    async updatePassword(id, passwordHash) {
      if (id !== user._id) return null;
      user.passwordHash = passwordHash;
      return { ...user };
    },
    async updateAvatar(id, avatarUrl) {
      if (id !== user._id) return null;
      user.avatarUrl = avatarUrl;
      return { ...user };
    },
  };
}

describe('profile service', () => {
  let userRepository;
  let service;

  beforeEach(() => {
    userRepository = createUserRepository();
    service = createProfileService({
      userRepository,
      comparePassword: async (value, hash) => value === 'Current123' && hash === 'old-hash',
      hashPassword: async (value) => `hashed:${value}`,
      auditLogger: { async log() {} },
    });
  });

  it('returns editable profile data without password hash', async () => {
    const result = await service.getProfile('user-1');

    assert.equal(result.email, 'thanh@example.com');
    assert.equal(result.phoneNumber, '0900000000');
    assert.equal(result.role.roleName, 'Customer');
    assert.equal(result.passwordHash, undefined);
  });

  it('updates only allowed profile fields and mirrors the legacy phone field', async () => {
    const result = await service.updateProfile('user-1', {
      fullName: 'Nguyễn Ngọc Thành',
      phoneNumber: '0912345678',
      address: 'Hà Nội',
    });

    assert.equal(result.fullName, 'Nguyễn Ngọc Thành');
    assert.equal(result.phoneNumber, '0912345678');
    assert.equal(userRepository.user.phone, '0912345678');
  });

  it('rejects protected or unknown profile fields', async () => {
    await assert.rejects(
      () => service.updateProfile('user-1', { roleId: 'admin-role' }),
      /Profile contains fields that cannot be updated/
    );
  });

  it('changes password only after verifying the current password', async () => {
    await service.changePassword('user-1', {
      currentPassword: 'Current123',
      newPassword: 'NewPassword123',
      confirmPassword: 'NewPassword123',
    });

    assert.equal(userRepository.user.passwordHash, 'hashed:NewPassword123');
  });

  it('rejects a wrong current password', async () => {
    await assert.rejects(
      () => service.changePassword('user-1', {
        currentPassword: 'Wrong123',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      }),
      /Current password is incorrect/
    );
  });

  it('updates and removes avatar while returning the previous managed URL', async () => {
    const avatarUrl = '/uploads/avatars/123e4567-e89b-12d3-a456-426614174000.png';
    const added = await service.setAvatar('user-1', avatarUrl);
    const removed = await service.removeAvatar('user-1');

    assert.equal(added.profile.avatarUrl, avatarUrl);
    assert.equal(added.previousAvatarUrl, '');
    assert.equal(removed.profile.avatarUrl, '');
    assert.equal(removed.previousAvatarUrl, avatarUrl);
  });
});
