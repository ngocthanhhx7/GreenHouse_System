const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createUserAddressService } = require('./userAddress.service');

function createRepository() {
  const addresses = [];
  return {
    addresses,
    async listByUser(userId) {
      return addresses.filter((item) => item.userId === userId);
    },
    async countByUser(userId) {
      return addresses.filter((item) => item.userId === userId).length;
    },
    async unsetDefault(userId) {
      addresses.filter((item) => item.userId === userId).forEach((item) => { item.isDefault = false; });
    },
    async create(userId, data) {
      const item = { _id: `address-${addresses.length + 1}`, userId, ...data };
      addresses.push(item);
      return item;
    },
    async findByIdForUser(userId, id) {
      return addresses.find((item) => item.userId === userId && item._id === id) || null;
    },
    async updateForUser(userId, id, changes) {
      const item = addresses.find((entry) => entry.userId === userId && entry._id === id);
      if (!item) return null;
      Object.assign(item, changes);
      return item;
    },
    async deleteForUser(userId, id) {
      const index = addresses.findIndex((entry) => entry.userId === userId && entry._id === id);
      if (index < 0) return null;
      return addresses.splice(index, 1)[0];
    },
  };
}

const validAddress = {
  label: 'Nhà riêng',
  receiverName: 'Nguyễn Ngọc Thành',
  phoneNumber: '0912345678',
  province: 'Hà Nội',
  district: 'Cầu Giấy',
  ward: 'Dịch Vọng',
  addressLine: 'Số 1 đường Cầu Giấy',
};

describe('user address service', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createRepository();
    service = createUserAddressService({ addressRepository: repository });
  });

  it('makes the first address default automatically', async () => {
    const created = await service.createAddress('user-1', validAddress);
    assert.equal(created.isDefault, true);
  });

  it('keeps at most one default address', async () => {
    const first = await service.createAddress('user-1', validAddress);
    const second = await service.createAddress('user-1', { ...validAddress, label: 'Văn phòng', isDefault: true });

    assert.equal(repository.addresses.find((item) => item._id === first.id).isDefault, false);
    assert.equal(second.isDefault, true);
    assert.equal(repository.addresses.filter((item) => item.isDefault).length, 1);
  });

  it('does not expose another user address', async () => {
    const created = await service.createAddress('user-1', validAddress);
    await assert.rejects(() => service.updateAddress('user-2', created.id, { label: 'Khác' }), /Address not found/);
  });

  it('promotes another address when deleting the current default', async () => {
    const first = await service.createAddress('user-1', validAddress);
    const second = await service.createAddress('user-1', { ...validAddress, label: 'Văn phòng' });

    await service.deleteAddress('user-1', first.id);

    assert.equal(repository.addresses.find((item) => item._id === second.id).isDefault, true);
  });

  it('validates Vietnamese phone and required address fields', async () => {
    await assert.rejects(
      () => service.createAddress('user-1', { ...validAddress, phoneNumber: '123' }),
      /Invalid address data/
    );
  });
});
