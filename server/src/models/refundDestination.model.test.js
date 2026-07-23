const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');

const RefundDestination = require('./refundDestination.model');
const { encrypt, decrypt, fingerprint } = require('../utils/refundDestinationCrypto');

describe('refund destination privacy contract', () => {
  it('encrypts and decrypts destination values without storing plaintext', () => {
    const encrypted = encrypt('0123456789');
    assert.notEqual(encrypted, '0123456789');
    assert.equal(decrypt(encrypted), '0123456789');
  });

  it('fails closed in production when the dedicated encryption key is missing', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousKey = process.env.REFUND_DESTINATION_ENCRYPTION_KEY;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.REFUND_DESTINATION_ENCRYPTION_KEY;
      assert.throws(() => encrypt('0123456789'), /required in production/i);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousKey === undefined) delete process.env.REFUND_DESTINATION_ENCRYPTION_KEY;
      else process.env.REFUND_DESTINATION_ENCRYPTION_KEY = previousKey;
    }
  });

  it('removes encrypted account values from JSON serialization', () => {
    const destination = new RefundDestination({
      returnRefundRequestId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      version: 1,
      bankName: 'Test Bank',
      bankBin: '970422',
      accountNumberEncrypted: encrypt('0123456789'),
      accountHolderEncrypted: encrypt('NGUYEN VAN A'),
      accountNumberLast4: '6789',
      accountHolderMasked: 'N***** V** A**',
      destinationFingerprint: fingerprint('Test Bank|0123456789|NGUYEN VAN A'),
      confirmationNotice: 'Confirmed by Customer',
      customerConfirmedAt: new Date(),
      idempotencyKey: 'destination-test-1',
    });
    const serialized = destination.toJSON();
    assert.equal(serialized.accountNumberEncrypted, undefined);
    assert.equal(serialized.accountHolderEncrypted, undefined);
    assert.equal(serialized.destinationFingerprint, undefined);
    assert.equal(serialized.bankBin, '970422');
  });

  it('keeps destination versions and idempotency identities unique', () => {
    const indexes = RefundDestination.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.returnRefundRequestId === 1 && fields.version === 1 && options.unique));
    assert.ok(indexes.some(([fields, options]) => fields.returnRefundRequestId === 1 && fields.idempotencyKey === 1 && options.unique));
  });

  it('accepts only a six-digit bank BIN when online payout metadata is present', async () => {
    const destination = new RefundDestination({ bankBin: 'ABC' });
    await assert.rejects(() => destination.validate(['bankBin']), /bankBin/i);
  });
});
