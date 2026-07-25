const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');

const { createUserAddressService } = require('./userAddress.service');

function createRepository() {
  const addresses = [];
  const calls = [];
  const lockTails = new Map();
  let transactionSequence = 0;
  return {
    addresses,
    calls,
    async withTransaction(work) {
      const snapshot = structuredClone(addresses);
      const session = {
        id: `transaction-${++transactionSequence}`,
        mutated: false,
        releases: [],
      };
      try {
        return await work(session);
      } catch (error) {
        if (session.mutated) addresses.splice(0, addresses.length, ...snapshot);
        throw error;
      } finally {
        session.releases.reverse().forEach((release) => release());
      }
    },
    async listByUser(userId) {
      return addresses.filter((item) => item.userId === userId);
    },
    async countByUser(userId) {
      return addresses.filter((item) => item.userId === userId).length;
    },
    async lockAddressBook(userId, session) {
      calls.push({ operation: 'lockAddressBook', session });
      const previous = lockTails.get(userId) || Promise.resolve();
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      lockTails.set(userId, previous.then(() => held));
      await previous;
      session.releases.push(release);
    },
    async unsetDefault(userId, session) {
      calls.push({ operation: 'unsetDefault', session });
      session.mutated = true;
      addresses.filter((item) => item.userId === userId).forEach((item) => { item.isDefault = false; });
    },
    async create(userId, data, session) {
      session.mutated = true;
      const item = { _id: `address-${addresses.length + 1}`, userId, ...data };
      addresses.push(item);
      return item;
    },
    async findByIdForUser(userId, id, session) {
      calls.push({ operation: 'findByIdForUser', session });
      return addresses.find((item) => item.userId === userId && item._id === id) || null;
    },
    async updateForUser(userId, id, changes, session) {
      calls.push({ operation: 'updateForUser', session });
      const item = addresses.find((entry) => entry.userId === userId && entry._id === id);
      if (!item) return null;
      session.mutated = true;
      Object.assign(item, changes);
      return item;
    },
    async deleteForUser(userId, id, session) {
      const index = addresses.findIndex((entry) => entry.userId === userId && entry._id === id);
      if (index < 0) return null;
      session.mutated = true;
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

  it('rolls back a default reassignment when the target update fails', async () => {
    const first = await service.createAddress('user-1', validAddress);
    const second = await service.createAddress('user-1', { ...validAddress, label: 'VÄƒn phÃ²ng' });
    const originalUpdate = repository.updateForUser;
    repository.updateForUser = async (userId, id, changes, session) => {
      if (id === second.id) {
        repository.calls.push({ operation: 'updateForUser', session });
        return null;
      }
      return originalUpdate(userId, id, changes, session);
    };

    await assert.rejects(() => service.updateAddress('user-1', second.id, { isDefault: true }), /Không tìm thấy địa chỉ/);

    assert.equal(repository.addresses.find((item) => item._id === first.id).isDefault, true);
    assert.equal(repository.addresses.find((item) => item._id === second.id).isDefault, false);
    assert.deepEqual(
      repository.calls.slice(-3).map((call) => [call.operation, call.session?.id]),
      [
        ['findByIdForUser', 'transaction-3'],
        ['unsetDefault', 'transaction-3'],
        ['updateForUser', 'transaction-3'],
      ]
    );
  });

  it('serializes concurrent creates at capacity so the address book never exceeds ten', async () => {
    for (let index = 0; index < 9; index += 1) {
      await service.createAddress('user-1', {
        ...validAddress,
        label: `Địa chỉ ${index + 1}`,
      });
    }

    const results = await Promise.allSettled([
      service.createAddress('user-1', { ...validAddress, label: 'Địa chỉ 10-A' }),
      service.createAddress('user-1', { ...validAddress, label: 'Địa chỉ 10-B' }),
    ]);

    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(results.find((item) => item.status === 'rejected').reason.errorCode, 'ADDRESS_LIMIT_REACHED');
    assert.equal(repository.addresses.length, 10);
    assert.equal(repository.addresses.filter((item) => item.isDefault).length, 1);
  });

  it('serializes sole-default deletion against create and preserves exactly one default', async () => {
    const sole = await service.createAddress('user-1', validAddress);

    const results = await Promise.allSettled([
      service.deleteAddress('user-1', sole.id),
      service.createAddress('user-1', { ...validAddress, label: 'Địa chỉ mới' }),
    ]);

    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2);
    assert.equal(repository.addresses.length, 1);
    assert.equal(repository.addresses[0].isDefault, true);
  });

  it('does not allow the only default address to be cleared through a partial update', async () => {
    const created = await service.createAddress('user-1', validAddress);

    await assert.rejects(
      () => service.updateAddress('user-1', created.id, { isDefault: false }),
      (error) => error.errorCode === 'DEFAULT_ADDRESS_REQUIRED'
    );

    assert.equal(repository.addresses.find((item) => item._id === created.id).isDefault, true);
  });

  it('does not expose another user address', async () => {
    const created = await service.createAddress('user-1', validAddress);
    await assert.rejects(() => service.updateAddress('user-2', created.id, { label: 'Khác' }), /Không tìm thấy địa chỉ/);
  });

  it('AT-148 blocks deletion of a default while another address remains', async () => {
    const first = await service.createAddress('user-1', validAddress);
    await service.createAddress('user-1', { ...validAddress, label: 'Văn phòng' });

    await assert.rejects(
      () => service.deleteAddress('user-1', first.id),
      (error) => error.errorCode === 'DEFAULT_ADDRESS_REPLACEMENT_REQUIRED'
    );

    assert.equal(repository.addresses.length, 2);
    assert.equal(repository.addresses.filter((item) => item.isDefault).length, 1);
  });

  it('AT-147 limits each Customer address book to ten structured addresses', async () => {
    for (let index = 0; index < 10; index += 1) {
      await service.createAddress('user-1', { ...validAddress, label: `Địa chỉ ${index + 1}` });
    }
    await assert.rejects(
      () => service.createAddress('user-1', { ...validAddress, label: 'Địa chỉ 11' }),
      (error) => error.errorCode === 'ADDRESS_LIMIT_REACHED'
    );
  });

  it('validates Vietnamese phone and required address fields', async () => {
    await assert.rejects(
      () => service.createAddress('user-1', { ...validAddress, phoneNumber: '123' }),
      /Dữ liệu địa chỉ không hợp lệ/
    );
  });

  it('returns field validation errors before Mongoose for oversized province district and ward', async () => {
    for (const field of ['province', 'district', 'ward']) {
      await assert.rejects(
        () => service.createAddress('user-1', { ...validAddress, [field]: 'x'.repeat(101) }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.equal(error.errorCode, 'VALIDATION_ERROR');
          assert.deepEqual(error.errors, [{
            field,
            message: 'Thông tin địa chỉ không được vượt quá 100 ký tự.',
          }]);
          return true;
        }
      );
    }
  });
});
