const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Notification = require('./notification.model');
const User = require('./user.model');
const UserAddress = require('./userAddress.model');

function assertPath(model, pathName) {
  assert.ok(model.schema.path(pathName), `${model.modelName}.${pathName} should exist`);
}

describe('account model contracts', () => {
  it('keeps legacy user fields while adding profile metadata', () => {
    ['phone', 'address', 'phoneNumber', 'avatarUrl', 'lastLoginAt'].forEach((field) => {
      assertPath(User, field);
    });
  });

  it('stores structured user addresses and enforces one default per user', () => {
    ['userId', 'label', 'receiverName', 'phoneNumber', 'province', 'district', 'ward', 'addressLine', 'isDefault'].forEach((field) => {
      assertPath(UserAddress, field);
    });

    const defaultIndex = UserAddress.schema.indexes().find(
      ([fields, options]) => fields.userId === 1 && fields.isDefault === 1 && options.name === 'one_default_address_per_user'
    );
    assert.equal(defaultIndex[1].unique, true);
    assert.deepEqual(defaultIndex[1].partialFilterExpression, { isDefault: true });
  });

  it('supports notification read audit and soft deletion', () => {
    ['readAt', 'deletedAt'].forEach((field) => assertPath(Notification, field));
    const inboxIndex = Notification.schema.indexes().find(
      ([fields]) => fields.userId === 1 && fields.deletedAt === 1 && fields.createdAt === -1
    );
    assert.ok(inboxIndex);
  });
});
