const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const Notification = require('./notification.model');
const User = require('./user.model');
const UserAddress = require('./userAddress.model');

function assertPath(model, pathName) {
  assert.ok(model.schema.path(pathName), `${model.modelName}.${pathName} should exist`);
}

describe('account model contracts', () => {
  it('AT-145 keeps one canonical phone and removes legacy phone/free-form address authority', () => {
    ['phoneNumber', 'avatarUrl', 'lastLoginAt', 'version'].forEach((field) => {
      assertPath(User, field);
    });
    assert.equal(User.schema.path('phone'), undefined);
    assert.equal(User.schema.path('address'), undefined);
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

  it('supports notification read audit and retained archive history', () => {
    ['state', 'readAt', 'archivedAt'].forEach((field) => assertPath(Notification, field));
    const inboxIndex = Notification.schema.indexes().find(
      ([fields]) => fields.userId === 1 && fields.channel === 1 && fields.state === 1 && fields.createdAt === -1 && fields._id === -1
    );
    assert.ok(inboxIndex);
  });
});
