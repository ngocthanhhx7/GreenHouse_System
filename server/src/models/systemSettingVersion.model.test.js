const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const SystemSettingVersion = require('./systemSettingVersion.model');

describe('system setting version model', () => {
  it('stores immutable canonical values with unique version and idempotency identities', () => {
    const indexes = SystemSettingVersion.schema.indexes();
    assert.ok(indexes.some(([keys, options]) => keys.version === 1 && options.unique));
    assert.ok(indexes.some(([keys, options]) => keys.idempotencyKey === 1 && options.unique));
    const document = new SystemSettingVersion({
      version: 1,
      values: { PAYMENT_TIMEOUT_MINUTES: 15, LOW_STOCK_DEFAULT_THRESHOLD: 5 },
      reason: 'Khoi tao cau hinh',
      effectiveAt: new Date(),
      updatedBy: null,
      idempotencyKey: 'settings-init',
      requestHash: 'a'.repeat(64),
    });
    assert.equal(SystemSettingVersion.schema.path('values').options.immutable, true);
    assert.equal(document.values.PAYMENT_TIMEOUT_MINUTES, 15);
  });
});
